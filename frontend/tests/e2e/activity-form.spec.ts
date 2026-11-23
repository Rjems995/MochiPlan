import { test, expect, type Page, type Locator } from "@playwright/test";

test.use({ timezoneId: "Asia/Manila" });
const paper = (page: Page) => page.locator(".canvas-inner .schedule-paper");
async function openActivity(page: Page, title: string) {
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await paper(page)
    .locator(".schedule-block")
    .filter({ hasText: title })
    .first()
    .click();
  return page.getByRole("dialog", { name: "A little edit", exact: true });
}
async function snapshot(page: Page, dialog: Locator, name: string) {
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element
        .closest(".modal-backdrop")!
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: `.sites-runtime/activity-form-${name}.png`,
    style: ".toast { visibility: hidden !important; }",
  });
}

for (const viewport of [
  { name: "small-phone", width: 320, height: 568 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`${viewport.name} keeps activity details optional and preserves them through collapsed edits and offline reloads`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(paper(page)).toBeVisible();
    await page
      .getByRole("button", { name: "Add activity", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "Add a little activity",
      exact: true,
    });
    const name = dialog.getByPlaceholder("e.g. Design principles");
    await expect(name).toBeFocused();
    await name.fill("Sketchbook time");
    const days = dialog.getByRole("group", {
      name: "On these days",
      exact: true,
    });
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const button = days.getByRole("button", { name: day, exact: true });
      const selected = (await button.getAttribute("aria-pressed")) === "true";
      if (selected !== ["Mon", "Wed"].includes(day)) await button.click();
    }
    await dialog.getByLabel("Starts at", { exact: true }).fill("12:00");
    await dialog.getByLabel("Finishes at", { exact: true }).fill("13:00");
    let more = dialog.getByRole("button", {
      name: "More details",
      exact: true,
    });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(more).toHaveAccessibleDescription("Optional");
    for (const label of ["Room or location", "Instructor", "Little notes"])
      await expect(dialog.getByLabel(label, { exact: true })).toBeHidden();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await snapshot(page, dialog, viewport.name);
    await more.focus();
    await more.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await dialog
      .getByLabel("Room or location", { exact: true })
      .fill("Art studio 204");
    await dialog.getByLabel("Instructor", { exact: true }).fill("Prof. Mochi");
    await dialog
      .getByRole("textbox", { name: "Little notes", exact: true })
      .fill("Bring a sketchbook and pencils.");
    await expect(more).toHaveAccessibleDescription("3 details added");
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await more.focus();
    await more.press("Space");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(
      dialog.getByLabel("Room or location", { exact: true }),
    ).toHaveValue("Art studio 204");
    await dialog
      .getByRole("button", { name: "Add activity", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    dialog = await openActivity(page, "Sketchbook time");
    more = dialog.getByRole("button", { name: "More details", exact: true });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(more).toHaveAccessibleDescription("3 details added");
    await expect(
      dialog.getByPlaceholder("e.g. Design principles"),
    ).toBeFocused();
    await dialog
      .getByPlaceholder("e.g. Design principles")
      .fill("A little sketch hour");
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect(page.locator(".connection-status")).toContainText(
      "All changes saved",
    );
    await context.setOffline(true);
    await page.reload();
    await expect(paper(page)).toBeVisible();
    dialog = await openActivity(page, "A little sketch hour");
    more = dialog.getByRole("button", { name: "More details", exact: true });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await expect(
      dialog.getByLabel("Room or location", { exact: true }),
    ).toHaveValue("Art studio 204");
    await expect(dialog.getByLabel("Instructor", { exact: true })).toHaveValue(
      "Prof. Mochi",
    );
    await expect(
      dialog.getByRole("textbox", { name: "Little notes", exact: true }),
    ).toHaveValue("Bring a sketchbook and pencils.");
    await dialog
      .getByLabel("Room or location", { exact: true })
      .fill("Unsaved room change");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    dialog = await openActivity(page, "A little sketch hour");
    await dialog
      .getByRole("button", { name: "More details", exact: true })
      .click();
    await expect(
      dialog.getByLabel("Room or location", { exact: true }),
    ).toHaveValue("Art studio 204");
  });
}
