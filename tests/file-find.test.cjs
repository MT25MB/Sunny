/**
 * File-find capability regressions: a file-location request must be handled
 * deterministically (no model), return the found path in the chat, and reveal
 * the file in Explorer through a validated action.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const ROUTER = require(path.join(REPO, 'src', 'electron', 'command-router.cjs'));
const { extractFileName, findUserFile } = require(path.join(REPO, 'src', 'electron', 'file-finder.cjs'));
const MAIN = fs.readFileSync(path.join(REPO, 'src', 'electron', 'main.cjs'), 'utf8');

test('extracts a filename from the exact reported phrasing', () => {
  assert.equal(
    extractFileName('can you find the BWSI.txt file on my computer? where is it? open it up in file explorer'),
    'BWSI.txt'
  );
  assert.equal(extractFileName('find my notes.txt and open it'), 'notes.txt');
  assert.equal(extractFileName('where is photo.JPG'), 'photo.JPG');
  assert.equal(extractFileName('when is thanksgiving this year?'), null);
});

test('rejects path-like and oversized names (no path traversal)', () => {
  assert.equal(extractFileName('find ..\\..\\Windows\\system.ini'), null);
  assert.equal(extractFileName('find C:\\secret.txt'), null);
  assert.equal(extractFileName(`find ${'a'.repeat(200)}.txt`), null);
});

test('finds a file by exact name within bounded roots', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sunny-find-'));
  try {
    fs.mkdirSync(path.join(root, 'Documents', 'school'), { recursive: true });
    const target = path.join(root, 'Documents', 'school', 'BWSI.txt');
    fs.writeFileSync(target, 'hello');
    const found = await findUserFile('BWSI.txt', [path.join(root, 'Documents')]);
    assert.equal(found, target);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('returns null when no file matches', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sunny-find-'));
  try {
    const found = await findUserFile('missing.txt', [root]);
    assert.equal(found, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reveal_file is an allowed, validated action type', () => {
  const action = ROUTER.sanitiseModelAction({ type: 'reveal_file', path: 'C:\\Users\\me\\Documents\\BWSI.txt' });
  assert.deepEqual(action, { type: 'reveal_file', path: 'C:\\Users\\me\\Documents\\BWSI.txt' });
  assert.equal(ROUTER.sanitiseModelAction({ type: 'reveal_file', path: '' }), null);
  assert.equal(ROUTER.sanitiseModelAction({ type: 'reveal_file', path: 42 }), null);
});

test('main routes file finds before the model and reveals files safely', () => {
  assert.ok(MAIN.includes('parseFileFind'), 'must handle file finds deterministically');
  assert.ok(MAIN.includes('showItemInFolder'), 'must reveal the file in Explorer');
  assert.ok(MAIN.includes('outside your folders'), 'must reject paths outside user folders');
  const findAt = MAIN.indexOf('const fileFind = await parseFileFind');
  const modelAt = MAIN.indexOf('runConfiguredInference(withBrainProtocol');
  assert.ok(findAt !== -1 && findAt < modelAt, 'file find must happen before model inference');
});
