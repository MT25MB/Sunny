/**
 * The single source of truth for desktop tools Sunny may ask for.
 *
 * The tool list, the protocol sent to the model, the allow-list in the router,
 * the security interceptor and the executor used to be four hand-written lists
 * that drifted apart. Each tool is declared once here; the protocol text and
 * the emitted type set are derived from this table. Per-tool field validation
 * still lives in command-router.cjs because it knows the exact shapes.
 */

'use strict';

/** Permission categories, ordered from harmless to dangerous. */
const PERMISSIONS = {
  none: { label: 'No permission needed', default: 'always' },
  open: { label: 'Open apps and websites', default: 'always' },
  screen: { label: 'Look at the screen', default: 'always' },
  mouse: { label: 'Control the mouse and keyboard', default: 'ask' },
  files: { label: 'Change your files', default: 'ask' },
  system: { label: 'Change Windows settings', default: 'ask' },
  terminal: { label: 'Run terminal commands', default: 'off' },
};

/** @type {Array<{name:string, fields:string, description:string, permission:string, risk:string, timeoutMs?:number}>} */
const TOOLS = [
  {
    name: 'open_app', fields: 'app',
    description: 'Open or launch an app installed on the computer. Pass its name in app.',
    permission: 'open', risk: 'low',
  },
  {
    name: 'web_search', fields: 'query',
    description: 'Search the web. Pass the search words in query.',
    permission: 'open', risk: 'low',
  },
  {
    name: 'screenshot', fields: '',
    description: 'Take a screenshot of the screen.',
    permission: 'screen', risk: 'low',
  },
  {
    name: 'window_action', fields: 'action: minimize, maximize, close, show, hide',
    description: 'Act on this window. Pass the action in action.',
    permission: 'none', risk: 'low',
  },
  { name: 'copy', fields: '', description: 'Copy the selection.', permission: 'mouse', risk: 'low' },
  { name: 'paste', fields: '', description: 'Paste from the clipboard.', permission: 'mouse', risk: 'low' },
  { name: 'select_all', fields: '', description: 'Select everything.', permission: 'mouse', risk: 'low' },
  { name: 'wait', fields: 'ms', description: 'Wait for a short time, in milliseconds.', permission: 'none', risk: 'low' },
  { name: 'scroll', fields: 'amount', description: 'Scroll the screen by an amount.', permission: 'mouse', risk: 'low' },
  {
    name: 'reveal_file', fields: 'path',
    description: 'Show a file in File Explorer. Pass its path in path.',
    permission: 'open', risk: 'low',
  },
  {
    name: 'blender_scene', fields: 'operations: delete_cube, add_plane, add_cube, add_sphere, clear_scene',
    description: 'Make a small, fixed edit to a Blender scene.',
    permission: 'mouse', risk: 'medium',
  },
  {
    name: 'routine',
    fields: 'action: save, list, forget, run; phrase; steps',
    description: 'Save a phrase for repeating a job, list saved routines, forget one, or run one. Pass the routine steps in their own words.',
    permission: 'files', risk: 'medium',
  },
  {
    name: 'use_computer', fields: 'task',
    description:
      'Use the mouse and keyboard to do any multi-step job inside an app or website. ' +
      'Pass the whole job in the user\'s own words in task, including any message to send. ' +
      'One call runs the entire job step by step.',
    permission: 'mouse', risk: 'high', timeoutMs: 180_000,
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

/** The set of action types the router may emit. */
const SAFE_ACTION_TYPES = new Set(TOOLS.map((tool) => tool.name));

/** Fields for the action-protocol prompt, derived from the registry. */
function actionFields() {
  return TOOLS.map((tool) => `${tool.name}${tool.fields ? ` (${tool.fields})` : ''}`).join(', ');
}

/** Permission category for an action, defaulting to the safest 'none' for unknown types. */
function permissionFor(action) {
  if (!action || typeof action.type !== 'string') return 'none';
  const tool = BY_NAME.get(action.type);
  return tool ? tool.permission : 'none';
}

module.exports = { TOOLS, PERMISSIONS, SAFE_ACTION_TYPES, actionFields, permissionFor };
