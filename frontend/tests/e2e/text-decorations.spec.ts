import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const words = "Dream big ♡\nOne little step at a time";
async function addText(page: Page) {
  await page.goto("/");
  await expect(page.locator(".canvas-inner .schedule-paper")).toBeVisible();
  const show = page.getByRole("button", {
    name: "Show design tools",
    exact: true,
  });
  if (await show.count()) await show.click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const panel = page.locator(".text-design-panel");
  await panel.getByRole("button", { name: "Add text", exact: true }).click();
  await panel
    .getByRole("textbox", { name: "Your words", exact: true })
    .fill(words);
  return panel;
}
async function backup(page: Page) {
  await page
    .getByRole("button", { name: "Profile settings", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download a full backup", exact: true })
    .click();
  return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
}
const text = (page: Page) => page.locator(".canvas-inner .canvas-text");

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
]) {
  test(`${viewport.name} offers one-tap text colors and validates custom hex colors`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const panel = await addText(page),
      layer = text(page);
    const palette = panel.getByRole("group", {
      name: "Text color",
      exact: true,
    });
    await expect(palette.getByRole("button")).toHaveCount(12);
    await expect(
      palette.getByRole("button", { name: "Rose text color", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const blue = palette.getByRole("button", {
      name: "Blue text color",
      exact: true,
    });
    await blue.click();
    await expect(layer).toHaveCSS("color", "rgb(80, 111, 186)");
    await expect(blue).toHaveAttribute("aria-pressed", "true");
    const target = (await blue.boundingBox())!;
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    const lavender = palette.getByRole("button", {
      name: "Lavender text color",
      exact: true,
    });
    await lavender.focus();
    await lavender.press("Enter");
    await expect(layer).toHaveCSS("color", "rgb(138, 98, 176)");
    await palette
      .getByRole("button", { name: "White text color", exact: true })
      .click();
    await expect(layer).toHaveCSS("color", "rgb(255, 255, 255)");
    const hex = palette.getByRole("textbox", {
      name: "Hex text color",
      exact: true,
    });
    await hex.fill("#52a38b");
    await expect(layer).toHaveCSS("color", "rgb(82, 163, 139)");
    await hex.fill("#zzzzzz");
    await hex.press("Tab");
    await expect(hex).toHaveAttribute("aria-invalid", "true");
    await expect(palette.getByRole("alert")).toContainText("Use a hex color");
    await expect(layer).toHaveCSS("color", "rgb(82, 163, 139)");
    await hex.fill("abc");
    await hex.press("Enter");
    await expect(hex).toHaveValue("#AABBCC");
    await expect(layer).toHaveCSS("color", "rgb(170, 187, 204)");
    await expect(palette.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(layer).toHaveCSS("color", "rgb(82, 163, 139)");
    await expect(hex).toHaveValue("#52A38B");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(layer).toHaveCSS("color", "rgb(170, 187, 204)");
    const saved = await backup(page);
    expect(
      saved.data.schedules.find(
        (schedule: any) => schedule.id === saved.data.activeId,
      ).design.textBoxes[0].color,
    ).toBe("#aabbcc");
    await page.reload();
    await expect(text(page)).toHaveCSS("color", "rgb(170, 187, 204)");
    await text(page).dblclick();
    await expect(
      page.getByRole("textbox", { name: "Hex text color", exact: true }),
    ).toHaveValue("#AABBCC");
    await page
      .getByRole("button", { name: "Berry text color", exact: true })
      .click();
    await expect(text(page)).toHaveCSS("color", "rgb(178, 68, 121)");
    await expect(
      palette.getByRole("button", { name: "Berry text color", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.sites-runtime/text-colors-${viewport.name}.png`,
    });
  });
}

test("text can be styled, positioned, duplicated, undone and saved with the planner", async ({
  page,
}) => {
  const panel = await addText(page),
    layer = text(page);
  await panel
    .getByRole("button", { name: "Use Nunito font", exact: true })
    .click();
  await expect(layer).toHaveCSS("font-family", /Nunito/);
  await panel
    .getByRole("button", { name: "Use Caveat font", exact: true })
    .click();
  await panel.getByRole("button", { name: "Bold text", exact: true }).click();
  await panel.getByRole("button", { name: "Italic text", exact: true }).click();
  const size = panel.getByRole("slider", { name: "Text size", exact: true });
  for (let i = 0; i < 4; i++) await size.press("ArrowRight");
  await expect(layer).toHaveCSS("font-size", "36px");
  await expect(layer).toHaveCSS("font-style", "italic");
  await expect(layer).toHaveCSS("font-weight", "600");
  await expect(layer).toHaveText(words);
  await layer.focus();
  await layer.press("ArrowRight");
  await expect(layer).toHaveAttribute("style", /left: 36%/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(layer).toHaveAttribute("style", /left: 35%/);
  const from = (await layer.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 70,
    from.y + from.height / 2 + 50,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(layer).not.toHaveAttribute("style", /left: 35%/);
  await panel
    .getByRole("button", { name: "Duplicate text", exact: true })
    .click();
  await expect(layer).toHaveCount(2);
  await panel.getByRole("button", { name: "Remove text", exact: true }).click();
  await expect(layer).toHaveCount(1);
  const saved = await backup(page),
    box = saved.data.schedules.find(
      (schedule: any) => schedule.id === saved.data.activeId,
    ).design.textBoxes[0];
  expect(box.text).toBe(words);
  expect(box.font).toBe("Caveat");
  expect(box.fontSize).toBe(36);
  expect(box.bold).toBe(true);
  await page.reload();
  await expect(text(page)).toHaveText(words);
  await text(page).focus();
  for (let i = 0; i < 5; i++) await text(page).press("Shift+ArrowLeft");
  for (let i = 0; i < 12; i++) await text(page).press("Shift+ArrowDown");
  await text(page).dblclick();
  await expect(page.locator(".text-design-panel")).toBeVisible();
  await page.screenshot({ path: ".sites-runtime/calendar-text-desktop.png" });
});

for (const device of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
]) {
  test(`${device.name} keeps text controls readable and supports touch positioning`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      hasTouch: true,
      timezoneId: "Asia/Manila",
    });
    const page = await context.newPage();
    try {
      const panel = await addText(page);
      expect(
        await panel
          .getByRole("textbox", { name: "Your words", exact: true })
          .evaluate((element) => getComputedStyle(element).fontSize),
      ).toBe("14px");
      expect(
        await panel.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Close design tools", exact: true })
        .click();
      const layer = text(page),
        before = await layer.getAttribute("style");
      const bounds = (await layer.boundingBox())!;
      const client = await context.newCDPSession(page);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        ],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: bounds.x + bounds.width / 2 + 24,
            y: bounds.y + bounds.height / 2 + 40,
          },
        ],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(layer).not.toHaveAttribute("style", before!);
      await layer.focus();
      for (let i = 0; i < 20; i++) await layer.press("Shift+ArrowDown");
      const edgeGap = await layer.evaluate(
        (element) =>
          element.parentElement!.getBoundingClientRect().bottom -
          element.getBoundingClientRect().bottom,
      );
      expect(Math.abs(edgeGap)).toBeLessThanOrEqual(2);
      await layer.dblclick();
      await expect(page.locator(".text-design-panel")).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Your words", exact: true }),
      ).toHaveValue(words);
      await page.screenshot({
        path: `.sites-runtime/calendar-text-${device.name}.png`,
      });
    } finally {
      await context.close();
    }
  });
}

test("handwritten words survive offline reloads and appear in clean exported images", async ({
  page,
  context,
}) => {
  await addText(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(text(page)).toHaveText(words);
  await context.setOffline(true);
  await page.reload();
  await expect(text(page)).toHaveText(words);
  await page
    .getByRole("button", { name: "Export planner", exact: true })
    .click();
  const dialog = page.getByRole("dialog"),
    download = dialog.getByRole("button", {
      name: "Download PNG",
      exact: true,
    });
  await expect(download).toBeEnabled({ timeout: 25000 });
  const exported = dialog.locator(".export-render .canvas-text");
  await expect(exported).toHaveText(words);
  await expect(exported).toHaveCSS("font-family", /Caveat/);
  await expect(exported).not.toHaveClass(/selected/);
  const pending = page.waitForEvent("download");
  await download.click();
  const file = await pending;
  await file.saveAs(".sites-runtime/calendar-text-export.png");
  const { data, info } = await sharp(await readFile((await file.path())!))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let ink = 0;
  for (let offset = 0; offset < data.length; offset += info.channels)
    if (
      Math.abs(data[offset] - 152) < 3 &&
      Math.abs(data[offset + 1] - 81) < 3 &&
      Math.abs(data[offset + 2] - 107) < 3
    )
      ink++;
  expect(ink).toBeGreaterThan(100);
});
