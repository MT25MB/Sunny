/**
 * The download links have to send people to the file for their own system.
 *
 * Run with:  node --test tests/
 *
 * Every "Download" button on the landing page used to point at the release
 * page, where the Windows installer sits next to the Linux package and the
 * macOS disk image. The instructions said the file "downloads
 * automatically", which was not true. Someone on Windows picked the Linux
 * package, and nothing would open.
 *
 * The release page also listed the .deb under a name that said nothing
 * about which system it was for, so choosing wrongly was easy.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const WORKFLOW = fs.readFileSync(
  path.join(REPO, '.github', 'workflows', 'release.yml'),
  'utf8'
);

const DIRECT = 'https://github.com/MT25MB/Sunny/releases/latest/download/';

/**
 * The href of the link whose text is the given string.
 *
 * The link text sits after an icon, so this finds the text and then walks
 * back to the anchor that contains it, rather than trying to match the
 * whole element with a regular expression.
 */
function hrefFor(text) {
  const at = HTML.indexOf(text);
  if (at === -1) return null;
  const start = HTML.lastIndexOf('<a ', at);
  if (start === -1) return null;
  const tag = HTML.slice(start, HTML.indexOf('>', at));
  const m = tag.match(/href="([^"]+)"/);
  return m ? m[1] : null;
}

test('each system card links straight at its own file', () => {
  const expectations = [
    ['Download for Windows', 'Sunny-Setup.exe'],
    ['Download for macOS', 'Sunny.dmg'],
    ['Download for Linux', 'Sunny-Linux-amd64.deb'],
  ];

  for (const [text, file] of expectations) {
    const href = hrefFor(text);
    assert.ok(href, 'the "' + text + '" link must exist');
    assert.equal(
      href,
      DIRECT + file,
      '"' + text + '" must link at ' + file + ' directly, not at the release page'
    );
  }
});

test('the release publishes a Linux package that says what it is', () => {
  // A file called sunny_1.5.13_amd64.deb says nothing about the operating
  // system, which is how the wrong one got downloaded in the first place.
  assert.ok(
    /Sunny-Linux-amd64\.deb/.test(WORKFLOW),
    'the release must publish the Linux package under a name that says so'
  );
  assert.ok(
    /out\/make\/Sunny-Linux-amd64\.deb/.test(WORKFLOW),
    'the release must attach the renamed package'
  );
});

test('the general download buttons fetch the right file too', () => {
  // The buttons that do not know which system the reader is on are
  // rewritten by a small script. Without JavaScript they still go to the
  // release page, so nothing is broken.
  assert.ok(
    /data-download/.test(HTML),
    'the general buttons must be marked for the platform-aware script'
  );
  assert.ok(
    /Sunny-Setup\.exe/.test(HTML) && /Sunny\.dmg/.test(HTML) &&
      /Sunny-Linux-amd64\.deb/.test(HTML),
    'the script must know all three file names'
  );
});

test('the install steps tell the truth about what happens', () => {
  // "File downloads automatically" was not true of the old links. Now it is,
  // but only because the links point at the file itself.
  assert.ok(
    !/File downloads automatically/.test(HTML),
    'the steps must not claim something the old links did not do'
  );
  assert.ok(
    /downloads automatically/.test(HTML),
    'the steps must say the file downloads automatically, which is now true'
  );
});
