#!/usr/bin/env node
/**
 * Runtime rendering check.
 *
 * Run with:  node scripts/check-rendering.cjs [cdpEndpoint]
 *
 * The stylesheet cannot be checked on its own. Text that inherits its
 * colour is invisible against a light panel no matter what the source
 * says: the medication dialog is a white card inside a dark app, so its
 * heading and labels inherited the app's light text colour and measured
 * 1.11:1 and 1.57:1 against white. Nothing in the source hints at that,
 * and a stylesheet-level contrast test cannot see it either, because the
 * rule that matters has no colour in it at all.
 *
 * The only way to catch it is to render the app and measure what is
 * actually on the screen. This does that: it drives the running app over
 * CDP, opens the things a person would open, and then measures every
 * piece of visible text against the background it is really sitting on.
 * It also checks that nothing overflows its panel, which is how the
 * System Health cards came to run past the right border.
 *
 * The app is measured twice: at whatever size the window happens to be,
 * and at a narrow width, because the layout is different there and a
 * screen that small is where the awkward cases live.
 *
 * It needs a display. On a developer machine, WSLg provides one. In CI the
 * screenshot job already runs under Xvfb.
 */

'use strict';

const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const ENDPOINT = process.argv[2] || 'http://localhost:9222';
const NARROW_WIDTH = 360;

const { chromium } = require(path.join(REPO, 'node_modules', 'playwright'));

/**
 * Runs in the page: measure every visible piece of text.
 *
 * Everything it needs is defined inside, because page.evaluate runs the
 * function in the browser, where this module's constants do not exist.
 */
function measureInPage() {
  const AA_NORMAL = 4.5;
  const AA_LARGE = 3;

  const parse = (value) => {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((n) => parseFloat(n));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };

  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  });

  const luminance = (c) => {
    const ch = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };

  const ratio = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  };

  /**
   * The colour really behind an element: every translucent layer is
   * composited back to front over the first opaque ancestor.
   */
  const backgroundOf = (el) => {
    const layers = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      // A gradient paints the element even though its background-color is
      // transparent. Take the first colour stop, which is what the text
      // actually sits on.
      const image = cs.backgroundImage;
      if (image && image !== 'none') {
        const stops = image.match(/rgba?\([^)]+\)/g) || [];
        const first = stops.length ? parse(stops[0]) : null;
        if (first) {
          layers.push(first);
          if (first.a >= 1) break;
        }
      }
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 1) break;
      }
      node = node.parentElement;
    }
    let result = { r: 0, g: 0, b: 0, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const l = layers[i];
      result = {
        r: l.r * l.a + result.r * (1 - l.a),
        g: l.g * l.a + result.g * (1 - l.a),
        b: l.b * l.a + result.b * (1 - l.a),
        a: 1,
      };
    }
    return result;
  };

  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return el.tagName.toLowerCase() + id + cls;
  };

  const lowContrast = [];
  const overflow = [];

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (parseFloat(cs.opacity) === 0) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    // Only elements that actually render text.
    const hasText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (hasText) {
      const fgRaw = parse(cs.color);
      if (fgRaw) {
        const bg = backgroundOf(el);
        const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;
        const r = ratio(fg, bg);
        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const floor = large ? AA_LARGE : AA_NORMAL;
        if (r < floor) {
          lowContrast.push({
            el: describe(el),
            text: (el.textContent || '').trim().slice(0, 40),
            ratio: Math.round(r * 100) / 100,
            needed: floor,
            color: cs.color,
            size: size,
            weight: weight,
          });
        }
      }
    }

    // A fixed-position element is the size of the viewport, so it is not
    // inside the panel in any meaningful sense -- and neither is anything
    // inside one. The medication dialog sits inside a fixed overlay, so
    // it is placed against the viewport rather than against the panel
    // that happens to contain it in the document.
    let inFixed = false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).position === 'fixed') {
        inFixed = true;
        break;
      }
    }
    if (inFixed) continue;
    const panel = el.closest(
      '.health-card, .digest-section, .medication-section, .recipe-section, .actions-section, .companion-card'
    );
    if (panel && panel !== el) {
      const pr = panel.getBoundingClientRect();
      const padRight = parseFloat(getComputedStyle(panel).paddingRight) || 0;
      const inner = pr.right - padRight;
      if (rect.right > inner + 1) {
        overflow.push({
          el: describe(el),
          overBy: Math.round(rect.right - inner),
          text: (el.textContent || '').trim().slice(0, 40),
        });
      }
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible') {
        overflow.push({
          el: describe(el),
          overBy: el.scrollWidth - el.clientWidth,
          text: '(content wider than the box)',
        });
      }
    }
  }

  return { lowContrast, overflow };
}

function report(label, result) {
  console.log('\n--- ' + label + ' ---');
  console.log('text that cannot be read:');
  if (!result.lowContrast.length) console.log('  (none)');
  for (const c of result.lowContrast) {
    console.log(
      '  ' + c.el.padEnd(38) + String(c.ratio).padStart(7) + ':1  needs ' + c.needed +
      '  ' + c.color + '  ' + c.size + 'px/' + c.weight + '  "' + c.text + '"'
    );
  }
  console.log('things sticking out of their panel:');
  if (!result.overflow.length) console.log('  (none)');
  for (const o of result.overflow) {
    console.log('  ' + o.el.padEnd(38) + 'over by ' + o.overBy + 'px  "' + o.text + '"');
  }
}

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP(ENDPOINT);
  } catch (err) {
    console.error('Could not reach the app at ' + ENDPOINT + ': ' + err.message);
    console.error('Start the app with --remote-debugging-port=9222 first.');
    process.exit(2);
  }

  try {
    const context = browser.contexts()[0];
    let page = context.pages()[0];
    if (!page) page = await context.newPage();
    await page.waitForSelector('.app-shell', { timeout: 20000 });
    await page.waitForTimeout(800);

    // Get past the first-run overlay, which covers everything. Wait for it
    // to actually go away: measuring the overlay would report the
    // onboarding's own colours, and measuring it half way through its
    // fade-out would report a mixture of the two.
    const skip = await page.$('.onboarding-skip');
    if (skip) {
      await skip.click().catch(() => {});
      await page
        .waitForSelector('.onboarding-skip', { state: 'detached', timeout: 5000 })
        .catch(() => console.warn('The onboarding overlay did not close.'));
      await page.waitForTimeout(400);
    }

    // Open every section, so their contents are measured too.
    for (const toggle of await page.$$('.collapsible-toggle')) {
      if ((await toggle.getAttribute('aria-expanded')) === 'false') {
        await toggle.click().catch(() => {});
        await page.waitForTimeout(120);
      }
    }
    await page.waitForTimeout(500);

    // Open the medication dialog, which is the worst offender: a light
    // panel inside a dark app.
    const addReminder = await page.$('button:has-text("Add Reminder")');
    if (addReminder) {
      await addReminder.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    const width = await page.evaluate(() => window.innerWidth);
    const atWindow = await page.evaluate(measureInPage);
    report('at the current width (' + width + 'px)', atWindow);

    // And again on a narrow screen. The layout is different there -- the
    // grids collapse to one column -- and that is where the awkward cases
    // live. The app's own minimum width is 320, so 360 is a size it
    // genuinely has to work at.
    let atNarrow = { lowContrast: [], overflow: [] };
    let narrowWorked = false;
    let session = null;
    try {
      session = await context.newCDPSession(page);
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: NARROW_WIDTH,
        height: 640,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.waitForTimeout(700);
      atNarrow = await page.evaluate(measureInPage);
      narrowWorked = true;
    } catch (err) {
      console.log('\n(could not measure at ' + NARROW_WIDTH + 'px: ' + err.message + ')');
    } finally {
      if (session) {
        await session.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
        await page.waitForTimeout(300);
      }
    }
    if (narrowWorked) {
      report('at ' + NARROW_WIDTH + 'px wide', atNarrow);
    }

    const problems =
      atWindow.lowContrast.length +
      atWindow.overflow.length +
      atNarrow.lowContrast.length +
      atNarrow.overflow.length;

    console.log(
      '\n' + (problems > 0
        ? 'FAILED: ' + problems + ' problem(s)'
        : 'The rendering is clean: every piece of text is readable and nothing overflows.')
    );
    process.exit(problems > 0 ? 1 : 0);
  } finally {
    await browser.close().catch(() => {});
  }
})().catch((err) => {
  console.error('check-rendering failed:', err && err.message);
  process.exit(2);
});
