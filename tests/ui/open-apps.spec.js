import { test, expect } from "@playwright/test";

async function setup(page) {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.calls = [];
    window.kept = [1, 2].map((id) => ({
      sessionId: id,
      shortcutId: `kept-${id}`,
      title: `Kept app ${id}`,
      active: false,
      sleeping: id === 1,
    }));
    localStorage.setItem(
      "aura-shortcuts-v2",
      JSON.stringify({
        version: 2,
        shortcuts: window.kept.map((app) => ({
          id: app.shortcutId,
          title: app.title,
          target: `https://example.com/${app.sessionId}`,
          kind: "website",
          launchMode: "internal",
          category: "other",
          favorite: true,
          color: "#294c6b",
          mark: "K",
        })),
      }),
    );
    const callbacks = {};
    const events = {};
    let active = null;
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) {
        const id = Object.keys(callbacks).length;
        callbacks[id] = callback;
        return id;
      },
      async invoke(command, args) {
        if (command === "plugin:event|listen") {
          events[args.event] = callbacks[args.handler];
          return 1;
        }
        window.calls.push({ command, args });
        if (command === "browser_sessions")
          return { limit: 6, items: window.kept };
        if (command === "browser_status")
          return (
            active && {
              ...active,
              phase: "received",
              ready: true,
              message: "Page received.",
            }
          );
        if (command === "browser_resume") {
          if (window.failResume) throw Error("Resume failed");
          active = window.kept.find((app) => app.sessionId === args.sessionId);
          active.active = true;
          events["aura-browser"]({ payload: null });
        }
        if (command === "browser_home") {
          if (active) active.active = false;
          active = null;
          events["aura-home"]({ payload: null });
        }
        if (command === "browser_close") {
          if (window.failClose) throw Error("Close failed");
          window.kept = window.kept.filter(
            (app) => app.sessionId !== args.sessionId,
          );
        }
        if (command === "launch_shortcut") {
          active = window.kept.find(
            (app) => app.shortcutId === args.shortcutId,
          );
          active.active = true;
          events["aura-browser"]({ payload: null });
          return { mode: "internal", resumed: true };
        }
        if (command === "usage_foreground") return false;
      },
    };
  });
  await page.goto("/");
}

test("Open apps returns to an existing session without a launch and closes explicitly (mock native)", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator("#open-app-count")).toHaveText("2");
  await expect(page.locator(".rail-favorite.is-open")).toHaveCount(2);
  await page.getByRole("button", { name: "Open apps", exact: true }).click();
  await expect(page.locator("#open-app-list article")).toHaveCount(2);
  await expect(page.locator("#open-app-list")).toContainText(
    "Sleeping · audio muted",
  );
  await expect(page.locator("#open-app-notice")).toContainText(
    "Pause the site's player",
  );
  await page
    .getByRole("button", { name: "Return to Kept app 1", exact: true })
    .click();
  await expect(page.locator("#browser-workspace")).toBeVisible();
  await expect(page.locator("#browser-loading")).toBeHidden();
  expect(
    await page.evaluate(() =>
      window.calls.filter((call) => call.command === "launch_shortcut"),
    ),
  ).toHaveLength(0);
  expect(
    await page.evaluate(
      () => window.calls.find((call) => call.command === "browser_resume").args,
    ),
  ).toEqual({ sessionId: 1 });
  await page.getByRole("button", { name: "Open apps", exact: true }).click();
  await page
    .getByRole("button", { name: "Close Kept app 1", exact: true })
    .click();
  await expect(page.locator("#open-app-list article")).toHaveCount(1);
  await expect(page.locator("#open-app-count")).toHaveText("1");
  await expect(
    page.getByRole("button", { name: "Return to Kept app 2", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Close Kept app 2", exact: true })
    .click();
  await expect(page.locator("#open-app-empty")).toBeVisible();
  await expect(page.locator("#open-app-count")).toBeHidden();
  await expect(page.locator(".rail-favorite.is-open")).toHaveCount(0);
});

test("failed close/resume keeps a usable list; returning via favorite adds no launch count (mock native)", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Open apps", exact: true }).click();
  await page.evaluate(() => {
    window.failClose = true;
    window.failResume = true;
  });
  await page
    .getByRole("button", { name: "Close Kept app 1", exact: true })
    .click();
  await expect(page.locator("#toast")).toContainText("Close failed");
  await expect(page.locator("#open-app-list article")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Return to Kept app 1", exact: true })
    .click();
  await expect(page.locator("#open-view")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("Resume failed");
  await page.evaluate(() => {
    window.failResume = false;
  });
  await page
    .getByRole("button", { name: "Open favorite Kept app 1", exact: true })
    .click();
  await expect(page.locator("#browser-loading")).toBeHidden();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("aura-usage-v1"))?.shortcuts || [],
    ),
  ).toHaveLength(0);
});

test("Open apps has touch-sized controls at compact and phone widths", async ({
  page,
}) => {
  await setup(page);
  for (const width of [620, 360]) {
    await page.setViewportSize({ width, height: 700 });
    await page.getByRole("button", { name: "Open apps", exact: true }).click();
    const button = page.getByRole("button", {
      name: "Return to Kept app 1",
      exact: true,
    });
    await expect(button).toBeVisible();
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/open-apps-${width}.png`,
      fullPage: true,
    });
  }
});
