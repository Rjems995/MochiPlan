import { test, expect, type Page } from "@playwright/test";
import { dateForWeekday, shiftDate } from "../../src/calendar";
test.use({ timezoneId: "Asia/Manila" });
const column = (page: Page, date: string) =>
  page.locator(`.canvas-inner .day-column[data-date="${date}"]`);
const block = (page: Page, date: string, title: string) =>
  column(page, date).locator(".schedule-block").filter({ hasText: title });
async function openPlanner(page: Page) {
  await page.goto("/");
  await expect(page.locator(".canvas-inner .schedule-paper")).toBeVisible();
  const date = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  return dateForWeekday(date, 0);
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
}
async function applyScope(page: Page, name: string) {
  await expect(page.locator(".modal-backdrop")).toHaveCSS("opacity", "1");
  await page.getByRole("radio", { name, exact: true }).check();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
}

test("this-date edits reschedule one class, persist, cancel and restore without duplicate originals", async ({
  page,
}) => {
  const monday = await openPlanner(page),
    tuesday = shiftDate(monday, 1),
    wednesday = shiftDate(monday, 2);
  await block(page, monday, "Design principles").click();
  await page.getByRole("radio", { name: "This date", exact: true }).check();
  await page.getByPlaceholder("e.g. Design principles").fill("One-off studio");
  await page.getByLabel("Event date", { exact: true }).fill(tuesday);
  await page.getByLabel("Starts at", { exact: true }).fill("13:00");
  await page.getByLabel("Finishes at", { exact: true }).fill("14:00");
  await expect(page.locator(".modal-backdrop")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".sites-runtime/scope-edit-desktop.png" });
  await save(page);
  await expect(block(page, monday, "Design principles")).toHaveCount(0);
  await expect(block(page, tuesday, "One-off studio")).toHaveCount(1);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    block(page, shiftDate(monday, 7), "Design principles"),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".canvas-inner .schedule-block")
      .filter({ hasText: "One-off studio" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Edit rescheduled One-off studio on ${tuesday}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("radio", { name: "This date", exact: true }),
  ).toBeChecked();
  await page.getByLabel("Event date", { exact: true }).fill(wednesday);
  await save(page);
  await expect(block(page, tuesday, "One-off studio")).toHaveCount(0);
  await block(page, wednesday, "One-off studio").click();
  await page
    .getByRole("button", { name: "Cancel this date", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Calendar dates", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Restore .* on / }),
  ).toHaveCount(1);
  await page
    .getByRole("button", {
      name: `Restore One-off studio on ${wednesday}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save calendar dates", exact: true })
    .click();
  await expect(block(page, wednesday, "One-off studio")).toHaveCount(1);
  await expect(page.locator(".connection-status")).toContainText(
    "All changes saved",
  );
  await page.reload();
  await expect(block(page, wednesday, "One-off studio")).toHaveCount(1);
  await expect(block(page, monday, "Design principles")).toHaveCount(0);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page
    .getByRole("button", { name: "Export planner", exact: true })
    .click();
  await expect(
    page.getByAltText("Exact preview of your exported planner"),
  ).toBeVisible({ timeout: 25000 });
  await expect(
    page
      .locator(`.export-render .month-cell[data-date="${wednesday}"] button`)
      .filter({ hasText: "One-off studio" }),
  ).toHaveCount(1);
});

test("future edits preserve history and whole-series edits cross every phase with undo and redo", async ({
  page,
}) => {
  const monday = await openPlanner(page),
    nextMonday = shiftDate(monday, 7);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await block(page, nextMonday, "Design principles").click();
  await page.getByRole("radio", { name: "Future dates", exact: true }).check();
  await page
    .getByPlaceholder("e.g. Design principles")
    .fill("Afternoon design");
  await page.getByLabel("Starts at", { exact: true }).fill("13:00");
  await page.getByLabel("Finishes at", { exact: true }).fill("14:00");
  await save(page);
  await expect(
    block(page, nextMonday, "Afternoon design").locator(".block-time"),
  ).toContainText("1 pm");
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await expect(
    block(page, monday, "Design principles").locator(".block-time"),
  ).toContainText("9 am");
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await block(page, nextMonday, "Afternoon design").click();
  await page.getByRole("radio", { name: "Entire series", exact: true }).check();
  await page.getByPlaceholder("e.g. Design principles").fill("Design workshop");
  await save(page);
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await expect(
    block(page, monday, "Design workshop").locator(".block-time"),
  ).toContainText("9 am");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(block(page, monday, "Design principles")).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(block(page, monday, "Design workshop")).toHaveCount(1);
  await expect(page.locator(".connection-status")).toContainText(
    "All changes saved",
  );
  await page.reload();
  await expect(block(page, monday, "Design workshop")).toHaveCount(1);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    block(page, nextMonday, "Design workshop").locator(".block-time"),
  ).toContainText("1 pm");
});

test("weekly drag and resize ask for scope and cancelling the prompt leaves the class unchanged", async ({
  page,
}) => {
  const monday = await openPlanner(page),
    tuesday = shiftDate(monday, 1);
  const original = block(page, monday, "Design principles"),
    bounds = await original.boundingBox();
  const a = await column(page, monday).boundingBox(),
    b = await column(page, tuesday).boundingBox();
  await page.mouse.move(bounds!.x + 20, bounds!.y + 12);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 20 + b!.x - a!.x, bounds!.y + 12, {
    steps: 12,
  });
  await page.mouse.up();
  await applyScope(page, "This date");
  await expect(block(page, tuesday, "Design principles")).toHaveCount(1);
  await expect(block(page, monday, "Design principles")).toHaveCount(0);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  const weekly = block(page, shiftDate(monday, 7), "Design principles");
  const handle = weekly.getByRole("slider");
  const end = await handle.getAttribute("aria-valuenow");
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(handle).toHaveAttribute("aria-valuenow", end!);
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await applyScope(page, "Future dates");
  await expect(handle).toHaveAttribute(
    "aria-valuenow",
    String(Number(end) + 15),
  );
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    block(page, shiftDate(monday, 14), "Design principles").getByRole("slider"),
  ).toHaveAttribute("aria-valuenow", String(Number(end) + 15));
});

test("switching from an exception to future editing loads the pattern and preserves typed changes", async ({
  page,
}) => {
  const monday = await openPlanner(page),
    tuesday = shiftDate(monday, 1);
  await block(page, monday, "Design principles").click();
  await page.getByRole("radio", { name: "This date", exact: true }).check();
  await page.getByLabel("Event date", { exact: true }).fill(tuesday);
  await page.getByPlaceholder("e.g. Design principles").fill("Special lecture");
  await page.getByLabel("Starts at", { exact: true }).fill("13:00");
  await page.getByLabel("Finishes at", { exact: true }).fill("14:00");
  await save(page);
  await block(page, tuesday, "Special lecture").click();
  await page
    .getByPlaceholder("e.g. Design principles")
    .fill("Design everywhere");
  await page.getByRole("radio", { name: "Entire series", exact: true }).check();
  await expect(page.getByLabel("Starts at", { exact: true })).toHaveValue(
    "09:00",
  );
  await expect(page.getByLabel("Finishes at", { exact: true })).toHaveValue(
    "10:30",
  );
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Mon", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByPlaceholder("e.g. Design principles")).toHaveValue(
    "Design everywhere",
  );
  await page.getByRole("radio", { name: "This date", exact: true }).check();
  await expect(page.getByLabel("Starts at", { exact: true })).toHaveValue(
    "13:00",
  );
  await expect(page.getByLabel("Event date", { exact: true })).toHaveValue(
    tuesday,
  );
  await page.getByRole("radio", { name: "Future dates", exact: true }).check();
  await expect(page.getByLabel("Starts at", { exact: true })).toHaveValue(
    "09:00",
  );
  await save(page);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    block(page, tuesday, "Design everywhere").locator(".block-time"),
  ).toContainText("1 pm");
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    block(page, shiftDate(monday, 7), "Design everywhere").locator(
      ".block-time",
    ),
  ).toContainText("9 am");
});

test("scope controls and one-date rescheduling work on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const monday = await openPlanner(page),
    wednesday = shiftDate(monday, 2);
  await page
    .locator(".canvas-inner .daily-nav")
    .getByRole("button", { name: "Mon", exact: true })
    .click();
  await block(page, monday, "Design principles").click();
  await page.getByRole("radio", { name: "This date", exact: true }).check();
  for (const label of ["This date", "Future dates", "Entire series"])
    await expect(
      page.getByRole("radio", { name: label, exact: true }),
    ).toBeInViewport();
  await page.getByLabel("Event date", { exact: true }).fill(wednesday);
  await page.getByPlaceholder("e.g. Design principles").fill("Mobile class");
  await expect(page.locator(".modal-backdrop")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".sites-runtime/scope-edit-mobile.png" });
  await save(page);
  await expect(block(page, wednesday, "Mobile class")).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
