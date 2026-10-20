export const USAGE_KEY = "aura-usage-v1";
const MAX = Number.MAX_SAFE_INTEGER;
const fresh = (enabled = true) => ({
  version: 1,
  enabled,
  auraMs: 0,
  shortcuts: [],
});
const number = (n) => Number.isSafeInteger(n) && n >= 0;
const identity = (s) =>
  s &&
  typeof s.id === "string" &&
  s.id.length > 0 &&
  s.id.length <= 128 &&
  typeof s.title === "string" &&
  s.title.trim().length > 0 &&
  s.title.length <= 48;
const add = (a, b) => Math.min(MAX, a + b);

function valid(data) {
  if (
    data?.version !== 1 ||
    typeof data.enabled !== "boolean" ||
    !number(data.auraMs) ||
    !Array.isArray(data.shortcuts) ||
    data.shortcuts.length > 1000
  )
    return false;
  const ids = new Set();
  return data.shortcuts.every((s) => {
    if (
      !identity(s) ||
      ids.has(s.id) ||
      ![s.internalMs, s.internalLaunches, s.externalLaunches].every(number) ||
      !(
        s.lastOpenedAt === null ||
        (number(s.lastOpenedAt) && s.lastOpenedAt <= 8.64e15)
      )
    )
      return false;
    ids.add(s.id);
    return true;
  });
}

// Aggregate counts and foreground time only. No targets, page history or session
// timestamps are persisted. An in-memory baseline prevents restart backfilling.
export class UsageTracker {
  constructor(storage) {
    this.storage = storage;
    this.data = fresh();
    this.previous = null;
    this.dirty = false;
    this.canSave = true;
    this.notice = "";
    try {
      const raw = storage.getItem(USAGE_KEY);
      if (raw !== null) {
        const data = JSON.parse(raw);
        if (!valid(data)) throw new Error("Invalid usage history");
        // Reconstruct the schema; discard unexpected properties, including URLs.
        this.data = {
          version: 1,
          enabled: data.enabled,
          auraMs: data.auraMs,
          shortcuts: data.shortcuts.map(
            ({
              id,
              title,
              internalMs,
              internalLaunches,
              externalLaunches,
              lastOpenedAt,
            }) => ({
              id,
              title,
              internalMs,
              internalLaunches,
              externalLaunches,
              lastOpenedAt,
            }),
          ),
        };
      }
    } catch {
      this.data = fresh(false);
      this.canSave = false;
      this.notice =
        "Usage history could not be read. Tracking is paused and existing data is preserved. Clear usage history to start again.";
    }
  }

  get enabled() {
    return this.data.enabled;
  }
  snapshot() {
    return {
      ...this.data,
      shortcuts: this.data.shortcuts.map((s) => ({ ...s })),
    };
  }
  entry(shortcut) {
    if (!identity(shortcut)) return null;
    let record = this.data.shortcuts.find((s) => s.id === shortcut.id);
    if (!record && this.data.shortcuts.length < 1000) {
      record = {
        id: shortcut.id,
        title: shortcut.title,
        internalMs: 0,
        internalLaunches: 0,
        externalLaunches: 0,
        lastOpenedAt: null,
      };
      this.data.shortcuts.push(record);
    }
    if (record) record.title = shortcut.title;
    return record;
  }

  launch(shortcut, mode, wall = Date.now()) {
    if (
      !this.enabled ||
      !["internal", "external"].includes(mode) ||
      !number(wall) ||
      wall > 8.64e15
    )
      return;
    const record = this.entry(shortcut);
    if (!record) return;
    const key = mode === "internal" ? "internalLaunches" : "externalLaunches";
    record[key] = add(record[key], 1);
    record.lastOpenedAt = wall;
    this.dirty = true;
    this.flush();
  }

  sample({ mono, wall, focused, shortcut = null, session = null }) {
    if (!Number.isFinite(mono) || !Number.isFinite(wall)) {
      this.previous = null;
      return;
    }
    if (!this.enabled) {
      this.previous = null;
      return;
    }
    const current = {
      mono,
      wall,
      focused: focused === true,
      shortcut,
      session,
    };
    const before = this.previous;
    this.previous = current;
    if (!before) return;
    const elapsed = mono - before.mono;
    const wallElapsed = wall - before.wall;
    // Drop sleep, timer stalls and clock jumps; never estimate hours from a
    // delayed callback. Both samples must see the AURA window in foreground.
    if (
      !before.focused ||
      !current.focused ||
      elapsed <= 0 ||
      elapsed > 5000 ||
      wallElapsed < 0 ||
      wallElapsed > 5000 ||
      Math.abs(elapsed - wallElapsed) > 1000
    )
      return;
    const ms = Math.floor(elapsed);
    this.data.auraMs = add(this.data.auraMs, ms);
    if (
      identity(shortcut) &&
      before.shortcut?.id === shortcut.id &&
      session !== null &&
      session === before.session
    ) {
      const record = this.entry(shortcut);
      if (record) record.internalMs = add(record.internalMs, ms);
    }
    this.dirty = true;
  }

  resetBaseline() {
    this.previous = null;
  }
  setEnabled(enabled) {
    if (!this.canSave) return;
    this.data.enabled = enabled === true;
    this.previous = null;
    this.dirty = true;
    this.flush();
  }
  clear() {
    this.data = fresh(this.enabled);
    this.previous = null;
    this.canSave = true;
    this.dirty = true;
    this.flush();
  }
  flush() {
    if (!this.dirty || !this.canSave) return;
    try {
      this.storage.setItem(USAGE_KEY, JSON.stringify(this.data));
      this.dirty = false;
      this.notice = "";
    } catch {
      this.notice =
        "Usage changes stay in this session because local storage is unavailable.";
    }
  }
}

export function usageDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
