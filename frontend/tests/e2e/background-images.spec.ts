import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";

async function photo() {
  return sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><path fill="#efaaaa" d="M0 0h400v400H0z"/><path fill="#aaceb0" d="M400 0h400v400H400z"/><path fill="#aebce9" d="M800 0h400v400H800z"/></svg>',
    ),
  )
    .png()
    .toBuffer();
}
async function studio(page: Page) {
  await page.goto("/");
  await expect(page.locator(".canvas-inner .schedule-paper")).toBeVisible();
  const show = page.getByRole("button", {
    name: "Show design tools",
    exact: true,
  });
  if (await show.count()) await show.click();
}
async function upload(page: Page) {
  await page
    .locator(
      '.design-panel input[type="file"][accept="image/png,image/jpeg,image/webp"]',
    )
    .setInputFiles({
      name: "pastel-photo.png",
      mimeType: "image/png",
      buffer: await photo(),
    });
  const dialog = page.getByRole("dialog", {
    name: "Adjust your background",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Use background", exact: true }),
  ).toBeEnabled();
  return dialog;
}
const image = (page: Page) =>
  page.locator(".canvas-inner .planner-background-photo > img");

test("photo framing supports zoom, drag, reset, cancel and undo, then exports the saved crop offline", async ({
  page,
  context,
}) => {
  await studio(page);
  let dialog = await upload(page);
  await expect(image(page)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(image(page)).toHaveCount(0);
  dialog = await upload(page);
  const zoom = dialog.getByRole("slider", {
    name: "Background zoom",
    exact: true,
  });
  for (let i = 0; i < 10; i++) await zoom.press("ArrowRight");
  await expect(zoom).toHaveValue("150");
  const preview = dialog.getByRole("img", {
    name: /Background framing preview/,
  });
  const bounds = (await preview.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 40,
    bounds.y + bounds.height / 2 + 30,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(
    dialog.getByRole("slider", {
      name: "Background horizontal position",
      exact: true,
    }),
  ).not.toHaveValue("50");
  await dialog
    .getByRole("button", { name: "Show whole photo", exact: true })
    .click();
  await expect(dialog.locator(".planner-background-photo > img")).toHaveCSS(
    "object-fit",
    "contain",
  );
  await dialog
    .getByRole("button", { name: "Reset framing", exact: true })
    .click();
  await expect(zoom).toHaveValue("100");
  await expect(
    dialog.getByRole("button", { name: "Fill calendar", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (let i = 0; i < 10; i++) await zoom.press("ArrowRight");
  await dialog
    .getByRole("slider", {
      name: "Background horizontal position",
      exact: true,
    })
    .press("End");
  await page.screenshot({
    path: ".sites-runtime/background-photo-desktop.png",
  });
  await dialog
    .getByRole("button", { name: "Use background", exact: true })
    .click();
  await expect(image(page)).toHaveCSS("object-position", "100% 50%");
  await expect(image(page)).toHaveCSS(
    "transform",
    "matrix(1.5, 0, 0, 1.5, 0, 0)",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(image(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(image(page)).toHaveCSS("object-position", "100% 50%");
  await page
    .getByRole("button", { name: "Adjust background", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Adjust your background",
    exact: true,
  });
  await dialog
    .getByRole("slider", { name: "Background zoom", exact: true })
    .press("Home");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(image(page)).toHaveCSS(
    "transform",
    "matrix(1.5, 0, 0, 1.5, 0, 0)",
  );
  await page
    .getByRole("button", { name: "Profile settings", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download a full backup", exact: true })
    .click();
  const backup = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(
    backup.data.schedules.find(
      (schedule: any) => schedule.id === backup.data.activeId,
    ).design.imageAdjustment,
  ).toEqual({ fit: "cover", zoom: 150, x: 100, y: 50 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(image(page)).toHaveCSS("object-position", "100% 50%");
  await context.setOffline(true);
  await page.reload();
  await expect(image(page)).toHaveCSS(
    "transform",
    "matrix(1.5, 0, 0, 1.5, 0, 0)",
  );
  await page
    .getByRole("button", { name: "Export planner", exact: true })
    .click();
  const exportDialog = page.getByRole("dialog"),
    download = exportDialog.getByRole("button", {
      name: "Download PNG",
      exact: true,
    });
  await expect(download).toBeEnabled({ timeout: 25000 });
  await expect(
    exportDialog.locator(".export-render .planner-background-photo > img"),
  ).toHaveCSS("object-position", "100% 50%");
  const file = page.waitForEvent("download");
  await download.click();
  const downloaded = await file;
  await downloaded.saveAs(".sites-runtime/background-photo-export.png");
  const { data, info } = await sharp(await readFile((await downloaded.path())!))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (10 * info.width + Math.floor(info.width / 2)) * info.channels;
  for (const [index, expected] of [185, 197, 236].entries())
    expect(Math.abs(data[offset + index] - expected)).toBeLessThanOrEqual(3);
});

for (const device of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
]) {
  test(`${device.name} adjusts uploaded backgrounds with touch and keeps the photo fit`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      hasTouch: true,
      timezoneId: "Asia/Manila",
    });
    const page = await context.newPage();
    try {
      await studio(page);
      const dialog = await upload(page);
      await dialog
        .getByRole("button", { name: "Show whole photo", exact: true })
        .click();
      await dialog
        .getByRole("slider", { name: "Background zoom", exact: true })
        .press("ArrowRight");
      const preview = dialog.getByRole("img", {
          name: /Background framing preview/,
        }),
        bounds = (await preview.boundingBox())!;
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
            x: bounds.x + bounds.width / 2 + 20,
            y: bounds.y + bounds.height / 2 + 20,
          },
        ],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(
        dialog.getByRole("slider", {
          name: "Background horizontal position",
          exact: true,
        }),
      ).not.toHaveValue("50");
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      expect(
        await dialog
          .getByRole("slider", { name: "Background zoom", exact: true })
          .evaluate(
            (element) => getComputedStyle(element.parentElement!).fontSize,
          ),
      ).toBe("14px");
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({
        path: `.sites-runtime/background-photo-${device.name}.png`,
      });
      await dialog
        .getByRole("button", { name: "Use background", exact: true })
        .click();
      await expect(image(page)).toHaveCSS("object-fit", "contain");
      await expect(image(page)).toHaveCSS(
        "transform",
        "matrix(1.05, 0, 0, 1.05, 0, 0)",
      );
      await page.reload();
      await expect(image(page)).toHaveCSS("object-fit", "contain");
    } finally {
      await context.close();
    }
  });
}
