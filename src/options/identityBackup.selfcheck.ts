import assert from "node:assert/strict";

type Delta = { id: number; state?: { current?: string } };

function storageArea(): chrome.storage.StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key: string) => ({ [key]: data[key] }),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
    remove: async (key: string) => void delete data[key],
  } as unknown as chrome.storage.StorageArea & { data: Record<string, unknown> };
}

const local = storageArea();
const session = storageArea();
const downloadListeners: ((delta: Delta) => void)[] = [];
const permissionListeners: (() => void)[] = [];
const chromeStub: Record<string, unknown> = {
  storage: { local, session, onChanged: { addListener: () => undefined } },
  permissions: { onAdded: { addListener: (listener: () => void) => permissionListeners.push(listener) } },
};
Object.assign(globalThis, { chrome: chromeStub });

const {
  initIdentityBackupWatcher,
  isIdentityBackedUp,
  markIdentityBackedUp,
  readBackedUpKeyId,
  rememberPendingBackup,
  settlePendingBackup,
} = await import("./identityBackup");

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

{
  assert.equal(isIdentityBackedUp("abc", "abc"), true, "matching key id counts as backed up");
  assert.equal(isIdentityBackedUp("abc", "def"), false, "a different identity brings the warning back");
  assert.equal(isIdentityBackedUp(undefined, "abc"), false, "never exported shows the warning");
  assert.equal(isIdentityBackedUp("", "abc"), false, "empty stored value does not count");
  assert.equal(isIdentityBackedUp(123, "abc"), false, "non-string stored value does not count");
  assert.equal(isIdentityBackedUp("", ""), false, "an empty key id never counts, even when both are empty");
}

{
  const pending = { downloadId: 7, keyId: "abc" };
  const settle = (delta: Delta) => settlePendingBackup(pending, delta);
  assert.deepEqual(
    settle({ id: 7, state: { current: "complete" } }),
    { backedUpKeyId: "abc", clearPending: true },
    "our download completing backs up its key"
  );
  assert.deepEqual(
    settle({ id: 7, state: { current: "interrupted" } }),
    { backedUpKeyId: null, clearPending: true },
    "a cancelled save clears the pending backup without marking"
  );
  assert.deepEqual(
    settle({ id: 8, state: { current: "complete" } }),
    { backedUpKeyId: null, clearPending: false },
    "another download is ignored"
  );
  assert.deepEqual(
    settle({ id: 7, state: { current: "in_progress" } }),
    { backedUpKeyId: null, clearPending: false },
    "in progress waits"
  );
  assert.deepEqual(settle({ id: 7 }), { backedUpKeyId: null, clearPending: false }, "a delta without state waits");
  assert.deepEqual(
    settlePendingBackup(undefined, { id: 7, state: { current: "complete" } }),
    { backedUpKeyId: null, clearPending: false },
    "no pending backup: nothing to settle"
  );
  assert.deepEqual(
    settlePendingBackup({ downloadId: "7", keyId: "abc" }, { id: 7, state: { current: "complete" } }),
    { backedUpKeyId: null, clearPending: false },
    "malformed pending value is ignored"
  );
  assert.deepEqual(
    settlePendingBackup({ downloadId: 7, keyId: "" }, { id: 7, state: { current: "complete" } }),
    { backedUpKeyId: null, clearPending: false },
    "a pending value without a key id is ignored"
  );
}

{
  assert.equal(await readBackedUpKeyId(), undefined, "nothing is stored before the first backup");
  await markIdentityBackedUp("abc");
  assert.equal(isIdentityBackedUp(await readBackedUpKeyId(), "abc"), true, "a stored backup reads back for its key");
  assert.equal(isIdentityBackedUp(await readBackedUpKeyId(), "def"), false, "a stored backup does not cover a new key");
}

{
  const errors: unknown[] = [];
  initIdentityBackupWatcher(error => errors.push(error));
  assert.equal(
    permissionListeners.length,
    1,
    "without the downloads permission the watcher waits for it to be granted"
  );

  chromeStub.downloads = {
    onChanged: { addListener: (listener: (delta: Delta) => void) => downloadListeners.push(listener) },
  };
  permissionListeners[0]();
  permissionListeners[0]();
  assert.equal(downloadListeners.length, 1, "granting the permission starts one download listener, never two");

  await rememberPendingBackup(42, "fresh-key");
  assert.deepEqual(
    session.data.identityBackupPending,
    { downloadId: 42, keyId: "fresh-key" },
    "the pending backup lives in session storage"
  );
  downloadListeners[0]({ id: 41, state: { current: "complete" } });
  await flush();
  assert.equal(await readBackedUpKeyId(), "abc", "an unrelated download leaves the flag alone");
  downloadListeners[0]({ id: 42, state: { current: "complete" } });
  await flush();
  assert.equal(await readBackedUpKeyId(), "fresh-key", "the background marks the key once its file lands");
  assert.equal(session.data.identityBackupPending, undefined, "the pending backup is cleared after it settles");

  await rememberPendingBackup(43, "other-key");
  downloadListeners[0]({ id: 43, state: { current: "interrupted" } });
  await flush();
  assert.equal(await readBackedUpKeyId(), "fresh-key", "a cancelled save does not mark the new key");
  assert.equal(session.data.identityBackupPending, undefined, "a cancelled save clears the pending backup");
  assert.deepEqual(errors, [], "no watcher errors");
}

console.log("identityBackup self-check passed");
