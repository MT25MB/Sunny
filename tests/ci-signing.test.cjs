/**
 * The Windows installer is code signed with SignPath.
 *
 * Run with:  node --test tests/
 *
 * An unsigned installer makes Windows SmartScreen warn every person who
 * installs it, and Defender treat the updater as unknown. The signing is
 * wired into the release workflow, guarded so that a release still goes out
 * when signing is unavailable or fails.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const RELEASE = fs.readFileSync(
  path.join(REPO, '.github', 'workflows', 'release.yml'),
  'utf8'
);

test('the release workflow signs the Windows installer', () => {
  // The action was renamed: SignPath/signpath-action is the old name and
  // no longer resolves.
  assert.ok(
    /signpath\/github-action-submit-signing-request@v\d+/.test(RELEASE),
    'the signing action must be github-action-submit-signing-request'
  );
  assert.ok(
    !/SignPath\/signpath-action/.test(RELEASE),
    'the old action name must not be used'
  );
  assert.ok(
    /secrets\.SIGNPATH_API_TOKEN/.test(RELEASE),
    'the API token must come from a secret, never from the repository'
  );
  assert.ok(
    /vars\.SIGNPATH_ORGANIZATION_ID/.test(RELEASE),
    'the organisation id must come from a repository variable'
  );
  assert.ok(
    /steps\.upload-unsigned\.outputs\.artifact-id/.test(RELEASE),
    'the signing request must reference the uploaded artifact'
  );
});

test('signing cannot break a release', () => {
  // The step only runs once the organisation is configured.
  assert.ok(
    /vars\.SIGNPATH_ORGANIZATION_ID != ''/.test(RELEASE),
    'the signing step must be skipped until the organisation is configured'
  );
  // And a failed signing request still publishes the unsigned installer.
  assert.ok(
    /continue-on-error:\s*true/.test(RELEASE),
    'a signing failure must not fail the release'
  );
  assert.ok(
    /if:\s*steps\.sign\.outcome != 'success'/.test(RELEASE),
    'the unsigned installer must be published when signing did not succeed'
  );
  assert.ok(
    /if:\s*steps\.sign\.outcome == 'success'/.test(RELEASE),
    'the signed installer must be published when signing succeeded'
  );
  // The unsigned artifact must not be picked up by the publish job, which
  // downloads everything matching "sunny-*".
  assert.ok(
    /name:\s*win-unsigned/.test(RELEASE),
    'the unsigned artifact must not match the "sunny-*" download pattern'
  );
  assert.ok(
    /pattern:\s*'sunny-\*'/.test(RELEASE),
    'the publish job downloads the "sunny-*" artifacts'
  );
});
