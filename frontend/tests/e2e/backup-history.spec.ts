import { test, expect, type Page } from "@playwright/test";
import { once } from "node:events";
import { createApp } from "../../../backend/src/server.mjs";

async function backend(page: Page) {
  const server = createApp({ databasePath: ":memory:" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  let requests = 0;
  await page.route("**/api/workspace**", async (route) => {
    if (route.request().method() === "PUT") requests++;
    await route.fulfill({
      response: await route.fetch({
        url: base + new URL(route.request().url()).pathname,
      }),
    });
  });
  return {
    base,
    writes: () => requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Back to my schedules" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator(".backup-settings")).toBeVisible();
}
const profile = (page: Page) =>
  page.locator('.settings-grid input[maxlength="40"]');
const backupStatus = (page: Page) => page.locator(".backup-status");

test("automatic backups show success, keep history and protect current edits during a restore", async ({
  page,
}) => {
  const api = await backend(page);
  try {
    await page.clock.install();
    await page.goto("/");
    await settings(page);
    await profile(page).fill("First automatic version");
    await page.clock.fastForward(4000);
    await expect(backupStatus(page)).toContainText(
      "Your latest changes are backed up.",
    );
    await expect(page.locator(".backup-last-success time")).toBeVisible();
    const firstTime = await page
      .locator(".backup-last-success time")
      .getAttribute("datetime");
    await profile(page).fill("Second automatic version");
    await page.clock.fastForward(65000);
    await expect(backupStatus(page)).toContainText(
      "Your latest changes are backed up.",
    );
    expect(api.writes()).toBe(2);
    await profile(page).fill("Current unsaved-on-server changes");
    await page
      .getByRole("button", { name: "Backup history", exact: true })
      .click();
    await expect(page.locator(".backup-version-list > li")).toHaveCount(2);
    await expect(page.locator(".backup-version-list")).toContainText(
      "Automatic backup",
    );
    await page
      .getByRole("button", { name: "Restore version 1", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Server version 1");
    await page
      .getByRole("button", { name: "Restore my workspace", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await settings(page);
    await expect(profile(page)).toHaveValue("First automatic version");
    await page
      .getByRole("button", { name: "Backup history", exact: true })
      .click();
    await expect(page.locator(".backup-version-list > li")).toHaveCount(4);
    await expect(page.locator(".backup-version-list")).toContainText(
      "Before a restore",
    );
    await expect(page.locator(".backup-version-list")).toContainText(
      "Restored workspace",
    );
    await expect(
      page.locator(`.backup-version-list time[datetime="${firstTime}"]`),
    ).toBeVisible();
    // The local safety copy is restorable even when the server cannot be reached.
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.unroute("**/api/workspace**");
    await page.route("**/api/workspace**", (route) => route.abort());
    await page
      .getByRole("button", { name: "Backup history", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Your local plans are safe.",
    );
    await page
      .getByRole("button", { name: "Restore safety copy", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Restore my workspace", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await settings(page);
    await expect(profile(page)).toHaveValue(
      "Current unsaved-on-server changes",
    );
  } finally {
    await api.close();
  }
});

test("automatic backup preference and last success survive reloads; failed saves retry", async ({
  page,
}) => {
  const api = await backend(page);
  try {
    await page.goto("/");
    await settings(page);
    await page
      .getByRole("checkbox", { name: "Automatic server backups", exact: true })
      .uncheck();
    await profile(page).fill("Automatic backups off");
    expect(api.writes()).toBe(0);
    await page
      .getByRole("button", { name: "Save a server backup", exact: true })
      .click();
    await expect(page.locator(".backup-last-success time")).toBeVisible();
    const successTime = await page
      .locator(".backup-last-success time")
      .getAttribute("datetime");
    await page.reload();
    await settings(page);
    await expect(
      page.getByRole("checkbox", {
        name: "Automatic server backups",
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(page.locator(".backup-last-success time")).toHaveAttribute(
      "datetime",
      successTime!,
    );
    await page.clock.install();
    let fail = true;
    await page.route("**/api/workspace**", async (route) => {
      if (fail) return route.abort();
      await route.fallback();
    });
    await page
      .getByRole("checkbox", { name: "Automatic server backups", exact: true })
      .check();
    await profile(page).fill("Retry these edits");
    await page.clock.fastForward(4000);
    await expect(backupStatus(page)).toContainText("Backup delayed.");
    await expect(page.locator(".backup-last-success time")).toHaveAttribute(
      "datetime",
      successTime!,
    );
    fail = false;
    await page
      .getByRole("button", { name: "Retry backup", exact: true })
      .click();
    await page.clock.fastForward(4000);
    await expect(backupStatus(page)).toContainText(
      "Your latest changes are backed up.",
    );
    expect(api.writes()).toBe(2);
  } finally {
    await api.close();
  }
});

test("newer server versions pause automation and stale restore confirmations preserve local edits", async ({
  page,
}) => {
  const api = await backend(page);
  try {
    await page.clock.install();
    await page.goto("/");
    await settings(page);
    await page.clock.fastForward(4000);
    await expect(backupStatus(page)).toContainText(
      "Your latest changes are backed up.",
    );
    const key = await page.evaluate(() =>
      localStorage.getItem("mochiplan-server-key"),
    );
    const headers = {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };
    const current = await (
      await fetch(api.base + "/api/workspace", { headers })
    ).json();
    current.data.preferences.name = "External server version";
    await fetch(api.base + "/api/workspace", {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...current, source: "manual" }),
    });
    await profile(page).fill("Keep my local edits");
    await page.clock.fastForward(65000);
    await expect(backupStatus(page)).toContainText(
      "Automatic backups are paused.",
    );
    await page
      .getByRole("button", { name: "Restore from server", exact: true })
      .click();
    current.revision = 2;
    current.data.preferences.name = "A newer external version";
    await fetch(api.base + "/api/workspace", {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...current, source: "manual" }),
    });
    await page
      .getByRole("button", { name: "Restore my workspace", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "A different server backup exists." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(profile(page)).toHaveValue("Keep my local edits");
    expect(api.writes()).toBe(1);
  } finally {
    await api.close();
  }
});

test("backup history remains readable on phones and supports keyboard navigation", async ({
  page,
}) => {
  const api = await backend(page);
  try {
    await page.goto("/");
    await settings(page);
    await page
      .getByRole("checkbox", { name: "Automatic server backups", exact: true })
      .uncheck();
    for (const name of [
      "Before changes",
      "Updated plans",
      "Ready for the week",
    ]) {
      await profile(page).fill(name);
      await page
        .getByRole("button", { name: "Save a server backup", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Save a server backup", exact: true }),
      ).toBeEnabled();
    }
    await page
      .getByRole("button", { name: "Backup history", exact: true })
      .click();
    await expect(page.locator(".backup-version-list > li")).toHaveCount(3);
    await expect(page.locator(".modal-backdrop")).toHaveCSS("opacity", "1");
    await expect(
      page.getByRole("button", { name: "Close dialog", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: ".sites-runtime/backup-history-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeInViewport();
    const sizes = await dialog.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.width);
    await expect(
      page.locator(".backup-version-title strong").first(),
    ).toHaveCSS("font-size", "16px");
    await page.screenshot({ path: ".sites-runtime/backup-history-mobile.png" });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  } finally {
    await api.close();
  }
});
