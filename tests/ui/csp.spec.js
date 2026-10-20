import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

let server;
let origin;
const config = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = path.join(
      process.cwd(),
      "dist",
      pathname === "/" ? "index.html" : pathname,
    );
    if (!file.startsWith(path.join(process.cwd(), "dist") + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const type = file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".css")
        ? "text/css"
        : "text/html";
    response.writeHead(200, {
      "Content-Type": type,
      "Content-Security-Policy": config.app.security.csp,
    });
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("production assets load under CSP while remote connections and scripts are blocked", async ({
  page,
}) => {
  await page.goto(origin);
  await expect(page.locator("#favorites .tile")).toHaveCount(5);
  const blocked = await page.evaluate(async () => {
    try {
      await fetch("https://example.com/csp-test");
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  await expect(
    page.addScriptTag({ url: "https://example.com/blocked.js" }),
  ).rejects.toThrow();
  await page.goto(`${origin}/browser.html`);
  await expect(
    page.getByRole("button", { name: "⌂ Return to AURA Home", exact: true }),
  ).toBeVisible();
});
