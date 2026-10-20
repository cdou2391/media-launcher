import { test, expect } from "@playwright/test";

async function fixture(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "aura-shortcuts-v2",
      JSON.stringify({
        version: 2,
        shortcuts: ["Cinema", "Music"].map((title, i) => ({
          id: `app-${i}`,
          title,
          target: `https://example.com/${i}`,
          kind: "website",
          category: "other",
          favorite: true,
          launchMode: "internal",
          allowHttp: false,
        })),
      }),
    );
    window.isTauri = true;
    window.nativeEvents = {};
    window.commands = [];
    window.site = null;
    let session = 0;
    const callbacks = {};
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) {
        const id = Object.keys(callbacks).length;
        callbacks[id] = callback;
        return id;
      },
      async invoke(command, args) {
        if (command === "plugin:event|listen") {
          window.nativeEvents[args.event] = callbacks[args.handler];
          return 1;
        }
        window.commands.push({ command, args });
        if (command === "browser_status")
          return window.site && { ...window.site };
        if (command === "launch_shortcut") {
          if (window.failClose) throw Error("Close failed");
          window.site = null;
          if (window.holdLaunch)
            await new Promise((resolve) => {
              window.releaseLaunch = resolve;
            });
          if (window.failCreate) throw Error("Unable to create website");
          window.site = {
            sessionId: ++session,
            shortcutId: args.shortcutId,
            title: args.title,
            ready: false,
            phase: "loading",
            message: "Loading website.",
          };
          window.nativeEvents["aura-browser"]({ payload: null });
          return { mode: "internal", reason: "Inside AURA" };
        }
        if (command === "browser_reveal") {
          if (!window.site?.ready || args.sessionId !== window.site.sessionId)
            throw Error("Wrong or unready session");
          window.revealed = args.sessionId;
        }
        if (command === "browser_retry") {
          window.site.phase = "loading";
          window.site.message = "Refreshing the original shortcut.";
        }
        if (command === "browser_home") {
          window.site = null;
          window.nativeEvents["aura-home"]({ payload: null });
        }
        if (command === "usage_foreground") return true;
      },
    };
  });
  await page.goto("/");
}
const favorite = (page, name) =>
  page.getByRole("button", { name: `Open favorite ${name}`, exact: true });
async function ready(page) {
  await page.evaluate(() => {
    window.site.ready = true;
    window.site.phase = "received";
    window.site.message = "Page received.";
  });
  await expect(page.locator("#browser-loading")).toBeHidden();
}

test("internal switching keeps the shell and branded loader throughout creation and loading, with no Home frame", async ({
  page,
}) => {
  await fixture(page);
  await favorite(page, "Cinema").click();
  await expect(page.locator("#browser-loading-title")).toHaveText(
    "Opening Cinema",
  );
  await ready(page);
  await page.evaluate(() => {
    window.homeFrames = 0;
    const check = () => {
      if (!document.body.classList.contains("browsing")) window.homeFrames++;
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
    window.holdLaunch = true;
  });
  await favorite(page, "Music").click();
  await expect(page.locator("#browser-loading")).toBeVisible();
  await expect(page.locator("#browser-loading-title")).toHaveText(
    "Opening Music",
  );
  await expect(page.locator("#service-title")).toHaveText("Music");
  await expect(page.locator("#home-view")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Home", exact: true }),
  ).toBeVisible();
  // Even an old close event received in the empty native-session gap is ignored.
  await page.evaluate(() =>
    window.nativeEvents["aura-home"]({ payload: null }),
  );
  await expect(page.locator("#browser-loading")).toBeVisible();
  await page.evaluate(() => window.releaseLaunch());
  await expect(favorite(page, "Music")).toBeEnabled();
  await expect(page.locator("#browser-loading")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await favorite(page, "Music").click();
  expect(
    await page.evaluate(() =>
      window.commands.filter((c) => c.command === "launch_shortcut"),
    ),
  ).toHaveLength(2);
  await ready(page);
  expect(await page.evaluate(() => window.homeFrames)).toBe(0);
  expect(
    await page.evaluate(() =>
      window.commands.filter((c) => c.command === "browser_home"),
    ),
  ).toHaveLength(0);
  expect(await page.evaluate(() => window.revealed)).toBe(2);
  const launches = await page.evaluate(
    () => JSON.parse(localStorage.getItem("aura-usage-v1")).shortcuts,
  );
  expect(
    Object.values(launches).reduce((sum, r) => sum + r.internalLaunches, 0),
  ).toBe(2);
});

test("loader fits a small window, follows the accent and respects reduced motion", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 620, height: 470 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Blue accent", exact: true }).click();
  await favorite(page, "Cinema").click();
  const bounds = await page.locator("#browser-loading").boundingBox();
  expect(bounds).toEqual({ x: 90, y: 56, width: 530, height: 414 });
  expect(
    await page
      .locator(".aura-orbit-ring")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".aura-orbit")
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe("rgb(141, 191, 231)");
  const content = await page.locator(".browser-loading-content").boundingBox();
  expect(content.y).toBeGreaterThanOrEqual(56);
  expect(content.y + content.height).toBeLessThanOrEqual(470);
  await page.screenshot({ path: testInfo.outputPath("aura-loader.png") });
});

test("slow loading stops indefinite motion, explains recovery and refresh reveals only the ready session", async ({
  page,
}) => {
  await fixture(page);
  await favorite(page, "Cinema").click();
  await page.evaluate(() => {
    window.site.phase = "slow";
    window.site.message =
      "The website is taking too long. Check your connection and refresh.";
  });
  await expect(page.locator("#browser-loading-detail")).toContainText(
    "Check your connection",
  );
  await expect(page.locator("#browser-loading")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(await page.evaluate(() => window.revealed)).toBeUndefined();
  await page
    .getByRole("button", { name: "Refresh website", exact: true })
    .click();
  await expect(page.locator("#browser-loading")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await ready(page);
  expect(
    await page.evaluate(() =>
      window.commands.filter((c) => c.command === "launch_shortcut"),
    ),
  ).toHaveLength(1);
});

test("failed close retains the previous site, while failed creation offers a usable retry", async ({
  page,
}) => {
  await fixture(page);
  await favorite(page, "Cinema").click();
  await ready(page);
  await page.evaluate(() => {
    window.failClose = true;
  });
  await favorite(page, "Music").click();
  await expect(page.locator("#browser-status")).toContainText("Close failed");
  await expect(page.locator("#service-title")).toHaveText("Cinema");
  await expect(favorite(page, "Cinema")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator("#browser-loading")).toBeHidden();
  await expect(page.locator("#launch-feedback")).toBeHidden();
  await page.evaluate(() => {
    window.failClose = false;
    window.failCreate = true;
  });
  await favorite(page, "Music").click();
  await expect(page.locator("#launch-feedback")).toBeVisible();
  await expect(page.locator("#launch-message")).toContainText(
    "Unable to create",
  );
  await expect(page.locator("#browser-loading")).toBeHidden();
  await page.evaluate(() => {
    window.failCreate = false;
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("#browser-loading-title")).toHaveText(
    "Opening Music",
  );
  await ready(page);
});

test("Home remains usable during loading and a Home request during native creation is honored", async ({
  page,
}) => {
  await fixture(page);
  await favorite(page, "Cinema").click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator("#browser-workspace")).toBeHidden();
  await expect(page.locator("#browser-loading")).toBeHidden();
  await page.evaluate(() => {
    window.holdLaunch = true;
  });
  await favorite(page, "Music").click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.evaluate(() => window.releaseLaunch());
  await expect(page.locator("#settings-view")).toBeVisible();
  await expect(page.locator("#browser-loading")).toBeHidden();
  expect(await page.evaluate(() => window.site)).toBeNull();
  expect(
    await page.evaluate(() =>
      window.commands.filter((c) => c.command === "browser_reveal"),
    ),
  ).toHaveLength(0);
});
