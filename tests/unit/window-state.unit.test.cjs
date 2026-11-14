'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const windowStateModule = require(path.join(
  process.cwd(),
  'src/electron/window-state.cjs'
));
const {
  clamp,
  computeSizeForArea,
  anchorBottomRight,
  SIZE_PRESETS,
  MIN_WIDTH,
  MIN_HEIGHT,
  EDGE_MARGIN,
  MIN_VISIBLE_WIDTH,
  MIN_VISIBLE_HEIGHT,
} = windowStateModule;

describe('window-state — clamp', () => {
  it('keeps value inside bounds', () => {
    assert.strictEqual(clamp(5, 0, 10), 5);
    assert.strictEqual(clamp(-5, 0, 10), 0);
    assert.strictEqual(clamp(15, 0, 10), 10);
    assert.strictEqual(clamp(0, 0, 10), 0);
    assert.strictEqual(clamp(10, 0, 10), 10);
  });

  it('works with negative values', () => {
    assert.strictEqual(clamp(-100, -50, -10), -50);
    assert.strictEqual(clamp(-20, -50, -10), -20);
    assert.strictEqual(clamp(-5, -50, -10), -10);
  });

  it('returns the same value when min equals max', () => {
    assert.strictEqual(clamp(5, 5, 5), 5);
  });
});

describe('window-state — computeSizeForArea', () => {
  it('compact preset dimensions', () => {
    const { width, height } = computeSizeForArea(
      { x: 0, y: 0, width: 1920, height: 1080 },
      'compact'
    );
    assert.ok(width > 0);
    assert.ok(height > 0);
    assert.ok(width <= 1920);
    assert.ok(height <= 1080);
  });

  it('comfortable preset dimensions', () => {
    const { width, height } = computeSizeForArea(
      { x: 0, y: 0, width: 1920, height: 1080 },
      'comfortable'
    );
    assert.ok(width > 0);
    assert.ok(height > 0);
    assert.ok(width <= 1920);
    assert.ok(height <= 1080);
  });

  it('large preset dimensions', () => {
    const { width, height } = computeSizeForArea(
      { x: 0, y: 0, width: 1920, height: 1080 },
      'large'
    );
    assert.ok(width > 0);
    assert.ok(height > 0);
    assert.ok(width <= 1920);
    assert.ok(height <= 1080);
  });

  it('bigger screen gets bigger window', () => {
    const small = computeSizeForArea(
      { x: 0, y: 0, width: 1024, height: 768 },
      'comfortable'
    );
    const large = computeSizeForArea(
      { x: 0, y: 0, width: 1920, height: 1080 },
      'comfortable'
    );
    assert.ok(large.width >= small.width);
    assert.ok(large.height >= small.height);
  });

  it('never drops below readable minimum', () => {
    const { width, height } = computeSizeForArea(
      { x: 0, y: 0, width: 1024, height: 768 },
      'comfortable'
    );
    assert.ok(width >= MIN_WIDTH);
    assert.ok(height >= MIN_HEIGHT);
  });

  it('unknown preset falls back to comfortable', () => {
    const result = computeSizeForArea(
      { x: 0, y: 0, width: 1920, height: 1080 },
      'nonexistent'
    );
    const comfortable = computeSizeForArea(
      { x: 0, y: 0, width: 1920, height: 1080 },
      'comfortable'
    );
    assert.strictEqual(result.width, comfortable.width);
    assert.strictEqual(result.height, comfortable.height);
  });
});

describe('window-state — anchorBottomRight', () => {
  it('anchors window in bottom-right corner with margin', () => {
    const { x, y } = anchorBottomRight(
      { x: 0, y: 0, width: 1920, height: 1080 },
      400,
      300
    );
    assert.strictEqual(x, 1920 - EDGE_MARGIN - 400);
    assert.strictEqual(y, 1080 - EDGE_MARGIN - 300);
  });

  it('respects secondary display not at origin', () => {
    const { x, y } = anchorBottomRight(
      { x: 1920, y: 0, width: 1920, height: 1080 },
      400,
      300
    );
    assert.strictEqual(x, 1920 + 1920 - EDGE_MARGIN - 400);
    assert.strictEqual(y, 1080 - EDGE_MARGIN - 300);
  });

  it('respects EDGE_MARGIN constant', () => {
    assert.ok(EDGE_MARGIN > 0);
    const { x, y } = anchorBottomRight(
      { x: 0, y: 0, width: 1000, height: 1000 },
      100,
      100
    );
    assert.strictEqual(x, 1000 - EDGE_MARGIN - 100);
    assert.strictEqual(y, 1000 - EDGE_MARGIN - 100);
  });
});

describe('window-state — SIZE_PRESETS', () => {
  it('has all three presets defined', () => {
    assert.ok('compact' in SIZE_PRESETS);
    assert.ok('comfortable' in SIZE_PRESETS);
    assert.ok('large' in SIZE_PRESETS);
  });

  it('presets are ordered by size', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1080 };
    const compact = computeSizeForArea(area, 'compact');
    const comfortable = computeSizeForArea(area, 'comfortable');
    const large = computeSizeForArea(area, 'large');
    assert.ok(compact.width < comfortable.width);
    assert.ok(comfortable.width < large.width);
    assert.ok(compact.height < comfortable.height);
    assert.ok(comfortable.height < large.height);
  });
});

describe('window-state — constants', () => {
  it('MIN_WIDTH and MIN_HEIGHT are positive', () => {
    assert.ok(MIN_WIDTH > 0);
    assert.ok(MIN_HEIGHT > 0);
  });

  it('EDGE_MARGIN is positive', () => {
    assert.ok(EDGE_MARGIN > 0);
  });

  it('MIN_VISIBLE_WIDTH and MIN_VISIBLE_HEIGHT are positive', () => {
    assert.ok(MIN_VISIBLE_WIDTH > 0);
    assert.ok(MIN_VISIBLE_HEIGHT > 0);
  });
});
