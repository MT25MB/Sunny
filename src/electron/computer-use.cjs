/**
 * Grounded computer use: do a whole job with the mouse and keyboard, one step
 * at a time. The model never gets to claim the job is done on its own — it must
 * call `done`, and the runner finishes only when that tool has been returned.
 *
 * This module is deliberately free of Electron imports so it can be unit
 * tested with fake inference, capture and action functions.
 */

'use strict';

const MAX_STEPS = 14;
const MAX_SCREENSHOTS_IN_PROMPT = 1;

const HANDS_PROMPT =
  'You are the hands of Sunny, a desktop assistant. You do one job with the mouse and keyboard, one step at a time, like a person would.\n' +
  'You never chat. Your words cannot touch the computer: only a tool can. Never say you opened, clicked or changed anything unless you called a tool for it.\n' +
  'You get the job, the steps already done, and the screen. Coordinates are pixels in the screenshot.\n' +
  'Call exactly one tool per turn. Allowed: click {x,y}, double_click {x,y}, type {text}, key {key}, hotkey {keys}, scroll {amount}, wait {ms}, screenshot, note {text}, ask {question}, fail {text}, done {text}.\n' +
  'Never type passwords, card numbers or other private details. If the job asks you to buy, pay or send something to someone new, call ask instead.\n' +
  'Open apps with the open_app action rather than hunting for them on the screen. When a step changes the screen, look again before the next click.\n' +
  'When the job is finished, call done and say what you did in one plain sentence. If you are stuck, call fail with a short reason.\n' +
  'Answer with a single JSON object and nothing else. Use {"action":{"type":"click","x":100,"y":200}} for a tool, or {"done":"I opened it."} when finished.';

/** Pull the first balanced JSON object out of a model reply. */
function extractDecisionObject(text) {
  const source = String(text ?? '');
  const start = source.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(source.slice(start, i + 1));
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const DIRECT_ACTIONS = new Set([
  'click', 'double_click', 'move', 'hover', 'drag', 'type', 'key', 'hotkey',
  'scroll', 'wait', 'screenshot', 'copy', 'paste', 'select_all',
  'open_app', 'reveal_file', 'web_search',
]);

/** Normalise a model decision into a runner decision. */
function parseDecision(raw) {
  const obj = extractDecisionObject(raw);
  if (!obj) return { kind: 'unclear' };

  for (const key of ['done', 'fail', 'ask']) {
    if (typeof obj[key] === 'string' && obj[key].trim()) {
      return { kind: key, text: obj[key].trim().slice(0, 400) };
    }
  }
  if (typeof obj.note === 'string' && obj.note.trim()) {
    return { kind: 'note', text: obj.note.trim().slice(0, 200) };
  }

  const action = obj.action && typeof obj.action === 'object' ? obj.action : null;
  if (action && typeof action.type === 'string' && DIRECT_ACTIONS.has(action.type)) {
    // Coordinates and text are numbers/strings from the model; the executor
    // applies its own bounds and forbidden-zone checks before anything runs.
    const clean = { type: action.type };
    for (const field of ['x', 'y', 'fromX', 'fromY', 'toX', 'toY', 'amount', 'ms', 'duration', 'button']) {
      if (typeof action[field] === 'number' && Number.isFinite(action[field])) clean[field] = action[field];
    }
    for (const field of ['text', 'key', 'keys', 'app', 'path', 'query']) {
      if (typeof action[field] === 'string') clean[field] = action[field].slice(0, 500);
    }
    if (Array.isArray(action.keys)) clean.keys = action.keys.filter((k) => typeof k === 'string').slice(0, 5);
    return { kind: 'action', action: clean };
  }
  return { kind: 'unclear' };
}

function buildPrompt(task, steps, screen, nudge, notes) {
  const history = steps.length
    ? steps.map((step) => `${step.n}. ${step.label}`).join('\n')
    : '(none yet)';
  const remembered = notes.length ? notes.join('; ') : '(none)';
  const warning = nudge
    ? '\nThe screen has not changed for two steps. Check whether the job is already done before clicking again.'
    : '';
  return (
    HANDS_PROMPT +
    '\n\nJob: ' + task +
    '\n\nSteps done so far:\n' + history +
    '\n\nNotes to remember: ' + remembered + warning +
    '\n\nThe current screen is attached. Decide the next single step.'
  );
}

/**
 * Run a job with the mouse and keyboard.
 *
 * @param {string} task the job in the user's own words
 * @param {object} deps
 * @param {(prompt:string, imageBase64:string)=>Promise<string>} deps.infer
 * @param {()=>Promise<{base64:string}>} deps.capture
 * @param {(actions:Array<object>)=>Promise<any>} deps.act
 * @param {()=>boolean} [deps.isCancelled]
 * @param {(info:object)=>void} [deps.onProgress]
 * @returns {Promise<{completed:boolean, response:string, steps:Array<object>, cancelled?:boolean, needsUser?:boolean, question?:string}>}
 */
async function runComputerUseJob(task, deps) {
  const { infer, capture, act } = deps;
  const isCancelled = deps.isCancelled || (() => false);
  const steps = [];
  const notes = [];
  let lastScreen = '';
  let unchanged = 0;
  let unclear = 0;

  for (let n = 1; n <= MAX_STEPS; n += 1) {
    if (isCancelled()) {
      return { completed: false, cancelled: true, response: 'Sunny stopped that job.', steps };
    }

    let screen;
    try {
      screen = await capture();
    } catch (err) {
      return { completed: false, response: 'Sunny could not look at the screen: ' + (err?.message || 'unknown error'), steps };
    }
    const base64 = String(screen?.base64 || '');
    const fingerprint = base64.length + ':' + base64.slice(0, 120);
    if (fingerprint === lastScreen) unchanged += 1;
    else unchanged = 0;
    lastScreen = fingerprint;

    let raw;
    try {
      raw = await infer(buildPrompt(task, steps, screen, unchanged >= 2, notes), base64);
    } catch (err) {
      return { completed: false, response: err?.message || 'Sunny could not work out the next step.', steps };
    }

    const decision = parseDecision(raw);
    if (decision.kind === 'done') {
      return { completed: true, response: decision.text, steps };
    }
    if (decision.kind === 'fail') {
      return { completed: false, response: decision.text, steps };
    }
    if (decision.kind === 'ask') {
      return { completed: false, needsUser: true, question: decision.text, response: decision.text, steps };
    }
    if (decision.kind === 'note') {
      notes.push(decision.text);
      steps.push({ n, label: 'noted: ' + decision.text });
      continue;
    }
    if (decision.kind === 'action' && decision.action) {
      unclear = 0;
      const chosen = decision.action;
      try {
        await act([chosen]);
      } catch (err) {
        return { completed: false, response: 'Sunny stopped: ' + (err?.message || 'the step failed'), steps };
      }
      const label = chosen.type + (chosen.text ? ': ' + String(chosen.text).slice(0, 40) : '');
      steps.push({ n, label });
      if (deps.onProgress) deps.onProgress({ step: n, label, total: MAX_STEPS });
      continue;
    }

    unclear += 1;
    steps.push({ n, label: 'waiting for a clear next step' });
    if (unclear >= 2) {
      return { completed: false, response: 'Sunny could not work out the next step, so it stopped.', steps };
    }
  }

  return {
    completed: false,
    response: 'Sunny used all ' + MAX_STEPS + ' steps without finishing that job.',
    steps,
  };
}

module.exports = { runComputerUseJob, parseDecision, buildPrompt, extractDecisionObject, HANDS_PROMPT, MAX_STEPS, MAX_SCREENSHOTS_IN_PROMPT };
