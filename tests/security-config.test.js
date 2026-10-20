import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const json = (path) =>
  JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));

test("only the trusted webview has capabilities even when a site shares its native window", () => {
  const main = json("../src-tauri/capabilities/default.json");
  assert.deepEqual(main.webviews, ["main"]);
  assert.equal(main.windows, undefined);
  assert.equal(main.remote, undefined);
  assert.ok(!main.permissions.includes("core:default"));
  assert.ok(
    !main.permissions.some((permission) =>
      /allow-create|shell:|fs:/.test(permission),
    ),
  );
  assert.equal(
    fs.existsSync(
      new URL(
        "../src-tauri/capabilities/browser-controls.json",
        import.meta.url,
      ),
    ),
    false,
  );
});

test("local CSP forbids frames, remote scripts and native global injection", () => {
  const config = json("../src-tauri/tauri.conf.json");
  assert.equal(config.app.withGlobalTauri, false);
  assert.match(config.app.security.csp, /script-src 'self';/);
  assert.match(config.app.security.csp, /frame-src 'none'/);
  assert.match(config.app.security.csp, /frame-ancestors 'none'/);
  assert.match(config.app.security.csp, /object-src 'none'/);
  assert.ok(!config.app.security.csp.includes("unsafe-eval"));
  assert.ok(!config.app.security.csp.includes("https:"));
});
