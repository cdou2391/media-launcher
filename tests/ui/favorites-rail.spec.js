import { test, expect } from "@playwright/test";

const fixtureApps = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `favorite-${i}`,
    title: `Favorite ${i}`,
    target: `https://example.com/${i}`,
    kind: "website",
    category: "other",
    favorite: true,
    color: "#32485b",
    mark: String(i),
    launchMode: "internal",
    allowHttp: false,
  }));

for (const viewport of [
  { width: 1400, height: 700 },
  { width: 620, height: 470 },
  { width: 360, height: 800 },
]) {
  test(`navigation stays pinned while pages and favorites scroll at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(
      (apps) =>
        localStorage.setItem(
          "aura-shortcuts-v2",
          JSON.stringify({ version: 2, shortcuts: apps }),
        ),
      fixtureApps(24),
    );
    await page.goto("/");
    for (const name of ["Home", "All applications", "Settings"]) {
      await page.getByRole("button", { name, exact: true }).click();
      const rail = await page.locator(".rail").boundingBox();
      const home = await page
        .getByRole("button", { name: "Home", exact: true })
        .boundingBox();
      const settings = await page
        .getByRole("button", { name: "Settings", exact: true })
        .boundingBox();
      await page.mouse.move(viewport.width - 40, viewport.height / 2);
      await page.mouse.wheel(0, 1000);
      await expect
        .poll(() => page.evaluate(() => scrollY))
        .toBeGreaterThan(100);
      await expect
        .poll(async () => (await page.locator(".rail").boundingBox()).y)
        .toBe(rail.y);
      expect(
        await page
          .getByRole("button", { name: "Home", exact: true })
          .boundingBox(),
      ).toEqual(home);
      expect(
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .boundingBox(),
      ).toEqual(settings);
      const main = await page.locator(".main").boundingBox();
      expect(main.x).toBe(viewport.width > 580 ? 90 : 0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    if (viewport.width <= 580)
      await page
        .getByRole("button", { name: "Favorite applications", exact: true })
        .click();
    const before = await page.locator(".rail").boundingBox();
    const pageScroll = await page.evaluate(() => scrollY);
    await page.locator("#rail-favorite-list").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(
      await page.locator("#rail-favorite-list").evaluate((el) => el.scrollTop),
    ).toBeGreaterThan(0);
    expect(await page.locator(".rail").boundingBox()).toEqual(before);
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
  });
}

test("sidebar favorites stay in sync with edits and persist independently of search", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".rail-favorite")).toHaveCount(5);
  await page
    .getByRole("button", { name: "All applications", exact: true })
    .click();
  await page.getByRole("button", { name: "Search shortcuts" }).click();
  await page.getByLabel("Find a shortcut").fill("Jellyfin");
  await expect(page.locator("#all-apps .tile")).toHaveCount(1);
  await expect(page.locator(".rail-favorite")).toHaveCount(5);
  await page.getByLabel("Find a shortcut").fill("");
  await page
    .locator("#all-apps .tile-controls")
    .first()
    .getByRole("button", { name: "Remove from favorites" })
    .click();
  await expect(
    page.getByRole("button", { name: "Open favorite YouTube", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Plex", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Plex hub");
  await page
    .getByRole("button", { name: "Save shortcut", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open favorite Plex hub", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".rail-favorite")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Open favorite Plex hub", exact: true }),
  ).toBeVisible();
});

test("long favorite lists scroll inside the rail while Home and Settings stay reachable", async ({
  page,
}) => {
  await page.addInitScript((apps) => {
    if (localStorage.getItem("aura-shortcuts-v2") === null)
      localStorage.setItem(
        "aura-shortcuts-v2",
        JSON.stringify({ version: 2, shortcuts: apps }),
      );
  }, fixtureApps(24));
  await page.setViewportSize({ width: 620, height: 470 });
  await page.goto("/");
  const scroll = await page
    .locator("#rail-favorite-list")
    .evaluate((el) => ({ height: el.clientHeight, content: el.scrollHeight }));
  expect(scroll.height).toBeGreaterThan(44);
  expect(scroll.content).toBeGreaterThan(scroll.height);
  const last = page.getByRole("button", {
    name: "Open favorite Favorite 23",
    exact: true,
  });
  await last.scrollIntoViewIfNeeded();
  const favorite = await last.boundingBox();
  expect(favorite.width).toBeGreaterThanOrEqual(44);
  expect(favorite.height).toBeGreaterThanOrEqual(44);
  for (const name of ["Home", "All applications", "Library", "Settings"]) {
    const bounds = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(470);
  }
  await last.click();
  await expect(page.locator("#launch-message")).toContainText(
    "browser preview cannot",
  );
  await page
    .getByRole("button", { name: "Return to AURA Home", exact: true })
    .click();
  await page.evaluate(() =>
    localStorage.setItem(
      "aura-shortcuts-v2",
      JSON.stringify({ version: 2, shortcuts: [] }),
    ),
  );
  await page.reload();
  await expect(page.locator("#rail-favorites")).toBeHidden();
});

test("phone favorites use a labeled panel and preserve the bottom navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", {
    name: "Favorite applications",
    exact: true,
  });
  await expect(page.locator("#rail-favorites")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Open favorite YouTube", exact: true }),
  ).toBeFocused();
  const panel = await page.locator("#rail-favorites").boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(360);
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(738);
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(page.locator("#rail-favorites")).toBeHidden();
  await toggle.click();
  await page
    .getByRole("button", { name: "Open favorite YouTube", exact: true })
    .click();
  await expect(page.locator("#rail-favorites")).toBeHidden();
  await expect(page.locator("#launch-feedback")).toBeVisible();
});

test("favorites switch internal sessions safely, keep active sites, and honor external routing (mock native)", async ({
  page,
}) => {
  await page.addInitScript((apps) => {
    apps[2].launchMode = "external";
    localStorage.setItem(
      "aura-shortcuts-v2",
      JSON.stringify({ version: 2, shortcuts: apps }),
    );
    window.isTauri = true;
    window.commands = [];
    window.nativeEvents = {};
    const callbacks = {};
    let site = null,
      session = 0;
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
        window.commands.push({ command, args });
        if (command === "browser_status") return site;
        if (command === "browser_home") {
          if (window.failClose) throw Error("Close failed");
          site = null;
          setTimeout(
            () => window.nativeEvents["aura-home"]({ payload: null }),
            60,
          );
          return;
        }
        if (command === "launch_shortcut") {
          if (window.failClose && site) throw Error("Close failed");
          if (args.launchMode === "external")
            return { mode: "external", reason: "External mode" };
          site = {
            sessionId: ++session,
            shortcutId: args.shortcutId,
            title: args.title,
            phase: "received",
            message: "Page received.",
          };
          window.nativeEvents["aura-browser"]({ payload: null });
          return { mode: "internal", reason: "Inside AURA" };
        }
      },
    };
  }, fixtureApps(3));
  await page.goto("/");
  const first = page.getByRole("button", {
    name: "Open favorite Favorite 0",
    exact: true,
  });
  const second = page.getByRole("button", {
    name: "Open favorite Favorite 1",
    exact: true,
  });
  await first.click();
  await expect(first).toHaveAttribute("aria-current", "true");
  const count = await page.evaluate(
    () =>
      window.commands.filter((call) => call.command === "launch_shortcut")
        .length,
  );
  await first.click();
  expect(
    await page.evaluate(
      () =>
        window.commands.filter((call) => call.command === "launch_shortcut")
          .length,
    ),
  ).toBe(count);
  await page.evaluate(() => {
    window.failClose = true;
  });
  await second.click();
  await expect(page.locator("#browser-status")).toContainText("Close failed");
  expect(
    await page.evaluate(
      () =>
        window.commands.filter((call) => call.command === "launch_shortcut")
          .length,
    ),
  ).toBe(count + 1);
  await page.evaluate(() => {
    window.failClose = false;
  });
  await second.click();
  await expect(second).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#service-title")).toHaveText("Favorite 1");
  await expect
    .poll(() =>
      page.evaluate(() => document.body.classList.contains("browsing")),
    )
    .toBe(true);
  // Wait for the intentionally delayed close event through a browser task.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await expect(page.locator("#browser-workspace")).toBeVisible();
  await page
    .getByRole("button", { name: "Open favorite Favorite 2", exact: true })
    .click();
  await expect(page.locator("#browser-workspace")).toBeHidden();
  const calls = await page.evaluate(() =>
    window.commands.filter((call) =>
      ["browser_home", "launch_shortcut"].includes(call.command),
    ),
  );
  expect(calls.map((call) => call.command)).toEqual([
    "launch_shortcut",
    "launch_shortcut",
    "launch_shortcut",
    "browser_home",
    "launch_shortcut",
  ]);
  expect(calls.at(-1).args).toMatchObject({
    shortcutId: "favorite-2",
    launchMode: "external",
  });
});
