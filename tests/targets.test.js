import test from "node:test";
import assert from "node:assert/strict";
import { targetKind, websiteUrl } from "../src/services/targets.js";

test("web targets require HTTP consent and cannot carry credentials", () => {
  assert.equal(websiteUrl("https://example.com").hostname, "example.com");
  assert.equal(websiteUrl("http://localhost:8096"), null);
  assert.equal(websiteUrl("http://localhost:8096", true).hostname, "localhost");
  for (const target of [
    "javascript:alert(1)",
    "https://u:p@example.com",
    "file:///C:/file",
    "https://ipc.localhost",
    "https://example.com\0",
    "https://\\evil.com",
  ])
    assert.equal(websiteUrl(target, true), null, target);
});

test("local targets reject relative paths, device namespaces and data streams", () => {
  assert.equal(targetKind("C:\\Program Files\\App\\app.exe"), "windowsApp");
  assert.equal(targetKind("\\\\server\\share\\movie.mkv"), "mediaFile");
  for (const target of [
    "cmd.exe",
    "C:app.exe",
    "C:\\..\\app.exe",
    "C:\\app.exe:evil.exe",
    "\\\\.\\pipe\\app.exe",
    "shell:AppsFolder",
  ])
    assert.equal(targetKind(target), null, target);
});
