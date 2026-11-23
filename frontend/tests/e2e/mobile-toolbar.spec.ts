import { test, expect, type Page } from "@playwright/test";
import { clickPlannerAction, openPlannerMore } from "./helpers/plannerToolbar";

test.use({ hasTouch: true });
const paper = (page: Page) => page.locator(".canvas-inner .schedule-paper");

async function ready(page: Page) {
  await page.goto("/");
  await expect(paper(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function settleDialog(page: Page) {
  await page.getByRole("dialog").evaluate(async (element) => {
    await Promise.all(
      element
        .closest(".modal-backdrop")!
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}

for (const viewport of [
  { name: "small-phone", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "landscape", width: 844, height: 390 },
]) {
  test(`${viewport.name} shows four labelled actions with large, separated touch targets`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    const toolbar = page.locator(".studio-toolbar");
    const buttons = toolbar.getByRole("button");
    await expect(buttons).toHaveCount(4);
    await expect(buttons).toHaveText(
      ["Add activity", "Design", "Export", "More"],
      { useInnerText: true },
    );
    const bounds = await buttons.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x,
          right: box.right,
          width: box.width,
          height: box.height,
        };
      }),
    );
    for (let index = 0; index < bounds.length; index++) {
      expect(bounds[index].width).toBeGreaterThanOrEqual(44);
      expect(bounds[index].height).toBeGreaterThanOrEqual(44);
      expect(bounds[index].right).toBeLessThanOrEqual(viewport.width);
      if (index)
        expect(
          bounds[index].x - bounds[index - 1].right,
        ).toBeGreaterThanOrEqual(8);
    }
    await expect(
      page.getByRole("button", { name: "Calendar dates", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Active planner", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    const more = page.getByRole("button", {
      name: "More planner actions",
      exact: true,
    });
    await more.tap();
    const dialog = page.getByRole("dialog", {
      name: "Planner actions",
      exact: true,
    });
    await expect(more).toHaveAttribute("aria-expanded", "true");
    for (const name of [
      "Share planner",
      "Calendar dates",
      "Planner size",
      "Full screen editor",
      "Undo",
      "Redo",
    ]) {
      const action = dialog.getByRole("button", { name, exact: true });
      await expect(action).toBeInViewport();
      const target = (await action.boundingBox())!;
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
    await expect(
      dialog.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Redo", exact: true }),
    ).toBeDisabled();
    await settleDialog(page);
    await page.screenshot({
      path: `.sites-runtime/mobile-toolbar-more-${viewport.name}.png`,
      style: ".toast { visibility: hidden !important; }",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.evaluate((element) => element.blur());
    await page.screenshot({
      path: `.sites-runtime/mobile-toolbar-${viewport.name}.png`,
      style: ".toast { visibility: hidden !important; }",
    });
    await more.tap();
    await page.locator(".modal-backdrop").tap({ position: { x: 2, y: 2 } });
    await expect(dialog).toHaveCount(0);
  });
}

test("phone primary actions and secondary dialogs remain usable offline", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(paper(page)).toBeVisible();
  await page.getByRole("button", { name: "Add activity", exact: true }).tap();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByPlaceholder("e.g. Design principles")
    .fill("Phone sketch session");
  await dialog
    .getByRole("button", { name: "Add activity", exact: true })
    .click();
  await expect(paper(page)).toContainText("Phone sketch session");
  const design = page.getByRole("button", {
    name: "Show design tools",
    exact: true,
  });
  await design.tap();
  await expect(page.locator(".design-inspector")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hide design tools", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("button", { name: "Hide design tools", exact: true })
    .tap();
  await expect(page.locator(".design-inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Export planner", exact: true }).tap();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled({ timeout: 25000 });
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  for (const [action, title] of [
    ["Calendar dates", "Calendar dates"],
    ["Planner size", "Choose your planner size"],
  ]) {
    await clickPlannerAction(page, action);
    await expect(page.getByRole("dialog")).toHaveAccessibleName(title);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  }
  await clickPlannerAction(page, "Full screen editor");
  await expect(page.locator(".app-shell")).toHaveClass(/focus-mode/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const paper = document
          .querySelector(".canvas-inner .schedule-paper")!
          .getBoundingClientRect();
        return (
          paper.top >= 0 &&
          paper.bottom <= innerHeight &&
          document.documentElement.scrollHeight <= innerHeight
        );
      }),
    )
    .toBe(true);
  await clickPlannerAction(page, "Exit full screen editor");
  await expect(page.locator(".app-shell")).not.toHaveClass(/focus-mode/);
});

test("More supports Undo, Redo, switching planners, keyboard focus and desktop resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const title = page.getByRole("textbox", {
    name: "Planner title",
    exact: true,
  });
  const original = await title.inputValue();
  await title.fill("A little mobile plan");
  await clickPlannerAction(page, "Undo");
  await expect(title).toHaveValue(original);
  await clickPlannerAction(page, "Redo");
  await expect(title).toHaveValue("A little mobile plan");
  await page
    .getByRole("button", { name: "Back to my schedules", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Duplicate Spring semester", exact: true })
    .click();
  await page.locator(".schedule-card-preview").first().click();
  let dialog = await openPlannerMore(page);
  const picker = dialog.getByRole("combobox", {
    name: "Active planner",
    exact: true,
  });
  const copy = await picker
    .locator("option")
    .filter({ hasText: "Spring semester (copy)" })
    .getAttribute("value");
  await picker.selectOption(copy!);
  await expect(dialog).toHaveCount(0);
  dialog = await openPlannerMore(page);
  await expect(
    dialog.getByRole("combobox", { name: "Active planner", exact: true }),
  ).toHaveValue(copy!);
  await settleDialog(page);
  const close = dialog.getByRole("button", {
    name: "Close dialog",
    exact: true,
  });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Active planner", exact: true }),
  ).toHaveValue(copy!);
  await expect(
    page.getByRole("button", { name: "More planner actions", exact: true }),
  ).toHaveCount(0);
  for (const name of [
    "Calendar dates",
    "Planner size",
    "Share planner",
    "Undo",
    "Redo",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
});
