import { test, expect } from "@playwright/test";

test("unknown sites preserve a readable monogram, including failed custom images", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "aura-shortcuts-v2",
      JSON.stringify({
        version: 2,
        shortcuts: [
          {
            id: "pale",
            title: "YouTube lookalike",
            target: "https://youtube.com.example.com",
            favorite: true,
            color: "#ffffff",
            mark: "YT",
            icon: "data:image/png;base64,aGVsbG8=",
          },
        ],
      }),
    ),
  );
  await page.goto("/");
  for (const selector of ["#favorites .app-icon", ".rail-favorite .app-icon"]) {
    const icon = page.locator(selector).first();
    await expect(icon).toHaveText("YT");
    await expect(icon).toHaveClass(/monogram/);
    await expect(icon).toHaveCSS("color", "rgb(16, 26, 40)");
    await expect(icon.locator("img")).toHaveCount(0);
  }
});

test("card controls stay inside cards, do not launch, and restore keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator("#favorites .app-card").first();
  const options = card.getByLabel("Options for YouTube", { exact: true });
  await options.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    card.getByRole("button", { name: "Remove from favorites" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(options).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card.locator("details")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(options).toBeFocused();
  await options.click();
  await card
    .getByRole("button", { name: "Launch options for YouTube", exact: true })
    .click();
  await expect(page.getByLabel("Open this shortcut")).toBeFocused();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(options).toBeFocused();
  await card.getByRole("button", { name: "Remove from favorites" }).click();
  await expect(page.locator("#favorites .app-card")).toHaveCount(4);
  await expect(page.locator("#launch-feedback")).toBeHidden();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("aura-shortcuts-v2")),
  );
  expect(saved.shortcuts.find((a) => a.id === "youtube").favorite).toBe(false);
});

test("logos load locally offline and custom raster uploads survive reload across surfaces", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await context.setOffline(true);
  const home = page.locator("#favorites .app-card").first();
  await expect
    .poll(() =>
      home
        .locator(".app-icon img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  const source = await home.locator("img").getAttribute("src");
  expect(
    await page
      .locator(".rail-favorite")
      .first()
      .locator("img")
      .getAttribute("src"),
  ).toBe(source);
  await home.getByLabel("Options for YouTube", { exact: true }).click();
  await home.getByRole("button", { name: "Edit YouTube", exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    c.getContext("2d").fillRect(0, 0, 256, 256);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Custom icon", { exact: true }).setInputFiles({
    name: "icon.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator("#icon-status")).toHaveText("Custom icon ready");
  await page
    .getByRole("button", { name: "Save shortcut", exact: true })
    .click();
  const custom = await home.locator("img").getAttribute("src");
  expect(custom).toMatch(/^data:image\/png;base64,/);
  expect(
    await home.locator("img").evaluate(
      (img) =>
        new Promise((resolve) => {
          const check = () => resolve(img.naturalWidth);
          if (img.complete) check();
          else img.onload = check;
        }),
    ),
  ).toBe(96);
  await context.setOffline(false);
  await page.reload();
  expect(await home.locator("img").getAttribute("src")).toBe(custom);
  expect(
    await page
      .locator(".rail-favorite")
      .first()
      .locator("img")
      .getAttribute("src"),
  ).toBe(custom);
  await home.getByLabel("Options for YouTube", { exact: true }).click();
  await home.getByRole("button", { name: "Edit YouTube", exact: true }).click();
  await page.getByLabel("Custom icon", { exact: true }).setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.locator("#icon-status")).toContainText("PNG, JPEG or WebP");
  await page
    .getByRole("button", { name: "Use automatic icon", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save shortcut", exact: true })
    .click();
  expect(await home.locator("img").getAttribute("src")).toBe(source);
});

for (const width of [1400, 620, 360])
  test(`card touch controls and open options fit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const card = page.locator("#favorites .app-card").first();
    const bounds = await card.boundingBox();
    for (const control of await card
      .locator(".tile-controls button, summary")
      .all()) {
      if (!(await control.isVisible())) continue;
      const b = await control.boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(bounds.x);
      expect(b.x + b.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    await card.getByLabel("Options for YouTube", { exact: true }).click();
    const panel = await card.locator(".card-menu-panel").boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/cards-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("heading", { name: "Home", exact: true }).click();
    await expect(card.locator("details")).not.toHaveAttribute("open");
  });
