import test from "node:test";
import assert from "node:assert/strict";
import {
  loadShortcuts,
  saveShortcuts,
  migrateShortcuts,
  STORAGE_KEY,
  LEGACY_KEY,
  BACKUP_KEY,
} from "../src/services/shortcuts.js";
import { defaults } from "../src/services/defaults.js";

function memory(values = {}) {
  const valuesMap = new Map(Object.entries(values));
  return {
    getItem: (key) => valuesMap.get(key) ?? null,
    setItem: (key, value) => valuesMap.set(key, value),
  };
}
const legacy = {
  id: "custom",
  title: "My player",
  target: "C:\\Apps\\player.exe",
  category: "music",
  favorite: true,
  color: "#123456",
  mark: "♫",
};

test("v1 migration retains custom paths, favorites, display values and original data", () => {
  const raw = JSON.stringify([legacy]);
  const storage = memory({ [LEGACY_KEY]: raw });
  const loaded = loadShortcuts(storage, defaults);
  assert.equal(loaded.shortcuts.length, 1);
  for (const [key, value] of Object.entries(legacy))
    assert.equal(loaded.shortcuts[0][key], value);
  assert.equal(loaded.shortcuts[0].kind, "windowsApp");
  assert.equal(loaded.shortcuts[0].launchMode, "auto");
  assert.equal(storage.getItem(LEGACY_KEY), raw);
  assert.equal(storage.getItem(BACKUP_KEY), raw);
  assert.deepEqual(
    loadShortcuts(storage, defaults).shortcuts,
    loaded.shortcuts,
  );
});

test("an intentionally empty collection stays empty across migration and reload", () => {
  const storage = memory({ [LEGACY_KEY]: "[]" });
  assert.deepEqual(loadShortcuts(storage, defaults).shortcuts, []);
  assert.deepEqual(loadShortcuts(storage, defaults).shortcuts, []);
});

test("v2 edits, mode and HTTP consent survive restart", () => {
  const storage = memory();
  const loaded = loadShortcuts(storage, defaults);
  const changed = loaded.shortcuts.map((value) => ({
    ...value,
    launchMode: "external",
    allowHttp: true,
    favorite: false,
  }));
  saveShortcuts(storage, changed, true);
  assert.deepEqual(loadShortcuts(storage, defaults).shortcuts, changed);
});

test("corrupt or future settings are preserved and never overwritten", () => {
  for (const raw of [
    "{broken",
    JSON.stringify({ version: 3, shortcuts: [legacy] }),
  ]) {
    const storage = memory({ [STORAGE_KEY]: raw });
    const loaded = loadShortcuts(storage, defaults);
    assert.equal(loaded.canSave, false);
    assert.ok(loaded.notice);
    assert.throws(() => saveShortcuts(storage, [], loaded.canSave));
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
});

test("failed backups and inaccessible storage cannot wipe previous settings", () => {
  const raw = JSON.stringify([legacy]);
  const storage = memory({ [LEGACY_KEY]: raw });
  storage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  assert.equal(loadShortcuts(storage, defaults).canSave, false);
  assert.equal(
    loadShortcuts(storage, defaults).shortcuts[0].title,
    legacy.title,
  );
  assert.equal(storage.getItem(LEGACY_KEY), raw);
  assert.equal(loadShortcuts(null, defaults).canSave, false);
});

test("invalid entries do not remove valid shortcuts and are backed up in v2", () => {
  const storage = memory({
    [STORAGE_KEY]: JSON.stringify({
      version: 2,
      shortcuts: [legacy, null, { title: "bad" }],
    }),
  });
  const loaded = loadShortcuts(storage, defaults);
  assert.equal(loaded.shortcuts.length, 1);
  assert.match(loaded.notice, /backed up/);
  assert.equal(migrateShortcuts([legacy, legacy]).length, 1);
});
