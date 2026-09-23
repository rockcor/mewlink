// Both sending and receiving advance the same persisted pairing state.
export function createSessionQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  };
}
