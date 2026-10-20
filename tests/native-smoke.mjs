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
    '<!doctype html><html><title>Remote isolation fixture</title><body><h1>Remote isolation fixture</h1><button id="popup" onclick="window.open(\'/popup\')">Popup</button><button id="local" onclick="location.href=\'http://tauri.localhost/index.html\'">Local navigation</button></body></html>',
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
    const toolbar = await waitFor(
      () =>
        context.pages().find((page) => page.url().includes("/browser.html")),
      "owned local toolbar",
    );
    await toolbar.locator("#browser-home").waitFor();
    if (target === fixtureUrl) await remote.locator("h1").waitFor();
    return { remote, toolbar };
  };
  for (let cycle = 0; cycle < 10; cycle++) {
    await main.locator('[data-view="apps"]').first().click();
    const { remote, toolbar } = await open();
    if (cycle === 0) {
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
          ["plugin:window|close", { label: "main" }],
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
      await toolbar.screenshot({ path: path.join(testFolder, "toolbar.png") });
    }
    await toolbar
      .locator("#browser-home")
      .click({ noWaitAfter: true })
      .catch((error) => {
        if (!toolbar.isClosed()) throw error;
      });
    await waitFor(
      () => remote.isClosed() && toolbar.isClosed(),
      "service/toolbar cleanup",
    );
    await main.locator("#home-view.active").waitFor();
    assert.equal(
      await main
        .locator("#hero-browse")
        .evaluate((element) => element === document.activeElement),
      true,
    );
  }
  result.checks.push(
    "Ten real native open/Home/close cycles restore Home and keyboard focus",
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
    .locator("#browser-home")
    .click({ noWaitAfter: true })
    .catch((error) => {
      if (!https.toolbar.isClosed()) throw error;
    });
  await waitFor(
    () => https.remote.isClosed() && https.toolbar.isClosed(),
    "HTTPS service cleanup",
  );
  for (const label of ["service", "browser-controls"]) {
    const windows = await open();
    await main.evaluate(
      (label) =>
        window.__TAURI_INTERNALS__.invoke("plugin:window|close", { label }),
      label,
    );
    await waitFor(
      () => windows.remote.isClosed() && windows.toolbar.isClosed(),
      "native close request cleanup",
    );
    await main.locator("#home-view.active").waitFor();
  }
  result.checks.push(
    "Native close requests for service and toolbar both restore Home",
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
