# Ratchet implementation and audit handoff

Status, 2026-09-09: local implementation and internal testing. **Not independently
audited, not approved for public release.** The coding agent wrote and reviewed
this change; that review is not independent. No third-party reviewer, engagement,
budget, report or remediation sign-off exists yet. No source has been submitted
to an outside audit service. The installed app and live relay remain unchanged.

## Protocol and trust boundaries

MewLink uses the released Rust crate `vodozemac = 0.10.0`, with default features
disabled. `experimental-session-config` enables `SessionConfig::version_2()`:
Olm AES-256 plus a full-length HMAC, instead of the stable configuration's
truncated MAC. This upstream feature is labelled experimental and is an explicit
review item. MewLink does not implement its own DH or ratchet key schedule.
The outer envelope version 2 is MewLink framing, not a claim of Signal wire
compatibility, X3DH, PQXDH or a post-quantum ratchet.

1. The inviter creates a native Olm account and one one-time key. Only public
   keys leave Rust. The offer is included in the existing sealed invite, together
   with a random 32-byte bootstrap secret and the separate relay credential.
2. The joiner creates an outbound Olm session and queues an encrypted `hello`.
   Its HMAC-SHA256 proof covers the relationship ID, Olm session ID and sorted
   device IDs, using the bootstrap secret. The inviter verifies the proof before
   committing any peer or consuming the account. Bad proofs leave state intact.
3. The inviter drops the account and bootstrap secret, commits the new session
   and an encrypted `ack`. The joiner becomes established after decrypting it.
   JavaScript removes its invite secret on the next successful state save.
4. Both screens show the first 128 bits of SHA-256 over a domain-separated
   transcript containing the relationship, session and sorted device IDs.
   Each user must compare all eight groups over a trusted call or in person,
   then explicitly confirm. Rust checks the exact current number before enabling
   outgoing events or exposing incoming deliveries. Clicking without comparison
   defeats this protection; the short pairing code is not identity authentication.
5. Each encrypted body repeats every routing header field. Decryption checks the
   inner and outer headers, fixed peer, relationship and session ID before commit.
   Native processing and the v2 relay row reject v1 traffic. Once established,
   no alternate pre-key message may reset the session. Legacy crypto helpers
   remain for compatibility tests; the desktop pauses legacy saved pairings.

In MewLink v2 the existing `nonce` field carries the Olm message type (`0` or
`1`); the actual cryptography is internal to Olm. The ciphertext is base64url.
The session ID is normalized to base64url for the relay's `keyId` field.
Neither device sends its native session pickle to the relay or the webview.
The relay still knows IDs, IP/connection metadata, request timing and sizes.

## Durable state and retry rules

The native store is `secure-session` beneath Tauri's app-data directory. Its
credential is service `app.mewlink.desktop.ratchet`, account `anchor-v1`.
A cross-process file lock serializes access. Each state change serializes into a
bounded, encrypted snapshot with a newly generated 32-byte wrapping key and
24-byte nonce. The OS credential stores that key and the snapshot's SHA-256 digest.

Commit order: write and sync `ratchet.pending`; write and verify the OS anchor;
rename to `ratchet.bin`; sync the directory on Unix. Return ciphertext or
plaintext only after commit succeeds. Recovery accepts the current or pending
file only when its digest matches the committed anchor, then validates AEAD.
Missing anchors, corruption and file-only rollback stop the session. They do
not trigger an automatic new session. Coordinated rollback of the OS credential
and files, filesystem/Keychain backups, a compromised OS and same-user malware
are not covered. Windows crash durability and signed-app credential access need
native testing. Symlink checks are not a sandbox against a hostile local process.

The outbox commits exact ciphertext before any POST. Retries use those bytes.
The relay uniquely indexes relationship, sender and `(keyId, sequence)` for v2;
an identical retry succeeds, but different ciphertext at that position fails.
Old v1 rows keep a nullable message key; migration does not rewrite their data.

The receiver commits the ratchet, replay receipt and pending delivery together.
The renderer acknowledges a receipt only after writing the event to IndexedDB.
Pending deliveries are drained before another relay batch, including after a
crash with a full inbox. Invalid ciphertext can be skipped; disk/Keychain failures,
missing sessions and full queues must not advance the relay cursor. Event IDs
deduplicate local storage. Animation side effects are not a transactional
exactly-once guarantee across crashes.

Bounds: 8,000-byte authenticated bodies, 12,000-character ciphertexts, 100 queued
outgoing and 100 pending incoming messages, 256 duplicate receipts and a 2 MiB
encrypted snapshot. vodozemac retains at most 40 skipped keys per receiving chain,
five receiving chains and allows a maximum forward gap of 2,000. Relay delivery
is normally ordered; adversarial reordering beyond those limits may lose old
messages. The relay currently retains ciphertext for 30 days. Local replay has
its separate user-selected retention; native receipts do not erase saved history.

Unpairing first records durable pending cancellation. Native state is replaced
with a tombstone and fresh wrapping key; server cancellation is still attempted
if native erasure fails. New pairing remains blocked until both finish. Neither
unpairing nor ratcheting can erase screenshots, received events, skipped keys or
backups already held elsewhere. Post-compromise recovery assumes the attacker
loses access and a subsequent two-way exchange incorporates fresh DH randomness;
it is not immediate protection while an endpoint remains compromised.

## Internal evidence

The Rust tests cover both directions, shuffled delivery, repeated ciphertext,
wrong bootstrap proofs, metadata tampering, protocol downgrade, fingerprint
confirmation, pickle restoration and exact outbox retries. A copied current
session fails to decrypt an already consumed message. A copied session can read
the next reply when it has the necessary current keys, but fails after the
subsequent fresh DH exchange. These are test cases, not a formal proof.

Store tests cover encrypted snapshots, fresh wrapping keys, file rollback,
missing anchors, recovery after the anchor commits before rename, and simulated
credential-write failure both before and after an uncertain commit. These use
isolated temporary files and a test credential backend, not users' real keys.

`pnpm test:relay-server` builds a test-only Rust peer executable and starts two
separate processes running the production engine. TypeScript transport calls
the production relay handlers with actual SQLite queries in place of D1. It
tests sealed offers, hello/ack, matching safety numbers, hug/skin/activity events,
pending receipt recovery, a lost POST response, exact retry deduplication,
conflicting reuse and downgrade rejection. This is not a test on two physical
Macs, the hosted Cloudflare runtime, Tauri IPC, or signed app upgrades.

Reproduction, from the root checkout with Node, pnpm, Rust 1.89+ and the separate
website checkout installed:

```sh
pnpm lint
pnpm test
pnpm test:relay-server
pnpm test:release
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo audit --file src-tauri/Cargo.lock
pnpm audit --prod
pnpm --dir website audit --prod
pnpm --dir website build
```

The Rust peer is an example executable, not a registered app command or release
artifact. Its temporary test keys are not production credentials. Regular CI
now runs Rust tests; the relay tests additionally need the separate website
checkout, which is not available in the public root repository CI by default.

Validation results on 2026-09-09: 100 frontend tests, 13 relay/SQLite integration
tests, 29 ordinary Rust tests, four release-preflight tests and five website
tests passed. Frontend and website builds, TypeScript checks, ESLint and Clippy
passed. The macOS app bundle built with an ad-hoc signature; it was not installed
or notarized. There was no hosted D1 test or public deployment.

Dependency follow-up on the same date: the website now passes 23 tests,
including 18 new image-parser security/compatibility tests. The latter also
passed after a fresh frozen-lockfile install in a temporary directory.
Website TypeScript, production build and targeted lint on the new tests passed.
Full-site lint reports 19 errors in unchanged UI components/hooks; this is
separate from the root ESLint result above. The two version-based image-size
alerts remain visible, with a tested local source patch. See
[`website/security/image-size-remediation.md`](../website/security/image-size-remediation.md)
for the patch scope, baseline failures, reproduction and remaining limits.

After user approval, dependency-only website version 63 was published from
`7a4f55f0179ae8eea20ace3c8910f05096aa1bbf`. Sites reported success at
2026-09-10T05:26:32Z. The isolated release passed the same 23 tests, TypeScript
and build. Its application routes, assets, database and migrations match the
previous public version exactly. Ratchet integration, relay changes and new
migrations 0003–0004 were excluded; no desktop update was released. The original
development checkout remains unchanged apart from these local release records.

The two opt-in OS-credential tests use separate, uniquely named test credentials,
including a real encrypted-vault commit/read/advance/read round trip. They never
read the production pairing or ratchet credentials:

```sh
cargo test --manifest-path src-tauri/Cargo.toml native_ -- --ignored
```

Both opt-in tests passed on this Mac. Core source hashes are in
`docs/ratchet-source.sha256`; verify from the root with
`shasum -a 256 -c docs/ratchet-source.sha256`. These identify the tested working
files, not a complete frozen release or an external audit scope. Before handing
code to a reviewer, freeze both the root and separate website checkouts, include
all build configuration and tests, and record their final commits/artifact hashes.

## Open findings and release gates

| Item | Status and required next step |
| --- | --- |
| Independent review | Not commissioned. Select an external cryptography/application-security reviewer, agree scope and budget, then provide a frozen source snapshot. Require a written report, finding severities, fixes and retest sign-off. |
| Authentication | Review sealed-invite substitution, bootstrap proof, safety-number construction/UX and the full-MAC experimental feature. No external security conclusion yet. |
| Short-code abuse | The public create/request/claim endpoints still lack deployment-level abuse controls. Add and test throttling before expanding public beta access. |
| Website dependency alerts | Four of the original six alerts were addressed by React/RSC 19.2.8, Vite 8.0.16 and esbuild 0.28.1. The remaining two `image-size` DoS findings have a pinned source patch and passing regression tests, including a fresh installation. These dependency changes were published separately in website version 63 with user approval. Raw version-based scanning still reports two high alerts. No suppression or version relabeling was used. The backport has not been independently reviewed; obtain that review and replace it with a verified upstream fix when available. |
| Rust dependency warnings | The scan reports no vulnerability errors, but seven warnings: six unmaintained transitive crates and a Linux `glib::VariantStrIter` unsoundness warning. Review target reachability and upstream migration; do not describe this as a warning-free dependency audit. |
| Local history | Decrypted replay events remain plaintext in IndexedDB. Ratchet forward secrecy does not protect that history from local compromise. |
| Physical devices and release identity | Test two actual Macs, offline periods, denied/locked Keychain, crash recovery, signed in-place upgrades and Windows native storage. Developer ID credentials, notarization and independent sign-off are still missing. |

All unresolved items stay visible. Do not publish a security badge or change
release notes to “independently audited” until an external report supports that
claim. After fixes, rerun tests against the exact artifact being reviewed; a
library audit or Apple notarization cannot substitute for this review.

## Merge with desktop releases 0.3.23–0.3.26

Status, 2026-09-30: the ratchet branch was merged with main's releases 0.3.23–0.3.26.
Those releases added a durable encrypted outbox, operation-history replay
(`operation.batch`) and cup syncing (`cup.consumed`) on the legacy key. The merge
keeps every ratchet rule and routes the new features through the ratchet:

- `queueEncryptedEvent` hands events to the native ratchet `send` once a
  relationship has a ratchet, and refuses to queue before safety-number
  verification. Only the plaintext UI/replay record goes to IndexedDB. The
  native store remains the only durable ciphertext outbox; sync drains it.
- `sendEncryptedBatch` (legacy `send_batch`) now throws inside a ratchet
  relationship, so no bootstrap-key ciphertext can be sent after the upgrade.
- The native event allowlist gained `cup.consumed` and `operation.batch`
  (`engine.rs`), with a test that unknown kinds are still rejected.
- Operation batches close at 6,000 bytes of points so every event stays under
  the 8,000-byte native plaintext limit.
- Sync, send, confirmation and unpairing share one serial queue. Unpairing also
  discards the old relationship's replay history and legacy outbox.

Operation history widens the existing local-history item above: coarse input
counts and activity categories are now kept in IndexedDB as plaintext too.
`ratchet-source.sha256` was refreshed for the merged files; the `website/`
entries were not re-hashed here.

## Source references

- [vodozemac source and security information](https://github.com/matrix-org/vodozemac),
  [the pinned release API](https://docs.rs/vodozemac/0.10.0/vodozemac/).
- [Least Authority's 2022 vodozemac report](https://matrix.org/media/Least%20Authority%20-%20Matrix%20vodozemac%20Final%20Audit%20Report.pdf).
  Its historical scope is not this MewLink integration or a current-version certificate.
- [Signal Double Ratchet specification](https://signal.org/docs/specifications/doubleratchet/)
  for terminology and threat-model distinctions, not a wire-compatibility claim.
- [React server-function advisory](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g)
  and [Vite Windows-path advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff).
- Image-size advisories (locally patched; still reported by version scans):
  [ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr),
  [JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
