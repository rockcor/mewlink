import { pathToFileURL } from 'node:url';

export function missingSigningInputs(platform, env) {
  const required = ['TAURI_SIGNING_PRIVATE_KEY'];
  if (platform === 'darwin') required.push(
    'APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY',
    'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID',
  );
  const missing = required.filter(name => !env[name]?.trim());
  if (platform === 'darwin' && env.APPLE_SIGNING_IDENTITY?.trim()
    && !env.APPLE_SIGNING_IDENTITY.startsWith('Developer ID Application:')) {
    missing.push('APPLE_SIGNING_IDENTITY (must be Developer ID Application)');
  }
  return missing;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const missing = missingSigningInputs(process.platform, process.env);
  if (missing.length) {
    // Print variable names only, never certificate/key/password values.
    console.error(`Release blocked: configure ${missing.join(', ')} in repository secrets.`);
    process.exitCode = 1;
  }
}
