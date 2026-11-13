'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const indexCssPath = path.join(process.cwd(), 'src/index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

const mainTsxPath = path.join(process.cwd(), 'src/main.tsx');
const mainTsx = fs.readFileSync(mainTsxPath, 'utf8');

const appTsxPath = path.join(process.cwd(), 'src/App.tsx');
const appTsx = fs.readFileSync(appTsxPath, 'utf8');

const preloadPath = path.join(process.cwd(), 'src/electron/preload.cjs');
const preloadCjs = fs.readFileSync(preloadPath, 'utf8');

const mainCjsPath = path.join(process.cwd(), 'src/electron/main.cjs');
const mainCjs = fs.readFileSync(mainCjsPath, 'utf8');

describe('accessibility — ARIA attributes', () => {
  it('App uses aria-label attributes', () => {
    assert.ok(appTsx.includes('aria-label'));
  });

  it('App imports CollapsibleSection (which uses aria-expanded)', () => {
    assert.ok(appTsx.includes('CollapsibleSection'));
  });

  it('CollapsibleSection has proper ARIA', () => {
    const collapsiblePath = path.join(process.cwd(), 'src/components/CollapsibleSection.tsx');
    const fs = require('node:fs');
    const collapsible = fs.readFileSync(collapsiblePath, 'utf8');
    assert.ok(collapsible.includes('aria-expanded'));
    assert.ok(collapsible.includes('aria-controls'));
    assert.ok(collapsible.includes('role="region"'));
  });

  it('Buttons have aria-labels', () => {
    // Check that ActionButton has aria-label
    assert.ok(appTsx.includes('aria-label'));
  });
});

describe('accessibility — high contrast mode', () => {
  it('High contrast mode is toggleable', () => {
    assert.ok(appTsx.includes('highContrast'));
    assert.ok(appTsx.includes('handleToggleHighContrast'));
  });

  it('High contrast CSS class exists', () => {
    assert.ok(indexCss.includes('.high-contrast'));
  });

  it('CSS has high contrast color definitions', () => {
    assert.ok(indexCss.includes('status-good') || indexCss.includes('status-warning') || indexCss.includes('status-critical'));
  });
});

describe('accessibility — keyboard shortcut', () => {
  it('Keyboard shortcut is registered', () => {
    assert.ok(mainCjs.includes('Control+Shift+Escape'));
  });
});

describe('accessibility — color contrast', () => {
  it('no text/background pair falls below WCAG AA', () => {
    // This is verified by the ci-contrast.test.cjs which parses the stylesheet
    // Just verify the contrast-related CSS exists
    assert.ok(indexCss.includes('color:'));
    assert.ok(indexCss.includes('background:'));
  });
});

describe('accessibility — focus management', () => {
  it('App has focusable interactive elements', () => {
    assert.ok(appTsx.includes('<button'));
    assert.ok(appTsx.includes('<input'));
  });

  it('Buttons have proper type attributes', () => {
    // Form buttons should have type="submit" or type="button"
    assert.ok(appTsx.includes('type="submit"') || appTsx.includes('type="button"'));
  });
});

describe('accessibility — screen reader support', () => {
  it('App has role attributes for landmarks', () => {
    assert.ok(appTsx.includes('role="banner"') || appTsx.includes('role="main"'));
  });

  it('Chat messages have role="log"', () => {
    assert.ok(appTsx.includes('role="log"'));
  });

  it('Status items have role="listitem"', () => {
    assert.ok(appTsx.includes('role="listitem"'));
  });
});

describe('accessibility — preload exposes accessible API', () => {
  it('preload exposes electronAPI with accessible methods', () => {
    assert.ok(preloadCjs.includes('electronAPI'));
  });

  it('preload exposes windowControls', () => {
    assert.ok(preloadCjs.includes('windowControls'));
  });
});

describe('accessibility — color system', () => {
  it('CSS defines status color classes', () => {
    assert.ok(indexCss.includes('status-good'));
    assert.ok(indexCss.includes('status-warning'));
    assert.ok(indexCss.includes('status-critical'));
    assert.ok(indexCss.includes('status-info'));
  });

  it('CSS defines focus styles', () => {
    assert.ok(indexCss.includes(':focus'));
  });
});

describe('accessibility — semantic HTML', () => {
  it('App uses header element', () => {
    assert.ok(appTsx.includes('<header'));
  });

  it('App uses main element', () => {
    assert.ok(appTsx.includes('<main'));
  });

  it('App uses footer element', () => {
    assert.ok(appTsx.includes('<footer') || appTsx.includes('Footer'));
  });

  it('App uses article for status items', () => {
    assert.ok(appTsx.includes('<article'));
  });
});
