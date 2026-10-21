import test from "node:test";
import assert from "node:assert/strict";
import { providerIcon, savedIcon } from "../src/services/app-icons.js";
import { normalizeShortcut } from "../src/services/shortcuts.js";
import fs from "node:fs";

test("provider logos match URL hosts, never names, paths or spoofed suffixes", () => {
  for (const target of [
    "https://www.youtube.com/watch",
    "https://music.youtube.com/",
  ])
    assert.equal(providerIcon({ target }), "youtube");
  for (const target of [
    "https://youtube.com.evil.test",
    "https://example.com/youtube.com",
    "https://youtube.com@evil.test",
    "file:///youtube.com",
    "C:\\Apps\\YouTube.exe",
  ])
    assert.equal(
      providerIcon({ title: "YouTube", id: "youtube", target }),
      null,
    );
  assert.equal(
    providerIcon({ id: "jellyfin", target: "http://localhost:8096" }),
    "jellyfin",
  );
  assert.equal(
    providerIcon({ id: "jellyfin", target: "http://example.com:8096" }),
    null,
  );
});

test("icon persistence accepts bounded raster PNG data only", () => {
  for (const value of [
    "https://example.com/logo.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,<>foo",
    "data:image/png;base64," + "A".repeat(60000),
  ])
    assert.equal(savedIcon(value), null);
  const png = "data:image/png;base64,aGVsbG8=";
  const app = {
    id: "test",
    title: "Test",
    target: "https://example.com",
    favorite: true,
    icon: png,
  };
  assert.equal(normalizeShortcut(app).icon, png);
  assert.equal(
    normalizeShortcut({ ...app, icon: "https://example.com" }).icon,
    undefined,
  );
  assert.equal(normalizeShortcut(app).favorite, true);
});

test("bundled provider icons contain static vectors without scripts or external resources", () => {
  for (const name of [
    "youtube",
    "netflix",
    "plex",
    "spotify",
    "primevideo",
    "jellyfin",
  ]) {
    const svg = fs.readFileSync(
      new URL(`../src/assets/providers/${name}.svg`, import.meta.url),
      "utf8",
    );
    assert.match(svg, /<svg\s/);
    assert.match(svg, /<path\s/);
    assert.doesNotMatch(
      svg,
      /<(?:script|image|foreignObject|use|iframe)\b|\son\w+=|href\s*=/i,
    );
  }
});
