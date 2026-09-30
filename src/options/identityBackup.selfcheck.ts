import assert from "node:assert/strict";

const stored: Record<string, unknown> = {};
Object.assign(globalThis, {
  chrome: {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: stored[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(stored, items),
      },
    },
  },
});

const { downloadCompleted, isIdentityBackedUp, markIdentityBackedUp, readBackedUpKeyId } = await import(
  "./identityBackup"
);

{
  assert.equal(isIdentityBackedUp("abc", "abc"), true, "matching key id counts as backed up");
  assert.equal(isIdentityBackedUp("abc", "def"), false, "a different identity brings the warning back");
  assert.equal(isIdentityBackedUp(undefined, "abc"), false, "never exported shows the warning");
  assert.equal(isIdentityBackedUp("", "abc"), false, "empty stored value does not count");
  assert.equal(isIdentityBackedUp(123, "abc"), false, "non-string stored value does not count");
  assert.equal(isIdentityBackedUp("", ""), false, "an empty key id never counts, even when both are empty");
}

{
  assert.equal(
    downloadCompleted({ id: 7, state: { current: "complete" } }, 7),
    true,
    "completion of our download counts"
  );
  assert.equal(
    downloadCompleted({ id: 8, state: { current: "complete" } }, 7),
    false,
    "another download does not count"
  );
  assert.equal(downloadCompleted({ id: 7, state: { current: "interrupted" } }, 7), false, "interrupted does not count");
  assert.equal(downloadCompleted({ id: 7, state: { current: "in_progress" } }, 7), false, "in progress does not count");
  assert.equal(downloadCompleted({ id: 7 }, 7), false, "a delta without state does not count");
}

{
  assert.equal(await readBackedUpKeyId(), undefined, "nothing is stored before the first backup");
  await markIdentityBackedUp("abc");
  assert.equal(isIdentityBackedUp(await readBackedUpKeyId(), "abc"), true, "a stored backup reads back for its key");
  assert.equal(isIdentityBackedUp(await readBackedUpKeyId(), "def"), false, "a stored backup does not cover a new key");
}

console.log("identityBackup self-check passed");
