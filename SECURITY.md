# Security policy

MewLink remains a developer preview. Do not use it for sensitive communication.
The source changes described below do not upgrade previously downloaded apps.

## Current protections

- New desktop pairs use vodozemac 0.10.0 Olm Double Ratchet in Rust. Each message
  advances a sending chain; fresh DH turns update the root key. Both people must
  update, pair again and compare the 128-bit safety number over a trusted channel.
  The app blocks sharing until local confirmation. Old pairs are paused, not
  silently upgraded. Routing IDs, size and timing remain visible to the relay.
- Native session snapshots are encrypted with XChaCha20-Poly1305. Each commit
  has a fresh wrapping key and a ciphertext digest anchored in the OS credential
  store. Outgoing ciphertext and incoming receipts survive restarts. The relay
  deduplicates exact v2 retries and refuses conflicting sequence reuse.
- The desktop pairing record is stored in macOS Keychain or Windows Credential
  Manager. On upgrade, the old localStorage record is removed only after a
  successful secure-store write and read-back. Access denial stops pairing;
  there is no plaintext fallback. Browser previews cannot establish live pairs.
- Unpairing invalidates the whole two-device relationship on the relay, clears
  pending invitations and deletes that relationship's queued ciphertext. A
  tombstone prevents old create/join requests from reviving it. Re-pairing makes
  a new relationship ID, encryption key and relay credential.
- Offline unpairing stops local traffic and removes the stored decryption key.
  Only the revocation credential is retained securely until the relay confirms
  cancellation. The UI reports pending completion and blocks new pairing.
  Retry requires the app to be running and online. It cannot revoke data already
  received or copied by the other person.
- Sync, sends and unpairing share a serialized session queue. A stopped session
  cannot be restored by an old asynchronous response. Server writes check
  revocation in the same SQL statement; cancellation and mailbox deletion are
  one transaction.

## Remaining limits

This integration has not received an independent security audit. The library's
historical audit is not an audit of this version, the selected configuration or
MewLink's glue code. We select the upstream `experimental-session-config` feature
for its full-length MAC; this choice requires explicit external review.
Keychain does not protect a compromised running app. Decrypted replay events
remain in IndexedDB; forward secrecy does not erase saved plaintext, retained
skipped keys, OS backups or another person's copies. Old v1 traffic retains its
old security properties. There is no post-quantum protection claim.

Pairing uses a sealed invite, a bootstrap proof inside Olm and mandatory manual
safety-number confirmation. A malicious relay can substitute handshake material;
users must actually compare the numbers through a separate trusted channel.
Production rollout still needs external review and abuse controls for the
unauthenticated short-code endpoints. The two website `image-size` parser
denial-of-service findings have a regression-tested source patch, published
separately in website version 63 without the pending encryption changes.
Version-based scanning still reports both high-severity advisories because no
installable fixed upstream release was available. No advisory was suppressed.
The patch has not been independently reviewed; see the audit handoff for
evidence and limits. The desktop/ratchet branch is still not ready for public
release, and the website publication did not change the downloadable app.

Revocation closes a whole relationship using its shared relay credential. It is
not an account-level device manager: a lost sole device cannot be remotely
revoked without the other paired device. An active compromised endpoint cannot
be made trustworthy by re-pairing alone.

MewLink ships as a public beta without an Apple Developer ID. macOS releases
are signed with one fixed self-signed certificate (public half in
`src-tauri/macos/mewlink-self-signed.pem`) and are not notarized, so macOS shows
a security warning on first launch. Because the certificate never changes, the
Keychain access a user approves ("Always Allow") stays valid across updates;
release builds are never ad-hoc signed. Publishing such a build requires the explicit `allow_unnotarized`
release input; if Developer ID credentials are configured later, the same
workflow notarizes and verifies the ticket instead. Update packages always
require the Tauri updater signature, which is separate from Apple signing.
Apple notarization is not a review of this encryption protocol.

See [release preparation](docs/SECURITY-HARDENING.md) for remaining gates and tests.
See [ratchet audit handoff](docs/RATCHET-AUDIT.md) for the exact protocol,
internal test scope and open findings. No auditor has yet been commissioned.

Please do not publish vulnerabilities in a public issue. Until a dedicated
security mailbox is configured, open a GitHub Security Advisory draft in the
repository. Include affected version, reproduction steps, impact, and any
suggested mitigation. We will acknowledge reports as maintainers become
available; no bounty program is currently offered.

Supported security releases will be listed here once the first signed beta is
published.
