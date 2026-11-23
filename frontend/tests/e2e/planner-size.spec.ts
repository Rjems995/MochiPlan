import { test, expect, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";

test.use({ timezoneId: "Asia/Manila" });
async function settleDialog(dialog: Locator) {
  await dialog.evaluate(async (element) => {
    const root = element.closest(".modal-backdrop")!;
    await Promise.all(
      root
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}
async function openSize(page: Page) {
  await page.getByRole("button", { name: "Planner size", exact: true }).click();
  return page.getByRole("dialog", {
    name: "Choose your planner size",
    exact: true,
  });
}
async function dimensions(page: Page, width: number, height: number) {
  const dialog = await openSize(page);
  await dialog
    .getByRole("combobox", { name: "Planner size preset", exact: true })
    .selectOption("custom");
  await dialog
    .getByRole("spinbutton", { name: "Planner width", exact: true })
    .fill(String(width));
  await dialog
    .getByRole("spinbutton", { name: "Planner height", exact: true })
    .fill(String(height));
  await expect(
    dialog.getByRole("button", { name: "Use size", exact: true }),
  ).toBeEnabled();
  return dialog;
}
const paper = (page: Page) => page.locator(".canvas-inner .schedule-paper");
for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
]) {
  test(`${viewport.name} custom sizes fit the editor, save offline and download at the chosen dimensions`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");
    await expect(paper(page)).toBeVisible();
    const dialog = await dimensions(page, 1200, 1600);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await dialog.evaluate((element) => {
      element.scrollTop = 0;
    });
    await settleDialog(dialog);
    await page.screenshot({
      path: `.sites-runtime/planner-size-${viewport.name}.png`,
    });
    await dialog.getByRole("button", { name: "Use size", exact: true }).click();
    await expect(paper(page)).toHaveAttribute("data-canvas-width", "1200");
    await expect(paper(page)).toHaveAttribute("data-canvas-height", "1600");
    await expect(paper(page)).toHaveAttribute("data-size-overflow", "false");
    await expect
      .poll(async () =>
        paper(page).evaluate((element) => {
          const box = element.getBoundingClientRect();
          return Math.abs(box.width / box.height - 1200 / 1600);
        }),
      )
      .toBeLessThan(0.005);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(paper(page)).not.toHaveAttribute("data-canvas-width", "1200");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(paper(page)).toHaveAttribute("data-canvas-width", "1200");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(paper(page)).toHaveAttribute("data-canvas-height", "1600");
    await context.setOffline(true);
    await page.reload();
    await expect(paper(page)).toHaveAttribute("data-canvas-width", "1200");
    await page
      .getByRole("button", { name: "Export planner", exact: true })
      .click();
    const exportDialog = page.getByRole("dialog");
    await expect(
      exportDialog.getByRole("button", { name: "Download PNG", exact: true }),
    ).toBeEnabled({ timeout: 25000 });
    await expect(
      exportDialog.getByRole("combobox", { name: "Image size", exact: true }),
    ).toHaveValue("0");
    const pending = page.waitForEvent("download");
    await exportDialog
      .getByRole("button", { name: "Download PNG", exact: true })
      .click();
    const file = await pending;
    await file.saveAs(
      `.sites-runtime/planner-size-${viewport.name}-export.png`,
    );
    const metadata = await sharp(
      await readFile((await file.path())!),
    ).metadata();
    expect({ width: metadata.width, height: metadata.height }).toEqual({
      width: 1200,
      height: 1600,
    });
    if (viewport.name === "desktop") {
      for (const format of ["JPG", "PDF"]) {
        await exportDialog
          .getByRole("button", { name: format, exact: true })
          .click();
        const button = exportDialog.getByRole("button", {
          name: `Download ${format}`,
          exact: true,
        });
        await expect(button).toBeEnabled({ timeout: 25000 });
        const downloading = page.waitForEvent("download");
        await button.click();
        const content = await readFile((await (await downloading).path())!);
        if (format === "JPG") {
          const result = await sharp(content).metadata();
          expect({ width: result.width, height: result.height }).toEqual({
            width: 1200,
            height: 1600,
          });
        } else {
          const box = content
            .toString("latin1")
            .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)!;
          expect(Number(box[1])).toBeCloseTo(900, 2);
          expect(Number(box[2])).toBeCloseTo(1200, 2);
        }
      }
      await exportDialog
        .getByRole("button", { name: "PNG", exact: true })
        .click();
      await exportDialog
        .getByRole("combobox", { name: "Image size", exact: true })
        .selectOption({ label: "Mobile · 1080 px wide" });
      await expect
        .poll(() =>
          exportDialog
            .getByAltText("Exact preview of your exported planner")
            .evaluate((image: HTMLImageElement) => [
              image.naturalWidth,
              image.naturalHeight,
            ]),
        )
        .toEqual([1080, 1440]);
    }
  });
}

test("presets, orientation, validation, cancellation and Automatic preserve the saved planner", async ({
  page,
}) => {
  await page.goto("/");
  await expect(paper(page)).toBeVisible();
  let dialog = await openSize(page);
  await dialog
    .getByRole("combobox", { name: "Planner size preset", exact: true })
    .selectOption("desktop");
  await expect(
    dialog.getByRole("spinbutton", { name: "Planner width", exact: true }),
  ).toHaveValue("1920");
  await dialog
    .getByRole("button", { name: "Swap width and height", exact: true })
    .click();
  await expect(
    dialog.getByRole("spinbutton", { name: "Planner width", exact: true }),
  ).toHaveValue("1080");
  await dialog.getByRole("button", { name: "Use size", exact: true }).click();
  await expect(paper(page)).toHaveAttribute("data-canvas-height", "1920");
  dialog = await openSize(page);
  await dialog
    .getByRole("spinbutton", { name: "Planner width", exact: true })
    .fill("4097");
  await expect(
    dialog.getByRole("button", { name: "Use size", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText("whole numbers");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(paper(page)).toHaveAttribute("data-canvas-width", "1080");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  dialog = await openSize(page);
  await dialog
    .getByRole("spinbutton", { name: "Planner width", exact: true })
    .fill("4096");
  await dialog
    .getByRole("spinbutton", { name: "Planner height", exact: true })
    .fill("320");
  await expect(dialog.getByRole("alert")).toContainText("more height");
  await expect(
    dialog.getByRole("button", { name: "Use size", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("combobox", { name: "Planner size preset", exact: true })
    .selectOption("auto");
  await dialog.getByRole("button", { name: "Use size", exact: true }).click();
  await expect(paper(page)).not.toHaveAttribute("data-canvas-width", "1080");
});

test("all schedule views and activity dragging work inside a custom canvas", async ({
  page,
}) => {
  await page.goto("/");
  await expect(paper(page)).toBeVisible();
  const dialog = await dimensions(page, 1600, 1600);
  await dialog.getByRole("button", { name: "Use size", exact: true }).click();
  await expect(paper(page)).toHaveAttribute("data-size-overflow", "false");
  await expect
    .poll(() =>
      paper(page).evaluate((element) =>
        Math.abs(
          element.getBoundingClientRect().width /
            element.getBoundingClientRect().height -
            1,
        ),
      ),
    )
    .toBeLessThan(0.005);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const monday = paper(page).locator(".day-column").first();
  const block = monday.locator(".schedule-block").first();
  const before = (await block.boundingBox())!,
    column = (await monday.boundingBox())!,
    next = (await paper(page).locator(".day-column").nth(1).boundingBox())!;
  const hour = Number(await paper(page).getAttribute("data-hour-height"));
  const scale = Number(
    await paper(page)
      .locator("xpath=ancestor::div[contains(@class, 'fit-viewport')]")
      .getAttribute("data-scale"),
  );
  await test.step("Drag one hour later and one weekday across", async () => {
    await page.mouse.move(before.x + 12, before.y + 12);
    await page.mouse.down();
    await page.mouse.move(
      before.x + 12 + next.x - column.x,
      before.y + 12 + hour * scale,
      { steps: 12 },
    );
    await page.mouse.up();
  });
  const scope = page.getByRole("dialog");
  await test.step("Apply the dragged occurrence", async () => {
    await expect(scope).toBeVisible();
    await settleDialog(scope);
    await scope
      .getByRole("button", { name: "Apply change", exact: true })
      .click();
    await expect(scope).toHaveCount(0);
    await expect(
      paper(page)
        .locator(".day-column")
        .nth(1)
        .locator(".schedule-block")
        .filter({ hasText: "Design principles" }),
    ).toContainText("10 am");
  });
  for (const name of ["Day", "Month", "List", "Week"]) {
    await test.step(`Switch to ${name}`, async () => {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(paper(page)).toHaveAttribute("data-size-overflow", "false");
      await expect
        .poll(() =>
          paper(page).evaluate((element) =>
            Math.abs(
              element.getBoundingClientRect().width /
                element.getBoundingClientRect().height -
                1,
            ),
          ),
        )
        .toBeLessThan(0.005);
    });
  }
});

test("A4 presets download standard landscape and portrait PDF pages", async ({
  page,
}) => {
  await page.goto("/");
  await expect(paper(page)).toBeVisible();
  for (const orientation of ["landscape", "portrait"]) {
    const dialog = await openSize(page);
    await dialog
      .getByRole("combobox", { name: "Planner size preset", exact: true })
      .selectOption(`a4-${orientation}`);
    await dialog.getByRole("button", { name: "Use size", exact: true }).click();
    await page
      .getByRole("button", { name: "Export planner", exact: true })
      .click();
    const exportDialog = page.getByRole("dialog");
    await exportDialog
      .getByRole("button", { name: "PDF", exact: true })
      .click();
    const button = exportDialog.getByRole("button", {
      name: "Download PDF",
      exact: true,
    });
    await expect(button).toBeEnabled({ timeout: 25000 });
    const downloading = page.waitForEvent("download");
    await button.click();
    const content = await readFile((await (await downloading).path())!);
    const box = content
      .toString("latin1")
      .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)!;
    const expected =
      orientation === "landscape" ? [841.89, 595.28] : [595.28, 841.89];
    expect(Number(box[1])).toBeCloseTo(expected[0], 1);
    expect(Number(box[2])).toBeCloseTo(expected[1], 1);
    await exportDialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  }
});
