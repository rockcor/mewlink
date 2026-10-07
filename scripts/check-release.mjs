import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { assertVersions } from './release-common.mjs';
import { macSigning } from './macos-signing.mjs';

const version = assertVersions(process.cwd(), process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
assert.ok(process.env.TAURI_SIGNING_PRIVATE_KEY?.trim(), 'Missing TAURI_SIGNING_PRIVATE_KEY');
const { notarize, selfSigned } = macSigning(process.env);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `notarize=${notarize}\nselfsigned=${selfSigned}\n`);
console.log(`Building MewLink ${version}; source versions match.`);
