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
