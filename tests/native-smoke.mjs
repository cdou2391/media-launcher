import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

assert.equal(os.platform(), "win32", "Native smoke tests require Windows");
assert.ok(
  process.argv[2],
  "Usage: npm run test:native -- <path-to-aura-home-media.exe>",
);
const executable = path.resolve(process.argv[2]);
assert.ok(
  fs.existsSync(executable),
  "Provide the extracted native executable path",
);
const result = {
  executable,
  host: `${os.type()} ${os.release()} ${os.arch()}`,
  checks: [],
};
let fixtureRequests = 0;
const fixture = http.createServer((request, response) => {
  if (request.url === "/") fixtureRequests++;
  response.setHeader("Content-Type", "text/html");
  response.end(
    '<!doctype html><html><title>Remote isolation fixture</title><body><h1>Remote isolation fixture</h1><button id="fullscreen" onclick="document.documentElement.requestFullscreen()">Fullscreen</button><button id="popup" onclick="window.open(\'/popup\')">Popup</button><button id="local" onclick="location.href=\'http://tauri.localhost/index.html\'">Local navigation</button></body></html>',
  );
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
const portProbe = http.createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const testFolder = path.resolve(".tools/native-smoke-" + Date.now());
fs.mkdirSync(testFolder, { recursive: true });
const visibilityHelper = path.join(testFolder, "own-window.ps1");
fs.writeFileSync(
  visibilityHelper,
  `param([int]$AuraPid, [string]$ExpectedExe, [int]$Show)
$ErrorActionPreference = 'Stop'
$auraProcess = Get-Process -Id $AuraPid
if ($auraProcess.Path -ne $ExpectedExe) { throw 'Unexpected test process; refusing window operation' }
$auraProcess.Refresh()
$auraWindowHandle = $auraProcess.MainWindowHandle
if ($auraWindowHandle -eq [IntPtr]::Zero) { throw 'Test application has no native window' }
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class AuraTestWindow { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd, int show); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd); }'
[void][AuraTestWindow]::ShowWindowAsync($auraWindowHandle, $Show)
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  $minimized = [AuraTestWindow]::IsIconic($auraWindowHandle)
  if (($Show -eq 6 -and $minimized) -or ($Show -eq 9 -and -not $minimized)) { exit 0 }
  Start-Sleep -Milliseconds 50
}
throw 'Test window did not reach the requested visible/minimized state'
`,
);
async function ownWindowVisibility(show) {
  await new Promise((resolve, reject) => {
    const helper = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `& {\n${fs.readFileSync(visibilityHelper, "utf8")}\n} -AuraPid ([int]$env:AURA_SMOKE_PID) -ExpectedExe $env:AURA_SMOKE_EXE -Show ([int]$env:AURA_SMOKE_SHOW)`,
      ],
      {
        windowsHide: true,
        stdio: "pipe",
        env: {
          ...process.env,
          AURA_SMOKE_PID: String(child.pid),
          AURA_SMOKE_EXE: executable,
          AURA_SMOKE_SHOW: String(show),
        },
      },
    );
    let output = "";
    helper.stdout.on("data", (data) => {
      output += data;
    });
    helper.stderr.on("data", (data) => {
      output += data;
    });
    helper.on("error", reject);
    helper.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(output)),
    );
    // Parse the complete command as a unit. Do not override execution policy.
    helper.stdin.end();
  });
}
let child = spawn(executable, [], {
  windowsHide: true,
  stdio: "pipe",
  env: {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: path.join(testFolder, "profile"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
let processOutput = "";
child.stdout.on("data", (data) => (processOutput += data));
child.stderr.on("data", (data) => (processOutput += data));
child.on("error", (error) => (processOutput += error.message));
let browser;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, description, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    if (child.exitCode !== null)
      throw new Error("AURA exited: " + processOutput);
    await pause(200);
  }
  throw new Error("Timed out: " + description + "\n" + processOutput);
}
try {
  await waitFor(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
    } catch {
      return false;
    }
  }, "WebView2 debug connection");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  result.webview2 = browser.version();
  const context = browser.contexts()[0];
  const requestFailures = [];
  const navigationResponses = [];
  context.on("response", (response) => {
    if (response.request().isNavigationRequest())
      navigationResponses.push({
        url: response.url(),
        status: response.status(),
      });
  });
  context.on("page", (page) =>
    page.on("requestfailed", (request) =>
      requestFailures.push({
        url: request.url(),
        error: request.failure()?.errorText,
      }),
    ),
  );
  const main = await waitFor(
    () => context.pages().find((page) => /tauri\.localhost/.test(page.url())),
    "local AURA Home",
  );
  await main.locator("#favorites .tile").first().waitFor();
  result.checks.push("Packaged application renders Home in real WebView2");
  await main.evaluate(() => {
    localStorage.removeItem("aura-shortcuts-v2");
    localStorage.setItem(
      "aura-shortcuts-v1",
      JSON.stringify([
        {
          id: "native-migration",
          title: "Native migration favorite",
          target: "https://example.com",
          category: "other",
          favorite: true,
          color: "#123456",
          mark: "M",
        },
      ]),
    );
    localStorage.setItem("aura-accent-v1", "blue");
  });
  await main.reload();
  await main
    .locator("#favorites .tile")
    .filter({ hasText: "Native migration favorite" })
    .waitFor();
  const stored = await main.evaluate(() => ({
    v2: JSON.parse(localStorage.getItem("aura-shortcuts-v2")),
    backup: localStorage.getItem("aura-shortcuts-v1-backup"),
    accent: document.documentElement.dataset.accent,
  }));
  assert.equal(stored.v2.version, 2);
  assert.equal(stored.v2.shortcuts[0].favorite, true);
  assert.equal(stored.v2.shortcuts[0].color, "#123456");
  assert.equal(stored.v2.shortcuts[0].mark, "M");
  assert.ok(stored.backup.includes("native-migration"));
  assert.equal(stored.accent, "blue");
  result.checks.push(
    "Native WebView2 v1 migration preserves favorite, color, mark and accent across renderer reload",
  );
  await main.evaluate((target) => {
    const data = JSON.parse(localStorage.getItem("aura-shortcuts-v2"));
    for (const suffix of ["one", "two"])
      data.shortcuts.push({
        id: `favorite-${suffix}`,
        title: `Favorite ${suffix}`,
        target: suffix === "one" ? target : `${target}/second`,
        kind: "website",
        category: "other",
        favorite: true,
        color: "#284b69",
        mark: suffix === "one" ? "F1" : "F2",
        launchMode: "internal",
        allowHttp: true,
      });
    localStorage.setItem("aura-shortcuts-v2", JSON.stringify(data));
  }, fixtureUrl);
  await main.reload();
  await main
    .locator('.rail-favorite[data-shortcut-id="favorite-one"]')
    .waitFor();
  let favoriteRemote;
  for (const suffix of ["one", "two", "one", "two"]) {
    const old = favoriteRemote;
    await main
      .locator(`.rail-favorite[data-shortcut-id="favorite-${suffix}"]`)
      .click();
    if (old)
      await waitFor(() => old.isClosed(), "favorite closes previous service");
    favoriteRemote = await waitFor(
      () =>
        context
          .pages()
          .find((page) => page !== main && page.url().startsWith(fixtureUrl)),
      "favorite opens controlled website",
    );
    await favoriteRemote.locator("h1").waitFor();
    await waitFor(
      async () =>
        (await main
          .locator(`.rail-favorite[data-shortcut-id="favorite-${suffix}"]`)
          .getAttribute("aria-current")) === "true",
      "active favorite highlight",
    );
    await pause(150);
    assert.ok(await main.locator("body.browsing").count());
    assert.equal(context.pages().length, 2);
    assert.equal(
      (
        await main.evaluate(() =>
          window.__TAURI_INTERNALS__.invoke("browser_status"),
        )
      ).shortcutId,
      `favorite-${suffix}`,
    );
  }
  const favoriteSession = await main.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("browser_status"),
  );
  await main.locator('.rail-favorite[data-shortcut-id="favorite-two"]').click();
  await pause(150);
  assert.equal(
    (
      await main.evaluate(() =>
        window.__TAURI_INTERNALS__.invoke("browser_status"),
      )
    ).sessionId,
    favoriteSession.sessionId,
  );
  assert.ok(!favoriteRemote.isClosed());
  await main
    .locator(".rail")
    .screenshot({ path: path.join(testFolder, "favorites-rail.png") });
  await main.locator('.rail-link[data-view="home"]').click();
  await waitFor(
    () => favoriteRemote.isClosed(),
    "favorite session returns Home",
  );
  await main.locator("body:not(.browsing)").waitFor();
  assert.equal(
    await main.locator('.rail-favorite[aria-current="true"]').count(),
    0,
  );
  result.checks.push(
    "Sidebar favorites open and switch real native services, highlight the active shortcut, and preserve the active session when reselected",
  );
  const open = async (target = fixtureUrl) => {
    await main.evaluate(
      ({ target }) =>
        window.__TAURI_INTERNALS__.invoke("launch_shortcut", {
          target,
          title: "Isolation fixture",
          kind: "website",
          launchMode: "internal",
          allowHttp: true,
        }),
      { target },
    );
    const remote = await waitFor(
      () => context.pages().find((page) => page.url().startsWith(target)),
      "remote service window",
    );
    const toolbar = main;
    await main.locator("body.browsing").waitFor();
    await toolbar.locator('.rail-link[data-view="home"]').waitFor();
    assert.equal(
      context.pages().length,
      2,
      "Only Home and one remote child should exist; no floating toolbar",
    );
    for (const name of ["Home", "All applications", "Library", "Settings"]) {
      assert.ok(
        await main.getByRole("button", { name, exact: true }).isVisible(),
      );
    }
    if (target === fixtureUrl) await remote.locator("h1").waitFor();
    return { remote, toolbar };
  };
  for (let cycle = 0; cycle < 10; cycle++) {
    await main.locator('[data-view="apps"]').first().click();
    const { remote, toolbar } = await open();
    if (cycle === 0) {
      const bar = await toolbar.locator("#browser-workspace").boundingBox();
      const refresh = await toolbar.locator("#browser-retry").boundingBox();
      assert.equal(bar.height, 56);
      assert.ok(refresh.width >= 44 && refresh.height >= 44);
      assert.ok(refresh.y >= 0 && refresh.y + refresh.height <= 56);
      assert.equal(await toolbar.locator("#browser-retry").innerText(), "");
      assert.ok(await toolbar.locator("#browser-retry svg").isVisible());
      assert.equal(
        await toolbar
          .locator("#browser-home, #browser-external, #service-origin")
          .count(),
        0,
      );
      result.checks.push(
        "Compact 56px native browser header has only the service title and touch-sized refresh icon",
      );
      result.ipc = await remote.evaluate(async () => {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (!invoke) return { bridgeAbsent: true };
        const cases = [
          ["open_target", { target: "https://example.com", allowHttp: false }],
          [
            "launch_shortcut",
            {
              target: "https://example.com",
              title: "Probe",
              kind: "website",
              launchMode: "external",
              allowHttp: false,
            },
          ],
          [
            "open_internal",
            { target: "https://example.com", title: "Probe", allowHttp: false },
          ],
          ["browser_status", {}],
          ["browser_home", {}],
          ["browser_retry", {}],
          ["browser_external", {}],
          ["usage_foreground", {}],
          ["plugin:window|close", { label: "main" }],
          ["plugin:window|set_fullscreen", { label: "main", value: false }],
          ["plugin:webview|close", { label: "main" }],
          ["plugin:event|emit", { event: "aura-home", payload: null }],
        ];
        const denied = [];
        for (const [command, args] of cases) {
          try {
            await invoke(command, args);
            denied.push({ command, denied: false });
          } catch (error) {
            denied.push({ command, denied: true, message: String(error) });
          }
        }
        return { bridgeAbsent: false, denied };
      });
      assert.ok(
        result.ipc.bridgeAbsent ||
          result.ipc.denied.every((item) => item.denied),
        "A remote IPC call unexpectedly succeeded",
      );
      await remote.locator("#popup").click();
      await waitFor(
        async () =>
          (await toolbar.locator("#browser-status").textContent()).includes(
            "popup",
          ),
        "popup denial",
      );
      await remote.locator("#local").click();
      await waitFor(
        async () =>
          (await toolbar.locator("#browser-status").textContent()).includes(
            "navigation is blocked",
          ),
        "local navigation denial",
      );
      assert.ok(remote.url().startsWith(fixtureUrl));
      result.checks.push(
        "Remote IPC inaccessible/denied; popup and privileged-origin navigation blocked",
      );
      const beforeRetry = fixtureRequests;
      await toolbar.locator("#browser-retry").click();
      await waitFor(
        () => fixtureRequests > beforeRetry,
        "native Retry reload request",
      );
      await remote.locator("#popup").waitFor();
      result.checks.push("Retry invokes native original-target navigation");
      await main
        .locator("#browser-workspace")
        .screenshot({ path: path.join(testFolder, "header.png") });
      await main.screenshot({ path: path.join(testFolder, "workspace.png") });
      await remote.screenshot({ path: path.join(testFolder, "remote.png") });
    }
    await toolbar
      .locator('.rail-link[data-view="home"]')
      .click({ noWaitAfter: true })
      .catch((error) => {
        if (!remote.isClosed()) throw error;
      });
    await waitFor(() => remote.isClosed(), "remote child cleanup");
    await main.locator("#home-view.active").waitFor();
    assert.equal(
      await main
        .locator("#hero-browse")
        .evaluate((element) => element === document.activeElement),
      true,
    );
  }
  result.checks.push(
    "Ten real native child open/Home/close cycles restore Home and keyboard focus",
  );
  const https = await open("https://example.com");
  try {
    await waitFor(
      async () =>
        (await https.remote.title()) === "Example Domain" &&
        (await https.remote.locator("body").innerText()).length > 100 &&
        navigationResponses.some(
          (response) =>
            response.url.startsWith("https://example.com") &&
            response.status === 200,
        ),
      "HTTPS response and rendered document",
    );
    result.https = {
      status: "PASS",
      url: https.remote.url(),
      title: await https.remote.title(),
      httpStatus: 200,
    };
    result.checks.push(
      "Ordinary HTTPS Example Domain document loads inside AURA",
    );
  } catch (error) {
    result.https = {
      status: "BLOCKED_OR_FAILED",
      error: String(error),
      title: await https.remote.title(),
      body: (await https.remote.locator("body").innerText()).slice(0, 1200),
      requests: requestFailures,
      nativeStatus: await main.evaluate(() =>
        window.__TAURI_INTERNALS__.invoke("browser_status"),
      ),
    };
  }
  await https.toolbar
    .locator('.rail-link[data-view="home"]')
    .click({ noWaitAfter: true })
    .catch((error) => {
      if (!https.remote.isClosed()) throw error;
    });
  await waitFor(() => https.remote.isClosed(), "HTTPS service cleanup");
  for (const destination of ["apps", "library", "settings", "home"]) {
    const { remote } = await open();
    await main.locator(`.rail [data-view="${destination}"]`).first().click();
    await waitFor(() => remote.isClosed(), "sidebar closes remote child");
    await main.locator(`#${destination}-view.active`).waitFor();
    await pause(150);
    assert.ok(
      await main.locator(`#${destination}-view`).isVisible(),
      "Late Home event must not overwrite chosen destination",
    );
  }
  result.checks.push(
    "All four persistent sidebar destinations close the site and navigate to the chosen AURA view",
  );
  const fullscreen = await open();
  const mainSize = await main.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const siteSize = await fullscreen.remote.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  assert.ok(
    Math.abs(mainSize.width - 90 - siteSize.width) <= 2,
    "Remote width must reserve the sidebar",
  );
  assert.ok(
    Math.abs(mainSize.height - 56 - siteSize.height) <= 2,
    "Remote height must reserve the local header",
  );
  await fullscreen.remote.locator("#fullscreen").click();
  await waitFor(
    () => fullscreen.remote.evaluate(() => Boolean(document.fullscreenElement)),
    "site fullscreen",
  );
  const fullscreenSize = await fullscreen.remote.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  assert.ok(fullscreenSize.width <= mainSize.width - 88);
  assert.ok(fullscreenSize.height <= mainSize.height - 54);
  assert.ok(
    await main.getByRole("button", { name: "Home", exact: true }).isVisible(),
  );
  await fullscreen.remote.evaluate(() => document.exitFullscreen());
  await main.locator('.rail-link[data-view="home"]').click();
  await waitFor(() => fullscreen.remote.isClosed(), "fullscreen site Home");
  result.checks.push(
    "Native child bounds reserve the rail/header, including a real site fullscreen request",
  );
  await main.evaluate((target) => {
    const data = JSON.parse(localStorage.getItem("aura-shortcuts-v2"));
    data.shortcuts.push({
      id: "usage-fixture",
      title: "Usage fixture",
      target,
      kind: "website",
      category: "other",
      favorite: false,
      launchMode: "internal",
      allowHttp: true,
      color: "#123456",
      mark: "U",
    });
    localStorage.setItem("aura-shortcuts-v2", JSON.stringify(data));
  }, fixtureUrl);
  await main.reload();
  const launchUsage = async () => {
    await main.locator('.rail [data-view="apps"]').click();
    await main
      .locator("#all-apps .tile")
      .filter({ hasText: "Usage fixture" })
      .click();
    await main.locator("body.browsing").waitFor();
    const childPage = await waitFor(
      () => context.pages().find((page) => page.url().startsWith(fixtureUrl)),
      "tracked child",
    );
    await childPage.locator("h1").click();
    assert.equal(await childPage.evaluate(() => document.hasFocus()), true);
  };
  await launchUsage();
  const nativeUsageContext = await main.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("browser_status"),
  );
  assert.equal(nativeUsageContext.shortcutId, "usage-fixture");
  assert.ok(nativeUsageContext.sessionId > 0);
  assert.equal(
    await main.evaluate(() =>
      window.__TAURI_INTERNALS__.invoke("usage_foreground"),
    ),
    true,
    "AURA must be foreground to validate foreground timing",
  );
  await pause(6500);
  await main.locator('.rail [data-view="settings"]').click();
  await main.locator("#usage-enabled").uncheck();
  const usageBefore = await main.evaluate(() =>
    JSON.parse(localStorage.getItem("aura-usage-v1")),
  );
  const timed = usageBefore.shortcuts.find((s) => s.id === "usage-fixture");
  assert.equal(timed.internalLaunches, 1);
  assert.ok(
    timed.internalMs >= 2000,
    "Actual remote-child foreground time must accrue",
  );
  await launchUsage();
  await pause(1500);
  await main.locator('.rail [data-view="settings"]').click();
  const pausedUsage = await main.evaluate(() =>
    JSON.parse(localStorage.getItem("aura-usage-v1")),
  );
  assert.deepEqual(
    pausedUsage,
    usageBefore,
    "Paused usage must not count launches or time",
  );
  await main.locator("#usage-clear").click();
  await main.locator("#usage-cancel").click();
  assert.ok(
    (await main.locator("#usage-rows").innerText()).includes("Usage fixture"),
  );
  await main.locator("#usage-clear").click();
  await main.locator("#usage-clear-confirm").click();
  assert.equal(await main.locator("#usage-rows tr").count(), 0);
  await main.locator("#usage-enabled").check();
  await launchUsage();
  await pause(3000);
  await main.locator('.rail [data-view="settings"]').click();
  await main.locator("#usage-enabled").uncheck();
  result.usage = await main.evaluate(() =>
    JSON.parse(localStorage.getItem("aura-usage-v1")),
  );
  assert.equal(result.usage.shortcuts[0].internalLaunches, 1);
  assert.ok(result.usage.shortcuts[0].internalMs > 0);
  result.checks.push(
    "Native usage tracks the identified remote child in foreground; pause, clear/cancel and per-shortcut counts work",
  );
  await main.locator("#usage-enabled").check();
  await pause(1200);
  await ownWindowVisibility(6);
  await waitFor(
    async () =>
      !(await main.evaluate(() =>
        window.__TAURI_INTERNALS__.invoke("usage_foreground"),
      )),
    "minimized AURA is not foreground",
  );
  // A checkpoint after minimization may still persist valid foreground time
  // earned before it. Compare settled checkpoints rather than stale storage.
  await pause(6000);
  const minimizedStart = await main.evaluate(() =>
    JSON.parse(localStorage.getItem("aura-usage-v1")),
  );
  await pause(6000);
  const minimizedEnd = await main.evaluate(() =>
    JSON.parse(localStorage.getItem("aura-usage-v1")),
  );
  assert.deepEqual(
    minimizedEnd,
    minimizedStart,
    "Minimized app and site time must stop",
  );
  await ownWindowVisibility(9);
  result.checks.push(
    "Actual native minimize/restore stops foreground duration without inspecting other applications",
  );
  await main.locator("#usage-enabled").uncheck();
  result.usage = await main.evaluate(() =>
    JSON.parse(localStorage.getItem("aura-usage-v1")),
  );
  await main.locator('[data-view="settings"]').first().click();
  await main.locator("#exit-app").click();
  await waitFor(
    () => child.exitCode !== null || main.isClosed(),
    "native Exit to Windows",
  );
  result.checks.push("Native Exit launcher closes application");
  await browser.close().catch(() => {});
  browser = undefined;
  await pause(1000);
  child = spawn(executable, [], {
    windowsHide: true,
    stdio: "pipe",
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: path.join(testFolder, "profile"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  child.stdout.on("data", (data) => (processOutput += data));
  child.stderr.on("data", (data) => (processOutput += data));
  child.on("error", (error) => (processOutput += error.message));
  await waitFor(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
    } catch {
      return false;
    }
  }, "restarted WebView2");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const restarted = await waitFor(
    () =>
      browser
        .contexts()[0]
        .pages()
        .find((page) => /tauri\.localhost/.test(page.url())),
    "restarted Home",
  );
  await restarted
    .locator("#favorites .tile")
    .filter({ hasText: "Native migration favorite" })
    .waitFor();
  const persisted = await restarted.evaluate(() => ({
    shortcut: JSON.parse(localStorage.getItem("aura-shortcuts-v2"))
      .shortcuts[0],
    accent: document.documentElement.dataset.accent,
  }));
  assert.equal(persisted.shortcut.favorite, true);
  assert.equal(persisted.shortcut.color, "#123456");
  assert.equal(persisted.shortcut.mark, "M");
  assert.equal(persisted.accent, "blue");
  for (const suffix of ["one", "two"]) {
    assert.ok(
      await restarted
        .locator(`.rail-favorite[data-shortcut-id="favorite-${suffix}"]`)
        .isVisible(),
    );
  }
  result.checks.push(
    "Sidebar favorite shortcuts and labels survive a full native process restart",
  );
  const persistedUsage = await restarted.evaluate(() =>
    JSON.parse(localStorage.getItem("aura-usage-v1")),
  );
  assert.deepEqual(persistedUsage, result.usage);
  await restarted.locator('.rail [data-view="settings"]').click();
  assert.equal(await restarted.locator("#usage-enabled").isChecked(), false);
  result.checks.push(
    "Usage totals and paused preference survive a complete native process restart",
  );
  result.checks.push(
    "Favorites, shortcut display values and accent survive a full native process restart",
  );
  await restarted.locator('[data-view="settings"]').first().click();
  await restarted.locator("#exit-app").click();
  await waitFor(
    () => child.exitCode !== null || restarted.isClosed(),
    "restarted application exit",
  );
  result.status =
    result.https.status === "PASS" ? "PASS" : "PARTIAL_HTTPS_UNVERIFIED";
  if (result.https.status !== "PASS") process.exitCode = 1;
} catch (error) {
  result.pages = browser
    ?.contexts()[0]
    ?.pages()
    .map((page) => page.url());
  result.status = "FAIL";
  result.error = String(error);
  result.processOutput = processOutput;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) child.kill();
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
  fs.writeFileSync(
    path.join(testFolder, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      { ...result, resultPath: path.join(testFolder, "result.json") },
      null,
      2,
    ),
  );
}
