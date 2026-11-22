import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { workspace } from "../../../backend/tests/fixture.mjs";

test.use({ timezoneId: "Asia/Manila" });

async function designedPlanner(page: Page) {
  const data = workspace();
  data.schedules[0].design.background = "#e4f1ff";
  data.schedules[0].design.pattern = "none";
  data.schedules[0].design.border = "double";
  data.schedules[0].design.stickers = [
    { id: "flower", emoji: "🌸", x: 85, y: 2, size: 42, rotation: 10 },
  ];
  await page.goto("/");
  await page
    .getByRole("button", { name: "Profile settings", exact: true })
    .click();
  await page
    .locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles({
      name: "designed-planner.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 1, data })),
    });
  await page
    .getByRole("button", { name: "Restore my workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  const dismiss = page.getByRole("button", {
    name: "Dismiss notification",
    exact: true,
  });
  if (await dismiss.count()) await dismiss.click();
}
async function openExport(page: Page) {
  await page
    .getByRole("button", { name: "Export planner", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled({ timeout: 25000 });
  return dialog;
}

for (const device of [
  {
    name: "desktop",
    viewport: { width: 1440, height: 1000 },
    size: "0",
    outputWidth: 1920,
  },
  {
    name: "tablet",
    viewport: { width: 820, height: 1180 },
    size: "1",
    outputWidth: 1536,
  },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    size: "2",
    outputWidth: 1080,
  },
]) {
  test(`${device.name} downloads only the designed planner with no padding or border`, async ({
    page,
  }) => {
    await page.setViewportSize(device.viewport);
    await designedPlanner(page);
    const dialog = await openExport(page);
    await dialog
      .getByRole("combobox", { name: "Image size", exact: true })
      .selectOption(device.size);
    const image = dialog.getByAltText("Exact preview of your exported planner");
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBe(device.outputWidth);
    const geometry = await dialog
      .locator(".export-render .schedule-paper")
      .evaluate((paper: HTMLElement) => {
        const box = paper.getBoundingClientRect(),
          activity = paper.querySelector<HTMLElement>(".schedule-block")!,
          block = activity.getBoundingClientRect();
        return {
          width: paper.offsetWidth,
          height: paper.offsetHeight,
          border: getComputedStyle(paper).borderTopWidth,
          x: block.left - box.left + block.width / 2,
          y: block.top - box.top + block.height - 8,
        };
      });
    expect(geometry.width).toBe(1280);
    expect(geometry.border).toBe("0px");
    expect(
      await dialog.locator(".export-render .canvas-sticker svg").count(),
    ).toBe(1);
    expect(
      await dialog.locator(".export-render [data-export-ignore]").count(),
    ).toBe(0);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const pending = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Download PNG", exact: true })
      .click();
    const file = await pending;
    await file.saveAs(`.sites-runtime/export-${device.name}.png`);
    const buffer = await readFile((await file.path())!);
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(device.outputWidth);
    expect(
      Math.abs(info.height - (info.width * geometry.height) / geometry.width),
    ).toBeLessThanOrEqual(1);
    const at = (x: number, y: number) =>
      Array.from(
        data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
      );
    expect(at(0, 0)).toEqual([228, 241, 255, 255]);
    const pixel = at(
      Math.round((geometry.x * info.width) / geometry.width),
      Math.round((geometry.y * info.height) / geometry.height),
    );
    for (const [index, expected] of [246, 217, 225].entries())
      expect(Math.abs(pixel[index] - expected)).toBeLessThanOrEqual(3);
    await page.screenshot({
      path: `.sites-runtime/export-preview-${device.name}.png`,
    });
  });
}

test("day, month and list exports keep all content and use automatic heights", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await designedPlanner(page);
  for (const view of ["Day", "Month", "List"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    const dialog = await openExport(page);
    const paper = dialog.locator(".export-render .schedule-paper");
    const dimensions = await paper.evaluate((element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      const content = Array.from(
        element.querySelectorAll<HTMLElement>(
          ".timetable, .month-grid, .schedule-list, .paper-footer, .schedule-block",
        ),
      );
      return {
        width: element.offsetWidth,
        height: element.offsetHeight,
        clippedContent: content.some((item) => {
          const box = item.getBoundingClientRect();
          return (
            box.bottom > bounds.bottom + 1 ||
            box.right > bounds.right + 1 ||
            box.left < bounds.left - 1
          );
        }),
      };
    });
    expect(dimensions.clippedContent).toBe(false);
    if (view === "Month")
      expect(await paper.locator(".month-cell").count()).toBeGreaterThanOrEqual(
        28,
      );
    if (view === "List")
      await expect(paper.locator(".list-activity")).toHaveCount(1);
    const actual = await dialog
      .getByAltText("Exact preview of your exported planner")
      .evaluate((image: HTMLImageElement) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      }));
    expect(
      Math.abs(
        actual.height - (actual.width * dimensions.height) / dimensions.width,
      ),
    ).toBeLessThanOrEqual(1);
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  }
});

test("custom resolution preserves proportions and PDF uses the same cropped page", async ({
  page,
}) => {
  await designedPlanner(page);
  const dialog = await openExport(page);
  await dialog
    .getByRole("combobox", { name: "Image size", exact: true })
    .selectOption("4");
  await dialog
    .getByRole("spinbutton", { name: "Export width", exact: true })
    .fill("1600");
  const preview = dialog.getByAltText("Exact preview of your exported planner");
  await expect
    .poll(() =>
      preview.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(1600);
  const dimensions = await preview.evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  await dialog.getByRole("button", { name: "PDF", exact: true }).click();
  const download = dialog.getByRole("button", {
    name: "Download PDF",
    exact: true,
  });
  await expect(download).toBeEnabled({ timeout: 25000 });
  const pending = page.waitForEvent("download");
  await download.click();
  const file = await pending;
  const pdf = (await readFile((await file.path())!)).toString("latin1");
  const media = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  expect(media).not.toBeNull();
  expect(Number(media![1]) / Number(media![2])).toBeCloseTo(
    dimensions.width / dimensions.height,
    3,
  );
});
