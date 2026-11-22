/**
 * Regression: Chat, Commands and Activity Log are three separate workspace
 * areas. They share one message store but never mix entries, and each gets the
 * full height of the window instead of the old 400px chat cap.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
const BRAIN = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'services', 'sunnyBrain.ts'), 'utf8'
);
const CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');

test('message model tags every entry with its section', () => {
  assert.match(BRAIN, /export type MessageKind = 'chat' \| 'command' \| 'event'/);
  assert.match(BRAIN, /kind: MessageKind;/);
  assert.match(BRAIN, /kind: MessageKind = 'event'/, 'status messages default to the Activity Log');
});

test('chat and command submissions tag their own messages', () => {
  const chat = APP.slice(APP.indexOf('const handleChatSubmit'), APP.indexOf('const handleCommandSubmit'));
  assert.match(chat, /addMessage\("user", input, "chat"\)/);
  assert.match(chat, /addMessage\("assistant", decision\.response \|\| "Done\.", "chat"\)/);
  const cmd = APP.slice(APP.indexOf('const handleCommandSubmit'));
  assert.match(cmd, /addMessage\("user", task, "command"\)/);
  assert.match(cmd, /"command"/);
});

test('the three views filter messages independently', () => {
  assert.match(APP, /chatMessages = useMemo\(\(\) => messages\.filter\(\(m\) => m\.kind === "chat"\)/);
  assert.match(APP, /commandMessages = useMemo\(\(\) => messages\.filter\(\(m\) => m\.kind === "command"\)/);
  assert.match(APP, /activityMessages = useMemo\(\(\) => messages\.filter\(\(m\) => m\.kind === "event"\)/);
});

test('all four workspace tabs are present and chat is the default view', () => {
  assert.match(APP, /useState<"chat" \| "commands" \| "activity" \| "routines">\("chat"\)/);
  assert.match(APP, /role="tablist" aria-label="Workspace sections"/);
  assert.match(APP, /<MessageSquare size=\{18\} \/> Chat/);
  assert.match(APP, /<Terminal size=\{18\} \/> Commands/);
  assert.match(APP, /<ScrollText size=\{18\} \/> Activity Log/);
  assert.match(APP, /<Bookmark size=\{18\} \/> Routines/);
  assert.equal((APP.match(/role="tab"/g) || []).length, 4);
});

test('each area has its own panel', () => {
  assert.match(APP, /className="chat-section"/);
  assert.match(APP, /className="commands-section"/);
  assert.match(APP, /className="activity-section"/);
  assert.match(APP, /className="activity-timeline" role="log"/);
});

test('existing element ids used by tests are preserved', () => {
  assert.ok(APP.includes('id="activity"'));
  assert.ok(APP.includes('id="quick-actions"'));
  assert.ok(APP.includes('id="activity-toggle"'));
});

test('the workspace is larger and uses the periwinkle accent', () => {
  assert.match(CSS, /\.workspace \{[\s\S]*?min-height: clamp\(600px, 88vh, 960px\)/);
  assert.match(CSS, /\.workspace-tab\.active \{[\s\S]*?border-color: var\(--accent\)/);
  assert.match(CSS, /\.activity-dot \{[\s\S]*?background: var\(--accent\)/);
});

test('Recent tasks gets usable height in a short window', () => {
  assert.match(CSS, /\.command-history \{[^}]*min-height: 200px/);
  assert.match(CSS, /\.command-history \.chat-msg \{[^}]*max-width: 100%/);
  assert.match(CSS, /\.commands-section \.action-btn \{[^}]*min-height: 68px/);
  assert.match(CSS, /\.commands-section \.btn-icon \{[^}]*width: 36px/);
});

test('the old 400px chat cap is removed', () => {
  const chatRules = [];
  let i = -1;
  while ((i = CSS.indexOf('.chat-section {', i + 1)) !== -1) {
    chatRules.push(CSS.slice(i, CSS.indexOf('}', i) + 1));
  }
  const all = chatRules.join(' ');
  assert.doesNotMatch(all, /max-height:\s*400px/, 'chat must fill the workspace');
  assert.match(all, /max-height:\s*none/);
  assert.match(all, /flex-direction:\s*column/);
  assert.match(all, /overflow:\s*hidden/);
});
