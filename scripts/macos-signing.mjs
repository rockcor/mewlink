import assert from 'node:assert/strict';

// Without an Apple Developer ID, macOS builds are signed with one fixed
// self-signed certificate (public half: src-tauri/macos/mewlink-self-signed.pem).
// A stable certificate keeps the trusted-app requirement stable. Unlike Apple
// Developer ID, a self-signed build has no trusted Team ID: Keychain's separate
// cdhash partition can still require authorization after the binary changes.
export const SELF_SIGNED_IDENTITY = 'MewLink Self-Signed Code Signing';
export const SELF_SIGNED_CERTIFICATE = 'src-tauri/macos/mewlink-self-signed.pem';

/** A self-signed leaf is also its root; macOS uses either spelling for the same pin. */
export function matchesStableCertificate(requirement, fingerprint, identifier) {
  return ['leaf', 'root'].some(kind => requirement.trim()
    === `designated => identifier "${identifier}" and certificate ${kind} = H"${fingerprint}"`);
}

/** Decides how a macOS build is signed: notarized Developer ID, the self-signed certificate, or ad hoc (local builds only). */
export function macSigning(env, platform = process.platform) {
  if (platform !== 'darwin') return { notarize: false, selfSigned: false };
  const publishing = env.MEWLINK_PUBLISH === 'true';
  if (env.APPLE_CERTIFICATE?.trim() || (publishing && env.MEWLINK_ALLOW_UNNOTARIZED !== 'true')) {
    const required = ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID'];
    const missing = required.filter(key => !env[key]?.trim());
    assert.equal(missing.length, 0, `Missing macOS signing inputs: ${missing.join(', ')}`);
    assert.ok(env.APPLE_SIGNING_IDENTITY.startsWith('Developer ID Application:'));
    return { notarize: true, selfSigned: false };
  }
  const selfSigned = Boolean(env.MACOS_SELF_SIGNED_CERTIFICATE?.trim());
  if (selfSigned) assert.ok(env.MACOS_SELF_SIGNED_CERTIFICATE_PASSWORD?.trim(), 'Missing MACOS_SELF_SIGNED_CERTIFICATE_PASSWORD');
  assert.ok(selfSigned || !publishing,
    'An unnotarized macOS release must be signed with the MewLink self-signed certificate (MACOS_SELF_SIGNED_CERTIFICATE), never ad hoc');
  return { notarize: false, selfSigned };
}
