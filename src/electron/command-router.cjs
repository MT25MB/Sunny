/**
 * Deterministic command router.
 *
 * The chat decides everything through the AI model: the model answers in
 * prose and nothing reliable parses that prose back into desktop actions,
 * so commands like "open calculator" never reached the desktop at all -
 * the app told the user "Done." and did nothing.
 *
 * This router recognises the small set of safe, self-directed commands an
 * older adult is most likely to type and returns fully built actions,
 * without calling the model. It also lets the AI path return actions in a
 * strict JSON envelope and sanitises those before anything executes.
 *
 * Anything not recognised returns null; the caller then falls back to the
 * usual model path unchanged.
 */

'use strict';

/**
 * Apps the chat is allowed to open, keyed by every alias we accept.
 * One entry per alias. The keys match APP_EXE_OPENERS in main.cjs.
 */
const OPEN_APP_ALIASES = [
  ['calculator', 'calculator'],
  ['calc', 'calculator'],
  ['windows calculator', 'calculator'],
  ['file explorer', 'files'],
  ['file manager', 'files'],
  ['explorer', 'files'],
  ['files', 'files'],
  ['my files', 'files'],
  ['notepad', 'notepad'],
  ['text editor', 'notepad'],
  ['notes', 'notepad'],
  ['microsoft word', 'word'],
  ['word document', 'word'],
  ['word', 'word'],
  ['microsoft excel', 'excel'],
  ['spreadsheet', 'excel'],
  ['excel', 'excel'],
  ['control panel', 'settings'],
  ['system settings', 'settings'],
  ['settings', 'settings'],
  ['calendar', 'calendar'],
  ['photo gallery', 'photos'],
  ['gallery', 'photos'],
  ['photos', 'photos'],
  ['pictures', 'photos'],
];

const OPEN_APP_NAMES = {
  calculator: 'the Calculator',
  files: 'File Explorer',
  notepad: 'Notepad',
  word: 'Word',
  excel: 'Excel',
  settings: 'Settings',
  calendar: 'the Calendar',
  photos: 'the Photos app',
};

/**
 * "search up pineapple on google chrome", "google weather london",
 * "look up pasta recipes", "find flights to rome" -> a web search.
 * The trailing "on google chrome / on google / on the web" is optional.
 */
const WEB_SEARCH_RE = /^(?:search(?:\s+(?:up|for))?|google|look\s+up|web\s+search|search\s+the\s+web\s+for|find)\s+([a-z0-9 .,&+-]{2,120}?)(?:\s+(?:on|in)\s+(?:google(?:\s+chrome|\s+search)?|chrome|the\s+web|the\s+internet))?$/;

function parseWebSearch(text) {
  const match = text.match(WEB_SEARCH_RE);
  if (!match) return null;
  // Drop connector words the user didn't mean as part of the query
  // ("search the web for X" -> "X").
  let query = match[1].trim();
  while (/^(?:up|for|the|a|an|web|internet)\s+/i.test(query)) {
    query = query.replace(/^(?:up|for|the|a|an|web|internet)\s+/i, '');
  }
  if (query.length < 2) return null;
  return {
    response: `Searching for "${query}".`,
    actions: [{ type: 'web_search', query }],
  };
}

const TRAILING_FILLERS = /\s+(for me|please|now|thanks|thank you)\.?$/i;

/** Collapse case, punctuation and spacing so pattern matching is stable. */
function normaliseCommand(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[“”‘’"'!?.,;:()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING_FILLERS, '')
    .trim();
}

const LEADING_POLITE = /^(?:(?:please|kindly|hey|hi|hello|sunny|hey sunny)\s+)*/;

function parseOpenApp(text) {
  // "open the calculator", "launch my files", "can you open notepad", ...
  const match = text.match(
    new RegExp(
      '^(?:can you\\s+|could you\\s+|would you\\s+|will you\\s+|may i\\s+)?' +
        '(?:open|launch|start|run|show(?: me)?|bring up|fire up)\\s+' +
        '(?:up\\s+)?(?:the\\s+|my\\s+|a\\s+|an\\s+)?([a-z ]+?)$'
    )
  );
  if (!match) return null;
  const rest = match[1].replace(/\s+/g, ' ').trim();
  for (const [alias, app] of OPEN_APP_ALIASES) {
    if (rest === alias) return app;
  }
  return null;
}

function parseScreenshot(text) {
  if (/^(?:take|capture|grab|snap|save|get)\s+(?:a\s+|the\s+)?screen$/.test(text)) return true;
  const match = text.match(
    /^(?:take|capture|grab|snap|save|get)?\s*(?:a\s+|an\s+|the\s+)?(?:screenshot|screen shot|screen capture|screengrab|screengrab)(?:\s+of\s+(?:the\s+)?screen)?$|^screenshot(?:\s+(?:the|of)\s+(?:the\s+)?screen)?$/
  );
  return match !== null;
}

function parseWindowAction(text) {
  // Require an explicit window noun - a bare "close" is ambiguous
  // ("close calculator" must not close this app).
  const match = text.match(
    /^(minimize|maximize|maximise|close|hide|show|restore)\s+(?:the\s+|this\s+|my\s+)?(?:sunny\s+|(?:app|application|window)\s+)?window$/
  );
  if (!match) return null;
  const verb = match[1].replace(/maximise/g, 'maximize');
  const map = { minimize: 'minimize', maximize: 'maximize', close: 'close', hide: 'hide', show: 'show', restore: 'maximize' };
  return map[verb] ?? null;
}

function parseClipboard(text) {
  if (/^(?:copy|copy that|copy it)$/.test(text)) return 'copy';
  if (/^(?:paste|paste that|paste it)$/.test(text)) return 'paste';
  if (/^(?:select all|select everything|select all of it)$/.test(text)) return 'select_all';
  return null;
}

/**
 * @param {string} input raw user text
 * @returns {{ response: string, actions: Array<{type: string, [key: string]: unknown}> } | null}
 *   A fully built decision when the command is recognised, otherwise null.
 */
function parseCommand(input) {
  const text = normaliseCommand(input).replace(LEADING_POLITE, '').trim();
  if (!text) return null;

  const app = parseOpenApp(text);
  if (app) {
    return {
      response: `Opening ${OPEN_APP_NAMES[app] ?? app} for you.`,
      actions: [{ type: 'open_app', app }],
    };
  }

  const webSearch = parseWebSearch(text);
  if (webSearch) return webSearch;

  if (parseScreenshot(text)) {
    return {
      response: 'Taking a screenshot for you.',
      actions: [{ type: 'screenshot' }],
    };
  }

  const windowAction = parseWindowAction(text);
  if (windowAction) {
    const sentences = { minimize: 'Minimizing the window.', maximize: 'Maximizing the window.', close: 'Closing the window.', hide: 'Hiding the window.', show: 'Showing the window.' };
    return {
      response: sentences[windowAction] ?? 'Done.',
      actions: [{ type: 'window_action', action: windowAction }],
    };
  }

  const clipboard = parseClipboard(text);
  if (clipboard === 'copy') {
    return { response: 'Copied that to the clipboard.', actions: [{ type: 'copy' }] };
  }
  if (clipboard === 'paste') {
    return { response: 'Pasted from the clipboard.', actions: [{ type: 'paste' }] };
  }
  if (clipboard === 'select_all') {
    return { response: 'Selected everything on the screen.', actions: [{ type: 'select_all' }] };
  }

  return null;
}

/**
 * Action types the model is allowed to request through the JSON envelope.
 * Mouse and keyboard injection (click, drag, type, hotkey, key, move, hover)
 * are deliberately excluded: they drive other applications, and the generic
 * tool path does not confirm them first. The model may open apps, take a
 * screenshot, act on this window, clipboard and simple scrolls - nothing
 * that touches anything else the user has open.
 */
const SAFE_ACTION_TYPES = new Set([
  'open_app',
  'web_search',
  'screenshot',
  'window_action',
  'copy',
  'paste',
  'select_all',
  'wait',
  'scroll',
  'reveal_file',
]);

const WINDOW_ACTIONS = new Set(['minimize', 'maximize', 'close', 'hide', 'show', 'focus', 'restore', 'get_info']);

/**
 * Validate a single action from the JSON envelope. Returns the action with
 * only its known fields, or null when the action is not one of the safe,
 * self-directed kinds.
 */
function sanitiseModelAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return null;
  const type = action.type;
  if (typeof type !== 'string' || !SAFE_ACTION_TYPES.has(type)) return null;

  switch (type) {
    case 'open_app': {
      const app = typeof action.app === 'string' ? action.app.trim().toLowerCase() : '';
      // Only apps this build knows how to open.
      if (!OPEN_APP_ALIASES.some(([, key]) => key === app) && !['calculator', 'files', 'notepad', 'word', 'excel', 'settings', 'calendar', 'photos', 'maps', 'weather', 'music'].includes(app)) {
        return null;
      }
      return { type: 'open_app', app };
    }
    case 'web_search': {
      const query = typeof action.query === 'string' ? action.query.trim() : '';
      if (query.length < 2 || query.length > 120) return null;
      return { type: 'web_search', query };
    }
    case 'screenshot':
      return { type: 'screenshot' };
    case 'window_action': {
      const actionName = typeof action.action === 'string' ? action.action.trim().toLowerCase() : '';
      if (!WINDOW_ACTIONS.has(actionName)) return null;
      return { type: 'window_action', action: actionName };
    }
    case 'copy':
    case 'paste':
    case 'select_all':
      return { type };
    case 'wait': {
      const ms = Number(action.ms);
      if (!Number.isFinite(ms) || ms < 0 || ms > 10000) return null;
      return { type: 'wait', ms: Math.round(ms) };
    }
    case 'scroll': {
      const amount = Number(action.amount);
      if (!Number.isFinite(amount) || Math.abs(amount) > 10000) return null;
      return { type: 'scroll', amount: Math.trunc(amount) };
    }
    case 'reveal_file': {
      const filePath = typeof action.path === 'string' ? action.path.trim() : '';
      if (!filePath || filePath.length > 500 || filePath.includes('\0')) return null;
      // main.cjs additionally checks the path is inside a known user folder.
      return { type: 'reveal_file', path: filePath };
    }
    default:
      return null;
  }
}

/**
 * Extract the strict action envelope from raw model prose.
 *
 * The model is asked to answer either with plain words (no action) or with
 * a single JSON object {"response": "...", "actions": [...]}. We scan for a
 * brace-balanced object rather than trusting the whole string to be JSON,
 * then keep only the safe action types.
 *
 * @returns {{ response: string, actions?: Array<object> } | null}
 *   null when there is no JSON envelope (plain text answer - caller keeps
 *   the text as-is, with no actions).
 */
function extractActionEnvelope(modelText) {
  const text = String(modelText ?? '');
  const start = text.indexOf('{');
  if (start === -1) return null;

  // Walk forward tracking depth so we can stop at the matching brace.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        let parsed;
        try {
          parsed = JSON.parse(candidate);
        } catch {
          return null;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const response = typeof parsed.response === 'string' ? parsed.response.trim() : '';
        const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
        const actions = rawActions.map(sanitiseModelAction).filter(Boolean);
        const envelope = { response };
        if (actions.length > 0) envelope.actions = actions;
        return envelope;
      }
    }
  }
  return null;
}

/**
 * Chat protocol for the AI path. This is an instruction block, NOT a suffix:
 * it must come BEFORE the user's question so the question is the last thing
 * the model reads. A previous version ended the prompt with a concrete
 * `{"response": "short reply for the user", "actions": [open calculator]}`
 * example. Small models copied that example verbatim for every prompt they
 * could not handle, replying "short reply..." and launching the calculator
 * even for plain questions. Placeholders and an explicit "never copy" rule
 * prevent that; ordinary questions are answered in prose with no JSON.
 */
const ACTION_PROTOCOL_SUFFIX =
  '\n\nIf the user explicitly asks you to operate this computer, reply with a single JSON object and nothing else. ' +
  'It must have a "response" field containing your own short answer and an "actions" array when an action is needed. ' +
  'Each action has a "type" field plus the fields that type requires. ' +
  'Never copy instruction text into your answer. ' +
  'Allowed action types: open_app (app), web_search (query), screenshot, window_action (action: minimize, maximize, close, show, hide), copy, paste, select_all, wait (ms), scroll (amount), reveal_file (path). ' +
  'Only include actions the user clearly asked for. For everything else, answer in plain words with no JSON.';

/**
 * A plain question must NOT be sent with the action protocol. Small models
 * copy whatever example string is in the prompt, so a conversational prompt
 * contains no JSON, no examples and no placeholders — just the question.
 * @param {string} text
 * @returns {boolean}
 */
function isConversationalPrompt(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (/\?$/.test(t)) return true;
  return /^(what|when|where|why|how|who|which|tell me|explain|define|describe|is|are|do|does|did|can you|could you|i want|i need|i'm|i am|help me|hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(t);
}

/** Build a clean prompt for a conversational question. */
function buildChatPrompt(userPrompt) {
  return 'Answer the user\'s question in one short, friendly paragraph. ' +
    'If you do not know, say so plainly.\n\n' +
    `User: ${String(userPrompt ?? '').trim()}\nAssistant:`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** The zero-based day-of-month of the nth weekday in a given month. */
function nthWeekdayOfMonth(year, month, weekday, nth) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

/** Resolve a year named in the question, with relative terms taking priority. */
function resolveQuestionYear(text) {
  const now = new Date().getFullYear();
  if (/\bnext year\b/.test(text)) return now + 1;
  if (/\blast year\b/.test(text)) return now - 1;
  if (/\bthis year\b/.test(text)) return now;
  const explicit = text.match(/\b(20\d{2})\b/);
  return explicit ? Number(explicit[1]) : now;
}

// Holidays whose date is the same every year.
const FIXED_DATE_HOLIDAYS = [
  { re: /\bnew year'?s? day\b/, name: "New Year's Day", month: 0, day: 1 },
  { re: /\bvalentine'?s? day\b/, name: "Valentine's Day", month: 1, day: 14 },
  { re: /\bindependence day\b|\b(?:4th|fourth) of july\b/, name: 'Independence Day', month: 6, day: 4 },
  { re: /\bhalloween\b/, name: 'Halloween', month: 9, day: 31 },
  { re: /\bchristmas\b/, name: 'Christmas Day', month: 11, day: 25 },
];

/**
 * Answer common factual date questions without any model call.
 *
 * The embedded model is a small vision-language model with no world knowledge:
 * for a question like "When is thanksgiving this year?" it echoes prompt
 * fragments, which the security guard correctly discards, leaving the user with
 * a sorry-can't-help message. Computing these answers here makes them exact,
 * instant and impossible to leak — the model never sees the question.
 *
 * @param {string} prompt
 * @returns {{ response: string } | null} null when the model path should handle it
 */
function parseFactualQuestion(prompt) {
  const text = String(prompt ?? '').trim().toLowerCase();
  if (!text) return null;

  // Questions about Sunny herself must always get a real answer, even when no
  // model is running. These are facts about the app, not guesses.
  if (/^(what|who) are you\b|\bwhat is sunny\b|\bwho are you\b/.test(text)) {
    return {
      response:
        "I'm Sunny, your desktop companion. I can check your computer health, read your morning digest aloud, manage medication reminders, find files, open apps, and answer everyday questions.",
    };
  }
  if (/^help\b|\bwhat can you do\b|\bwhat can you help\b/.test(text)) {
    return {
      response:
        'I can check your computer health, read your digest aloud, set medication reminders, find files, open apps, and answer questions. Just tell me what you need in plain words.',
    };
  }

  const year = resolveQuestionYear(text);

  // US Thanksgiving: the fourth Thursday of November.
  if (/\bthanksgiving\b/.test(text)) {
    const day = nthWeekdayOfMonth(year, 10, 4, 4);
    return {
      response: `Thanksgiving in the United States falls on ${WEEKDAY_NAMES[4]}, November ${day}, ${year}.`,
    };
  }

  for (const holiday of FIXED_DATE_HOLIDAYS) {
    if (holiday.re.test(text)) {
      const weekday = new Date(year, holiday.month, holiday.day).getDay();
      return {
        response: `${holiday.name} falls on ${WEEKDAY_NAMES[weekday]}, ${MONTH_NAMES[holiday.month]} ${holiday.day}, ${year}.`,
      };
    }
  }

  return null;
}

/**
 * Reject model output that is just an echoed placeholder from an old prompt.
 * @param {string} text
 * @returns {string} the cleaned answer, or '' when it must not be shown
 */
function sanitizeChatAnswer(text) {
  const answer = String(text ?? '').trim();
  if (!answer) return '';
  if (/<your own short answer>|<action type>|<field>|<value>|short reply for the user|short reply from the user/i.test(answer)) return '';
  if (/^\{[\s\S]*\}$/.test(answer)) return '';
  return answer;
}

/**
 * SECURITY: never let prompt text reach the chat. Small local models can echo
 * their instructions verbatim; this is the last line of defence on EVERY model
 * reply, whichever prompt path produced it.
 * @param {string} text raw model output
 * @param {string} [userPrompt] the original user question
 * @returns {string} the safe answer, or '' when the reply must be discarded
 */
function sanitizeModelReply(text, userPrompt) {
  const answer = String(text ?? '').trim();
  if (!answer) return '';
  if (/<your own short answer>|<action type>|<field>|<value>|short reply for the user|short reply from the user/i.test(answer)) return '';
  if (/^\{[\s\S]*\}$/.test(answer)) return '';
  // Fragments of the system prompt or action protocol that must never be shown.
  const leakMarkers = [
    /you are sunny/i,
    /allowed action types/i,
    /i am designed solely to assist/i,
    /must never execute terminal scripts/i,
    /reply with a single json object/i,
    /if the user explicitly asks you to operate/i,
    /never copy instruction text/i,
    /for everything else, answer in plain words/i,
  ];
  if (leakMarkers.some((re) => re.test(answer))) return '';
  // An echoed "User: <their question>" pair is a full prompt replay.
  const cleanPrompt = String(userPrompt ?? '').trim();
  if (cleanPrompt.length >= 3 && answer.includes('User: ' + cleanPrompt.slice(0, 40))) return '';
  // A normal chat reply is short; a wall of text is almost always a leak.
  if (answer.length > 4000) return '';
  return answer;
}

module.exports = {
  sanitizeModelReply,
  parseFactualQuestion,
  parseCommand,
  parseWebSearch,
  normaliseCommand,
  sanitiseModelAction,
  extractActionEnvelope,
  isConversationalPrompt,
  buildChatPrompt,
  sanitizeChatAnswer,
  OPEN_APP_ALIASES,
  ACTION_PROTOCOL_SUFFIX,
  SAFE_ACTION_TYPES,
};
