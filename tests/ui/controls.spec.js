import { test, expect } from "@playwright/test";

test("toolbar Home, Retry and external actions use bounded IPC (mock only)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.commands = [];
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
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
  await page.goto("/browser.html");
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
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => {
        window.homeEvent = callback;
        return 1;
      },
      invoke: async (command, args) => {
        window.nativeCalls.push({ command, args });
        if (command === "plugin:event|listen") return 1;
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
    window.homeEvent({ event: "aura-home", payload: null, id: 1 }),
  );
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#hero-browse")).toBeFocused();
});

test("long service identity and error message keep narrow toolbar actions visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      invoke: async () => ({
        title: "A very long service title that still fits safely",
        origin: "https://" + "very-long-host-name.".repeat(10) + "example.com",
        message:
          "The website is taking too long. Check your connection, Retry or Open externally.",
      }),
    };
  });
  await page.setViewportSize({ width: 280, height: 264 });
  await page.goto("/browser.html");
  await expect(page.locator("#service-title")).toContainText("very long");
  for (const id of ["browser-home", "browser-retry", "browser-external"]) {
    const rect = await page.locator(`#${id}`).boundingBox();
    expect(rect.y + rect.height).toBeLessThanOrEqual(264);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
