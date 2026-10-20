import { test, expect } from "@playwright/test";

async function mockNative(page) {
  await page.clock.install();
  await page.addInitScript(() => {
    window.isTauri = true;
    window.usageEvents = {};
    window.appForeground = true;
    window.failLaunch = false;
    let current = null;
    let sessionId = 0;
    const callbacks = {};
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => {
        const id = Object.keys(callbacks).length;
        callbacks[id] = callback;
        return id;
      },
      invoke: async (command, args) => {
        if (command === "plugin:event|listen") {
          window.usageEvents[args.event] = callbacks[args.handler];
          return 1;
        }
        if (command === "usage_foreground") return window.appForeground;
        if (command === "browser_status") return current;
        if (command === "launch_shortcut") {
          if (window.failLaunch) throw new Error("Fixture launch failed");
          const mode =
            args.launchMode === "external" || /netflix/.test(args.target)
              ? "external"
              : "internal";
          if (mode === "internal") {
            current = {
              sessionId: ++sessionId,
              shortcutId: args.shortcutId,
              title: args.title,
              origin: "https://www.youtube.com",
              message: "Page received.",
            };
            window.usageEvents["aura-browser"]({ payload: null });
          }
          return { mode, reason: "Fixture launch" };
        }
        if (command === "browser_home") {
          current = null;
          window.usageEvents["aura-home"]({ payload: null });
        }
      },
    };
  });
  await page.goto("/");
}
async function settings(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#usage-heading")).toBeVisible();
}
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("aura-usage-v1")));

test("Settings counts internal foreground time, pauses while backgrounded, and retains totals after reload (mock native)", async ({
  page,
}) => {
  await mockNative(page);
  await page.locator("#favorites .tile").filter({ hasText: "YouTube" }).click();
  await expect(page.locator("body")).toHaveClass("browsing");
  await page.clock.runFor(6000);
  const before = await stored(page);
  expect(before.shortcuts[0].internalLaunches).toBe(1);
  expect(before.shortcuts[0].internalMs).toBeGreaterThanOrEqual(3000);
  await page.evaluate(() => {
    window.appForeground = false;
  });
  await page.clock.runFor(6000);
  // Allow the next checkpoint to persist foreground time earned before the
  // switch, then compare two settled background checkpoints exactly.
  const inactiveStart = await stored(page);
  await page.clock.runFor(6000);
  const inactiveEnd = await stored(page);
  expect(inactiveEnd.auraMs).toBe(inactiveStart.auraMs);
  expect(inactiveEnd.shortcuts[0].internalMs).toBe(
    inactiveStart.shortcuts[0].internalMs,
  );
  await settings(page);
  await expect(
    page.locator('#usage-rows tr[data-shortcut-id="youtube"]'),
  ).toContainText("1 inside / 0 external");
  await page.reload();
  await settings(page);
  await expect(page.locator("#usage-rows")).toContainText("YouTube");
  expect((await stored(page)).shortcuts[0].internalLaunches).toBe(1);
});

test("pause survives reload and external launches have no fabricated duration (mock native)", async ({
  page,
}) => {
  await mockNative(page);
  await page.locator("#favorites .tile").filter({ hasText: "Netflix" }).click();
  await settings(page);
  await expect(page.locator("#usage-rows")).toContainText(
    "Unavailable (external)",
  );
  await page.getByLabel("Track usage").uncheck();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.locator("#favorites .tile").filter({ hasText: "YouTube" }).click();
  await page.clock.runFor(6000);
  await settings(page);
  await expect(page.locator("#usage-rows")).not.toContainText("YouTube");
  await page.reload();
  await settings(page);
  await expect(page.getByLabel("Track usage")).not.toBeChecked();
  await expect(page.locator("#usage-state")).toContainText("paused");
});

test("clear requires its inline confirmation and preserves shortcuts and accent (mock native)", async ({
  page,
}) => {
  await mockNative(page);
  await page.locator("#favorites .tile").filter({ hasText: "Netflix" }).click();
  await settings(page);
  await page.getByRole("button", { name: "Blue accent" }).click();
  const shortcuts = await page.evaluate(() =>
    localStorage.getItem("aura-shortcuts-v2"),
  );
  await page.locator("#usage-clear").click();
  await page.locator("#usage-cancel").click();
  await expect(page.locator("#usage-rows")).toContainText("Netflix");
  await page.locator("#usage-clear").click();
  await page.locator("#usage-clear-confirm").click();
  await expect(page.locator("#usage-empty")).toBeVisible();
  expect((await stored(page)).shortcuts).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.getItem("aura-shortcuts-v2")),
  ).toBe(shortcuts);
  await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");
});

test("failed launch does not add usage and malformed history is preserved", async ({
  page,
}) => {
  await mockNative(page);
  await page.evaluate(() => {
    window.failLaunch = true;
  });
  await page.locator("#favorites .tile").filter({ hasText: "YouTube" }).click();
  await expect(page.locator("#launch-message")).toContainText(
    "Fixture launch failed",
  );
  expect((await stored(page))?.shortcuts ?? []).toEqual([]);
  // Seed corruption after the old document's legitimate pagehide flush, before
  // the new document reads storage. Mutating it before reload races that flush.
  await page.addInitScript(() =>
    localStorage.setItem("aura-usage-v1", "{broken"),
  );
  await page.reload();
  await settings(page);
  await expect(page.locator("#usage-notice")).toContainText(
    "existing data is preserved",
  );
  await expect(page.getByLabel("Track usage")).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("aura-usage-v1"))).toBe(
    "{broken",
  );
});
