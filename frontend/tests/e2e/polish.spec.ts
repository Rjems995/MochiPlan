import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { themes } from "../../src/model";

async function expectContrast(page: Page, selectors: string[]) {
  await expect
    .poll(() =>
      page.evaluate((selectors) => {
        const rgba = (value: string) => {
          const numbers = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
          return [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1];
        };
        const blend = (a: number[], b: number[]) =>
          a
            .slice(0, 3)
            .map((n, i) => n * a[3] + b[i] * (1 - a[3]))
            .concat(1);
        const luminance = (color: number[]) => {
          const values = color
            .slice(0, 3)
            .map((v) => v / 255)
            .map((v) =>
              v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
            );
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        };
        return selectors.flatMap((selector) =>
          Array.from(document.querySelectorAll<HTMLElement>(selector))
            .filter((element) => element.offsetWidth && element.offsetHeight)
            .flatMap((element) => {
              const ancestors: HTMLElement[] = [];
              for (
                let node: HTMLElement | null = element;
                node;
                node = node.parentElement
              )
                ancestors.unshift(node);
              let background = [255, 255, 255, 1],
                opacity = 1;
              for (const node of ancestors) {
                const style = getComputedStyle(node);
                background = blend(rgba(style.backgroundColor), background);
                opacity *= Number(style.opacity);
              }
              const foreground = rgba(getComputedStyle(element).color);
              foreground[3] *= opacity;
              const a = luminance(blend(foreground, background)),
                b = luminance(background);
              const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
              return ratio >= 4.5
                ? []
                : [
                    {
                      selector,
                      text: element.textContent?.trim().slice(0, 35),
                      ratio: Number(ratio.toFixed(2)),
                    },
                  ];
            }),
        );
      }, selectors),
    )
    .toEqual([]);
}

const paperText = [
  ".canvas-inner .paper-heading p",
  ".canvas-inner .hours > span",
  ".canvas-inner .day-heading > small",
  ".canvas-inner .block-title",
  ".canvas-inner .block-time",
  ".canvas-inner .block-location",
  ".canvas-inner .paper-footer > span",
  ".canvas-inner .paper-brand",
];
const interfaceText = [
  ".planner-select select",
  ".design-panel-top h3",
  ".breadcrumb strong",
  ".connection-status",
  ".canvas-status",
  ".design-tabs > button",
  ".theme-choice strong",
  ".design-panel .field-label",
  ".pattern-choices small",
  ".background-row > span",
  ".planner-type",
  ".view-controls > button",
  ".today-button",
];

test("small text remains legible across all planner palettes and app dark mode", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".canvas-inner .schedule-paper")).toBeVisible();
  await page
    .getByRole("button", { name: "Explore all 8 themes", exact: true })
    .click();
  for (const theme of themes) {
    await page
      .locator(".theme-choice")
      .filter({ hasText: theme.name })
      .locator("button")
      .first()
      .click();
    await expectContrast(page, [...paperText, ...interfaceText]);
  }
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expectContrast(page, [
    ".canvas-inner .month-cell > button",
    ".canvas-inner .month-cell > button > small",
    ".canvas-inner .other-month > span",
  ]);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expectContrast(page, [
    ".canvas-inner .list-activity",
    ".canvas-inner .list-activity small",
    ".canvas-inner .schedule-list h3 > small",
  ]);
  await page.getByRole("button", { name: "Back to my schedules" }).click();
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await expectContrast(page, [
    ".schedule-card-info p",
    ".schedule-card-info small",
  ]);
  await page.locator(".schedule-card-preview").first().click();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore all 8 themes", exact: true })
    .click();
  for (const theme of [themes[0], themes[7]]) {
    await page
      .locator(".theme-choice")
      .filter({ hasText: theme.name })
      .locator("button")
      .first()
      .click();
    await expectContrast(page, [...paperText, ...interfaceText]);
  }
  await page.screenshot({ path: ".sites-runtime/polish-dark.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Close design tools", exact: true })
    .click();
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expectContrast(page, [
    ...paperText,
    ".bottom-nav > button",
    ".planner-select select",
  ]);
  await page.screenshot({ path: ".sites-runtime/polish-dark-mobile.png" });
});

test("illustrated stickers keep their artwork, controls and legacy backups across mobile and offline export", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator(".canvas-inner .schedule-paper")).toBeVisible();
  await page.getByRole("button", { name: "Stickers", exact: true }).click();
  await expect(page.locator(".sticker-collection > button svg")).toHaveCount(
    30,
  );
  await expect(page.locator(".sticker-collection svg text")).toHaveCount(0);
  await page.screenshot({ path: ".sites-runtime/sticker-library.png" });
  for (const name of ["strawberry", "bunny", "cloud"])
    await page
      .getByRole("button", { name: `Add ${name} sticker`, exact: true })
      .click();
  const strawberry = page.locator(
    '.canvas-inner .canvas-sticker svg[data-illustration="strawberry"]',
  );
  const artwork = await strawberry.innerHTML();
  expect(artwork).toBe(
    await page
      .locator('.sticker-collection svg[data-illustration="strawberry"]')
      .innerHTML(),
  );
  const cloud = page.getByRole("button", {
    name: "Cloud sticker. Drag to move.",
    exact: true,
  });
  const before = await cloud.evaluate((element) =>
    parseFloat(element.style.left),
  );
  await cloud.focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => cloud.evaluate((element) => parseFloat(element.style.left)))
    .toBeCloseTo(before - 1);
  const size = page.locator('.sticker-tools input[type="range"]').first();
  await size.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(size).toHaveValue("19");
  await page.locator('.sticker-tools input[type="range"]').nth(1).focus();
  await page.keyboard.press("End");
  await expect(cloud).toHaveCSS("transform", "matrix(-1, 0, 0, -1, 0, 0)");
  await expect(page.locator(".connection-status")).toContainText(
    "All changes saved",
  );
  const dismiss = page.getByRole("button", {
    name: "Dismiss notification",
    exact: true,
  });
  if (await dismiss.count()) await dismiss.click();
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({ path: ".sites-runtime/polish-desktop.png" });
  await page.reload();
  await expect(page.locator(".canvas-inner .canvas-sticker")).toHaveCount(3);
  expect(await strawberry.innerHTML()).toBe(artwork);
  await page.setViewportSize({ width: 390, height: 844 });
  const closeTools = page.getByRole("button", {
    name: "Close design tools",
    exact: true,
  });
  if (await closeTools.isVisible()) await closeTools.click();
  await page.getByRole("button", { name: "Day", exact: true }).click();
  expect(await strawberry.innerHTML()).toBe(artwork);
  await page.screenshot({ path: ".sites-runtime/polish-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Back to my schedules" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download a full backup", exact: true })
    .click();
  const file = await downloading;
  const backup = JSON.parse(await readFile((await file.path())!, "utf8"));
  const planner = backup.data.schedules.find(
    (s: { id: string }) => s.id === backup.data.activeId,
  );
  expect(planner.design.stickers[0].emoji).toBe("🍓");
  planner.design.stickers.push(
    { id: "old-cloud", emoji: "☁", x: 25, y: 8, size: 40, rotation: 0 },
    { id: "custom-keepsake", emoji: "🛸", x: 45, y: 8, size: 40, rotation: 0 },
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "legacy-stickers.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page
    .getByRole("button", { name: "Restore my workspace", exact: true })
    .click();
  await expect(
    page.locator(
      '.canvas-inner .canvas-sticker svg[data-illustration="cloud"]',
    ),
  ).toHaveCount(2);
  await expect(
    page.locator(
      '.canvas-inner .canvas-sticker svg[data-illustration="keepsake"]',
    ),
  ).toHaveCount(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator(".canvas-inner .canvas-sticker")).toHaveCount(5);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".canvas-inner .canvas-sticker")).toHaveCount(5);
  expect(await strawberry.innerHTML()).toBe(artwork);
  await page
    .getByRole("button", { name: "Export planner", exact: true })
    .click();
  await expect(
    page.getByAltText("Exact preview of your exported planner"),
  ).toBeVisible({ timeout: 25000 });
  expect(
    await page
      .locator(
        '.export-render .canvas-sticker svg[data-illustration="strawberry"]',
      )
      .innerHTML(),
  ).toBe(artwork);
  const output = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  expect(await (await output).failure()).toBeNull();
});
