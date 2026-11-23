import { expect, type Page } from "@playwright/test";

export async function openPlannerMore(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Planner actions",
    exact: true,
  });
  if (!(await dialog.isVisible()))
    await page
      .getByRole("button", { name: "More planner actions", exact: true })
      .click();
  return dialog;
}

export async function clickPlannerAction(page: Page, name: string) {
  await expect(page.locator(".studio-toolbar")).toBeVisible();
  const more = page.getByRole("button", {
    name: "More planner actions",
    exact: true,
  });
  if (await more.isVisible()) {
    const dialog = await openPlannerMore(page);
    await dialog.getByRole("button", { name, exact: true }).click();
  } else {
    await page.getByRole("button", { name, exact: true }).click();
  }
}
