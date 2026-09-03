# Contributing to MewLink

Thanks for helping build calmer, more respectful ambient communication.

## Before opening a change

- Read `docs/DESIGN.md`, especially the threat model and privacy boundaries.
- Never collect screen pixels, keystrokes, window titles, URLs, document names,
  or message contents without a separately reviewed design change.
- Keep native probes behind the minimized `PresenceSignal` interface.
- Do not describe the current demo transport as production E2EE.

## Development

1. Install Node.js 22+, pnpm, Rust, and the Tauri prerequisites for your OS.
2. Run `pnpm install`, `pnpm lint`, `pnpm test`, and `pnpm build`.
3. For native changes, also run `cargo fmt --check`, `cargo clippy`, and the
   relevant macOS/Windows integration tests.

Open an issue before changes to cryptography, telemetry, identity, device
binding, retention, or permissions. Security reports must follow SECURITY.md.
