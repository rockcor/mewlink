declare module 'libsodium-wrappers-sumo' {
  type Variant = number;
  interface Sodium {
    ready: Promise<void>; base64_variants: { URLSAFE_NO_PADDING: Variant };
    crypto_aead_xchacha20poly1305_ietf_KEYBYTES: number; crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
    randombytes_buf(length: number): Uint8Array; to_base64(value: Uint8Array, variant: Variant): string; from_base64(value: string, variant: Variant): Uint8Array;
    crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array; keyType: string };
    crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
    crypto_box_seal_open(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array;
    crypto_aead_xchacha20poly1305_ietf_encrypt(message: Uint8Array, aad: Uint8Array, secretNonce: null, nonce: Uint8Array, key: Uint8Array): Uint8Array;
    crypto_aead_xchacha20poly1305_ietf_decrypt(secretNonce: null, ciphertext: Uint8Array, aad: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
  }
  const sodium: Sodium; export default sodium;
}
