export type ActionType = 'move' | 'click' | 'type' | 'key' | 'scroll' | 'screenshot' | 'wait' | 'open_app';

export type SafetyLevel = 'safe' | 'moderate' | 'destructive';

export type DesktopAction =
  | { type: 'move'; x: number; y: number }
  | { type: 'click'; button?: 'left' | 'right' }
  | { type: 'type'; text: string }
  | { type: 'key'; key: string }
  | { type: 'scroll'; amount: number }
  | { type: 'screenshot' }
  | { type: 'wait'; ms: number }
  | { type: 'open_app'; app: string };

const KEY_ALLOWLIST = new Set([
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Space',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Shift', 'Control', 'Alt', 'Meta',
  'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
]);

const APP_ALLOWLIST = new Set([
  'browser', 'email', 'mail', 'calculator', 'files', 'finder',
  'notepad', 'textedit', 'settings', 'word', 'excel',
  'calendar', 'maps', 'weather', 'music', 'photos',
]);

const MAX_TEXT_LENGTH = 4000;
const MAX_WAIT_MS = 10000;
const MAX_ACTIONS = 30;

export function validateAction(action: unknown): { valid: boolean; error?: string } {
  if (!action || typeof action !== 'object') {
    return { valid: false, error: 'Action must be an object.' };
  }
  const a = action as Record<string, unknown>;
  if (typeof a.type !== 'string') {
    return { valid: false, error: 'Action must have a type.' };
  }

  switch (a.type) {
    case 'move':
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) {
        return { valid: false, error: 'Move action requires finite x and y coordinates.' };
      }
      if ((a.x as number) < 0 || (a.y as number) < 0) {
        return { valid: false, error: 'Coordinates cannot be negative.' };
      }
      return { valid: true };

    case 'click':
      if (a.button !== undefined && a.button !== 'left' && a.button !== 'right') {
        return { valid: false, error: 'Click button must be "left" or "right".' };
      }
      return { valid: true };

    case 'type':
      if (typeof a.text !== 'string') {
        return { valid: false, error: 'Type action requires a text string.' };
      }
      if (a.text.length > MAX_TEXT_LENGTH) {
        return { valid: false, error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters.` };
      }
      return { valid: true };

    case 'key':
      if (typeof a.key !== 'string' || !KEY_ALLOWLIST.has(a.key)) {
        return { valid: false, error: `Key "${a.key}" is not in the allowlist.` };
      }
      return { valid: true };

    case 'scroll':
      if (!Number.isFinite(a.amount) || Math.abs(a.amount as number) > 5000) {
        return { valid: false, error: 'Scroll amount must be a reasonable finite number.' };
      }
      return { valid: true };

    case 'screenshot':
      return { valid: true };

    case 'wait':
      if (!Number.isFinite(a.ms) || (a.ms as number) < 0 || (a.ms as number) > MAX_WAIT_MS) {
        return { valid: false, error: `Wait duration must be between 0 and ${MAX_WAIT_MS}ms.` };
      }
      return { valid: true };

    case 'open_app':
      if (typeof a.app !== 'string' || !APP_ALLOWLIST.has(a.app.toLowerCase())) {
        return { valid: false, error: `App "${a.app}" is not in the allowlist.` };
      }
      return { valid: true };

    default:
      return { valid: false, error: `Unknown action type: "${a.type}".` };
  }
}

export function validateActionBatch(actions: unknown[]): { valid: boolean; error?: string } {
  if (!Array.isArray(actions)) {
    return { valid: false, error: 'Actions must be an array.' };
  }
  if (actions.length > MAX_ACTIONS) {
    return { valid: false, error: `Too many actions (max ${MAX_ACTIONS}).` };
  }
  for (let i = 0; i < actions.length; i++) {
    const result = validateAction(actions[i]);
    if (!result.valid) {
      return { valid: false, error: `Action ${i + 1}: ${result.error}` };
    }
  }
  return { valid: true };
}

const DESTRUCTIVE_KEYS = new Set<string>(['Backspace', 'Delete']);
const DESTRUCTIVE_TEXT_PATTERNS = /\b(delete|remove|trash|erase|wipe|overwrite|format|reset)\b/i;

export function classifyAction(action: DesktopAction, context?: { targetDescription?: string }): SafetyLevel {
  switch (action.type) {
    case 'screenshot':
    case 'wait':
      return 'safe';

    case 'move':
    case 'scroll':
      return 'safe';

    case 'open_app':
      return 'moderate';

    case 'click':
      if (action.button === 'right') return 'moderate';
      if (context?.targetDescription) {
        if (DESTRUCTIVE_TEXT_PATTERNS.test(context.targetDescription)) return 'destructive';
      }
      return 'moderate';

    case 'key':
      if (DESTRUCTIVE_KEYS.has(action.key)) return 'destructive';
      return 'moderate';

    case 'type':
      if (DESTRUCTIVE_TEXT_PATTERNS.test(action.text)) return 'destructive';
      return 'moderate';

    default:
      return 'moderate';
  }
}

export function classifyActions(actions: DesktopAction[]): {
  safe: DesktopAction[];
  moderate: DesktopAction[];
  destructive: DesktopAction[];
  hasDestructive: boolean;
} {
  const safe: DesktopAction[] = [];
  const moderate: DesktopAction[] = [];
  const destructive: DesktopAction[] = [];

  for (const action of actions) {
    const level = classifyAction(action);
    if (level === 'safe') safe.push(action);
    else if (level === 'moderate') moderate.push(action);
    else destructive.push(action);
  }

  return { safe, moderate, destructive, hasDestructive: destructive.length > 0 };
}

export function formatActionForDisplay(action: DesktopAction): string {
  switch (action.type) {
    case 'move':
      return `Move cursor to (${action.x}, ${action.y})`;
    case 'click':
      return `Click ${action.button === 'right' ? 'right' : 'left'} mouse button`;
    case 'type':
      return `Type "${action.text.length > 50 ? action.text.slice(0, 50) + '...' : action.text}"`;
    case 'key':
      return `Press ${action.key} key`;
    case 'scroll':
      return `Scroll ${action.amount > 0 ? 'down' : 'up'} by ${Math.abs(action.amount)} pixels`;
    case 'screenshot':
      return 'Capture screenshot';
    case 'wait':
      return `Wait ${action.ms}ms`;
    case 'open_app':
      return `Open ${action.app}`;
    default:
      return 'Unknown action';
  }
}
