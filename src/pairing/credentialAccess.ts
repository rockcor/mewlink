/** Exact native status only: network/disk errors must not be mistaken for denial. */
export function credentialAccessRequired(error: unknown): boolean {
  const code = error instanceof Error ? error.message : error;
  return code === 'secure_storage_authorization_required';
}
