import { test, expect, type Page } from "@playwright/test";
import { dateKey, shiftDate } from "../../src/calendar";

test.use({ timezoneId: "Asia/Manila" });
async function tasksPage(page: Page) {
  const button = page.getByRole("button", {
    name: "Back to my schedules",
    exact: true,
  });
  if (await button.isVisible()) await button.click();
  await page
    .getByRole("button", { name: "Little to-dos", exact: true })
    .click();
}
async function add(page: Page, title: string) {
  await page.getByRole("button", { name: "Add a to-do", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "One little thing to do",
    exact: true,
  });
  await dialog.getByPlaceholder("Finish my moodboard").fill(title);
  return dialog;
}
test("subtasks and recurring copies keep history, reset progress, and survive offline reloads", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Back to my schedules", exact: true }),
  ).toBeVisible();
  await tasksPage(page);
  const dialog = await add(page, "Weekly reading journal"),
    today = dateKey(new Date()),
    due = shiftDate(today, 1);
  await dialog.getByLabel("A little deadline", { exact: true }).fill(due);
  await dialog.getByLabel("Deadline time", { exact: true }).fill("17:00");
  await dialog
    .getByRole("combobox", { name: "Deadline notification", exact: true })
    .selectOption("60");
  await dialog
    .getByRole("combobox", { name: "Repeat", exact: true })
    .selectOption("weekly");
  await dialog
    .getByLabel("Repeat until", { exact: true })
    .fill(shiftDate(due, 14));
  await dialog
    .getByRole("button", { name: "Add a subtask", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Subtask 1", exact: true })
    .fill("Read the chapter");
  await dialog
    .getByRole("button", { name: "Add a subtask", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Subtask 2", exact: true })
    .fill("Write three reflections");
  await dialog
    .getByRole("button", { name: "Add my to-do", exact: true })
    .click();
  const item = page
    .locator(".task-item")
    .filter({ hasText: "Weekly reading journal" });
  await item
    .getByRole("checkbox", {
      name: "Complete Read the chapter in Weekly reading journal",
      exact: true,
    })
    .check();
  await expect(item).toContainText("1/2 steps");
  await item
    .getByRole("button", {
      name: "Complete Weekly reading journal",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".task-row.completed")
      .filter({ hasText: "Weekly reading journal" }),
  ).toHaveCount(1);
  const next = page
    .locator(".task-item")
    .filter({ has: page.locator(".task-row:not(.completed)") })
    .filter({ hasText: "Weekly reading journal" });
  await expect(next).toContainText("0/2 steps");
  await expect(next).toContainText("Every week");
  await expect(next).toContainText("1 hour before");
  await expect(next.getByRole("checkbox").first()).not.toBeChecked();
  await next
    .getByRole("button", { name: "Edit Weekly reading journal", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("A little deadline", { exact: true }),
  ).toHaveValue(shiftDate(due, 7));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.screenshot({ path: ".sites-runtime/task-upgrades-desktop.png" });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(page.locator(".connection-status")).toContainText(
    "All changes saved",
  );
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Back to my schedules", exact: true }),
  ).toBeVisible();
  await tasksPage(page);
  await expect(
    page.locator(".task-item").filter({ hasText: "Weekly reading journal" }),
  ).toHaveCount(2);
  await expect(
    page
      .locator(".task-row.completed")
      .filter({ hasText: "Weekly reading journal" }),
  ).toHaveCount(1);
  await context.setOffline(false);
});

test("task options validate missing deadlines, fit phones and can stop repeating without deleting history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Back to my schedules", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to my schedules", exact: true })
    .click();
  await page.getByRole("button", { name: "To-dos", exact: true }).click();
  const dialog = await add(page, "Monthly project review");
  await dialog.getByLabel("A little deadline", { exact: true }).fill("");
  await dialog
    .getByRole("combobox", { name: "Repeat", exact: true })
    .selectOption("monthly");
  await dialog
    .getByRole("button", { name: "Add my to-do", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Choose a deadline");
  await dialog
    .getByLabel("A little deadline", { exact: true })
    .fill(shiftDate(dateKey(new Date()), 1));
  await dialog
    .getByRole("button", { name: "Add a subtask", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Subtask 1", exact: true })
    .fill("Review what worked");
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await dialog.screenshot({ path: ".sites-runtime/task-editor-mobile.png" });
  await dialog
    .getByRole("button", { name: "Add my to-do", exact: true })
    .click();
  const item = page
    .locator(".task-item")
    .filter({ hasText: "Monthly project review" });
  await item
    .getByRole("button", { name: "Edit Monthly project review", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Repeat", exact: true })
    .selectOption("none");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await item
    .getByRole("button", {
      name: "Complete Monthly project review",
      exact: true,
    })
    .click();
  await expect(item).toHaveCount(1);
  await expect(item.locator(".task-row")).toHaveClass(/completed/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".sites-runtime/task-upgrades-mobile.png" });
});
