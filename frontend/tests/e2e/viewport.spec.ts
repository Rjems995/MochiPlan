import { test, expect, type Page } from "@playwright/test";

async function expectPageFits(page: Page) {
  const size = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
  expect(size.scrollHeight).toBeLessThanOrEqual(size.height);
}
async function expectPaperFits(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const paperNode = document.querySelector(".canvas-inner .schedule-paper");
        const stageNode = document.querySelector(".canvas-scroller");
        if (!paperNode || !stageNode) return false;
        const paper = paperNode.getBoundingClientRect();
        const stage = stageNode.getBoundingClientRect();
        return (
          stage.height > 40 &&
          paper.top >= stage.top - 1 &&
          paper.bottom <= stage.bottom + 1 &&
          paper.left >= stage.left - 1 &&
          paper.right <= stage.right + 1
        );
      }),
    )
    .toBe(true);
}
test("schedule views and design controls fit laptop, phone and landscape screens", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".canvas-inner .schedule-paper")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectPaperFits(page);
    await expectPageFits(page);
    await expect(
      page.getByRole("button", { name: "Export planner" }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Add activity", exact: true }),
    ).toBeInViewport();
    for (const view of ["Week", "Day", "Month", "List"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expectPaperFits(page);
    }
    const show = page.getByRole("button", {
      name: "Show design tools",
      exact: true,
    });
    if (await show.count()) await show.click();
    await page.getByRole("button", { name: "Layout", exact: true }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const panel = document
            .querySelector(".design-panel")!
            .getBoundingClientRect();
          const frame = document
            .querySelector(".design-inspector")!
            .getBoundingClientRect();
          return panel.bottom <= frame.bottom + 1;
        }),
      )
      .toBe(true);
    if (viewport.width === 1366) {
      await page.getByRole("button", { name: "Themes", exact: true }).click();
      await page.screenshot({ path: ".sites-runtime/fit-desktop.png" });
    }
    if (viewport.width === 390) {
      await page
        .getByRole("button", { name: "Close design tools", exact: true })
        .click();
      await page.getByRole("button", { name: "Day", exact: true }).click();
      await page.screenshot({ path: ".sites-runtime/fit-mobile.png" });
    }
    await page.getByRole("button", { name: "Back to my schedules" }).click();
    await expect(page.locator(".collection-pager")).toBeInViewport();
    await expectPageFits(page);
    await expect(
      page.getByRole("button", { name: "New schedule", exact: true }),
    ).toBeInViewport();
  }
});
test("a large saved collection stays on screen and can be paged and searched", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "Back to my schedules" }).click();
  for (let i = 0; i < 10; i++)
    await page
      .getByRole("button", { name: "Duplicate Spring semester", exact: true })
      .click();
  const next = page.getByRole("button", { name: "Next schedule page" });
  await expect(next).toBeEnabled();
  await expectPageFits(page);
  await next.click();
  await expect(
    page.getByRole("button", { name: "Previous schedule page" }),
  ).toBeEnabled();
  for (const card of await page.locator(".schedule-card").all())
    await expect(card.getByRole("button", { name: /Delete/ })).toBeInViewport();
  await page
    .getByRole("textbox", { name: "Search schedules" })
    .fill("no matching planner");
  await expect(
    page.getByText("No matching schedules", { exact: true }),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByRole("textbox", { name: "Search schedules" }).fill("Spring");
  await expect(page.getByText(/Page 1 of/)).toBeVisible();
  await expectPageFits(page);
  await page.screenshot({ path: ".sites-runtime/fit-collection.png" });
});

test("activity titles and times remain readable in the fitted desktop timetable", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1920, height: 900 },
    { width: 1536, height: 720 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expectPaperFits(page);
    await expectPageFits(page);
    await expect
      .poll(() =>
        page.locator(".canvas-inner .schedule-block").evaluateAll((blocks) =>
          blocks.every((block) => {
            const bounds = block.getBoundingClientRect();
            return [".block-title", ".block-time", ".block-location"].every(
              (selector) => {
                const text = block.querySelector(selector);
                if (!text) return selector !== ".block-time";
                const rect = text.getBoundingClientRect();
                return (
                  rect.top >= bounds.top + 0.5 &&
                  rect.bottom <= bounds.bottom - 0.5
                );
              },
            );
          }),
        ),
      )
      .toBe(true);
    const font = await page.evaluate(() => {
      const scale = Number(
        document
          .querySelector(".canvas-scroller .fit-viewport")!
          .getAttribute("data-scale"),
      );
      return (
        parseFloat(
          getComputedStyle(
            document.querySelector(".canvas-inner .block-title")!,
          ).fontSize,
        ) * scale
      );
    });
    expect(font).toBeGreaterThanOrEqual(10);
    if (viewport.width === 1920)
      await page.screenshot({ path: ".sites-runtime/roomy-desktop.png" });
    if (viewport.width === 1536)
      await page.screenshot({ path: ".sites-runtime/roomy-laptop.png" });
  }
});
