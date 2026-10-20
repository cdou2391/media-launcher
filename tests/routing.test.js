import test from "node:test";
import assert from "node:assert/strict";
import { launchRoute, routeLabel } from "../src/services/launch-router.js";

const website = (target, launchMode = "auto", allowHttp = false) => ({
  target,
  launchMode,
  allowHttp,
  kind: "website",
});

test("Auto uses external for known restricted providers and their true subdomains", () => {
  for (const target of [
    "https://netflix.com",
    "https://www.netflix.com",
    "https://NETFLIX.COM.",
    "https://disneyplus.com",
    "https://primevideo.com",
    "https://www.amazon.co.uk/video",
    "https://open.spotify.com",
  ]) {
    assert.equal(launchRoute(website(target)).mode, "external", target);
    assert.match(launchRoute(website(target)).reason, /unverified/);
  }
});

test("host matching cannot mistake a URL path or suffix for a provider", () => {
  for (const target of [
    "https://example.com/netflix.com",
    "https://netflix.com.evil.test",
    "https://notnetflix.com",
  ])
    assert.equal(launchRoute(website(target)).mode, "internal");
});

test("explicit modes and external local apps are respected", () => {
  assert.equal(
    launchRoute(website("https://example.com", "external")).mode,
    "external",
  );
  assert.equal(
    launchRoute(website("https://netflix.com", "internal")).mode,
    "internal",
  );
  assert.equal(
    launchRoute({
      target: "C:\\Apps\\app.exe",
      kind: "windowsApp",
      launchMode: "internal",
    }).mode,
    "external",
  );
  assert.match(routeLabel(website("https://example.com")), /Inside AURA/);
});

test("HTTP consent, schemas, kind and scheme are checked before routing", () => {
  assert.throws(() => launchRoute(website("http://localhost:8096")));
  assert.equal(
    launchRoute(website("http://localhost:8096", "internal", true)).mode,
    "internal",
  );
  assert.throws(() => launchRoute(website("javascript:alert(1)", "internal")));
  assert.throws(() => launchRoute(website("https://example.com", "unknown")));
  assert.throws(() =>
    launchRoute({ ...website("https://example.com"), kind: "windowsApp" }),
  );
});
