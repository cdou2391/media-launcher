import { test, expect } from "@playwright/test";

test("dashboard, search, favorites, edit mode and settings survive refresh", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "All applications", exact: true })
    .click();
  await page
    .locator("#all-apps")
    .getByLabel("Options for YouTube", { exact: true })
    .click();
  await page.getByRole("button", { name: "Edit YouTube", exact: true }).click();
  await page.getByLabel("Open this shortcut").selectOption("external");
  await page
    .getByRole("button", { name: "Save shortcut", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove from favorites" })
    .first()
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "All applications", exact: true })
    .click();
  await expect(page.locator("#all-apps .tile").first()).toContainText(
    "External",
  );
  await page.getByRole("button", { name: "Search shortcuts" }).click();
  await page.getByLabel("Find a shortcut").fill("YouTube");
  await expect(page.locator("#all-apps .tile")).toHaveCount(1);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("aura-shortcuts-v2")),
  );
  expect(saved.shortcuts[0]).toMatchObject({
    favorite: false,
    launchMode: "external",
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Blue accent" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");
});

test("v1 migration preserves favorites and an empty user library stays empty", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "aura-shortcuts-v1",
      JSON.stringify([
        {
          id: "custom",
          title: "My site",
          target: "https://example.com",
          favorite: true,
          color: "#123456",
          mark: "M",
          category: "other",
        },
      ]),
    ),
  );
  await page.goto("/");
  await expect(page.locator("#favorites .tile")).toHaveCount(1);
  await expect(page.locator("#favorites")).toContainText("My site");
  expect(
    await page.evaluate(() => localStorage.getItem("aura-shortcuts-v1-backup")),
  ).toContain("My site");
  await page.evaluate(() =>
    localStorage.setItem(
      "aura-shortcuts-v2",
      JSON.stringify({ version: 2, shortcuts: [] }),
    ),
  );
  await page.reload();
  await expect(page.locator("#favorites")).toContainText("No favorites yet");
});

test("HTTP requires explicit consent and add/edit dialog traps focus", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add a shortcut", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Local media");
  await page
    .getByLabel("Website URL or Windows app path")
    .fill("http://localhost:8096");
  await page
    .getByRole("button", { name: "Save shortcut", exact: true })
    .click();
  await expect(page.locator("#toast")).toContainText("unencrypted");
  await page.getByLabel(/Allow unencrypted HTTP/).check();
  await page
    .getByRole("button", { name: "Save shortcut", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Save shortcut", exact: true })
    .click();
  await expect(page.locator("#favorites")).toContainText("Local media");
});

test("browser preview explains internal limitation and offers a touch-visible Home path", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#favorites .tile").filter({ hasText: "YouTube" }).click();
  await expect(page.locator("#launch-feedback")).toContainText(
    "browser preview cannot",
  );
  await page
    .getByRole("button", { name: "Return to AURA Home", exact: true })
    .click();
  await expect(page.locator("#launch-feedback")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
});

test("native IPC failure exposes retry and external fallback (mock, not native verification)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (command) => {
        if (command === "plugin:event|listen") return 1;
        throw new Error("Service unavailable");
      },
    };
  });
  await page.goto("/");
  await page.locator("#favorites .tile").filter({ hasText: "YouTube" }).click();
  await expect(page.locator("#launch-feedback")).toContainText(
    "Service unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open externally ↗", exact: true }),
  ).toBeVisible();
});

test("offline dashboard, exit and responsive portrait navigation remain usable", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 768, height: 1152 });
  await page.goto("/");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Exit launcher" }).click();
  await expect(page.locator("#toast")).toContainText("Close this browser tab");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator("#favorites .tile").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("browser preview keeps its existing sidebar and has no floating controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".rail")).toBeVisible();
  await expect(page.locator("#browser-workspace")).toBeHidden();
  await page.locator("#favorites .tile").filter({ hasText: "YouTube" }).click();
  await expect(page.locator("#launch-message")).toContainText(
    "browser preview cannot",
  );
  await expect(page.locator("#browser-workspace")).toBeHidden();
});
