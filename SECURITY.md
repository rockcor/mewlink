# Security policy

MewLink is currently a developer preview. Version 0.3 adds two-device encrypted
interaction testing through an opaque mailbox relay. The shared relationship
secret is carried in the invite and currently stored in browser-backed local
storage; there is no Keychain integration, forward-secret ratchet, device
revocation, independent protocol audit, or signed/notarized release yet. Do not
use this version for sensitive communication.

Please do not publish vulnerabilities in a public issue. Until a dedicated
security mailbox is configured, open a GitHub Security Advisory draft in the
repository. Include affected version, reproduction steps, impact, and any
suggested mitigation. We will acknowledge reports as maintainers become
available; no bounty program is currently offered.

Supported security releases will be listed here once the first signed beta is
published.
