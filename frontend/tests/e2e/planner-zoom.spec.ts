import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

test.use({ hasTouch: true, timezoneId: "Asia/Manila" });
const frame = (page: Page) =>
  page.getByRole("region", { name: "Planner canvas", exact: true });
const paper = (page: Page) => page.locator(".canvas-inner .schedule-paper");
const zoom = (page: Page) =>
  page.getByRole("combobox", { name: "Planner zoom", exact: true });
const pan = (page: Page) =>
  page.getByRole("button", { name: "Pan canvas", exact: true });
async function ready(page: Page) {
  await page.goto("/");
  await expect(paper(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function fits(page: Page) {
  await expect
    .poll(async () => {
      const p = (await paper(page).boundingBox())!,
        f = (await frame(page).boundingBox())!;
      return (
        p.x >= f.x - 1 &&
        p.y >= f.y - 1 &&
        p.x + p.width <= f.x + f.width + 1 &&
        p.y + p.height <= f.y + f.height + 1
      );
    })
    .toBe(true);
}
async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}
async function centre(page: Page, element: Locator) {
  const f = (await frame(page).boundingBox())!,
    box = (await element.boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.wheel(
    box.x + box.width / 2 - f.x - f.width / 2,
    box.y + box.height / 2 - f.y - f.height / 2,
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(element).toBeInViewport();
}
async function stylePosition(element: Locator) {
  return element.evaluate((node: HTMLElement) => ({
    x: parseFloat(node.style.left),
    y: parseFloat(node.style.top),
  }));
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
]) {
  test(`${viewport.name} defaults to Fit, zooms without page scrolling and pans without changing dates or activities`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    await fits(page);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("mochi-offline-ready")),
    );
    const toast = page.locator(".toast");
    await expect(toast).toBeVisible();
    const notification = (await toast.boundingBox())!,
      controls = (await page
        .getByRole("group", { name: "Planner zoom and pan", exact: true })
        .boundingBox())!;
    expect(notification.y + notification.height).toBeLessThan(controls.y);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.screenshot({
      path: `.sites-runtime/planner-fit-${viewport.name}.png`,
      style: ".toast { visibility: hidden !important; }",
    });
    await expect(zoom(page)).toHaveValue("1");
    await expect(pan(page)).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Zoom out", exact: true }),
    ).toBeDisabled();
    const fitScale = Number(await frame(page).getAttribute("data-scale"));
    const original = await paper(page)
      .locator(".schedule-block")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("style")));
    const dates = await paper(page)
      .locator(".day-column")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-date")),
      );
    await zoom(page).selectOption("2");
    await expect
      .poll(async () => Number(await frame(page).getAttribute("data-scale")))
      .toBeCloseTo(fitScale * 2, 3);
    await pan(page).click();
    const f = (await frame(page).boundingBox())!;
    await drag(page, f.x + f.width / 2, f.y + f.height / 2, -55, -65);
    await expect
      .poll(async () => Number(await frame(page).getAttribute("data-pan-y")))
      .toBeLessThan(0);
    expect(
      await paper(page)
        .locator(".schedule-block")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("style")),
        ),
    ).toEqual(original);
    expect(
      await paper(page)
        .locator(".day-column")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-date")),
        ),
    ).toEqual(dates);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await frame(page).focus();
    await frame(page).press("ArrowUp");
    await pan(page).click();
    await frame(page).focus();
    const before = Number(await frame(page).getAttribute("data-pan-y"));
    await page.keyboard.down("Space");
    await drag(page, f.x + f.width / 2, f.y + f.height / 2, 0, -35);
    await page.keyboard.up("Space");
    await expect(frame(page)).not.toHaveClass(/pan-active/);
    await expect
      .poll(async () => Number(await frame(page).getAttribute("data-pan-y")))
      .toBeLessThan(before);
    await page.screenshot({
      path: `.sites-runtime/planner-zoom-${viewport.name}.png`,
      style: ".toast { visibility: hidden !important; }",
    });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await zoom(page).selectOption("4");
    await expect(
      page.getByRole("button", { name: "Zoom in", exact: true }),
    ).toBeDisabled();
    await zoom(page).selectOption("1");
    await fits(page);
    await expect(pan(page)).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(zoom(page)).toHaveValue("1.25");
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expect(zoom(page)).toHaveValue("1");
    for (const view of ["Month", "List", "Week", "Day"]) {
      await zoom(page).selectOption("2");
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect(zoom(page)).toHaveValue("1");
      await fits(page);
    }
  });
}

test("one-finger Pan moves a zoomed phone canvas without swiping to another day", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const dates = await paper(page)
    .locator(".day-column")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-date")),
    );
  await zoom(page).selectOption("4");
  await pan(page).tap();
  const f = (await frame(page).boundingBox())!,
    x = Math.round(f.x + f.width / 2),
    y = Math.round(f.y + f.height / 2);
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= 8; step++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - step * 12, y: y - step * 8 }],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => Number(await frame(page).getAttribute("data-pan-x")))
    .toBeLessThan(-80);
  expect(
    await paper(page)
      .locator(".day-column")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-date")),
      ),
  ).toEqual(dates);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await session.detach();
});

test("zoomed text and stickers drag by the correct distance and Pan leaves their positions untouched", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your words", exact: true })
    .fill("Little plans, big dreams");
  await page.getByRole("button", { name: "Stickers", exact: true }).click();
  await page
    .getByRole("button", { name: "Add strawberry sticker", exact: true })
    .click();
  await zoom(page).selectOption("2");
  for (const element of [
    paper(page).locator(".canvas-text"),
    paper(page).locator(".canvas-sticker").first(),
  ]) {
    await centre(page, element);
    const before = await stylePosition(element);
    await pan(page).click();
    let box = (await element.boundingBox())!;
    await drag(page, box.x + box.width / 2, box.y + box.height / 2, -35, -25);
    expect(await stylePosition(element)).toEqual(before);
    await pan(page).click();
    await centre(page, element);
    box = (await element.boundingBox())!;
    const p = (await paper(page).boundingBox())!;
    await drag(page, box.x + box.width / 2, box.y + box.height / 2, 45, 32);
    await expect
      .poll(async () => (await stylePosition(element)).x)
      .toBeCloseTo(before.x + (45 / p.width) * 100, 1);
    await expect
      .poll(async () => (await stylePosition(element)).y)
      .toBeCloseTo(before.y + (32 / p.height) * 100, 1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => stylePosition(element)).toEqual(before);
  }
});

test("activity drag and resize use the zoomed scale", async ({ page }) => {
  await ready(page);
  await zoom(page).selectOption("2");
  const block = paper(page)
    .locator(".day-column")
    .first()
    .locator(".schedule-block")
    .filter({ hasText: "Design principles" });
  await centre(page, block);
  const box = (await block.boundingBox())!,
    columns = paper(page).locator(".day-column");
  const first = (await columns.first().boundingBox())!,
    next = (await columns.nth(1).boundingBox())!;
  const hour = Number(await paper(page).getAttribute("data-hour-height")),
    scale = Number(await frame(page).getAttribute("data-scale"));
  await drag(page, box.x + 12, box.y + 12, next.x - first.x, hour * scale);
  const dialog = page.getByRole("dialog");
  await expect(page.locator(".modal-backdrop")).toHaveCSS("opacity", "1");
  await dialog.getByRole("radio", { name: "This date", exact: true }).check();
  await dialog
    .getByRole("button", { name: "Apply change", exact: true })
    .click();
  const moved = columns
    .nth(1)
    .locator(".schedule-block")
    .filter({ hasText: "Design principles" });
  await expect(moved).toContainText("10 am");
  await centre(page, moved);
  const handle = (await moved.getByRole("slider").boundingBox())!;
  await drag(
    page,
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
    0,
    (hour * scale) / 2,
  );
  await expect(moved).toContainText("12 pm");
});

test("zoom and pan do not change exported image pixels", async ({ page }) => {
  await ready(page);
  async function downloadImage() {
    await page
      .getByRole("button", { name: "Export planner", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const button = dialog.getByRole("button", {
      name: "Download PNG",
      exact: true,
    });
    await expect(button).toBeEnabled({ timeout: 25000 });
    const pending = page.waitForEvent("download");
    await button.click();
    const pixels = await sharp(await readFile((await (await pending).path())!))
      .raw()
      .toBuffer();
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    return pixels;
  }
  const before = await downloadImage();
  await zoom(page).selectOption("3");
  await frame(page).focus();
  await frame(page).press("ArrowRight");
  expect((await downloadImage()).equals(before)).toBe(true);
});
