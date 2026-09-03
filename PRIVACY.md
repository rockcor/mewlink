# Privacy promise — developer preview

MewLink's architecture is designed so raw screen content never leaves a device.
The application must not collect screenshots, pixels, keystrokes, document
contents, URLs, or window titles. Local signals are reduced to a coarse state:
`coding`, `reading`, `meeting`, `browsing`, `idle`, or `rest`.

The current developer preview has no production network relay and no account
system. Its encrypted loopback is only a protocol prototype. IndexedDB stores
local demo events on the device. Removing browser/app data removes those events.

Future networked builds must use audited end-to-end encryption, minimize
metadata, publish retention periods, and obtain separate opt-in before sharing
any aggregate. Differential privacy applies to opted-in aggregates; it does not
turn a per-event activity timeline into anonymous data.
