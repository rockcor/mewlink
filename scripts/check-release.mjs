import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { assertVersions } from './release-common.mjs';

const version = assertVersions(process.cwd(), process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
assert.ok(process.env.TAURI_SIGNING_PRIVATE_KEY?.trim(), 'Missing TAURI_SIGNING_PRIVATE_KEY');
let notarize = false;
if (process.platform === 'darwin' && (process.env.APPLE_CERTIFICATE?.trim()
  || (process.env.MEWLINK_PUBLISH === 'true' && process.env.MEWLINK_ALLOW_UNNOTARIZED !== 'true'))) {
  const required = ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID'];
  const missing = required.filter(key => !process.env[key]?.trim());
  assert.equal(missing.length, 0, `Missing macOS signing inputs: ${missing.join(', ')}`);
  assert.ok(process.env.APPLE_SIGNING_IDENTITY.startsWith('Developer ID Application:'));
  notarize = true;
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `notarize=${notarize}\n`);
console.log(`Building MewLink ${version}; source versions match.`);
