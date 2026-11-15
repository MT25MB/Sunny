/**
 * Behavioural tests for the desktop-app launcher.
 *
 * Recurring bug: telling Sunny to open Calculator printed "Done." and
 * nothing happened. The launcher must (a) never block on a GUI app's
 * lifetime, and (b) report a missing/unlaunchable app instead of claiming
 * success.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { launchExecutable, mapError } = require('../../src/electron/launch-executable.cjs');

const NODE = process.execPath;

test('a long-running process resolves without waiting for it to exit', async () => {
  // This child stays alive for 30s; if the launcher waited for exit, the
  // test would hang. It must resolve on the spawn event instead.
  const started = Date.now();
  const result = await launchExecutable(
    NODE,
    ['-e', 'setInterval(() => {}, 1000)']
  );
  const elapsed = Date.now() - started;

  assert.deepEqual(result, { launched: true });
  assert.ok(elapsed < 10000, `resolution must not wait for the child (took ${elapsed}ms)`);
});

test('a missing executable reports a readable error instead of claiming success', async () => {
  const result = await launchExecutable(
    'sunny-definitely-not-a-real-program-9f8e7d6c',
    []
  );
  assert.equal(result.launched, false);
  assert.match(result.error, /was not found on this computer/i);
});

test('a program that spawns then exits immediately still counts as launched', async () => {
  // GUI apps that delegate to another process (e.g. explorer forwarding to
  // an already-running shell) may exit immediately. That is a successful
  // launch, not a failure.
  const result = await launchExecutable(NODE, ['-e', 'process.exit(0)']);
  assert.deepEqual(result, { launched: true });
});

test('arguments are passed as an array, never as one shell string', () => {
  // If a shell string ("spawn(exe + ' ' + args.join(' '))") were introduced,
  // metacharacters in arguments would be reinterpreted by the shell. Pin the
  // shape: spawn gets the executable and the argument array separately.
  const fs = require('node:fs');
  const launchSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'electron', 'launch-executable.cjs'),
    'utf8'
  );
  assert.match(launchSrc, /spawn\(exe,\s*args \|\| \[\]/);
  assert.ok(!/spawn\(\s*[`'"]/.test(launchSrc), 'spawn must not receive a templated command string');
});

test('mapError maps ENOENT and friends to friendly messages', () => {
  const enoent = mapError('thing', { code: 'ENOENT' });
  assert.equal(enoent.launched, false);
  assert.match(enoent.error, /was not found/);

  const notFound127 = mapError('thing', { code: 127 });
  assert.equal(notFound127.launched, false);
  assert.match(notFound127.error, /was not found/);

  const timeout = mapError('thing', { code: 'ETIMEDOUT' });
  assert.match(timeout.error, /took too long/i);

  const denied = mapError('thing', { code: 'EPERM' });
  assert.match(denied.error, /permission/i);

  const other = mapError('thing', { message: 'weird failure' });
  assert.equal(other.error, 'weird failure');
});
