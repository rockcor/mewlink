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
the test relationship secret is stored locally by the app. Removing app data
removes those local events and pairing material.

Future networked builds must use audited end-to-end encryption, minimize
metadata, publish retention periods, and obtain separate opt-in before sharing
any aggregate. Differential privacy applies to opted-in aggregates; it does not
turn a per-event activity timeline into anonymous data.
