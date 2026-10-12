const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, safeStorage, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const inference = require('./inference.cjs');
const { interceptAction, sanitizeUntrustedContent } = require('../main/security/interceptor.cjs');

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

let mainWindow;
let automationModule;
let automationCancelled = false;

const isDev = !app.isPackaged;
const rendererUrl = process.env.SUNNY_RENDERER_URL || 'http://localhost:5173';

const APP_OPEN_MAP = {
  browser: process.platform === 'darwin' ? 'https://' : process.platform === 'win32' ? 'start "" "https://"' : 'xdg-open https://',
  email: process.platform === 'darwin' ? 'mailto:' : process.platform === 'win32' ? 'start "" "mailto:"' : 'xdg-open mailto:',
  mail: process.platform === 'darwin' ? 'mailto:' : process.platform === 'win32' ? 'start "" "mailto:"' : 'xdg-open mailto:',
  calculator: process.platform === 'darwin' ? 'open -a Calculator' : process.platform === 'win32' ? 'start calc' : 'gnome-calculator',
  files: process.platform === 'darwin' ? 'open -a Finder' : process.platform === 'win32' ? 'start explorer' : 'nautilus',
  finder: 'open -a Finder',
  // terminal removed for security — opening a shell is a prerequisite for command injection
  notepad: process.platform === 'win32' ? 'start notepad' : 'open -a TextEdit',
  textedit: 'open -a TextEdit',
  settings: process.platform === 'darwin' ? 'open -a "System Settings"' : process.platform === 'win32' ? 'start ms-settings:' : 'gnome-control-center',
  word: 'open -a "Microsoft Word"',
  excel: 'open -a "Microsoft Excel"',
  calendar: process.platform === 'darwin' ? 'open -a Calendar' : process.platform === 'win32' ? 'start outlookcal:' : 'gnome-calendar',
  maps: process.platform === 'darwin' ? 'open -a Maps' : 'https://maps.google.com',
  weather: process.platform === 'darwin' ? 'open -a Weather' : 'https://weather.com',
  music: process.platform === 'darwin' ? 'open -a Music' : process.platform === 'win32' ? 'start mspaint' : 'rhythmbox',
  photos: process.platform === 'darwin' ? 'open -a Photos' : process.platform === 'win32' ? 'start msphotos:' : 'shotwell',
};

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

async function executeActions(actions) {
  const automation = await getAutomation();
  automationCancelled = false;
  for (const action of actions) {
    if (automationCancelled) return { completed: 0, cancelled: true };
    if (!action || typeof action.type !== 'string') throw new Error('Sunny received an invalid desktop action.');

    if (action.type === 'move' && Number.isFinite(action.x) && Number.isFinite(action.y)) {
      await automation.mouse.setPosition(new automation.Point(action.x, action.y));
    } else if (action.type === 'click') {
      await automation.mouse.click(action.button === 'right' ? automation.Button.RIGHT : automation.Button.LEFT);
    } else if (action.type === 'type' && typeof action.text === 'string' && action.text.length <= 4000) {
      await automation.keyboard.type(action.text);
    } else if (action.type === 'key' && typeof action.key === 'string') {
      await automation.keyboard.pressKey(automation.Key[action.key]);
    } else if (action.type === 'scroll' && Number.isFinite(action.amount)) {
      await automation.mouse.scrollDown(action.amount);
    } else if (action.type === 'wait' && Number.isFinite(action.ms) && action.ms <= 10000) {
      await new Promise((resolve) => setTimeout(resolve, action.ms));
    } else if (action.type === 'screenshot') {
      // Screenshot is handled by captureScreen separately
    } else if (action.type === 'open_app' && typeof action.app === 'string') {
      const appKey = action.app.toLowerCase();
      const cmd = APP_OPEN_MAP[appKey];
      if (cmd) {
        // Use shell.openExternal for URLs, exec only for app launch commands
        if (cmd.startsWith('http') || cmd.startsWith('mailto')) {
          shell.openExternal(cmd);
        } else {
          const { exec } = require('node:child_process');
          exec(cmd, (err) => {
            if (err) throw new Error(`Could not open ${action.app}.`);
          });
        }
      } else {
        throw new Error(`Sunny does not know how to open "${action.app}".`);
      }
    } else {
      throw new Error('Sunny stopped because an action was not safe to run.');
    }
  }
  return { completed: actions.length, cancelled: false };
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  ipcMain.handle('sunny:capture-screen', captureScreen);

  ipcMain.handle('sunny:analyze-screen', async (_event, payload) => {
    if (!payload || typeof payload.prompt !== 'string' || typeof payload.image !== 'string') {
      throw new Error('Sunny needs a prompt and screenshot.');
    }
    const base64Image = payload.image.replace(/^data:image\/[^;]+;base64,/, '');
    const result = await inference.runInference(payload.prompt, base64Image);
    if (result.error) throw new Error(result.error);
    return { response: result.response };
  });

  ipcMain.handle('sunny:decide-action', async (_event, payload) => {
    if (!payload || typeof payload.prompt !== 'string') {
      throw new Error('Sunny needs a prompt to decide actions.');
    }
    const result = await inference.runInference(payload.prompt, null);
    if (result.error) throw new Error(result.error);
    return { response: result.response };
  });

  ipcMain.handle('sunny:execute-actions', async (_event, actions) => {
    if (!Array.isArray(actions) || actions.length > 30) throw new Error('Sunny received too many actions.');
    // Interceptor: validate every action before execution
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

  ipcMain.handle('sunny:window-action', (_event, action) => {
    if (!mainWindow) return;
    if (action === 'hide') mainWindow.hide();
    if (action === 'show') mainWindow.show();
    if (action === 'close') mainWindow.close();
  });

  ipcMain.handle('sunny:get-model-status', () => {
    return inference.getModelStatus();
  });

  ipcMain.handle('sunny:init-model', async (event) => {
    await inference.initModel((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sunny:model-progress', status);
      }
    });
    return inference.getModelStatus();
  });

  ipcMain.handle('sunny:write-debug-log', (_event, entry) => {
    inference.writeDebugLog(entry);
    return { success: true };
  });

  ipcMain.handle('sunny:clear-debug-logs', () => {
    return inference.clearDebugLogs();
  });

  ipcMain.handle('sunny:export-debug-logs', () => {
    return inference.exportDebugLogs();
  });

  ipcMain.handle('sunny:sanitize-content', (_event, text) => {
    if (typeof text !== 'string') return '';
    return sanitizeUntrustedContent(text);
  });

  ipcMain.handle('sunny:get-debug-log-count', () => {
    return inference.getDebugLogCount();
  });

  ipcMain.handle('sunny:save-credential', (_event, key, value) => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('Invalid credential parameters.');
    }
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
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});
