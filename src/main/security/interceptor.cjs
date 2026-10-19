'use strict';

/**
 * Action Interceptor (CJS) — validates every tool call BEFORE execution.
 * This is the plain-JS version used by Electron's main process.
 */

const BLOCKED_COMMAND_PATTERNS = [
  /\brm\b/i, /\bdel\b(\s|\/)/i, /\brmdir\b/i, /\bformat\b/i,
  /\bpowershell\b/i, /\bcmd\b(\.exe)?\s*\/?/i, /\bsudo\b/i,
  /\bshutdown\b/i, /\breboot\b/i, /\bmkfs\b/i, /\bdd\b\s+if=/i,
  /\bchmod\b/i, /\bchown\b/i, /\bkillall\b/i, /\btaskkill\b/i,
  /\breg\s+delete\b/i, /\bregedit\b/i, /\bnet\s+user\b/i,
  /\bnet\s+localgroup\b/i, /\bat\s+\d{1,2}:\d{2}\s+\//i, /\bschtasks\b/i,
  /\bcron\b/i, /\bsystemctl\b/i,
  /\bservice\s+(stop|delete|disable)\b/i, /\bftp\b\s+/i,
  /\bscp\b\s+/i, /\bwget\b\s+/i,
  /\bcurl\b.*\|\s*(sh|bash|python|perl)/i, /\bnohup\b/i,
  /\bhistory\s+-c\b/i, /\bexport\s+(PATH|LD_LIBRARY_PATH|DYLD)/i,
];

/**
 * English function words. Their density distinguishes a sentence from a
 * command line.
 *
 * The blocked patterns above match bare command names, so applied literally to
 * every string Sunny types they also fire on ordinary speech: "call the doctor
 * at 3pm", "format the letter", "set up a cron schedule". Hard-blocking a user
 * for typing a sentence is the worst possible failure for this policy, so a
 * blocked pattern only applies to text that is genuinely command-shaped.
 */
const PROSE_WORDS =
  /\b(?:i|me|my|mine|you|your|yours|we|our|he|she|they|them|it|its|the|a|an|and|or|but|so|to|of|in|on|at|for|with|from|by|as|is|are|was|were|be|been|am|do|does|did|can|could|will|would|should|shall|may|might|must|please|need|want|like|call|email|write|make|get|tell|show|find|help|know|think|when|what|where|which|who|why|how|then|than|about|after|before|also|very|really|just|still|even|some|any|there|here|now|today|tomorrow|set|up|out|again|more|less|later|tonight|schedule|remind|bring|read|look|thank|please)\b/gi;

/** True when the text reads as a sentence rather than a command line. */
function looksLikeProse(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  // A single token is a command, not prose.
  if (words.length < 2) return false;
  const hits = (text.match(PROSE_WORDS) || []).length;
  return hits >= 2;
}

/**
 * A command position: the very start of the text, or right after something
 * that chains commands (`&&`, `||`, `;`, `|`, `$`, a newline, or a prompt).
 * "rm" here is a shell command; "the rm button" is not.
 */
const COMMAND_POSITION = /(?:^|[;&|$\n>]\s*)\S/;

function isCommandShaped(text) {
  if (looksLikeProse(text)) return false;
  return COMMAND_POSITION.test(text.trim());
}

const FILE_DELETION_PATTERNS = [
  /\b(delete|remove|trash|erase|wipe|shred)\b/i, /\bmove\s+to\s+trash\b/i,
  /\bempty\s+(the\s+)?(recycle|trash)\b/i, /\brm\s+/i, /\bdel\s+/i,
];
const EMAIL_SEND_PATTERNS = [
  /\b(send|reply|forward|compose)\b.*\b(email|mail|message|inbox)/i,
  /\bmailto:/i, /\bsend\s+(it|now|this)/i, /\bclick\s+send\b/i,
];
const PURCHASE_PATTERNS = [
  /\b(buy|purchase|pay|checkout|order|subscribe|donate)\b/i,
  /\b(add\s+to\s+cart|complete\s+purchase|place\s+order)\b/i,
  /\benter\s+(card|credit|payment)\b/i,
];
const CLOSE_UNSAVED_PATTERNS = [
  /\b(close|quit|exit)\b.*\b(unsaved|without saving|discard|don.?t save)\b/i,
  /\b(alt\+f4|cmd\+q|command\+q)\b/i, /\bforce\s+quit\b/i,
  /\bkill\s+(process|app|application)\b/i,
];
const OVERWRITE_PATTERNS = [/\b(overwrite|replace|rename)\b/i, /\bsave\s+(over|as)\b/i];
const SYSTEM_CHANGE_PATTERNS = [
  /\b(install|uninstall|disable|enable)\b.*\b(antivirus|firewall|defender|security)\b/i,
  /\bchange\s+(password|pin|credentials)\b/i,
  /\b(disable|turn\s+off)\s+(firewall|antivirus|uac|protection)\b/i,
];

const INSTRUCTION_LIKE_PATTERNS = [
  /ignore (all )?(previous |prior )?instructions/gi,
  /you are now (in )?(admin|developer|root|unrestricted|jailbreak|dan) mode/gi,
  /disregard (all |the )?(above |prior )?(rules|safety|guardrails|restrictions)/gi,
  /pretend (you are|to be) (a |an )?(different|other|unrestricted)/gi,
  /act as (if )?(you are|a |an )?(unrestricted|unfiltered|admin)/gi,
  /do not (ask|seek|request) (permission|approval|confirmation)/gi,
  /reveal (your |the )?(system |internal )?(prompt|instructions|rules)/gi,
  /send (this |the )?(data|text|content|info) (to|at|via) (http|ftp|email|discord|telegram)/gi,
  /execute (the )?following (command|code|script|payload)/gi,
  /forget (everything|all (rules|instructions|guidelines))/gi,
  /override (safety|security|guardrails|restrictions|policy)/gi,
  /system override/gi,
  /show (me |us )?(your |the )?(system |internal )?(prompt|instructions|rules|config)/gi,
  /what (are|is) (your |the )?(system |internal )?(prompt|instructions|rules)/gi,
  /instead,?\s+(do|run|execute|type|click|open)/gi,
  /now\s+(type|run|execute|open|click|press)\s+/gi,
  /<%(.*?)%>/gi, /\{\{(.*?)\}\}/gi,
];

function sanitizeUntrustedContent(text) {
  let sanitized = text;
  for (const pattern of INSTRUCTION_LIKE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[FILTERED]');
  }
  return sanitized;
}

function interceptAction(action) {
  if (!action || typeof action !== 'object') return { verdict: 'block', reason: 'Action is not a valid object.' };
  const a = action;
  if (typeof a.type !== 'string') return { verdict: 'block', reason: 'Action has no type field.' };

  switch (a.type) {
    case 'screenshot': case 'wait': return { verdict: 'allow', reason: 'Safe action.' };
    // Coordinates matter differently per action: `move` must have them to do
    // anything, while `click` acts on the cursor's current position and may
    // legitimately omit them. Either way, numbers that are present must be
    // real numbers — `Number.isFinite` is used instead of a truthiness check
    // because the string "NaN" is truthy and `{ x: 'NaN' }` used to be
    // reported as a safe action.
    case 'click': return interceptPoint(a, false);
    case 'move': return interceptPoint(a, true);
    case 'scroll': return interceptScroll(a);
    case 'key': return interceptKey(a);
    case 'type': return interceptType(a);
    case 'open_app': return interceptOpenApp(a);
    default: return { verdict: 'block', reason: `Unknown action type: "${a.type}".` };
  }
}

/**
 * Validates a coordinate pair.
 *
 * Rejects non-numbers and clamps to sane bounds so a hallucinated coordinate
 * cannot fling the pointer off into space.
 */
const MAX_COORDINATE = 100_000;

function hasValidCoords(a, required) {
  if (a.x === undefined && a.y === undefined) return !required;
  if (a.x === undefined || a.y === undefined) return false;
  if (typeof a.x !== 'number' || typeof a.y !== 'number') return false;
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return false;
  return a.x >= 0 && a.y >= 0 && a.x <= MAX_COORDINATE && a.y <= MAX_COORDINATE;
}

function interceptPoint(a, required) {
  if (!hasValidCoords(a, required)) {
    return {
      verdict: 'block',
      reason: required
        ? 'Action is missing usable coordinates.'
        : 'Action has invalid coordinates.',
    };
  }
  return { verdict: 'allow', reason: 'Safe action.' };
}

function interceptScroll(a) {
  if (a.amount === undefined || a.amount === null) {
    return { verdict: 'block', reason: 'Scroll action has no amount.' };
  }
  if (typeof a.amount !== 'number' || !Number.isFinite(a.amount)) {
    return { verdict: 'block', reason: 'Scroll amount is not a number.' };
  }
  if (Math.abs(a.amount) > MAX_COORDINATE) {
    return { verdict: 'block', reason: 'Scroll amount is unreasonably large.' };
  }
  return { verdict: 'allow', reason: 'Safe action.' };
}

function interceptKey(a) {
  if (!a.key) return { verdict: 'block', reason: 'Key action has no key specified.' };

  // Blocked key combos (shell-level danger)
  const blockedKeyPatterns = [
    /Meta\+Key/,
    /Control\+C.*Control\+C/, // Ctrl+C Ctrl+C in terminal
  ];
  for (const p of blockedKeyPatterns) {
    if (p.test(a.key)) {
      return { verdict: 'block', reason: `Blocked key combination: "${a.key}".` };
    }
  }

  if (a.key === 'Delete' || a.key === 'Backspace') {
    return { verdict: 'confirm', reason: 'Delete/Backspace key.', confirmLabel: 'Delete key', confirmReason: 'Pressing Delete or Backspace may remove text, files, or items. This may not be undoable.' };
  }
  if (/^(Meta|Alt)\+Q$/i.test(a.key) || /^(Meta|Alt)\+(F4)$/i.test(a.key)) {
    return { verdict: 'confirm', reason: 'App quit key.', confirmLabel: 'Close application', confirmReason: 'This keyboard shortcut closes the active application. Unsaved work could be lost.' };
  }
  return { verdict: 'allow', reason: 'Key is safe.' };
}

function interceptType(a) {
  if (typeof a.text !== 'string') return { verdict: 'block', reason: 'Type action has no text.' };
  const text = a.text;

  for (const p of BLOCKED_COMMAND_PATTERNS) {
    // Only command-shaped text is hard-blocked; the same word inside a
    // sentence falls through to the confirm groups below, which is the right
    // level for "delete the old photos".
    if (p.test(text) && isCommandShaped(text)) {
      return { verdict: 'block', reason: `Blocked: text matches dangerous command pattern.`, confirmLabel: 'Blocked command', confirmReason: `Sunny detected a dangerous command in the text it was about to type: "${text.slice(0, 80)}". This was blocked.` };
    }
  }
  const confirmGroups = [
    { patterns: FILE_DELETION_PATTERNS, label: 'Delete files', reason: 'Sunny is about to type text that could delete files or data. Deleted items may not be recoverable.' },
    { patterns: EMAIL_SEND_PATTERNS, label: 'Send email or message', reason: 'Sunny is about to type text related to sending an email or message. Sent messages cannot be un-sent.' },
    { patterns: PURCHASE_PATTERNS, label: 'Make a purchase or payment', reason: 'Sunny is about to type text related to making a purchase or payment. Money may be spent.' },
    { patterns: CLOSE_UNSAVED_PATTERNS, label: 'Close unsaved application', reason: 'Sunny is about to type text that could close an application with unsaved work.' },
    { patterns: OVERWRITE_PATTERNS, label: 'Overwrite or replace content', reason: 'Sunny is about to type text that could overwrite or replace existing content.' },
    { patterns: SYSTEM_CHANGE_PATTERNS, label: 'Change system settings', reason: 'Sunny is about to type text that could change system or security settings.' },
  ];
  for (const group of confirmGroups) {
    for (const p of group.patterns) {
      if (p.test(text)) return { verdict: 'confirm', reason: 'High-risk text detected.', confirmLabel: group.label, confirmReason: `${group.reason} Text: "${text.slice(0, 80)}"` };
    }
  }
  return { verdict: 'allow', reason: 'Type text is safe.' };
}

function interceptOpenApp(a) {
  if (typeof a.app !== 'string') return { verdict: 'block', reason: 'open_app action has no app specified.' };
  const app = a.app.toLowerCase();
  const blockedApps = ['terminal', 'cmd', 'powershell', 'bash', 'sh', 'zsh'];
  if (blockedApps.includes(app)) return { verdict: 'block', reason: `Blocked app: "${a.app}". Opening a terminal or shell is blocked for security.` };
  if (app === 'email' || app === 'mail') return { verdict: 'confirm', reason: 'Opening email app.', confirmLabel: 'Open email application', confirmReason: 'Sunny is about to open your email application. Please confirm this is what you want.' };
  return { verdict: 'allow', reason: 'App is safe to open.' };
}

function checkParameterAmbiguity(action) {
  if (!action || typeof action !== 'object') return { isAmbiguous: false, question: '' };
  const a = action;
  if (typeof a.type !== 'string') return { isAmbiguous: false, question: '' };
  switch (a.type) {
    case 'type':
      if (typeof a.text !== 'string' || a.text.trim() === '') return { isAmbiguous: true, question: 'What should I type in the text field?' };
      break;
    case 'open_app':
      if (typeof a.app !== 'string' || a.app.trim() === '') return { isAmbiguous: true, question: 'Which application should I open?' };
      break;
    case 'key':
      if (typeof a.key !== 'string' || a.key.trim() === '') return { isAmbiguous: true, question: 'Which key should I press?' };
      break;
    case 'move':
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { isAmbiguous: true, question: 'Where should I move the cursor?' };
      break;
    case 'scroll':
      if (!Number.isFinite(a.amount)) return { isAmbiguous: true, question: 'How much should I scroll?' };
      break;
  }
  return { isAmbiguous: false, question: '' };
}

module.exports = { interceptAction, sanitizeUntrustedContent, checkParameterAmbiguity };
