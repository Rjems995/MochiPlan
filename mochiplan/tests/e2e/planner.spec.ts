import { test, expect } from "@playwright/test";
test("create, edit, overlap, undo, duplicate and persist planners", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForTimeout(300);
  await page.screenshot({ path: ".sites-runtime/desktop.png", fullPage: true });
  await expect(
    page.getByRole("heading", { name: "Good weeks start with a little plan" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create a schedule", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.getByPlaceholder("e.g. My fall semester").fill("QA study week");
  await modal.getByRole("button", { name: "Create my planner" }).click();
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page
    .getByPlaceholder("e.g. Design principles")
    .fill("Literature seminar");
  for (const d of ["Mon", "Tue"]) {
    const button = page
      .getByRole("dialog")
      .getByRole("button", { name: d, exact: true });
    if ((await button.getAttribute("aria-pressed")) !== "true")
      await button.click();
  }
  await page.locator("input[type=time]").nth(0).fill("09:00");
  await page.locator("input[type=time]").nth(1).fill("10:30");
  await page.getByPlaceholder("Studio 204").fill("Room 42");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add activity", exact: true })
    .click();
  await expect(page.locator(".canvas-inner .schedule-block")).toHaveCount(2);
  const first = page.locator(".canvas-inner .schedule-block").first();
  await expect(first).toHaveCSS("height", "72px");
  await first.click();
  await page
    .getByPlaceholder("e.g. Design principles")
    .fill("Modern literature");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page
      .locator(".canvas-inner .block-title")
      .filter({ hasText: "Modern literature" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page
      .locator(".canvas-inner .block-title")
      .filter({ hasText: "Literature seminar" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page
      .locator(".canvas-inner .block-title")
      .filter({ hasText: "Modern literature" }),
  ).toHaveCount(1);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Active planner" }),
  ).toHaveValue(/.+/);
  await expect(page.locator(".canvas-inner .schedule-block")).toHaveCount(2);
  await page
    .getByRole("button", { name: "My schedules", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Duplicate QA study week", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "QA study week (copy)", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete QA study week (copy)", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Let this little planner go?",
  );
  await page.getByRole("button", { name: "Keep my planner" }).click();
  await expect(
    page.getByRole("heading", { name: "QA study week (copy)", exact: true }),
  ).toBeVisible();
});
test("theme, stickers, template favorites and tasks work", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Matcha Latte", exact: false })
    .first()
    .click();
  await expect(page.locator(".canvas-inner .schedule-paper")).toHaveCSS(
    "background-color",
    "rgb(245, 247, 237)",
  );
  await page.getByRole("button", { name: "Stickers", exact: true }).click();
  await page.getByRole("button", { name: "Add 🍓 sticker" }).click();
  await expect(page.locator(".canvas-inner .canvas-sticker")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Template garden", exact: true })
    .click();
  await expect(page.locator(".template-card")).toHaveCount(16);
  await page
    .getByRole("button", { name: "Favorite A moment of matcha", exact: true })
    .click();
  await page.getByRole("button", { name: "My favorites", exact: true }).click();
  await expect(page.locator(".template-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Preview A moment of matcha" })
    .click();
  await page.getByRole("button", { name: "Make it mine" }).click();
  await expect(page.locator(".canvas-inner .paper-heading h2")).toHaveText(
    "A moment of matcha",
  );
  await page
    .getByRole("button", { name: "Little to-dos", exact: true })
    .click();
  await page.getByRole("button", { name: "Add a to-do", exact: true }).click();
  await page
    .getByPlaceholder("Finish my moodboard")
    .fill("Prepare presentation");
  await page.getByRole("button", { name: "Add my to-do" }).click();
  await expect(
    page.locator(".task-row").filter({ hasText: "Prepare presentation" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Complete Prepare presentation", exact: true })
    .click();
  await expect(
    page
      .locator(".task-row.completed")
      .filter({ hasText: "Prepare presentation" }),
  ).toHaveCount(1);
});
test("exports PNG, JPG and PDF at the requested dimensions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Export planner" }).click();
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByAltText("Exact preview of your exported planner"),
  ).toBeVisible({ timeout: 25000 });
  for (const ext of ["png", "jpg", "pdf"]) {
    await modal
      .getByRole("button", { name: ext.toUpperCase(), exact: true })
      .click();
    await expect(
      modal.getByRole("button", {
        name: `Download ${ext.toUpperCase()}`,
        exact: true,
      }),
    ).toBeEnabled({ timeout: 25000 });
    const download = page.waitForEvent("download");
    await modal
      .getByRole("button", {
        name: `Download ${ext.toUpperCase()}`,
        exact: true,
      })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
    expect(await file.failure()).toBeNull();
  }
  const dimensions = await modal
    .getByAltText("Exact preview of your exported planner")
    .evaluate((img: HTMLImageElement) => ({
      w: img.naturalWidth,
      h: img.naturalHeight,
    }));
  expect(dimensions).toEqual({ w: 1920, h: 1080 });
});
test("offline cold launch, editing and exports work after service worker caches", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator(".canvas-inner .schedule-paper")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator(".canvas-inner .schedule-block")).toHaveCount(15);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".canvas-inner .schedule-block")).toHaveCount(15);
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page.getByPlaceholder("e.g. Design principles").fill("Offline study");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add activity", exact: true })
    .click();
  await expect(page.locator(".canvas-inner .schedule-block")).toHaveCount(16);
  await page.getByRole("button", { name: "Export planner" }).click();
  await expect(
    page.getByAltText("Exact preview of your exported planner"),
  ).toBeVisible({ timeout: 25000 });
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await expect(page.locator(".canvas-inner .schedule-block")).toHaveCount(16);
});
test("mobile navigation, day view and tasks fit within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".bottom-nav")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: ".sites-runtime/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.locator(".canvas-inner .view-daily")).toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Templates" })
    .click();
  await expect(page.locator(".template-card")).toHaveCount(16);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "To-dos" })
    .click();
  await page.getByRole("button", { name: "Add a to-do" }).click();
  await expect(page.getByRole("dialog")).toBeInViewport();
});
