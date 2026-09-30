import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { RatchetError, type RatchetPort } from '../src/crypto/ratchet';

// Uses the production Rust engine, not a cryptography mock. All keys are
// throwaway test keys, held by a test-only child process, never OS Keychain.
export function ratchetPeer() {
  const process = spawn(resolve(`src-tauri/target/debug/examples/ratchet_peer${globalThis.process.platform === 'win32' ? '.exe' : ''}`), [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting: Array<{ resolve: (value: never) => void; reject: (error: Error) => void }> = [];
  const reader = createInterface({ input: process.stdout });
  reader.on('line', line => {
    const request = waiting.shift();
    const response = JSON.parse(line);
    if (response.error) request?.reject(new RatchetError(response.error)); else request?.resolve(response.ok);
  });
  process.on('error', error => { for (const pending of waiting.splice(0)) pending.reject(error); });
  process.on('exit', () => { for (const pending of waiting.splice(0)) pending.reject(new Error('test_peer_exited')); });
  const port: RatchetPort = (operation, _relationshipId, input = null) => new Promise((resolve, reject) => {
    waiting.push({ resolve, reject });
    process.stdin.write(`${JSON.stringify({ operation, input })}\n`);
  });
  return { port, stop: () => { reader.close(); process.stdin.end(); process.kill(); } };
}
