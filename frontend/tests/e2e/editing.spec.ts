import { test, expect } from "@playwright/test";
test("drag changes day and time; resizing changes duration; overlap stays readable", async ({
  page,
}) => {
  await page.goto("/");
  const first = page
    .locator(".canvas-inner .schedule-block")
    .filter({ hasText: "Design principles" })
    .first();
  await first.scrollIntoViewIfNeeded();
  const bounds = await first.boundingBox();
  const columns = page.locator(".canvas-inner .day-column");
  const firstCol = await columns.nth(0).boundingBox();
  const secondCol = await columns.nth(1).boundingBox();
  const scale = Number(
    await page
      .locator(".canvas-scroller .fit-viewport")
      .getAttribute("data-scale"),
  );
  const hourHeight = Number(
    await page
      .locator(".canvas-inner .schedule-paper")
      .getAttribute("data-hour-height"),
  );
  await page.mouse.move(bounds!.x + 25, bounds!.y + 15);
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + 25 + (secondCol!.x - firstCol!.x),
    bounds!.y + 15 + hourHeight * scale,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(page.locator(".modal-backdrop")).toHaveCSS("opacity", "1");
  await page.getByRole("radio", { name: "Entire series", exact: true }).check();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(
    page
      .locator(".canvas-inner .day-column")
      .nth(1)
      .getByText("Design principles"),
  ).toHaveCount(1);
  const moved = page
    .locator(".canvas-inner .day-column")
    .nth(1)
    .locator(".schedule-block")
    .filter({ hasText: "Design principles" });
  await expect
    .poll(() =>
      moved.evaluate(
        (e) =>
          parseFloat(getComputedStyle(e).top) /
          Number(
            e.closest(".schedule-paper")!.getAttribute("data-hour-height"),
          ),
      ),
    )
    .toBeCloseTo(2, 1);
  const resizeHourHeight = Number(
    await page
      .locator(".canvas-inner .schedule-paper")
      .getAttribute("data-hour-height"),
  );
  const resizeScale = Number(
    await page
      .locator(".canvas-scroller .fit-viewport")
      .getAttribute("data-scale"),
  );
  const handle = moved.getByRole("slider");
  const hb = await handle.boundingBox();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + 5);
  await page.mouse.down();
  await page.mouse.move(
    hb!.x + hb!.width / 2,
    hb!.y + 5 + (resizeHourHeight / 2) * resizeScale,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(page.locator(".modal-backdrop")).toHaveCSS("opacity", "1");
  await page.getByRole("radio", { name: "Entire series", exact: true }).check();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect
    .poll(() =>
      moved.evaluate(
        (e) =>
          parseFloat(getComputedStyle(e).height) /
          Number(
            e.closest(".schedule-paper")!.getAttribute("data-hour-height"),
          ),
      ),
    )
    .toBeCloseTo(2, 1);
  await page.waitForTimeout(350);
  await moved.click();
  await expect(page.locator("input[type=time]").nth(0)).toHaveValue("10:00");
  await expect(page.locator("input[type=time]").nth(1)).toHaveValue("12:00");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.locator(".canvas-inner .day-column").nth(1).locator(".has-conflict"),
  ).toHaveCount(3);
  await expect(page.locator(".overlap-notice")).toBeVisible();
});
test("custom palettes, full screen, all views and backups work", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a custom palette" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Palette name")
    .fill("Apricot journal");
  await page.getByRole("button", { name: "Save my palette" }).click();
  await expect(
    page.locator(".theme-choice").filter({ hasText: "Apricot journal" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Explore all 8 themes" }).click();
  await expect(
    page.locator(".theme-choice").filter({ hasText: "Apricot journal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Full screen editor" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/focus-mode/);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  expect(
    await page.locator(".canvas-inner .month-cell").count(),
  ).toBeGreaterThanOrEqual(28);
  expect(
    await page.locator(".canvas-inner .month-cell").count(),
  ).toBeLessThanOrEqual(42);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".canvas-inner .list-activity")).toHaveCount(15);
  await page.getByRole("button", { name: "Exit full screen editor" }).click();
  await page.getByRole("button", { name: "Back to my schedules" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download a full backup" }).click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe("mochiplan-backup.json");
  const path = await downloaded.path();
  await page.locator("input[type=file]").setInputFiles(path!);
  await expect(page.getByRole("dialog")).toContainText(
    "Bring back your little workspace?",
  );
  await page.getByRole("button", { name: "Restore my workspace" }).click();
  await expect(page.locator(".canvas-inner .list-activity")).toHaveCount(15);
});
