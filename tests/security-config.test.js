import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const json = (path) =>
  JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));

test("remote windows have no capabilities and trusted controls cannot launch arbitrary targets", () => {
  const main = json("../src-tauri/capabilities/default.json");
  const controls = json("../src-tauri/capabilities/browser-controls.json");
  assert.deepEqual(main.windows, ["main"]);
  assert.deepEqual(controls.windows, ["browser-controls"]);
  for (const capability of [main, controls]) {
    assert.equal(capability.remote, undefined);
    assert.ok(!capability.permissions.includes("core:default"));
    assert.ok(
      !capability.permissions.some((permission) =>
        /allow-create|shell:|fs:/.test(permission),
      ),
    );
  }
  assert.ok(!controls.permissions.includes("allow-open-target"));
  assert.ok(!controls.permissions.includes("allow-launch-shortcut"));
});

test("local CSP forbids frames, remote scripts and native global injection", () => {
  const config = json("../src-tauri/tauri.conf.json");
  assert.equal(config.app.withGlobalTauri, false);
  assert.match(config.app.security.csp, /script-src 'self';/);
  assert.match(config.app.security.csp, /frame-src 'none'/);
  assert.match(config.app.security.csp, /object-src 'none'/);
  assert.ok(!config.app.security.csp.includes("unsafe-eval"));
  assert.ok(!config.app.security.csp.includes("https:"));
});
