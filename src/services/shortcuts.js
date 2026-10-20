import { targetKind } from "./targets.js";

export const STORAGE_KEY = "aura-shortcuts-v2";
export const LEGACY_KEY = "aura-shortcuts-v1";
export const BACKUP_KEY = "aura-shortcuts-v1-backup";

export function normalizeShortcut(value) {
  if (
    !value ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 48
  )
    return null;
  const kind = targetKind(value.target);
  if (!kind) return null;
  return {
    id: value.id,
    title: value.title.trim(),
    target: value.target,
    kind,
    category: ["video", "music", "other"].includes(value.category)
      ? value.category
      : "other",
    favorite: value.favorite === true,
    color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : "#32485b",
    mark:
      typeof value.mark === "string"
        ? value.mark.slice(0, 3)
        : value.title[0].toUpperCase(),
    launchMode: ["auto", "internal", "external"].includes(value.launchMode)
      ? value.launchMode
      : "auto",
    allowHttp: value.allowHttp === true,
  };
}

export function migrateShortcuts(values) {
  if (!Array.isArray(values)) throw new Error("Invalid shortcut collection");
  const ids = new Set();
  return values.map(normalizeShortcut).filter((value) => {
    if (!value || ids.has(value.id)) return false;
    ids.add(value.id);
    return true;
  });
}

export function loadShortcuts(storage, defaults) {
  const fallback = migrateShortcuts(defaults);
  let raw;
  let recovered = fallback;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 2)
        return {
          shortcuts: fallback,
          canSave: false,
          notice:
            "These settings use an unsupported version. Existing data is preserved; changes stay in this session.",
        };
      const shortcuts = migrateShortcuts(parsed.shortcuts);
      recovered = shortcuts;
      if (shortcuts.length !== parsed.shortcuts.length) {
        storage.setItem(`${STORAGE_KEY}-recovery-${Date.now()}`, raw);
        return {
          shortcuts,
          canSave: true,
          notice:
            "Some shortcuts need recovery. Valid shortcuts were kept; the original settings were backed up locally.",
        };
      }
      return { shortcuts, canSave: true, notice: "" };
    }
    const legacy = storage.getItem(LEGACY_KEY);
    const shortcuts =
      legacy === null ? fallback : migrateShortcuts(JSON.parse(legacy));
    recovered = shortcuts;
    if (legacy !== null && storage.getItem(BACKUP_KEY) === null)
      storage.setItem(BACKUP_KEY, legacy);
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, shortcuts }));
    return {
      shortcuts,
      canSave: true,
      notice:
        legacy === null
          ? ""
          : "Shortcuts upgraded. Favorites and the original v1 settings are preserved. HTTP shortcuts need explicit consent in Edit.",
    };
  } catch {
    // Never replace unreadable data or a failed backup with defaults.
    return {
      shortcuts: recovered,
      canSave: false,
      notice: raw
        ? "Saved settings could not be read. The original data is preserved; changes stay in this session."
        : "Local settings are unavailable. Changes stay in this session.",
    };
  }
}

export function saveShortcuts(storage, shortcuts, canSave) {
  if (!canSave)
    throw new Error(
      "Existing settings are preserved. Changes are available only in this session.",
    );
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, shortcuts }));
}

export function readPreference(storage, key, fallback) {
  try {
    return storage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
