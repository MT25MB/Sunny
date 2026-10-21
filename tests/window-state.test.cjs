/**
 * Tests for the window geometry maths.
 *
 * The window's size is derived from the display rather than hard-coded, so
 * it fits an old 1024x768 panel and a 4K monitor alike. These cover the
 * sizing and anchoring rules under plain Node, with no Electron.
 *
 * Run with:  node --test tests/
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeSizeForArea,
  anchorBottomRight,
  clamp,
  MIN_WIDTH,
  MIN_HEIGHT,
  EDGE_MARGIN,
} = require('../src/electron/window-state.cjs');

/** A work area for a display, with the given size. */
const area = (width, height) => ({ x: 0, y: 0, width, height });

test('the default size fits inside every screen it is given', () => {
  const screens = [
    { name: 'old 1024x768 panel', width: 1024, height: 728 },
    { name: '1366x768 laptop', width: 1366, height: 728 },
    { name: '1920x1080 desktop', width: 1920, height: 1040 },
    { name: '2560x1440 monitor', width: 2560, height: 1400 },
  ];

  for (const screen of screens) {
    const { width, height } = computeSizeForArea(area(screen.width, screen.height), 'comfortable');
    assert.ok(width <= screen.width, `${screen.name}: width ${width} exceeds the screen`);
    assert.ok(height <= screen.height, `${screen.name}: height ${height} exceeds the screen`);
  }
});

test('the default size never drops below a readable minimum', () => {
  for (const screen of [
    { width: 1024, height: 728 },
    { width: 1366, height: 728 },
    { width: 1920, height: 1040 },
  ]) {
    const { width, height } = computeSizeForArea(area(screen.width, screen.height), 'comfortable');
    assert.ok(width >= MIN_WIDTH, `width ${width} is below the minimum`);
    assert.ok(height >= MIN_HEIGHT, `height ${height} is below the minimum`);
  }
});

test('a bigger screen gets a bigger window', () => {
  const small = computeSizeForArea(area(1024, 728), 'comfortable');
  const large = computeSizeForArea(area(2560, 1400), 'comfortable');
  assert.ok(large.width > small.width, 'a wider screen should get a wider window');
  assert.ok(large.height > small.height, 'a taller screen should get a taller window');
});

test('the presets are ordered by size', () => {
  const a = area(1920, 1040);
  const compact = computeSizeForArea(a, 'compact');
  const comfortable = computeSizeForArea(a, 'comfortable');
  const large = computeSizeForArea(a, 'large');
  assert.ok(compact.width < comfortable.width, 'compact should be narrower');
  assert.ok(comfortable.width < large.width, 'comfortable should be narrower than large');
  assert.ok(compact.height < comfortable.height, 'compact should be shorter');
  assert.ok(comfortable.height < large.height, 'comfortable should be shorter than large');
});

test('an unknown preset falls back to the comfortable size', () => {
  const a = area(1920, 1040);
  assert.deepEqual(
    computeSizeForArea(a, 'nonsense'),
    computeSizeForArea(a, 'comfortable'),
  );
});

test('the window is anchored in the bottom-right corner with a margin', () => {
  const { width, height } = computeSizeForArea(area(1920, 1040), 'comfortable');
  const { x, y } = anchorBottomRight(area(1920, 1040), width, height);
  assert.equal(x, 1920 - width - EDGE_MARGIN);
  assert.equal(y, 1040 - height - EDGE_MARGIN);
  assert.ok(x + width <= 1920, 'the window must not run off the right edge');
  assert.ok(y + height <= 1040, 'the window must not run off the bottom edge');
});

test('the anchor respects a secondary display that is not at the origin', () => {
  const secondary = { x: 1920, y: -200, width: 1280, height: 1000 };
  const { width, height } = computeSizeForArea(secondary, 'comfortable');
  const { x, y } = anchorBottomRight(secondary, width, height);
  assert.equal(x, 1920 + 1280 - width - EDGE_MARGIN);
  assert.equal(y, -200 + 1000 - height - EDGE_MARGIN);
});

test('clamp keeps a value inside its bounds', () => {
  assert.equal(clamp(5, 10, 20), 10);
  assert.equal(clamp(15, 10, 20), 15);
  assert.equal(clamp(25, 10, 20), 20);
});