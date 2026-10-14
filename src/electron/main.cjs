const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, safeStorage, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const inference = require('./inference.cjs');
const { interceptAction, sanitizeUntrustedContent } = require('../main/security/interceptor.cjs');

// ============================================================================
// IPC guardrails — rate limiting, payload sizing, input validation
// ============================================================================

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 30;
const MAX_PAYLOAD_BYTES = 128 * 1024;
const MAX_LOG_ENTRY_CHARS = 20_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;
const APP_LAUNCH_TIMEOUT_MS = 10_000;
const MAX_ACTIONS_PER_BATCH = 30;
const MAX_TYPED_CHARS = 4000;

const SPEECH_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const SUNNY_TOOLS = ['get_system_status', 'speak_notification', 'search_recipe', 'get_daily_digest', 'schedule_medication_reminder'];

// Recipe API - using TheMealDB (free, no API key required)
const RECIPE_API_BASE = 'https://www.themealdb.com/api/json/v1/1';
const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
const NEWS_API = 'https://api.rss2json.com/v1/api.json'; // Free tier available

// Medication reminder storage
const medicationReminders = new Map();
let medicationCheckInterval = null;

const INTERNET_TEST_URL = 'https://www.google.com/generate_204';
const INTERNET_TIMEOUT_MS = 4000;
const STATUS_POLL_INTERVAL_MS = 30_000;

const rateBuckets = new Map();

/** Sliding-window rate limiter, one bucket per IPC channel. */
function rateLimit(channel) {
  const now = Date.now();
  let hits = rateBuckets.get(channel);
  if (!hits) {
    hits = [];
    rateBuckets.set(channel, hits);
  }
  while (hits.length > 0 && now - hits[0] >= RATE_LIMIT_WINDOW_MS) hits.shift();
  if (hits.length >= RATE_LIMIT_MAX_CALLS) {
    const retrySec = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - hits[0])) / 1000));
    const err = new Error(`Too many requests. Please wait about ${retrySec} second(s) and try again.`);
    err.code = 'RATE_LIMITED';
    throw err;
  }
  hits.push(now);
}

/** Rejects IPC calls that originate outside our own app window. */
function assertTrustedSender(event) {
  if (mainWindow && event && event.sender && event.sender !== mainWindow.webContents) {
    throw new Error('Sunny rejected a request from an unexpected source.');
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertPayloadSize(value, label) {
  if (value === undefined || value === null) return;
  let size;
  try {
    size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    throw new Error(`${label} could not be measured.`);
  }
  if (size > MAX_PAYLOAD_BYTES) {
    throw new Error(`${label} is too large (${size} bytes, limit ${MAX_PAYLOAD_BYTES}).`);
  }
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

// ============================================================================
// Encrypted credential storage
// ============================================================================

function getCredentialsDir() {
  return path.join(app.getPath('userData'), 'credentials');
}

function getCredentialPath(key) {
  return path.join(getCredentialsDir(), `${key}.enc`);
}

function ensureCredentialsDir() {
  const dir = getCredentialsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

// ============================================================================
// Window
// ============================================================================

let mainWindow;
let automationModule;
let automationCancelled = false;
let statusEmitterTimer = null;

const isDev = !app.isPackaged;
const rendererUrl = process.env.SUNNY_RENDERER_URL || 'http://localhost:5173';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 760,
    minWidth: 360,
    minHeight: 620,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    backgroundColor: '#11161b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  if (isDev) mainWindow.loadURL(rendererUrl);
  else mainWindow.loadURL(pathToFileURL(path.join(__dirname, '../../dist/index.html')).toString());
}

// ============================================================================
// Desktop automation
// ============================================================================

async function getAutomation() {
  if (!automationModule) automationModule = await import('@nut-tree-fork/nut-js');
  return automationModule;
}

async function captureScreen() {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1600, height: 1000 } });
  const source = sources[0];
  if (!source) throw new Error('No screen is available for capture.');
  const image = nativeImage.createFromDataURL(source.thumbnail.toDataURL());
  return { dataUrl: image.toDataURL(), width: image.getSize().width, height: image.getSize().height };
}

// ---------------------------------------------------------------------------
// Application launching
//
// Every launch target comes from the fixed table below — never from user or
// model input. Targets are either:
//   * a URI, opened with shell.openExternal (no process spawn at all), or
//   * a bare executable plus an argument array, run with execFile (no shell).
// This keeps command injection off the table: nothing is ever interpolated
// into a shell string.
// ---------------------------------------------------------------------------

const APP_URI_OPENERS = {
  browser: 'https://',
  email: 'mailto:',
  mail: 'mailto:',
  maps: 'https://maps.google.com',
  weather: 'https://weather.com',
};

const APP_EXE_OPENERS = {
  win32: {
    calculator: { exe: 'calc' },
    files: { exe: 'explorer' },
    notepad: { exe: 'notepad' },
    word: { exe: 'winword' },
    excel: { exe: 'excel' },
    settings: { uri: 'ms-settings:' },
    calendar: { uri: 'outlookcal:' },
    photos: { uri: 'ms-photos:' },
  },
  darwin: {
    calculator: { exe: 'open', args: ['-a', 'Calculator'] },
    files: { exe: 'open', args: ['-a', 'Finder'] },
    finder: { exe: 'open', args: ['-a', 'Finder'] },
    notepad: { exe: 'open', args: ['-a', 'TextEdit'] },
    textedit: { exe: 'open', args: ['-a', 'TextEdit'] },
    settings: { exe: 'open', args: ['-a', 'System Settings'] },
    word: { exe: 'open', args: ['-a', 'Microsoft Word'] },
    excel: { exe: 'open', args: ['-a', 'Microsoft Excel'] },
    calendar: { exe: 'open', args: ['-a', 'Calendar'] },
    maps: { exe: 'open', args: ['-a', 'Maps'] },
    weather: { exe: 'open', args: ['-a', 'Weather'] },
    music: { exe: 'open', args: ['-a', 'Music'] },
    photos: { exe: 'open', args: ['-a', 'Photos'] },
  },
  linux: {
    calculator: { exe: 'gnome-calculator' },
    files: { exe: 'nautilus' },
    notepad: { exe: 'gedit' },
    settings: { exe: 'gnome-control-center' },
    calendar: { exe: 'gnome-calendar' },
    maps: { uri: 'https://maps.google.com' },
    weather: { uri: 'https://weather.com' },
    music: { exe: 'rhythmbox' },
    photos: { exe: 'shotwell' },
  },
};

/** Resolve an app key to `{ uri }` or `{ exe, args }`, or null when unknown. */
function resolveOpener(appKey) {
  const uri = APP_URI_OPENERS[appKey];
  if (uri) return { uri };
  const table = APP_EXE_OPENERS[process.platform] || {};
  const entry = table[appKey];
  if (!entry) return null;
  if (entry.uri) return { uri: entry.uri };
  return { exe: entry.exe, args: entry.args || [] };
}

/** Spawn a process with no shell involved. */
async function launchExecutable(exe, args) {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const execFileAsync = promisify(execFile);
  try {
    await execFileAsync(exe, args, { timeout: APP_LAUNCH_TIMEOUT_MS, windowsHide: true });
    return { launched: true };
  } catch (err) {
    const code = err && err.code;
    if (code === 'ENOENT' || code === 127) {
      return { launched: false, error: `"${exe}" was not found on this computer.` };
    }
    if (code === 'ETIMEDOUT') {
      return { launched: false, error: `"${exe}" took too long to start.` };
    }
    return { launched: false, error: (err && err.message) || 'Unknown error while launching the application.' };
  }
}

async function openApp(appKey) {
  const opener = resolveOpener(appKey);
  if (!opener) {
    throw new Error(`Sunny does not know how to open "${appKey}".`);
  }
  if (opener.uri) {
    await shell.openExternal(opener.uri);
    return { launched: true };
  }
  return launchExecutable(opener.exe, opener.args);
}

async function executeActions(actions) {
  const automation = await getAutomation();
  automationCancelled = false;
  const completed = [];

  for (const action of actions) {
    if (automationCancelled) return { completed: completed.length, cancelled: true };
    if (!action || typeof action.type !== 'string') throw new Error('Sunny received an invalid desktop action.');

    if (action.type === 'move' && Number.isFinite(action.x) && Number.isFinite(action.y)) {
      await automation.mouse.setPosition(new automation.Point(action.x, action.y));
    } else if (action.type === 'click') {
      await automation.mouse.click(action.button === 'right' ? automation.Button.RIGHT : automation.Button.LEFT);
    } else if (action.type === 'type' && typeof action.text === 'string' && action.text.length <= MAX_TYPED_CHARS) {
      await automation.keyboard.type(action.text);
    } else if (action.type === 'key' && typeof action.key === 'string') {
      await automation.keyboard.pressKey(automation.Key[action.key]);
    } else if (action.type === 'scroll' && Number.isFinite(action.amount)) {
      await automation.mouse.scrollDown(action.amount);
    } else if (action.type === 'wait' && Number.isFinite(action.ms) && action.ms <= 10000) {
      await new Promise((resolve) => setTimeout(resolve, action.ms));
    } else if (action.type === 'screenshot') {
      // Screenshots are taken through captureScreen; nothing to do here.
    } else if (action.type === 'open_app' && typeof action.app === 'string') {
      await openApp(action.app.toLowerCase());
    } else {
      throw new Error('Sunny stopped because an action was not safe to run.');
    }

    completed.push(action.type);
  }

  return { completed: completed.length, cancelled: false };
}

// ============================================================================
// System status tools
// ============================================================================

let lastCpuTimes = null;

/** CPU utilisation since the previous sample (0 on the first call). */
function readCpuUsage() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  let usage = 0;
  if (lastCpuTimes) {
    const idleDelta = idle - lastCpuTimes.idle;
    const totalDelta = total - lastCpuTimes.total;
    if (totalDelta > 0) usage = 100 * (1 - idleDelta / totalDelta);
  }
  lastCpuTimes = { idle, total };
  return Math.max(0, Math.min(100, Math.round(usage)));
}

/** Reports whether a real, non-link-local network adapter is up. */
function readNetworkStatus() {
  let connected = false;
  let networkName = null;
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (!addresses) continue;
    const usable = addresses.some(
      (addr) => !addr.internal && addr.family === 'IPv4' && !addr.address.startsWith('169.254.')
    );
    if (!usable) continue;
    connected = true;
    networkName = name;
    break;
  }
  return { connected, networkName, signalStrength: null };
}

async function readInternetStatus() {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNET_TIMEOUT_MS);
  try {
    await fetch(INTERNET_TEST_URL, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    return { reachable: true, testServer: INTERNET_TEST_URL, latency: `${Date.now() - startedAt} ms` };
  } catch {
    return { reachable: false, testServer: INTERNET_TEST_URL, latency: '—' };
  } finally {
    clearTimeout(timer);
  }
}

function buildUserFriendlyMessage(status) {
  const { battery, wifi, internet, system } = status;
  const parts = [];
  if (battery.batteryPercent === null) {
    parts.push('This computer has no battery, so power is not a concern.');
  } else {
    parts.push(`Battery is at ${battery.batteryPercent}%${battery.isCharging ? ' and charging' : ''}.`);
  }
  parts.push(wifi.connected
    ? `Wi-Fi is connected${wifi.networkName ? ` to ${wifi.networkName}` : ''}.`
    : 'Wi-Fi is not connected.');
  parts.push(internet.reachable ? 'The internet is reachable.' : 'The internet is not reachable right now.');
  parts.push(`Processor use is ${system.cpuUsage}% and ${system.memoryAvailableGB} GB of memory is free.`);
  return parts.join(' ');
}

function buildRecommendations(status) {
  const { battery, wifi, internet, system } = status;
  const out = [];
  if (battery.batteryPercent !== null && battery.batteryPercent <= 20 && !battery.isCharging) {
    out.push('Your battery is low. Please plug in the charger when you can.');
  }
  if (!wifi.connected) {
    out.push('Wi-Fi looks switched off. Check the wireless switch on your computer.');
  } else if (!internet.reachable) {
    out.push('Wi-Fi is on but the internet is not answering. Restarting your router often helps.');
  }
  if (system.cpuUsage >= 80) out.push('The processor is very busy. Closing a few programs may speed things up.');
  if (system.memoryAvailableGB < 2) out.push('Free memory is running low. Restarting Sunny may help.');
  if (out.length === 0) out.push('Everything looks healthy. Nothing needs your attention.');
  return out;
}

async function buildSystemStatus() {
  const battery = { batteryPercent: null, isCharging: false, health: 'unknown' };
  const wifi = readNetworkStatus();
  const internet = await readInternetStatus();
  const system = {
    cpuUsage: readCpuUsage(),
    memoryAvailableGB: Number((os.freemem() / (1024 ** 3)).toFixed(1)),
    uptime: Math.round(os.uptime()),
    platform: process.platform,
    nodeVersion: process.version,
  };
  const base = { battery, wifi, internet, system };
  return {
    timestamp: new Date().toISOString(),
    success: true,
    toolName: 'get_system_status',
    // Flat summary accessors, mirrored from the detail blocks below.
    batteryLevel: battery.batteryPercent,
    isOnline: internet.reachable,
    ...base,
    recommendations: buildRecommendations(base),
    userFriendlyMessage: buildUserFriendlyMessage(base),
  };
}

// ============================================================================
// Tool registry — the only tools the renderer may invoke
// ============================================================================

function validateToolParams(toolName, params) {
  const box = requirePlainObject(params, `parameters for "${toolName}"`);
  if (toolName === 'get_system_status') return {};

  if (toolName === 'speak_notification') {
    const message = requireString(box.message, 'message');
    if (message.length > 500) throw new Error('Notification message must be 500 characters or fewer.');
    const priority = box.priority === undefined ? 'normal' : box.priority;
    if (typeof priority !== 'string' || !SPEECH_PRIORITIES.includes(priority)) {
      throw new Error(`priority must be one of: ${SPEECH_PRIORITIES.join(', ')}`);
    }
    const repeat = box.repeat === undefined ? 1 : box.repeat;
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 3) {
      throw new Error('repeat must be a whole number between 1 and 3.');
    }
    return { message, priority, repeat };
  }

  if (toolName === 'search_recipe') {
    const query = requireString(box.query, 'query');
    if (query.length > 100) throw new Error('Recipe query must be 100 characters or fewer.');
    const maxResults = box.maxResults === undefined ? 5 : box.maxResults;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 10) {
      throw new Error('maxResults must be a whole number between 1 and 10.');
    }
    return { query, maxResults };
  }

  if (toolName === 'get_daily_digest') {
    const location = box.location || 'auto';
    const newsCount = box.newsCount === undefined ? 5 : box.newsCount;
    if (!Number.isInteger(newsCount) || newsCount < 1 || newsCount > 10) {
      throw new Error('newsCount must be a whole number between 1 and 10.');
    }
    return { location, newsCount };
  }

  if (toolName === 'schedule_medication_reminder') {
    const pillName = requireString(box.pillName, 'pillName');
    const timeString = requireString(box.timeString, 'timeString');
    // Validate time format HH:MM
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString)) {
      throw new Error('timeString must be in HH:MM format (24-hour).');
    }
    return { pillName, timeString };
  }

  throw new Error(`Unknown tool: ${toolName}`);
}

async function runTool(toolName, params) {
  if (toolName === 'get_system_status') return buildSystemStatus();

  // Speech synthesis itself must happen in the renderer: the main process has
  // no access to the platform text-to-speech voices. This handler validates
  // and acknowledges the request; the renderer performs the speaking.
  if (toolName === 'speak_notification') {
    return {
      ok: true,
      toolName,
      message: params.message,
      priority: params.priority,
      repeat: params.repeat,
      spokenByRenderer: true,
    };
  }

  if (toolName === 'search_recipe') {
    return await searchRecipes(params.query, params.maxResults);
  }

  if (toolName === 'get_daily_digest') {
    return await getDailyDigest(params.location, params.newsCount);
  }

  if (toolName === 'schedule_medication_reminder') {
    return await scheduleMedicationReminder(params.pillName, params.timeString);
  }

  throw new Error(`Unknown tool: ${toolName}`);
}

async function searchRecipes(query, maxResults = 5) {
  try {
    // First search by name
    const searchResponse = await fetch(`${RECIPE_API_BASE}/search.php?s=${encodeURIComponent(query)}`);
    const searchData = await searchResponse.json();
    
    if (!searchData.meals || searchData.meals.length === 0) {
      return { recipes: [] };
    }

    const recipes = searchData.meals.slice(0, maxResults).map(meal => {
      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
        const ingredient = meal[`strIngredient${i}`];
        const measure = meal[`strMeasure${i}`];
        if (ingredient && ingredient.trim()) {
          ingredients.push(`${measure ? measure.trim() + ' ' : ''}${ingredient.trim()}`);
        }
      }

      const instructions = meal.strInstructions
        .split('\r\n')
        .filter(step => step.trim())
        .map(step => step.trim());

      return {
        id: meal.idMeal,
        title: meal.strMeal,
        imageUrl: meal.strMealThumb,
        ingredients,
        instructions,
        servings: 4,
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
        sourceUrl: meal.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
      };
    });

    return { recipes };
  } catch (error) {
    console.error('Recipe search error:', error);
    throw new Error('Failed to search for recipes. Please check your internet connection.');
  }
}

async function getDailyDigest(location = 'auto', newsCount = 5) {
  try {
    let latitude = 0;
    let longitude = 0;
    let locationName = 'Your Location';

    if (location === 'auto') {
      try {
        const ipResponse = await fetch('http://ip-api.com/json/');
        const ipData = await ipResponse.json();
        if (ipData.status === 'success') {
          latitude = ipData.lat;
          longitude = ipData.lon;
          locationName = `${ipData.city}, ${ipData.regionName}`;
        }
      } catch {
        latitude = 40.7128;
        longitude = -74.0060;
        locationName = 'New York, NY';
      }
    }

    const weatherUrl = `${OPEN_METEO_API}?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`;
    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();

    const weather = {
      temperature: Math.round(weatherData.current_weather?.temperature || 0),
      condition: getWeatherCondition(weatherData.current_weather?.weathercode || 0),
      location: locationName,
    };

    let news = [];
    try {
      const newsResponse = await fetch(`${NEWS_API}?rss_url=https://feeds.bbci.co.uk/news/rss.xml&api_key=demo&count=${newsCount}`);
      const newsData = await newsResponse.json();
      
      if (newsData.items) {
        news = newsData.items.slice(0, newsCount).map(item => ({
          title: item.title,
          summary: item.description?.replace(/<[^>]*>/g, '').substring(0, 200) || '',
          url: item.link,
        }));
      }
    } catch {
      news = [
        { title: 'Stay informed with daily updates', summary: 'Check your favorite news source for the latest headlines.', url: '' },
      ];
    }

    return {
      weather,
      news,
      date: new Date().toISOString().split('T')[0],
    };
  } catch (error) {
    console.error('Daily digest error:', error);
    return {
      weather: { temperature: 20, condition: 'Partly Cloudy', location: location },
      news: [{ title: 'Unable to fetch news', summary: 'Please check your internet connection.', url: '' }],
      date: new Date().toISOString().split('T')[0],
    };
  }
}

function getWeatherCondition(code) {
  const conditions = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
    55: 'Dense drizzle', 56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    66: 'Light freezing rain', 67: 'Heavy freezing rain', 71: 'Slight snow fall',
    73: 'Moderate snow fall', 75: 'Heavy snow fall', 77: 'Snow grains',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    85: 'Slight snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
  };
  return conditions[code] || 'Unknown';
}

async function scheduleMedicationReminder(pillName, timeString) {
  const id = `med_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const reminder = {
    id,
    pillName,
    timeString,
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  medicationReminders.set(id, reminder);
  startMedicationChecker();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sunny:medication-reminder-added', reminder);
  }

  return { success: true, reminderId: id };
}

function startMedicationChecker() {
  if (medicationCheckInterval) return;

  medicationCheckInterval = setInterval(() => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const [id, reminder] of medicationReminders.entries()) {
      if (reminder.enabled && reminder.timeString === currentTime) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sunny:medication-reminder-triggered', {
            ...reminder,
            triggeredAt: new Date().toISOString(),
          });
        }
      }
    }
  }, 30000);
}

function stopMedicationChecker() {
  if (medicationCheckInterval) {
    clearInterval(medicationCheckInterval);
    medicationCheckInterval = null;
  }
}

// ============================================================================
// Periodic status broadcast to the renderer
  assertPayloadSize({ toolName, params }, channel);
  const name = requireString(toolName, 'toolName');
  if (!SUNNY_TOOLS.includes(name)) {
    throw new Error(`Unknown tool: ${name}. Available tools: ${SUNNY_TOOLS.join(', ')}`);
  }
  const validated = validateToolParams(name, params === undefined ? {} : params);
  return withTimeout(
    runTool(name, validated),
    TOOL_CALL_TIMEOUT_MS,
    `The "${name}" action took too long and was stopped.`
  );

// ============================================================================
// Periodic status broadcast to the renderer
// ============================================================================

async function emitSystemStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const status = await buildSystemStatus();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sunny:system-status-change', status);
    }
  } catch {
    // Listeners simply keep their last known state.
  }
}

function startStatusBroadcast() {
  if (statusEmitterTimer) return;
  emitSystemStatus();
  statusEmitterTimer = setInterval(emitSystemStatus, STATUS_POLL_INTERVAL_MS);
  if (typeof statusEmitterTimer.unref === 'function') statusEmitterTimer.unref();
}

function stopStatusBroadcast() {
  if (!statusEmitterTimer) return;
  clearInterval(statusEmitterTimer);
  statusEmitterTimer = null;
}

// ============================================================================
// Cooking mode step emission
// ============================================================================

function emitCookingStepChange(stepIndex, totalSteps, instruction) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('sunny:cooking-step-change', {
      stepIndex,
      totalSteps,
      instruction,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Ignore emission errors
  }
}

// ============================================================================
// App lifecycle
// ============================================================================

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  // --- Screen capture & model -------------------------------------------
  ipcMain.handle('sunny:capture-screen', captureScreen);

  ipcMain.handle('sunny:analyze-screen', async (event, payload) => {
    rateLimit('sunny:analyze-screen');
    assertTrustedSender(event);
    const box = requirePlainObject(payload, 'payload');
    const prompt = requireString(box.prompt, 'prompt');
    const image = requireString(box.image, 'image');
    const base64Image = image.replace(/^data:image\/[^;]+;base64,/, '');
    const result = await inference.runInference(prompt, base64Image);
    if (result.error) throw new Error(result.error);
    return { response: result.response };
  });

  ipcMain.handle('sunny:decide-action', async (event, payload) => {
    rateLimit('sunny:decide-action');
    assertTrustedSender(event);
    const box = requirePlainObject(payload, 'payload');
    const prompt = requireString(box.prompt, 'prompt');
    const result = await inference.runInference(prompt, null);
    if (result.error) throw new Error(result.error);
    return { response: result.response };
  });

  ipcMain.handle('sunny:execute-actions', async (event, actions) => {
    rateLimit('sunny:execute-actions');
    assertTrustedSender(event);
    if (!Array.isArray(actions) || actions.length > MAX_ACTIONS_PER_BATCH) {
      throw new Error(`Sunny received too many actions (limit is ${MAX_ACTIONS_PER_BATCH}).`);
    }
    assertPayloadSize(actions, 'action batch');
    for (const action of actions) {
      const result = interceptAction(action);
      if (result.verdict === 'block') {
        throw new Error(`Blocked: ${result.reason}`);
      }
    }
    return executeActions(actions);
  });

  ipcMain.handle('sunny:cancel-actions', () => {
    automationCancelled = true;
    return { cancelled: true };
  });

  ipcMain.handle('sunny:window-action', (event, action) => {
    assertTrustedSender(event);
    if (!mainWindow) return;
    if (action === 'hide') mainWindow.hide();
    if (action === 'show') mainWindow.show();
    if (action === 'close') mainWindow.close();
  });

  // --- Model lifecycle ---------------------------------------------------
  ipcMain.handle('sunny:get-model-status', () => inference.getModelStatus());

  ipcMain.handle('sunny:init-model', async (event) => {
    rateLimit('sunny:init-model');
    assertTrustedSender(event);
    await inference.initModel((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sunny:model-progress', status);
      }
    });
    return inference.getModelStatus();
  });

  // --- Tool bridge (sunnyBrain / accessible UI) --------------------------
  ipcMain.handle('sunny:execute-tool', (event, toolName, params) => {
    assertTrustedSender(event);
    return handleExecuteTool('sunny:execute-tool', toolName, params);
  });

  ipcMain.handle('sunny:get-system-status', (event) => {
    assertTrustedSender(event);
    rateLimit('sunny:get-system-status');
    return withTimeout(buildSystemStatus(), TOOL_CALL_TIMEOUT_MS, 'The system check took too long and was stopped.');
  });

  ipcMain.handle('sunny:speak-notification', (event, payload) => {
    assertTrustedSender(event);
    const box = requirePlainObject(payload, 'notification');
    return handleExecuteTool('sunny:speak-notification', 'speak_notification', box);
  });

  ipcMain.handle('sunny:search-recipe', (event, payload) => {
    assertTrustedSender(event);
    const box = requirePlainObject(payload, 'recipe search');
    return handleExecuteTool('sunny:search-recipe', 'search_recipe', box);
  });

  ipcMain.handle('sunny:get-daily-digest', (event, payload) => {
    assertTrustedSender(event);
    const box = requirePlainObject(payload || {}, 'daily digest');
    return handleExecuteTool('sunny:get-daily-digest', 'get_daily_digest', box);
  });

  ipcMain.handle('sunny:schedule-medication-reminder', (event, payload) => {
    assertTrustedSender(event);
    const box = requirePlainObject(payload, 'medication reminder');
    return handleExecuteTool('sunny:schedule-medication-reminder', 'schedule_medication_reminder', box);
  });

  ipcMain.handle('sunny:medication-taken', (event, payload) => {
    assertTrustedSender(event);
    const box = requirePlainObject(payload, 'medication taken');
    const reminderId = requireString(box.reminderId, 'reminderId');
    const reminder = medicationReminders.get(reminderId);
    if (reminder) {
      reminder.lastTaken = new Date().toISOString();
      reminder.enabled = false; // Disable after taking
      medicationReminders.set(reminderId, reminder);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sunny:medication-reminder-updated', reminder);
      }
      return { success: true };
    }
    throw new Error('Reminder not found');
  });

  ipcMain.handle('sunny:get-medication-reminders', () => {
    return Array.from(medicationReminders.values());
  });

  ipcMain.handle('sunny:delete-medication-reminder', (event, payload) => {
    assertTrustedSender(event);
    const box = requirePlainObject(payload, 'delete reminder');
    const reminderId = requireString(box.reminderId, 'reminderId');
    medicationReminders.delete(reminderId);
    return { success: true };
  });

  ipcMain.handle('sunny:get-available-tools', () => SUNNY_TOOLS.slice());

  ipcMain.handle('sunny:is-tool-available', (_event, toolName) => SUNNY_TOOLS.includes(requireString(toolName, 'toolName')));

  // --- Debug logs --------------------------------------------------------
  ipcMain.handle('sunny:write-debug-log', (_event, entry) => {
    rateLimit('sunny:write-debug-log');
    assertPayloadSize(entry, 'debug log entry');
    const serialized = JSON.stringify(entry === undefined ? null : entry);
    if (serialized.length > MAX_LOG_ENTRY_CHARS) {
      throw new Error(`Debug log entry is too large (limit ${MAX_LOG_ENTRY_CHARS} characters).`);
    }
    inference.writeDebugLog(entry);
    return { success: true };
  });

  ipcMain.handle('sunny:clear-debug-logs', () => inference.clearDebugLogs());
  ipcMain.handle('sunny:export-debug-logs', () => inference.exportDebugLogs());
  ipcMain.handle('sunny:get-debug-log-count', () => inference.getDebugLogCount());

  // --- Content sanitisation ---------------------------------------------
  ipcMain.handle('sunny:sanitize-content', (_event, text) => {
    if (typeof text !== 'string') return '';
    if (text.length > MAX_PAYLOAD_BYTES) return '';
    return sanitizeUntrustedContent(text);
  });

  // --- Encrypted credentials --------------------------------------------
  ipcMain.handle('sunny:save-credential', (_event, key, value) => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('Invalid credential parameters.');
    }
    if (key.length > 128) throw new Error('Credential key is too long.');
    ensureCredentialsDir();
    const filePath = getCredentialPath(key);
    if (!value.trim()) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return { success: true };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS-level encryption is not available on this system.');
    }
    const encrypted = safeStorage.encryptString(value);
    fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
    return { success: true };
  });

  ipcMain.handle('sunny:load-credential', (_event, key) => {
    if (typeof key !== 'string') throw new Error('Invalid credential key.');
    const filePath = getCredentialPath(key);
    if (!fs.existsSync(filePath)) return { value: '' };
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS-level encryption is not available on this system.');
    }
    const encrypted = fs.readFileSync(filePath);
    const value = safeStorage.decryptString(encrypted);
    return { value };
  });

  ipcMain.handle('sunny:delete-credential', (_event, key) => {
    if (typeof key !== 'string') throw new Error('Invalid credential key.');
    const filePath = getCredentialPath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true };
  });

  createWindow();
  startStatusBroadcast();

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });

  inference.initModel((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sunny:model-progress', status);
    }
  }).catch(() => {});
});

app.on('window-all-closed', () => {
  stopStatusBroadcast();
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
