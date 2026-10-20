import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UsageTracker,
  USAGE_KEY,
  usageDuration,
} from "../src/services/usage.js";

function memory() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
const site = {
  id: "youtube",
  title: "YouTube",
  target: "https://example.com/private?token=secret",
};
const sample = (tracker, ms, extra = {}) =>
  tracker.sample({
    mono: ms,
    wall: 1700000000000 + ms,
    focused: true,
    shortcut: site,
    session: 1,
    ...extra,
  });

test("usage persists launch totals and foreground site time without recording targets", () => {
  const storage = memory(),
    tracker = new UsageTracker(storage);
  tracker.launch(site, "internal", 1700000000000);
  sample(tracker, 0);
  sample(tracker, 1000);
  sample(tracker, 2000);
  tracker.launch(site, "external", 1700000002000);
  tracker.flush();
  const data = new UsageTracker(storage).snapshot();
  assert.equal(data.auraMs, 2000);
  assert.deepEqual(data.shortcuts[0], {
    id: "youtube",
    title: "YouTube",
    internalMs: 2000,
    internalLaunches: 1,
    externalLaunches: 1,
    lastOpenedAt: 1700000002000,
  });
  assert.ok(!storage.getItem(USAGE_KEY).includes("secret"));
  sample(new UsageTracker(storage), 900000);
  assert.equal(
    new UsageTracker(storage).snapshot().auraMs,
    2000,
    "restart cannot backfill elapsed time",
  );
});

test("unfocused intervals, sleep gaps and clock jumps do not inflate usage", () => {
  const tracker = new UsageTracker(memory());
  sample(tracker, 0);
  sample(tracker, 1000);
  sample(tracker, 2000, { focused: false });
  sample(tracker, 3000, { focused: false });
  sample(tracker, 4000);
  sample(tracker, 5000);
  sample(tracker, 100000);
  sample(tracker, 101000);
  sample(tracker, 102000, { wall: 1700100000000 });
  sample(tracker, 103000, { wall: 1699999999999 });
  assert.equal(tracker.snapshot().auraMs, 3000);
  assert.equal(tracker.snapshot().shortcuts[0].internalMs, 3000);
});

test("session switches never assign an interval to the wrong shortcut or reopened service", () => {
  const tracker = new UsageTracker(memory());
  sample(tracker, 0);
  sample(tracker, 1000);
  sample(tracker, 2000, { session: 2 });
  sample(tracker, 3000, { session: 2 });
  sample(tracker, 4000, {
    shortcut: { id: "other", title: "Other" },
    session: 3,
  });
  sample(tracker, 5000, { shortcut: null, session: null });
  const data = tracker.snapshot();
  assert.equal(data.auraMs, 5000);
  assert.equal(data.shortcuts[0].internalMs, 2000);
  assert.equal(data.shortcuts.length, 1);
});

test("pause survives restart and resume has no time backfill or paused launch records", () => {
  const storage = memory(),
    tracker = new UsageTracker(storage);
  sample(tracker, 0);
  sample(tracker, 1000);
  tracker.setEnabled(false);
  tracker.launch(site, "internal");
  sample(tracker, 2000);
  const resumed = new UsageTracker(storage);
  assert.equal(resumed.enabled, false);
  resumed.setEnabled(true);
  sample(resumed, 100000);
  sample(resumed, 101000);
  assert.equal(resumed.snapshot().auraMs, 2000);
  assert.equal(resumed.snapshot().shortcuts[0].internalLaunches, 0);
});

test("external launch records have zero measured duration and invalid/failed modes do not count", () => {
  const tracker = new UsageTracker(memory());
  tracker.launch({ id: "native", title: "Player" }, "external");
  tracker.launch(site, "failed");
  sample(tracker, 0, { shortcut: null });
  sample(tracker, 1000, { shortcut: null });
  assert.equal(tracker.snapshot().shortcuts.length, 1);
  assert.equal(tracker.snapshot().shortcuts[0].externalLaunches, 1);
  assert.equal(tracker.snapshot().shortcuts[0].internalMs, 0);
});

test("clear resets only usage, preserves paused preference, and leaves shortcut settings intact", () => {
  const storage = memory();
  storage.setItem("aura-shortcuts-v2", "personal shortcuts");
  const tracker = new UsageTracker(storage);
  tracker.launch(site, "internal");
  tracker.setEnabled(false);
  tracker.clear();
  assert.deepEqual(tracker.snapshot(), {
    version: 1,
    enabled: false,
    auraMs: 0,
    shortcuts: [],
  });
  assert.equal(storage.getItem("aura-shortcuts-v2"), "personal shortcuts");
  assert.equal(new UsageTracker(storage).enabled, false);
});

test("corrupt/future usage is preserved and paused until explicit clear; quota errors keep session totals", () => {
  for (const raw of [
    "{broken",
    JSON.stringify({ version: 99 }),
    JSON.stringify({ version: 1, enabled: true, auraMs: -1, shortcuts: [] }),
  ]) {
    const storage = memory();
    storage.setItem(USAGE_KEY, raw);
    const tracker = new UsageTracker(storage);
    tracker.launch(site, "internal");
    tracker.setEnabled(true);
    tracker.flush();
    assert.equal(tracker.enabled, false);
    assert.equal(storage.getItem(USAGE_KEY), raw);
    tracker.clear();
    tracker.setEnabled(true);
    assert.equal(new UsageTracker(storage).enabled, true);
  }
  const storage = memory(),
    tracker = new UsageTracker(storage);
  storage.setItem = () => {
    throw new Error("quota");
  };
  tracker.launch(site, "internal");
  assert.equal(tracker.snapshot().shortcuts[0].internalLaunches, 1);
  assert.match(tracker.notice, /session/);
});

test("usage display formats seconds, minutes and hours without rounding up", () => {
  assert.equal(usageDuration(59999), "59s");
  assert.equal(usageDuration(61000), "1m 1s");
  assert.equal(usageDuration(3661000), "1h 1m");
});
