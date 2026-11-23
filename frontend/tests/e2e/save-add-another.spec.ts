import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { clickPlannerAction } from "./helpers/plannerToolbar";

test.use({ timezoneId: "Asia/Manila", hasTouch: true });
const paper = (page: Page) => page.locator(".canvas-inner .schedule-paper");
const nameField = (dialog: Locator) =>
  dialog.getByPlaceholder("e.g. Design principles");
const saveAnother = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Save and add another", exact: true });
async function add(page: Page) {
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  return page.getByRole("dialog", {
    name: "Add a little activity",
    exact: true,
  });
}
async function backup(page: Page) {
  await page
    .getByRole("button", { name: "Profile settings", exact: true })
    .click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download a full backup", exact: true })
    .click();
  const saved = JSON.parse(
    await readFile((await (await downloading).path())!, "utf8"),
  );
  return saved.data.schedules.find(
    (schedule: any) => schedule.id === saved.data.activeId,
  ).entries;
}
async function times(dialog: Locator, start: string, end: string) {
  await dialog.getByLabel("Starts at", { exact: true }).fill(start);
  await dialog.getByLabel("Finishes at", { exact: true }).fill(end);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
]) {
  test(`${viewport.name} adds classes continuously offline, reuses scheduling choices, and saves each batch separately`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(paper(page)).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    await expect(paper(page)).toBeVisible();
    const dialog = await add(page);
    await nameField(dialog).fill("Sketchbook class");
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const button = dialog.getByRole("button", { name: day, exact: true });
      const selected = (await button.getAttribute("aria-pressed")) === "true";
      if (selected !== ["Mon", "Wed"].includes(day)) await button.click();
    }
    await times(dialog, "12:00", "13:00");
    await dialog
      .getByLabel("Custom activity color", { exact: true })
      .fill("#4f75a8");
    await dialog
      .getByRole("button", { name: "More details", exact: true })
      .click();
    await dialog
      .getByLabel("Room or location", { exact: true })
      .fill("First class room");
    await dialog.getByLabel("Instructor", { exact: true }).fill("Prof. Mochi");
    await dialog
      .getByRole("textbox", { name: "Little notes", exact: true })
      .fill("Bring the first class workbook.");
    await saveAnother(dialog).focus();
    await saveAnother(dialog).press("Enter");
    await expect(dialog).toBeVisible();
    await expect(nameField(dialog)).toHaveValue("");
    await expect(nameField(dialog)).toBeFocused();
    await expect(nameField(dialog)).toBeInViewport();
    await expect(dialog.getByRole("status")).toContainText("Activity added.");
    await expect(
      dialog.getByRole("button", { name: "Mon", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("button", { name: "Wed", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByLabel("Starts at", { exact: true })).toHaveValue(
      "12:00",
    );
    await expect(dialog.getByLabel("Finishes at", { exact: true })).toHaveValue(
      "13:00",
    );
    await expect(
      dialog.getByLabel("Custom activity color", { exact: true }),
    ).toHaveValue("#4f75a8");
    await expect(
      dialog.getByRole("combobox", {
        name: "Activity recurrence",
        exact: true,
      }),
    ).toHaveValue("weekly");
    await expect(
      dialog.getByRole("button", { name: "More details", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      dialog.getByLabel("Room or location", { exact: true }),
    ).toHaveValue("");
    await expect(dialog.getByLabel("Instructor", { exact: true })).toHaveValue(
      "",
    );
    await dialog
      .getByRole("button", { name: "More details", exact: true })
      .click();
    await expect(
      dialog.getByRole("textbox", { name: "Little notes", exact: true }),
    ).toHaveValue("");
    await dialog
      .getByRole("button", { name: "More details", exact: true })
      .click();
    await nameField(dialog).fill("Reading seminar");
    await times(dialog, "14:00", "15:00");
    if (viewport.name === "mobile") await saveAnother(dialog).tap();
    else await saveAnother(dialog).click();
    await expect(dialog.getByRole("status")).toContainText(
      "2 activities added.",
    );
    await expect(nameField(dialog)).toBeFocused();
    await expect(saveAnother(dialog)).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Add activity", exact: true }),
    ).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Done", exact: true }),
    ).toBeVisible();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await dialog.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: `.sites-runtime/save-add-another-${viewport.name}.png`,
      style: ".toast { visibility: hidden !important; }",
    });
    await nameField(dialog).fill("French conversation");
    await times(dialog, "16:00", "17:00");
    await nameField(dialog).press("Enter");
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Week", exact: true }).click();
    const third = paper(page)
      .locator(".schedule-block")
      .filter({ hasText: "French conversation" });
    await expect(third).toHaveCount(2);
    await clickPlannerAction(page, "Undo");
    await expect(third).toHaveCount(0);
    await expect(
      paper(page)
        .locator(".schedule-block")
        .filter({ hasText: "Reading seminar" }),
    ).toHaveCount(2);
    await clickPlannerAction(page, "Redo");
    await expect(third).toHaveCount(2);
    await page
      .getByRole("button", { name: "Profile settings", exact: true })
      .click();
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await page.goto("/");
    await expect(paper(page)).toBeVisible();
    const entries = (await backup(page)).filter((entry: any) =>
      ["Sketchbook class", "Reading seminar", "French conversation"].includes(
        entry.title,
      ),
    );
    expect(entries).toHaveLength(6);
    expect(new Set(entries.map((entry: any) => entry.id)).size).toBe(6);
    for (const entry of entries) {
      expect(entry.color).toBe("#4f75a8");
      expect([0, 2]).toContain(entry.day);
      expect(entry.date).toBeUndefined();
      expect(entry.location).toBe(
        entry.title === "Sketchbook class" ? "First class room" : "",
      );
      expect(entry.instructor).toBe(
        entry.title === "Sketchbook class" ? "Prof. Mochi" : "",
      );
      expect(entry.notes).toBe(
        entry.title === "Sketchbook class"
          ? "Bring the first class workbook."
          : "",
      );
    }
  });
}

test("dated batches retain the event date, validate without clearing drafts and finish with Done", async ({
  page,
}) => {
  await page.goto("/");
  await expect(paper(page)).toBeVisible();
  const dialog = await add(page);
  await nameField(dialog).fill("Studio exam");
  await dialog
    .getByRole("combobox", { name: "Activity recurrence", exact: true })
    .selectOption("once");
  await dialog.getByLabel("Event date", { exact: true }).fill("2026-12-17");
  await times(dialog, "12:00", "13:00");
  await saveAnother(dialog).click();
  await expect(
    dialog.getByRole("combobox", { name: "Activity recurrence", exact: true }),
  ).toHaveValue("once");
  await expect(dialog.getByLabel("Event date", { exact: true })).toHaveValue(
    "2026-12-17",
  );
  await nameField(dialog).fill("   ");
  await saveAnother(dialog).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Give your activity a name",
  );
  await expect(dialog.getByRole("status")).toContainText("Activity added.");
  await nameField(dialog).fill("Portfolio review");
  await dialog.getByLabel("Finishes at", { exact: true }).fill("11:00");
  await saveAnother(dialog).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "end time needs to be after",
  );
  await expect(nameField(dialog)).toHaveValue("Portfolio review");
  await dialog.getByLabel("Event date", { exact: true }).fill("2026-12-18");
  await dialog.getByLabel("Finishes at", { exact: true }).fill("13:00");
  await saveAnother(dialog).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText("2 activities added.");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await paper(page)
    .locator(".schedule-block")
    .filter({ hasText: "Portfolio review" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Save and add another", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  const entries = (await backup(page)).filter((entry: any) =>
    ["Studio exam", "Portfolio review"].includes(entry.title),
  );
  expect(entries).toHaveLength(2);
  expect(entries.map((entry: any) => entry.date)).toEqual([
    "2026-12-17",
    "2026-12-18",
  ]);
});

test("cancelling the next draft retains completed saves and a fresh form starts empty", async ({
  page,
}) => {
  await page.goto("/");
  await expect(paper(page)).toBeVisible();
  let dialog = await add(page);
  await nameField(dialog).fill("Saved workshop");
  await times(dialog, "12:00", "13:00");
  await saveAnother(dialog).click();
  await nameField(dialog).fill("Unfinished class");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  dialog = await add(page);
  await expect(nameField(dialog)).toHaveValue("");
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const entries = await backup(page);
  expect(
    entries.filter((entry: any) => entry.title === "Saved workshop"),
  ).toHaveLength(1);
  expect(
    entries.filter((entry: any) => entry.title === "Unfinished class"),
  ).toHaveLength(0);
});
