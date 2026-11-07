/**
 * UNIT TESTS: Window state geometry
 * Tests for src/electron/window-state.cjs
 *
 * Pure functions testable under plain Node (no Electron required for sizing math).
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
  MIN_VISIBLE_WIDTH,
  MIN_VISIBLE_HEIGHT,
  SIZE_PRESETS,
} = require('../../src/electron/window-state.cjs');

// ============================================================================
// clamp
// ============================================================================

test('clamp: keeps value inside bounds', () => {
  assert.equal(clamp(5, 10, 20), 10);
  assert.equal(clamp(15, 10, 20), 15);
  assert.equal(clamp(25, 10, 20), 20);
  assert.equal(clamp(10, 10, 20), 10);
  assert.equal(clamp(20, 10, 20), 20);
});

test('clamp: works with negative values', () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(-1, -10, -5), -5);
  assert.equal(clamp(0, -10, 10), 0);
});

// ============================================================================
// computeSizeForArea
// ============================================================================

test('size: fits inside every screen it is given (comfortable)', () => {
  const screens = [
    { name: 'old 1024x768 panel', width: 1024, height: 728 },
    { name: '1366x768 laptop', width: 1366, height: 728 },
    { name: '1920x1080 desktop', width: 1920, height: 1040 },
    { name: '2560x1440 monitor', width: 2560, height: 1400 },
    { name: '3840x2160 4K', width: 3840, height: 2160 },
  ];

  for (const screen of screens) {
    const { width, height } = computeSizeForArea(
      { x: 0, y: 0, width: screen.width, height: screen.height },
      'comfortable'
    );
    assert.ok(width <= screen.width, `${screen.name}: width ${width} exceeds screen`);
    assert.ok(height <= screen.height, `${screen.name}: height ${height} exceeds screen`);
  }
});

test('size: never drops below readable minimum', () => {
  const screens = [
    { width: 1024, height: 728 },
    { width: 1366, height: 728 },
    { width: 1920, height: 1040 },
    { width: 2560, height: 1400 },
  ];

  for (const screen of screens) {
    const { width, height } = computeSizeForArea(
      { x: 0, y: 0, width: screen.width, height: screen.height },
      'comfortable'
    );
    assert.ok(width >= MIN_WIDTH, `width ${width} is below minimum ${MIN_WIDTH}`);
    assert.ok(height >= MIN_HEIGHT, `height ${height} is below minimum ${MIN_HEIGHT}`);
  }
});

test('size: bigger screen gets bigger window', () => {
  const small = computeSizeForArea({ x: 0, y: 0, width: 1024, height: 728 }, 'comfortable');
  const large = computeSizeForArea({ x: 0, y: 0, width: 2560, height: 1400 }, 'comfortable');
  assert.ok(large.width > small.width, 'wider screen should get wider window');
  assert.ok(large.height > small.height, 'taller screen should get taller window');
});

test('size: presets are ordered by size', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const compact = computeSizeForArea(area, 'compact');
  const comfortable = computeSizeForArea(area, 'comfortable');
  const large = computeSizeForArea(area, 'large');

  assert.ok(compact.width < comfortable.width, 'compact should be narrower');
  assert.ok(comfortable.width < large.width, 'comfortable should be narrower than large');
  assert.ok(compact.height < comfortable.height, 'compact should be shorter');
  assert.ok(comfortable.height < large.height, 'comfortable should be shorter than large');
});

test('size: unknown preset falls back to comfortable', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(
    computeSizeForArea(area, 'nonsense'),
    computeSizeForArea(area, 'comfortable'),
    'unknown preset must fall back to comfortable'
  );
});

test('size: compact preset dimensions', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const { width, height } = computeSizeForArea(area, 'compact');
  const preset = SIZE_PRESETS.compact;
  assert.ok(width <= preset.maxWidth, 'compact width must not exceed maxWidth');
  assert.ok(height <= preset.maxHeight, 'compact height must not exceed maxHeight');
});

test('size: comfortable preset dimensions', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const { width, height } = computeSizeForArea(area, 'comfortable');
  const preset = SIZE_PRESETS.comfortable;
  assert.ok(width <= preset.maxWidth, 'comfortable width must not exceed maxWidth');
  assert.ok(height <= preset.maxHeight, 'comfortable height must not exceed maxHeight');
});

test('size: large preset dimensions', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const { width, height } = computeSizeForArea(area, 'large');
  const preset = SIZE_PRESETS.large;
  assert.ok(width <= preset.maxWidth, 'large width must not exceed maxWidth');
  assert.ok(height <= preset.maxHeight, 'large height must not exceed maxHeight');
});

// ============================================================================
// anchorBottomRight
// ============================================================================

test('anchor: window is anchored in bottom-right corner with margin', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const { width, height } = computeSizeForArea(area, 'comfortable');
  const { x, y } = anchorBottomRight(area, width, height);

  assert.equal(x, 1920 - width - EDGE_MARGIN);
  assert.equal(y, 1040 - height - EDGE_MARGIN);
  assert.ok(x + width <= 1920, 'window must not run off right edge');
  assert.ok(y + height <= 1040, 'window must not run off bottom edge');
  assert.ok(x >= EDGE_MARGIN, 'window must not run off left edge');
  assert.ok(y >= EDGE_MARGIN, 'window must not run off top edge');
});

test('anchor: respects secondary display not at origin', () => {
  const secondary = { x: 1920, y: -200, width: 1280, height: 1000 };
  const { width, height } = computeSizeForArea(secondary, 'comfortable');
  const { x, y } = anchorBottomRight(secondary, width, height);

  assert.equal(x, 1920 + 1280 - width - EDGE_MARGIN);
  assert.equal(y, -200 + 1000 - height - EDGE_MARGIN);
  assert.ok(x + width <= secondary.x + secondary.width, 'must fit on secondary display');
  assert.ok(y + height <= secondary.y + secondary.height, 'must fit on secondary display');
});

test('anchor: respects EDGE_MARGIN constant', () => {
  const area = { x: 100, y: 200, width: 800, height: 600 };
  const { width, height } = computeSizeForArea(area, 'compact');
  const { x, y } = anchorBottomRight(area, width, height);

  const expectedX = area.x + area.width - width - EDGE_MARGIN;
  const expectedY = area.y + area.height - height - EDGE_MARGIN;
  assert.equal(x, expectedX);
  assert.equal(y, expectedY);
});

// ============================================================================
// SIZE_PRESETS constants
// ============================================================================

test('presets: compact has defined constraints', () => {
  assert.ok(SIZE_PRESETS.compact.widthScale > 0);
  assert.ok(SIZE_PRESETS.compact.heightScale > 0);
  assert.ok(SIZE_PRESETS.compact.maxWidth > 0);
  assert.ok(SIZE_PRESETS.compact.maxHeight > 0);
});

test('presets: comfortable has defined constraints', () => {
  assert.ok(SIZE_PRESETS.comfortable.widthScale > 0);
  assert.ok(SIZE_PRESETS.comfortable.heightScale > 0);
  assert.ok(SIZE_PRESETS.comfortable.maxWidth > 0);
  assert.ok(SIZE_PRESETS.comfortable.maxHeight > 0);
});

test('presets: large has defined constraints', () => {
  assert.ok(SIZE_PRESETS.large.widthScale > 0);
  assert.ok(SIZE_PRESETS.large.heightScale > 0);
  assert.ok(SIZE_PRESETS.large.maxWidth > 0);
  assert.ok(SIZE_PRESETS.large.maxHeight > 0);
});

// ============================================================================
// Constants
// ============================================================================

test('constants: MIN_WIDTH and MIN_HEIGHT are positive', () => {
  assert.ok(MIN_WIDTH > 0);
  assert.ok(MIN_HEIGHT > 0);
});

test('constants: EDGE_MARGIN is positive', () => {
  assert.ok(EDGE_MARGIN > 0);
});

test('constants: MIN_VISIBLE_WIDTH and MIN_VISIBLE_HEIGHT are positive', () => {
  assert.ok(MIN_VISIBLE_WIDTH > 0);
  assert.ok(MIN_VISIBLE_HEIGHT > 0);
});
