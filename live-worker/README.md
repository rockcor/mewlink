# mewlink-live (prototype)

Forwards end-to-end encrypted live-typing pulses between the two devices of one
relationship. Deployed to your own Cloudflare account; it stores nothing and
holds only the public key of the relay's ticket signer. Design:
"MewLink 实时打字动画通道设计".

- Connect: `wss://<host>/live?relationshipId=…&deviceId=…` with subprotocols
  `mewlink.v1` and `ticket.<ticket>`. The ticket (`<base64url {r,d,exp}>.<base64url Ed25519 sig>`,
  at most 10 minutes, the relay issues 5) is verified before the upgrade.
- First frame: `{"t":"ready","e":<key epoch>}`. Then `pulse` / `rekey` are
  forwarded byte for byte to the peer; `renew` swaps in a fresh ticket;
  `{"t":"ping"}` is answered without waking the object.
- `POST /revoke` with a relay-signed `{r, revoked:true}` closes the room for good.
- Limits: 512-byte frames, 8 frames/s per socket (burst 16), two devices per room.

## Test

```bash
WRANGLER=<path to wrangler/bin/wrangler.js> node test/run.mjs
```

Starts `wrangler dev` on a free port with a fresh signing key, runs the worker
tests, measures the local forward time and simulates receiver playout on four
network profiles (`test/playout.mjs`). XChaCha20-Poly1305 pulse sealing uses the
app's `libsodium-wrappers-sumo`.

## Deploy (your account)

```bash
wrangler deploy
wrangler secret put TICKET_PUBLIC_KEY
```
