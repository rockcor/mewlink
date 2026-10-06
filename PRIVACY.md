# Privacy promise — developer preview

MewLink's architecture is designed so raw screen content never leaves a device.
The application must not collect screenshots, pixels, keystrokes, document
contents, URLs, or window titles. Local signals are reduced to a coarse state:
`work`, `meeting`, `leisure`, `idle`, or `rest`. Code, document, and web
screen variants are selected locally and are not synchronized as separate states.

The current developer preview has no account system. Two Macs can pair using a
private invite and exchange encrypted interaction, companion-color, and optional
statistics envelopes through a mailbox relay. The relay receives routing identifiers,
approximate request timing, and ciphertext, but not the event body. Local events are stored in IndexedDB;
the desktop pairing credential is stored in the system credential store. New
pairings use a native ratchet whose session snapshot is encrypted on disk, with
its rotating wrapping key in the system credential store. The temporary invite
secret is removed after the handshake. Existing plaintext pairing records are migrated only after a
verified secure write. Local replay events are not yet encrypted at rest by
MewLink. Removing ordinary app files does not necessarily remove Keychain or
Credential Manager entries; unpair in the app before uninstalling.
Old pairings must be replaced on both devices before using the new protocol.
The ratchet does not remove plaintext replay history or copies in OS backups.

Live typing is off by default and works only when both people turn it on.
While both are online, the app sends the number of key presses, pointer moves
and clicks in each 0.25-second window, plus the coarse state above, so the
partner's pet can type along. It never sends which keys were pressed. Each
pulse is encrypted end to end with a key exchanged over the verified ratchet
and has a fixed size; a forwarding Worker on Cloudflare (`mewlink-live`) sees
routing identifiers, connection times and when pulses are sent, but not their
contents, and stores none of them. Typing rhythm can still say something about
what a person is doing, which is why it is opt-in. On macOS no pulse is sent
while a password field has focus (Secure Event Input); Windows has no
equivalent signal.

Unpairing stops this device's traffic. When the relay confirms the request, both
devices lose access to that relationship's mailbox and its queued ciphertext is
deleted. Offline requests are retained securely and retried while the app runs.
Previously downloaded history or copies held by the other person cannot be
remotely erased. Relay revocation tombstones retain opaque relationship/device
identifiers and a credential hash to reject old requests.

Future networked builds must use audited end-to-end encryption, minimize
metadata, publish retention periods, and obtain separate opt-in before sharing
any aggregate. Differential privacy applies to opted-in aggregates; it does not
turn a per-event activity timeline into anonymous data.
