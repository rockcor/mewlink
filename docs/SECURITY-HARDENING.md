# Security hardening and release preparation

## Scope

This change adds native credential storage, upgrade migration, whole-pair
revocation, serialized client operations and a fail-closed macOS release pipeline.
The follow-up adds a native Olm ratchet, described in
[the audit handoff](RATCHET-AUDIT.md). No independent auditor has been commissioned
and no Apple certificate obtained. None of these features requires Mac App Store distribution.

## Storage and migration

The fixed credential is service `app.mewlink.desktop.pairing`, account
`pairing-v2`. The native command cannot select arbitrary credentials. Records
are bounded and platform errors are reduced to codes without logging secrets.
Keychain calls run off the UI thread and use a process-wide lock. Unsupported
platforms fail instead of using keyring's mock backend.

The record has three states: active, revoking and empty. Active stores the
relationship and its counters. Revoking retains only the relationship ID,
device ID and relay token. Empty is a tombstone, not a deleted credential; this
prevents a leftover legacy record from restoring a cancelled pair after a crash.
Successful storage migration preserves the old record so it can be revoked;
the new app pauses old v1 connections and requires fresh pairing on both devices.
Failed writes/read-back keep the legacy copy untouched and pause connections.
Unchanged saves do not write to Keychain again.

Downgrading to an older app after migration is unsupported: that app cannot read
the new store. Ad-hoc signatures can also cause Keychain prompts across builds.
Verify upgrade access with a stable Developer ID before a public rollout.

## Unpairing

Both peers share a relationship-level relay credential, so either can close the
whole pair. This is the current two-device revocation model, not independent
per-device identity credentials. Server revocation is idempotent. A cancelled
ID remains reserved even if cancellation arrives before a delayed create.
Pending invite material and queued ciphertext are removed for that pair only.
Offline cancellation survives restarts, blocks sends immediately, and finishes
when the app can contact the relay. The UI must not claim server completion
until it receives confirmation. Another device may retain already received data.

## macOS distribution prerequisites

Configure these GitHub Actions repository secrets through GitHub's secret UI;
never commit their values or paste private keys into an issue:

- `APPLE_CERTIFICATE`: exported Developer ID Application certificate with its
  private key, in base64-encoded P12 form.
- `APPLE_CERTIFICATE_PASSWORD`: the P12 export password.
- `APPLE_SIGNING_IDENTITY`: `Developer ID Application: … (TEAMID)`.
- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`: the Apple account, an
  app-specific password for notarization, and the developer team ID.
- `TAURI_SIGNING_PRIVATE_KEY` and, if encrypted, its
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the existing updater signing key. Do not
  replace the updater public key to work around a missing private key.

These Apple secrets are optional while MewLink is a public beta. Without them,
`scripts/check-release.mjs` allows an ad-hoc signed, unnotarized macOS build only
for build-only runs or when the `allow_unnotarized` release input is set, and the
release notes say so. With them, the workflow uses Tauri's Developer ID
signing/notarization flow, then runs codesign, stapler and Gatekeeper checks.
The updater key is always required. Do not publish a release whose verification
job failed. Windows updater artifacts have updater signatures; Authenticode
signing is still separate and not configured here.

References: [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/),
[Apple Developer ID](https://developer.apple.com/developer-id/),
[keyring storage backends](https://docs.rs/keyring/3.6.3/keyring/).

## Tests

- `pnpm test`: migration, denied storage, corrupt records, read-back mismatch,
  pending revocation across restarts, new credentials, and session queue ordering.
- `pnpm test:relay-server`: production handlers against SQLite, including both
  directions of encrypted delivery, revocation, wrong credentials, cancellation
  before creation, competing pairing requests and a send/revoke race. Requires
  the separate website checkout and its migrations.
- `pnpm test:release`: missing credentials and rejection of ad-hoc/store identities.
- `cargo test --manifest-path src-tauri/Cargo.toml`: native checks.
- The opt-in native test `secure_storage::tests::native_credential_round_trip`
  creates and deletes only an isolated credential under
  `app.mewlink.security-test`; run with `-- --ignored --exact`.

## Next security gates

1. Test two physical Macs, upgrade/restart access, locked Keychain and denied
   prompts with the actual Developer ID-signed release. Run Windows native tests.
2. Have the vodozemac integration, full-MAC configuration, manual verification,
   crash recovery and rollback limits reviewed externally. Run the new native
   tests and the two-process relay tests described in the audit handoff.
3. Add application-level encryption for retained local events and review IPC,
   renderer permissions, short-code abuse controls and retention policies.
4. Commission independent review of the actual protocol and release pipeline.
   Publish the reviewed version, scope and remediation status, not a blanket
   claim that the app is secure.

## Initial storage/revocation validation on 2026-09-09

Passed: 94 frontend tests, 11 production relay/SQLite tests, four release guard
tests, 17 normal Rust tests, and the separate native Keychain round-trip test.
The website's five existing tests, TypeScript checks, frontend/site builds,
ESLint and Rust Clippy also passed. The macOS app bundle built successfully
with an ad-hoc signature; it is not a notarized release.

No installed app, public download, GitHub release or live relay was changed in
this validation. Deployment and in-place installation await confirmation.
Two physical Macs and native Windows behavior remain untested.
These counts describe the initial phase. Follow-up ratchet results and dependency
findings are recorded in [RATCHET-AUDIT.md](RATCHET-AUDIT.md).
