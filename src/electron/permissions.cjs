/**
 * Permission tiers for desktop actions.
 *
 * Computer control is on by default, but that does not mean every action runs
 * silently. Categories people can understand ("open apps", "change files",
 * "control the mouse") each have a tier. Guarded is the default: harmless
 * categories run straight away; actions in risky categories are held and the
 * assistant asks in plain words before running them.
 */

'use strict';

const { PERMISSIONS } = require('./tool-registry.cjs');

const TIERS = ['off', 'ask', 'always'];

/**
 * Default posture: on, with risky categories asking first.
 * @type {Record<string, 'off'|'ask'|'always'>}
 */
const DEFAULT_TIERS = {
  none: 'always',
  open: 'always',
  screen: 'always',
  mouse: 'ask',
  files: 'ask',
  system: 'ask',
  terminal: 'off',
};

/** Only known categories and valid tiers are accepted from Settings. */
function normaliseTiers(patch) {
  const next = { ...DEFAULT_TIERS };
  if (!patch || typeof patch !== 'object') return next;
  for (const [category, tier] of Object.entries(patch)) {
    if (Object.prototype.hasOwnProperty.call(PERMISSIONS, category) && TIERS.includes(tier)) {
      next[category] = tier;
    }
  }
  return next;
}

/**
 * @returns {{verdict:'allow'|'ask'|'deny', category:string, reason:string}}
 */
function decide(action, tiers, computerControlEnabled = true) {
  const category = require('./tool-registry.cjs').permissionFor(action);
  if (!computerControlEnabled && category !== 'none') {
    return { verdict: 'deny', category, reason: 'Computer control is turned off in Settings.' };
  }
  const tier = (tiers && tiers[category]) || DEFAULT_TIERS[category] || 'ask';
  if (tier === 'off') {
    return { verdict: 'deny', category, reason: `The "${PERMISSIONS[category]?.label || category}" permission is turned off.` };
  }
  if (tier === 'ask') {
    return { verdict: 'ask', category, reason: PERMISSIONS[category]?.label || category };
  }
  return { verdict: 'allow', category, reason: '' };
}

module.exports = { TIERS, DEFAULT_TIERS, normaliseTiers, decide };
