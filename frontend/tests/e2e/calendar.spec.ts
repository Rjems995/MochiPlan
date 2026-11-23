import { clickPlannerAction } from "./helpers/plannerToolbar";
import { test, expect, type Page } from "@playwright/test";
import { dateForWeekday, shiftDate } from "../../src/calendar";
test.use({ timezoneId: "Asia/Manila" });
async function currentMonday(page: Page) {
  await expect(page.locator(".canvas-inner .schedule-paper")).toBeVisible();
  const key = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  return dateForWeekday(key, 0);
}
const column = (page: Page, date: string) =>
  page.locator(`.canvas-inner .day-column[data-date="${date}"]`);
async function saveCalendar(
  page: Page,
  start: string,
  end: string,
  holiday?: { date: string; name: string },
) {
  await clickPlannerAction(page, "Calendar dates");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Semester starts", { exact: true }).fill(start);
  await dialog.getByLabel("Semester ends", { exact: true }).fill(end);
  if (holiday) {
    await dialog.getByLabel("Holiday name", { exact: true }).fill(holiday.name);
    await dialog
      .getByLabel("Holiday starts", { exact: true })
      .fill(holiday.date);
    await dialog.getByLabel("Holiday ends", { exact: true }).fill(holiday.date);
    await dialog
      .getByRole("button", { name: "Add holiday", exact: true })
      .click();
  }
  await dialog
    .getByRole("button", { name: "Save calendar dates", exact: true })
    .click();
}
test("semester limits, holidays and single-class cancellation persist and can be restored", async ({
  page,
}) => {
  await page.goto("/");
  const monday = await currentMonday(page);
  const friday = shiftDate(monday, 4);
  await saveCalendar(page, monday, shiftDate(monday, 13), {
    date: friday,
    name: "Campus holiday",
  });
  await expect(column(page, friday).locator(".schedule-block")).toHaveCount(0);
  await expect(page.locator(".canvas-inner .holiday-note")).toHaveText(
    "Campus holiday",
  );
  await column(page, monday)
    .locator(".schedule-block")
    .filter({ hasText: "Design principles" })
    .click();
  await page
    .getByRole("button", { name: "Cancel this date", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    column(page, monday)
      .locator(".schedule-block")
      .filter({ hasText: "Design principles" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: `Edit cancelled Design principles on ${monday}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    column(page, shiftDate(monday, 7))
      .locator(".schedule-block")
      .filter({ hasText: "Design principles" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Edit cancelled Design principles on ${monday}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Restore this date", exact: true })
    .click();
  await expect(
    column(page, monday)
      .locator(".schedule-block")
      .filter({ hasText: "Design principles" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page.locator(".canvas-inner .schedule-block")).toHaveCount(0);
  await expect(
    page.locator(".canvas-inner .outside-term-note").first(),
  ).toBeVisible();
  await expect(page.locator(".connection-status")).toContainText(
    "All changes saved",
  );
  await page.reload();
  await clickPlannerAction(page, "Calendar dates");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Semester starts", { exact: true }),
  ).toHaveValue(monday);
  await expect(
    dialog.getByText("Campus holiday", { exact: true }),
  ).toBeVisible();
});
test("one-off exams keep their exact date through calendar edits, cancellations, restore and export", async ({
  page,
}) => {
  await page.goto("/");
  const monday = await currentMonday(page);
  const examDate = shiftDate(monday, 9);
  const movedDate = shiftDate(examDate, 2);
  await saveCalendar(page, monday, shiftDate(monday, 6), {
    date: examDate,
    name: "Campus closure",
  });
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page
    .getByPlaceholder("e.g. Design principles")
    .fill("Final examination");
  await page
    .getByRole("combobox", { name: "Activity recurrence" })
    .selectOption("once");
  await page.getByLabel("Event date", { exact: true }).fill(examDate);
  await page.getByLabel("Starts at", { exact: true }).fill("13:00");
  await page.getByLabel("Finishes at", { exact: true }).fill("15:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add activity", exact: true })
    .click();
  await expect(page.locator(".canvas-inner .schedule-block")).toHaveCount(1);
  await expect(
    column(page, examDate).getByText("Final examination", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page.locator(".canvas-inner .schedule-block")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const cell = (date: string) =>
    page.locator(`.canvas-inner .month-cell[data-date="${date}"]`);
  await cell(examDate)
    .getByRole("button", { name: /Final examination/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Activity recurrence" }),
  ).toHaveValue("once");
  await page.getByLabel("Event date", { exact: true }).fill(movedDate);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    cell(examDate).getByRole("button", { name: /Final examination/ }),
  ).toHaveCount(0);
  await expect(
    cell(movedDate).getByRole("button", { name: /Final examination/ }),
  ).toHaveCount(1);
  await cell(movedDate)
    .getByRole("button", { name: /Final examination/ })
    .click();
  await page
    .getByRole("button", { name: "Cancel this date", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(cell(movedDate).locator(".cancelled-note")).toHaveCount(1);
  await clickPlannerAction(page, "Calendar dates");
  await page
    .getByRole("button", {
      name: `Restore Final examination on ${movedDate}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save calendar dates", exact: true })
    .click();
  await expect(
    cell(movedDate).getByRole("button", { name: /Final examination/ }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Export planner", exact: true })
    .click();
  await expect(
    page.getByAltText("Exact preview of your exported planner"),
  ).toBeVisible({ timeout: 25000 });
  await expect(
    page
      .locator(`.export-render .month-cell[data-date="${movedDate}"] button`)
      .filter({ hasText: "Final examination" }),
  ).toHaveCount(1);
});
test("dragging a one-off event changes its calendar date without making it repeat", async ({
  page,
}) => {
  await page.goto("/");
  const monday = await currentMonday(page);
  const tuesday = shiftDate(monday, 1);
  const wednesday = shiftDate(monday, 2);
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page
    .getByPlaceholder("e.g. Design principles")
    .fill("One-time consultation");
  await page
    .getByRole("combobox", { name: "Activity recurrence" })
    .selectOption("once");
  await page.getByLabel("Event date", { exact: true }).fill(tuesday);
  await page.getByLabel("Starts at", { exact: true }).fill("12:00");
  await page.getByLabel("Finishes at", { exact: true }).fill("13:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add activity", exact: true })
    .click();
  const block = column(page, tuesday)
    .locator(".schedule-block")
    .filter({ hasText: "One-time consultation" });
  const bounds = await block.boundingBox();
  const a = await column(page, tuesday).boundingBox();
  const b = await column(page, wednesday).boundingBox();
  await page.mouse.move(bounds!.x + 20, bounds!.y + 12);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 20 + b!.x - a!.x, bounds!.y + 12, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(
    column(page, wednesday).getByText("One-time consultation", { exact: true }),
  ).toBeVisible();
  await expect(
    column(page, tuesday).getByText("One-time consultation", { exact: true }),
  ).toHaveCount(0);
  // dnd-kit keeps a document click guard for 50 ms after dropping an activity.
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(column(page, shiftDate(wednesday, 7))).toBeVisible();
  await expect(
    page
      .locator(".canvas-inner .schedule-block")
      .filter({ hasText: "One-time consultation" }),
  ).toHaveCount(0);
});
test("new semester planners and exam defaults survive reopening", async ({
  page,
}) => {
  await page.goto("/");
  const monday = await currentMonday(page);
  const start = shiftDate(monday, 7),
    end = shiftDate(monday, 20);
  await page.getByRole("button", { name: "Back to my schedules" }).click();
  await page.getByRole("button", { name: "New schedule", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByPlaceholder("e.g. My fall semester")
    .fill("Winter examinations");
  await dialog.locator("select").selectOption("Exam schedule");
  await dialog.getByLabel("Semester starts", { exact: true }).fill(start);
  await dialog.getByLabel("Semester ends", { exact: true }).fill(end);
  await dialog.getByRole("button", { name: "Create my planner" }).click();
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Activity recurrence" }),
  ).toHaveValue("once");
  await page.getByPlaceholder("e.g. Design principles").fill("Portfolio exam");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add activity", exact: true })
    .click();
  await expect(page.locator(".connection-status")).toContainText(
    "All changes saved",
  );
  await page.reload();
  await expect(
    page
      .locator(".canvas-inner .schedule-block")
      .filter({ hasText: "Portfolio exam" }),
  ).toHaveCount(1);
  await clickPlannerAction(page, "Calendar dates");
  await expect(
    page.getByRole("dialog").getByLabel("Semester starts", { exact: true }),
  ).toHaveValue(start);
});

test("dated planners fit small screens and daily swipes cross into the next calendar week", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  const monday = await currentMonday(page);
  await saveCalendar(page, monday, shiftDate(monday, 13), {
    date: shiftDate(monday, 4),
    name: "Campus holiday",
  });
  await column(page, monday)
    .locator(".schedule-block")
    .filter({ hasText: "Design principles" })
    .click();
  await page
    .getByRole("button", { name: "Cancel this date", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  const expectFits = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const paper = document
            .querySelector(".canvas-inner .schedule-paper")
            ?.getBoundingClientRect();
          const frame = document
            .querySelector(".canvas-scroller")
            ?.getBoundingClientRect();
          return (
            !!paper &&
            !!frame &&
            paper.bottom <= frame.bottom + 1 &&
            paper.top >= frame.top - 1 &&
            paper.left >= frame.left - 1 &&
            paper.right <= frame.right + 1 &&
            document.documentElement.scrollHeight <= innerHeight &&
            document.documentElement.scrollWidth <= innerWidth
          );
        }),
      )
      .toBe(true);
    for (const name of ["Add activity", "Export planner"])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeInViewport();
    const more = page.getByRole("button", {
      name: "More planner actions",
      exact: true,
    });
    await expect(
      (await more.isVisible())
        ? more
        : page.getByRole("button", { name: "Calendar dates", exact: true }),
    ).toBeInViewport();
  };
  await expectFits();
  await page
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .click();
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({ path: ".sites-runtime/dated-desktop.png" });
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const closeTools = page.getByRole("button", {
      name: "Close design tools",
      exact: true,
    });
    if (await closeTools.isVisible()) await closeTools.click();
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await page
      .locator(".canvas-inner .daily-nav")
      .getByRole("button", { name: "Mon", exact: true })
      .click();
    await expectFits();
  }
  await page.screenshot({ path: ".sites-runtime/dated-mobile.png" });
  await page
    .locator(".canvas-inner .daily-nav")
    .getByRole("button", { name: "Sun", exact: true })
    .click();
  await page.locator(".canvas-inner .schedule-paper").evaluate((paper) => {
    const start = new Event("touchstart", { bubbles: true });
    Object.defineProperty(start, "touches", { value: [{ clientX: 300 }] });
    paper.dispatchEvent(start);
    const end = new Event("touchend", { bubbles: true });
    Object.defineProperty(end, "changedTouches", { value: [{ clientX: 100 }] });
    paper.dispatchEvent(end);
  });
  await expect(column(page, shiftDate(monday, 7))).toBeVisible();
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Activity recurrence" })
    .selectOption("once");
  await expect(page.getByLabel("Event date", { exact: true })).toHaveValue(
    shiftDate(monday, 7),
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await clickPlannerAction(page, "Calendar dates");
  await expect(page.getByRole("dialog")).toBeInViewport();
  await expect(page.locator(".modal-backdrop")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".sites-runtime/calendar-dialog-mobile.png" });
});
