import { test, expect } from "@playwright/test";

test("page changes preserve the editor session and task filter, and keyboard history runs once", async ({
  page,
}) => {
  await page.goto("/");
  const title = page.getByRole("textbox", {
    name: "Planner title",
    exact: true,
  });
  await expect(title).toHaveValue("My little weekly rhythm");
  await title.fill("First title edit");
  await title.fill("Second title edit");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.keyboard.press("Control+z");
  await expect(title).toHaveValue("First title edit");
  await page.keyboard.press("Control+Shift+z");
  await expect(title).toHaveValue("Second title edit");
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  const month = await page.locator(".week-navigation > span").textContent();
  await page
    .getByRole("button", { name: "Back to my schedules", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Little to-dos", exact: true })
    .click();
  await page.getByRole("button", { name: "Little wins", exact: true }).click();
  await page.getByRole("link", { name: "MochiPlan home", exact: true }).click();
  await expect(page.locator(".canvas-inner .view-monthly")).toBeVisible();
  await expect(page.locator(".week-navigation > span")).toHaveText(month!);
  await expect(title).toHaveValue("Second title edit");
  await page
    .getByRole("button", { name: "Back to my schedules", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Little to-dos", exact: true })
    .click();
  await expect(page.locator(".filter-pills > button.active")).toHaveText(
    "Little wins",
  );
  await page.getByRole("button", { name: "Add a to-do", exact: true }).click();
  await page.getByPlaceholder("Finish my moodboard").fill("Shared task dialog");
  await page.getByRole("button", { name: "Add my to-do", exact: true }).click();
  await page
    .getByRole("button", { name: "All my to-dos", exact: true })
    .click();
  await expect(
    page.locator(".task-row").filter({ hasText: "Shared task dialog" }),
  ).toHaveCount(1);
  await expect(page.locator(".connection-status")).toContainText(
    "All changes saved",
  );
});
