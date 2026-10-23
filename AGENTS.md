# Native App Acceptance Tests

Use `pnpm build:qa` for local native acceptance testing. Open the resulting
`src-tauri/target/release/bundle/macos/MewLink QA.app` on macOS.

- QA uses `app.mewlink.desktop.qa`, its own data and Keychain items, and cannot
  install a production update. Keep it separate from the installed MewLink.
- Do not use `tauri dev` or a normal `tauri build` to test against a real
  production pairing. Do not reset, unbind or reuse a production pairing for QA.
- If the QA build requests certificate trust, stop and give the printed
  `security add-trusted-cert` command to the user to run manually. Do not run
  it yourself, use sudo, or bypass the signing checks.
- Production upgrade acceptance is allowed when explicitly requested by the
  user; preserve the installed app's pairing and data.
