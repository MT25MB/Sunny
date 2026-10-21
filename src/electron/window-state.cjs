/**
 * Persistent window geometry for the Sunny desktop shell.
 *
 * The window is deliberately NOT user-resizable by dragging its edges: the
 * audience this app is built for finds edge-dragging fiddly, and an
 * accidental drag can leave the window unusably small. Instead the size is
 * chosen from a set of presets in Settings, and this module remembers the
 * resulting size and position between launches.
 *
 * Everything is stored in device-independent pixels (DIP), which is the unit
 * Electron's window bounds already use, so a HiDPI display needs no special
 * handling here.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Bumped when the persisted shape changes, so old files can be discarded. */
const STATE_VERSION = 1;

const FILE_NAME = 'window-state.json';

/** Size presets, as a fraction of the usable screen area. */
const SIZE_PRESETS = {
  compact: { widthScale: 0.28, heightScale: 0.5, maxWidth: 440, maxHeight: 640 },
  comfortable: { widthScale: 0.36, heightScale: 0.72, maxWidth: 640, maxHeight: 900 },
  large: { widthScale: 0.52, heightScale: 0.9, maxWidth: 1000, maxHeight: 1200 },
};

/** Never smaller than this, in DIP. */
const MIN_WIDTH = 320;
const MIN_HEIGHT = 460;

/** Gap between the window and the screen edge, in DIP. */
const EDGE_MARGIN = 24;

/**
 * How much of a restored window must still land on-screen for it to count
 * as "visible". A window saved on a monitor that has since been unplugged
 * would otherwise open completely off-screen with no way to reach it.
 */
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 60;

function getStateFilePath() {
  // Required on demand rather than at module load, so the pure sizing
  // helpers below can be unit tested under plain Node with no Electron.
  const { app } = require('electron');
  return path.join(app.getPath('userData'), FILE_NAME);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * Works out a window size for a given usable screen area.
 *
 * `area` is the display's work area (already excludes the taskbar and the
 * macOS dock) in DIP. The result never exceeds that area, so the window
 * always fits on the screen it was sized for, and never drops below a
 * readable minimum unless the screen itself is smaller than that.
 */
function computeSizeForArea(area, presetName) {
  const preset = SIZE_PRESETS[presetName] || SIZE_PRESETS.comfortable;

  const maxWidth = Math.min(preset.maxWidth, area.width);
  const maxHeight = Math.min(preset.maxHeight, area.height);

  const width = Math.round(
    Math.max(Math.min(MIN_WIDTH, maxWidth), Math.min(maxWidth, area.width * preset.widthScale)),
  );
  const height = Math.round(
    Math.max(Math.min(MIN_HEIGHT, maxHeight), Math.min(maxHeight, area.height * preset.heightScale)),
  );

  return { width, height };
}

/**
 * Places a window in the bottom-right corner of the given screen area.
 */
function anchorBottomRight(area, width, height) {
  return {
    x: Math.round(area.x + area.width - width - EDGE_MARGIN),
    y: Math.round(area.y + area.height - height - EDGE_MARGIN),
  };
}

/**
 * Returns the saved state, or null when there is nothing usable on disk.
 * A corrupt or unreadable file is treated as "no state" rather than an
 * error, because a broken preferences file must never stop the app starting.
 */
function load() {
  try {
    const file = getStateFilePath();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== STATE_VERSION) return null;
    // A file that only records the "remember" preference has no geometry,
    // which is fine: it is how the preference survives a launch.
    if (parsed.remember === false) return parsed;
    if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function save(state) {
  try {
    const payload = {
      version: STATE_VERSION,
      // Whether the geometry should be restored on the next launch. This
      // lives with the geometry because the main process needs it before the
      // window is created - the renderer's copy of the preference arrives
      // too late to decide where the window opens.
      remember: state.remember !== false,
      maximized: Boolean(state.maximized),
      preset: state.preset,
    };

    if (
      payload.remember &&
      Number.isFinite(state.width) &&
      Number.isFinite(state.height) &&
      state.width >= MIN_WIDTH &&
      state.height >= MIN_HEIGHT
    ) {
      payload.x = Math.round(state.x);
      payload.y = Math.round(state.y);
      payload.width = Math.round(state.width);
      payload.height = Math.round(state.height);
    }

    fs.mkdirSync(path.dirname(getStateFilePath()), { recursive: true });
    fs.writeFileSync(getStateFilePath(), JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // A failed write only costs the user their remembered geometry.
  }
}

function clear() {
  try {
    fs.unlinkSync(getStateFilePath());
  } catch {
    // Already gone.
  }
}

module.exports = {
  SIZE_PRESETS,
  MIN_WIDTH,
  MIN_HEIGHT,
  EDGE_MARGIN,
  MIN_VISIBLE_WIDTH,
  MIN_VISIBLE_HEIGHT,
  computeSizeForArea,
  anchorBottomRight,
  clamp,
  load,
  save,
  clear,
};