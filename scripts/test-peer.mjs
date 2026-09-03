import process from 'node:process';
import sodium from 'libsodium-wrappers-sumo';

const endpoint = process.env.MEWLINK_RELAY_ENDPOINT ?? 'https://mewlink.jshmhsb.chatgpt.site/api/relay';
const inviteCode = (await new Promise(resolve => {
  let value = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { value += chunk; });
  process.stdin.on('end', () => resolve(value));
})).trim().replace(/\s+/gu, '');

if (!inviteCode.startsWith('MEW1-')) throw new Error('Pass a MewLink invite through standard input.');
const invite = JSON.parse(Buffer.from(inviteCode.slice(5), 'base64url').toString('utf8'));
if (invite.v !== 1 || invite.e < Date.now()) throw new Error('The invite is invalid or expired.');

await sodium.ready;
const deviceId = sodium.to_base64(sodium.randombytes_buf(18), sodium.base64_variants.URLSAFE_NO_PADDING);
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${invite.t}` };
const post = async body => {
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Relay returned ${response.status}.`);
};

await post({ operation: 'join', relationshipId: invite.r, deviceId });
const key = sodium.from_base64(invite.k, sodium.base64_variants.URLSAFE_NO_PADDING);

async function send(action, sequence) {
  const event = {
    id: crypto.randomUUID(),
    version: 1,
    relationshipId: invite.r,
    senderDeviceId: deviceId,
    createdAt: new Date().toISOString(),
    senderUtcOffsetMinutes: -new Date().getTimezoneOffset(),
    kind: 'interaction',
    payload: action === 'water' ? { action, cupStyle: 'tumbler' } : { action },
  };
  const header = {
    protocolVersion: 1,
    relationshipId: invite.r,
    senderDeviceId: deviceId,
    recipientDeviceId: invite.d,
    keyId: invite.i,
    sequence,
  };
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    JSON.stringify(event),
    JSON.stringify(header),
    null,
    nonce,
    key,
  );
  await post({
    operation: 'send',
    envelope: {
      ...header,
      nonce: sodium.to_base64(nonce, sodium.base64_variants.URLSAFE_NO_PADDING),
      ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.URLSAFE_NO_PADDING),
    },
  });
}

await send('hug', 1);
await send('water', 2);
console.log('Test peer connected and sent one hug plus one water reminder.');
