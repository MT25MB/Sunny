/**
 * Action Interceptor — validates every tool call BEFORE execution.
 *
 * Three verdicts:
 *   ALLOW    — safe to execute immediately
 *   BLOCK    — rejected, never execute
 *   CONFIRM  — needs explicit user approval before executing
 *
 * Also provides sanitizeUntrustedContent() to strip instruction-like
 * strings from screen OCR, web content, and file content before that
 * text is fed back into the agent context window.
 */

export type InterceptorVerdict = 'allow' | 'block' | 'confirm';

export type InterceptorResult = {
  verdict: InterceptorVerdict;
  reason: string;
  /** Human-friendly label shown in the confirmation modal when verdict === 'confirm' */
  confirmLabel?: string;
  /** Longer explanation shown under the label */
  confirmReason?: string;
};

// ---------------------------------------------------------------------------
// 1. Dangerous shell / terminal command blocklist
// ---------------------------------------------------------------------------

const BLOCKED_COMMAND_PATTERNS: RegExp[] = [
  /\brm\b/i,
  /\bdel\b(\s|\/)/i,
  /\brmdir\b/i,
  /\bdel\b\s+/i,
  /\bformat\b/i,
  /\bpowershell\b/i,
  /\bcmd\b(\.exe)?\s*\/?/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\b\s+if=/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bkillall\b/i,
  /\btaskkill\b/i,
  /\breg\s+delete\b/i,
  /\bregedit\b/i,
  /\bnet\s+user\b/i,
  /\bnet\s+localgroup\b/i,
  /\bat\s+\d/i, // scheduled task creation
  /\bschtasks\b/i,
  /\bcron\b/i,
  /\bsystemctl\b/i,
  /\bservice\s+(stop|delete|disable)\b/i,
  /\bipc\s+config\b/i,
  /\bftp\b\s+/i,
  /\bscp\b\s+/i,
  /\bwget\b\s+/i,
  /\bcurl\b.*\|\s*(sh|bash|python|perl)/i,
  /\bnohup\b/i,
  /\bhistory\s+-c\b/i,
  /\bexport\s+(PATH|LD_LIBRARY_PATH|DYLD)/i,
];

// ---------------------------------------------------------------------------
// 2. High-risk action patterns requiring confirmation
// ---------------------------------------------------------------------------

const FILE_DELETION_PATTERNS: RegExp[] = [
  /\b(delete|remove|trash|erase|wipe|shred)\b/i,
  /\bmove\s+to\s+trash\b/i,
  /\bempty\s+(the\s+)?(recycle|trash)\b/i,
  /\brm\s+/i,
  /\bdel\s+/i,
];

const EMAIL_SEND_PATTERNS: RegExp[] = [
  /\b(send|reply|forward|compose)\b.*\b(email|mail|message|inbox)/i,
  /\bmailto:/i,
  /\bsend\s+(it|now|this)/i,
  /\bclick\s+send\b/i,
];

const PURCHASE_PATTERNS: RegExp[] = [
  /\b(buy|purchase|pay|checkout|order|subscribe|donate)\b/i,
  /\b(add\s+to\s+cart|complete\s+purchase|place\s+order)\b/i,
  /\benter\s+(card|credit|payment)\b/i,
];

const CLOSE_UNSAVED_PATTERNS: RegExp[] = [
  /\b(close|quit|exit)\b.*\b(unsaved|without saving|discard|don.?t save)\b/i,
  /\b(alt\+f4|cmd\+q|command\+q)\b/i,
  /\bforce\s+quit\b/i,
  /\bkill\s+(process|app|application)\b/i,
];

const OVERWRITE_PATTERNS: RegExp[] = [
  /\b(overwrite|replace|rename)\b/i,
  /\bsave\s+(over|as)\b/i,
];

const SYSTEM_CHANGE_PATTERNS: RegExp[] = [
  /\b(install|uninstall|disable|enable)\b.*\b(antivirus|firewall|defender|security)\b/i,
  /\bchange\s+(password|pin|credentials)\b/i,
  /\b(disable|turn\s+off)\s+(firewall|antivirus|uac|protection)\b/i,
];

// ---------------------------------------------------------------------------
// 3. Indirect prompt injection defense
// ---------------------------------------------------------------------------

const INSTRUCTION_LIKE_PATTERNS: RegExp[] = [
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
  /<%(.*?)%>/gi, // template injection
  /\{\{(.*?)\}\}/gi, // template injection
];

/**
 * Strip instruction-like strings from untrusted content (screen OCR,
 * web page text, file contents) before feeding it back into the agent
 * context window.  Replaces matched substrings with [FILTERED].
 */
export function sanitizeUntrustedContent(text: string): string {
  let sanitized = text;
  for (const pattern of INSTRUCTION_LIKE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[FILTERED]');
  }
  return sanitized;
}

// ---------------------------------------------------------------------------
// 4. Action type definitions (mirrors desktop-actions.ts but usable in main)
// ---------------------------------------------------------------------------

type AnyAction = {
  type: string;
  text?: string;
  key?: string;
  app?: string;
  button?: string;
  x?: number;
  y?: number;
  amount?: number;
  ms?: number;
};

// ---------------------------------------------------------------------------
// 5. Core interception logic
// ---------------------------------------------------------------------------

export function interceptAction(action: unknown): InterceptorResult {
  if (!action || typeof action !== 'object') {
    return { verdict: 'block', reason: 'Action is not a valid object.' };
  }

  const a = action as AnyAction;
  if (typeof a.type !== 'string') {
    return { verdict: 'block', reason: 'Action has no type field.' };
  }

  switch (a.type) {
    case 'screenshot':
      return { verdict: 'allow', reason: 'Screenshot is safe.' };

    case 'wait':
      return { verdict: 'allow', reason: 'Wait is safe.' };

    case 'move':
      return { verdict: 'allow', reason: 'Mouse move is safe.' };

    case 'scroll':
      return { verdict: 'allow', reason: 'Scroll is safe.' };

    case 'click':
      // Right-click is moderate but not blocked
      return { verdict: 'allow', reason: 'Click is safe.' };

    case 'key':
      return interceptKey(a);

    case 'type':
      return interceptType(a);

    case 'open_app':
      return interceptOpenApp(a);

    default:
      return { verdict: 'block', reason: `Unknown action type: "${a.type}".` };
  }
}

function interceptKey(a: AnyAction): InterceptorResult {
  if (!a.key) {
    return { verdict: 'block', reason: 'Key action has no key specified.' };
  }

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

  // High-risk keys
  if (a.key === 'Delete' || a.key === 'Backspace') {
    return {
      verdict: 'confirm',
      reason: 'Delete/Backspace key pressed.',
      confirmLabel: 'Delete key',
      confirmReason: 'Pressing Delete or Backspace may remove text, files, or items. This may not be undoable.',
    };
  }

  // App-quit combos
  if (/^(Meta|Alt)\+Q$/i.test(a.key) || /^(Meta|Alt)\+(F4)$/i.test(a.key)) {
    return {
      verdict: 'confirm',
      reason: 'App quit key combination.',
      confirmLabel: 'Close application',
      confirmReason: 'This keyboard shortcut closes the active application. Unsaved work could be lost.',
    };
  }

  return { verdict: 'allow', reason: 'Key is safe.' };
}

function interceptType(a: AnyAction): InterceptorResult {
  if (typeof a.text !== 'string') {
    return { verdict: 'block', reason: 'Type action has no text.' };
  }

  const text = a.text;

  // Check for blocked shell commands
  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(text)) {
      return {
        verdict: 'block',
        reason: `Blocked: text matches dangerous command pattern.`,
        confirmLabel: 'Blocked command',
        confirmReason: `Sunny detected a dangerous command in the text it was about to type: "${text.slice(0, 80)}". This was blocked for your safety.`,
      };
    }
  }

  // Check for high-risk patterns requiring confirmation
  for (const p of FILE_DELETION_PATTERNS) {
    if (p.test(text)) {
      return {
        verdict: 'confirm',
        reason: 'File deletion text detected.',
        confirmLabel: 'Delete files',
        confirmReason: 'Sunny is about to type text that could delete files or data. Deleted items may not be recoverable.',
      };
    }
  }

  for (const p of EMAIL_SEND_PATTERNS) {
    if (p.test(text)) {
      return {
        verdict: 'confirm',
        reason: 'Email send text detected.',
        confirmLabel: 'Send email or message',
        confirmReason: 'Sunny is about to type text related to sending an email or message. Sent messages cannot be un-sent.',
      };
    }
  }

  for (const p of PURCHASE_PATTERNS) {
    if (p.test(text)) {
      return {
        verdict: 'confirm',
        reason: 'Purchase text detected.',
        confirmLabel: 'Make a purchase or payment',
        confirmReason: 'Sunny is about to type text related to making a purchase or payment. Money may be spent.',
      };
    }
  }

  for (const p of CLOSE_UNSAVED_PATTERNS) {
    if (p.test(text)) {
      return {
        verdict: 'confirm',
        reason: 'Close unsaved app text detected.',
        confirmLabel: 'Close unsaved application',
        confirmReason: 'Sunny is about to type text that could close an application with unsaved work.',
      };
    }
  }

  for (const p of OVERWRITE_PATTERNS) {
    if (p.test(text)) {
      return {
        verdict: 'confirm',
        reason: 'Overwrite text detected.',
        confirmLabel: 'Overwrite or replace content',
        confirmReason: 'Sunny is about to type text that could overwrite or replace existing content. The previous version could be lost.',
      };
    }
  }

  for (const p of SYSTEM_CHANGE_PATTERNS) {
    if (p.test(text)) {
      return {
        verdict: 'confirm',
        reason: 'System change text detected.',
        confirmLabel: 'Change system settings',
        confirmReason: 'Sunny is about to type text that could change system or security settings. This can affect other apps or accounts.',
      };
    }
  }

  return { verdict: 'allow', reason: 'Type text is safe.' };
}

function interceptOpenApp(a: AnyAction): InterceptorResult {
  if (typeof a.app !== 'string') {
    return { verdict: 'block', reason: 'open_app action has no app specified.' };
  }

  const app = a.app.toLowerCase();

  // Block terminal/shell apps entirely — they are a prerequisite for shell injection
  const blockedApps = ['terminal', 'cmd', 'powershell', 'bash', 'sh', 'zsh'];
  if (blockedApps.includes(app)) {
    return {
      verdict: 'block',
      reason: `Blocked app: "${a.app}". Opening a terminal or shell is blocked for security.`,
    };
  }

  // Email is moderate — needs confirmation for "send" flows
  if (app === 'email' || app === 'mail') {
    return {
      verdict: 'confirm',
      reason: 'Opening email app.',
      confirmLabel: 'Open email application',
      confirmReason: 'Sunny is about to open your email application. Please confirm this is what you want.',
    };
  }

  return { verdict: 'allow', reason: 'App is safe to open.' };
}

// ---------------------------------------------------------------------------
// 6. Batch interception
// ---------------------------------------------------------------------------

export type BatchInterceptionResult = {
  allowed: unknown[];
  blocked: { action: unknown; reason: string }[];
  confirm: { action: unknown; confirmLabel: string; confirmReason: string }[];
  hasBlocked: boolean;
  hasConfirm: boolean;
};

export function interceptActions(actions: unknown[]): BatchInterceptionResult {
  const allowed: unknown[] = [];
  const blocked: { action: unknown; reason: string }[] = [];
  const confirm: { action: unknown; confirmLabel: string; confirmReason: string }[] = [];

  for (const action of actions) {
    const result = interceptAction(action);
    switch (result.verdict) {
      case 'allow':
        allowed.push(action);
        break;
      case 'block':
        blocked.push({ action, reason: result.reason });
        break;
      case 'confirm':
        confirm.push({
          action,
          confirmLabel: result.confirmLabel ?? 'Confirm action',
          confirmReason: result.confirmReason ?? 'This action needs your approval before proceeding.',
        });
        break;
    }
  }

  return {
    allowed,
    blocked,
    confirm,
    hasBlocked: blocked.length > 0,
    hasConfirm: confirm.length > 0,
  };
}

// ---------------------------------------------------------------------------
// 7. Parameter ambiguity detection
// ---------------------------------------------------------------------------

export type AmbiguityResult = {
  isAmbiguous: boolean;
  question: string;
};

export function checkParameterAmbiguity(action: unknown): AmbiguityResult {
  if (!action || typeof action !== 'object') {
    return { isAmbiguous: false, question: '' };
  }

  const a = action as AnyAction;
  if (typeof a.type !== 'string') {
    return { isAmbiguous: false, question: '' };
  }

  switch (a.type) {
    case 'type':
      if (typeof a.text !== 'string' || a.text.trim() === '') {
        return {
          isAmbiguous: true,
          question: 'What should I type in the text field?',
        };
      }
      break;

    case 'open_app':
      if (typeof a.app !== 'string' || a.app.trim() === '') {
        return {
          isAmbiguous: true,
          question: 'Which application should I open?',
        };
      }
      break;

    case 'key':
      if (typeof a.key !== 'string' || a.key.trim() === '') {
        return {
          isAmbiguous: true,
          question: 'Which key should I press?',
        };
      }
      break;

    case 'click':
      // Click with no position context is ambiguous if we don't know what we're clicking
      // The brain should have observed the screen first, so we only flag if truly empty
      break;

    case 'move':
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) {
        return {
          isAmbiguous: true,
          question: 'Where should I move the cursor?',
        };
      }
      break;

    case 'scroll':
      if (!Number.isFinite(a.amount)) {
        return {
          isAmbiguous: true,
          question: 'How much should I scroll?',
        };
      }
      break;
  }

  return { isAmbiguous: false, question: '' };
}

export function checkBatchAmbiguity(actions: unknown[]): AmbiguityResult | null {
  for (const action of actions) {
    const result = checkParameterAmbiguity(action);
    if (result.isAmbiguous) {
      return result;
    }
  }
  return null;
}
