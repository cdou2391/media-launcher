import { test, expect } from "@playwright/test";

test("toolbar Home, Retry and external actions use bounded IPC (mock only)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.commands = [];
    window.nativeEvents = {};
    window.__callbacks = {};
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => {
        const id = Object.keys(window.__callbacks).length;
        window.__callbacks[id] = callback;
        return id;
      },
      invoke: async (command, args) => {
        if (command === "plugin:event|listen") {
          window.nativeEvents[args.event] = window.__callbacks[args.handler];
          return 1;
        }
        window.commands.push({ command, args });
        if (command === "browser_status")
          return {
            title: "Test service",
            origin: "https://example.com",
            phase: "blocked",
            message: "Popup blocked. Use Open externally.",
          };
      },
    };
  });
  await page.goto("/");
  await page.evaluate(() =>
    window.nativeEvents["aura-browser"]({ payload: null }),
  );
  await expect(page.locator("#service-title")).toHaveText("Test service");
  await expect(page.locator("#browser-status")).toContainText("Popup blocked");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page
    .getByRole("button", { name: "Open externally ↗", exact: true })
    .click();
  await page
    .getByRole("button", { name: "⌂ Return to AURA Home", exact: true })
    .click();
  const commands = await page.evaluate(() => window.commands);
  for (const command of ["browser_retry", "browser_external", "browser_home"]) {
    expect(
      commands.some(
        (call) =>
          call.command === command && Object.keys(call.args).length === 0,
      ),
    ).toBe(true);
  }
  expect(commands.some((call) => call.command === "open_target")).toBe(false);
});

test("storage errors are visible and leave existing data intact", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("aura-shortcuts-v2", "{broken"),
  );
  await page.goto("/");
  await expect(page.locator("#storage-notice")).toContainText(
    "original data is preserved",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("aura-shortcuts-v2")),
  ).toBe("{broken");
});

test("native Home event returns from Applications to actual Home with keyboard focus (mock only)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.nativeCalls = [];
    window.nativeCallbacks = {};
    window.nativeEvents = {};
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => {
        const id = Object.keys(window.nativeCallbacks).length;
        window.nativeCallbacks[id] = callback;
        return id;
      },
      invoke: async (command, args) => {
        window.nativeCalls.push({ command, args });
        if (command === "plugin:event|listen") {
          window.nativeEvents[args.event] =
            window.nativeCallbacks[args.handler];
          return 1;
        }
        if (command === "browser_status") return null;
        return { mode: "internal", reason: "Opening inside AURA." };
      },
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "All applications", exact: true })
    .click();
  await page.locator("#all-apps .tile").filter({ hasText: "YouTube" }).click();
  expect(
    await page.evaluate(
      () =>
        window.nativeCalls.find((call) => call.command === "launch_shortcut")
          .args,
    ),
  ).toMatchObject({
    kind: "website",
    target: "https://www.youtube.com",
    launchMode: "auto",
    allowHttp: false,
  });
  await page.evaluate(() =>
    window.nativeEvents["aura-home"]({
      event: "aura-home",
      payload: null,
      id: 1,
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#hero-browse")).toBeFocused();
});

test("sidebar and browser actions remain visible with long titles in a narrow window (mock only)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.nativeEvents = {};
    const callbacks = {};
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => {
        const id = Object.keys(callbacks).length;
        callbacks[id] = callback;
        return id;
      },
      invoke: async (command, args) => {
        if (command === "plugin:event|listen") {
          window.nativeEvents[args.event] = callbacks[args.handler];
          return 1;
        }
        if (command === "browser_home") {
          window.nativeEvents["aura-home"]({ payload: null });
          return;
        }
        if (command === "browser_status")
          return {
            title: "A very long service title that still fits safely",
            origin:
              "https://" + "very-long-host-name.".repeat(10) + "example.com",
            message:
              "The website is taking too long. Check your connection, Retry or Open externally.",
          };
      },
    };
  });
  await page.setViewportSize({ width: 620, height: 470 });
  await page.goto("/");
  await page.evaluate(() =>
    window.nativeEvents["aura-browser"]({ payload: null }),
  );
  await expect(page.locator("#service-title")).toContainText("very long");
  for (const id of ["browser-home", "browser-retry", "browser-external"]) {
    const rect = await page.locator(`#${id}`).boundingBox();
    expect(rect.y + rect.height).toBeLessThanOrEqual(128);
    expect(rect.x).toBeGreaterThanOrEqual(90);
    expect(rect.x + rect.width).toBeLessThanOrEqual(620);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  for (const name of ["Home", "All applications", "Library", "Settings"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  const rail = await page.locator(".rail").boundingBox();
  expect(rail.width).toBe(90);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#settings-view")).toBeVisible();
  await expect(page.locator("#browser-workspace")).toBeHidden();
});
