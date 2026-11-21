import { test, expect, type Browser, type Page } from "@playwright/test";
import { once } from "node:events";
import { createApp } from "../../../backend/src/server.mjs";
import { workspace } from "../../../backend/tests/fixture.mjs";

const password = "my-private-planner-link-password";
async function backend() {
  let now = Date.now();
  const server = createApp({
    databasePath: ":memory:",
    shareOptions: { now: () => now },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    advance: (time: number) => {
      now += time;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
async function device(browser: Browser, base: string, phone = false) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: phone
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    timezoneId: "Asia/Manila",
  });
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({ url: base + url.pathname + url.search }),
    });
  });
  return { context, page: await context.newPage() };
}
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Profile settings", exact: true })
    .click();
}
async function sharing(page: Page) {
  await page
    .getByRole("button", { name: /^(Back to my schedules|My schedules)$/ })
    .first()
    .click();
  await page.locator(".schedule-card-preview").first().click();
  await page
    .getByRole("button", { name: "Share planner", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Share this planner" });
  await expect(dialog.getByText("Loading shared links…")).toHaveCount(0);
  return dialog;
}
async function restore(page: Page, data = workspace()) {
  await settings(page);
  data.schedules[0].termStart = "2026-11-16";
  data.schedules[0].termEnd = "2026-11-20";
  await page
    .locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles({
      name: "share-fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 1, data })),
    });
  await page
    .getByRole("button", { name: "Restore my workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function createLink(page: Page, protectedLink = false) {
  const dialog = await sharing(page);
  if (protectedLink) {
    await dialog
      .getByRole("combobox", { name: "Who can view", exact: true })
      .selectOption("password");
    await dialog.getByLabel("Link password", { exact: true }).fill(password);
  }
  await dialog
    .getByRole("button", { name: "Create read-only link", exact: true })
    .click();
  const field = dialog
    .getByRole("textbox", { name: "Read-only planner link" })
    .first();
  await expect(field).toBeVisible();
  return { dialog, url: await field.inputValue() };
}

test("shared snapshots are private by default, read-only, update explicitly, and preserve the recipient workspace", async ({
  browser,
}) => {
  const api = await backend(),
    owner = await device(browser, api.base),
    recipient = await device(browser, api.base);
  try {
    await owner.page.goto("/");
    await restore(owner.page);
    const { dialog, url } = await createLink(owner.page);
    await recipient.page.goto("/");
    await settings(recipient.page);
    const profile = recipient.page.locator(
      '.settings-grid input[maxlength="40"]',
    );
    await profile.fill("Recipient’s own plans");
    await expect(
      recipient.page.getByText("All changes saved", { exact: true }).first(),
    ).toBeVisible();
    const appRequests: string[] = [];
    recipient.page.on("request", (request) => {
      if (/\/api\/(account|workspace|push)/.test(request.url()))
        appRequests.push(request.url());
    });
    await recipient.page.goto(url);
    await expect(recipient.page.locator(".shared-heading h1")).toHaveText(
      "Spring semester",
    );
    await expect(recipient.page.locator(".schedule-block")).toContainText(
      "Design principles",
    );
    await expect(
      recipient.page.getByRole("button", { name: "Add activity", exact: true }),
    ).toHaveCount(0);
    await expect(recipient.page.getByRole("slider")).toHaveCount(0);
    await expect(
      recipient.page.getByRole("button", { name: /Design principles/ }),
    ).toHaveCount(0);
    await recipient.page
      .getByRole("button", { name: "List", exact: true })
      .click();
    await expect(recipient.page.locator(".list-activity")).toContainText(
      "Design principles",
    );
    await expect(recipient.page.locator(".shared-canvas")).not.toContainText(
      "Studio 204",
    );
    await expect(recipient.page.locator(".shared-canvas")).not.toContainText(
      "Bring a sketchbook",
    );
    expect(appRequests).toEqual([]);
    await dialog
      .getByRole("button", { name: "Edit link", exact: true })
      .click();
    await dialog.getByLabel("Locations", { exact: true }).check();
    await dialog.getByLabel("Instructors and notes", { exact: true }).check();
    await recipient.page
      .getByRole("button", { name: "Refresh planner", exact: true })
      .click();
    await expect(recipient.page.locator(".shared-canvas")).not.toContainText(
      "Studio 204",
    );
    await dialog
      .getByRole("button", { name: "Update shared copy", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Shared copy updated",
    );
    await recipient.page
      .getByRole("button", { name: "Refresh planner", exact: true })
      .click();
    await expect(recipient.page.locator(".shared-canvas")).toContainText(
      "Studio 204",
    );
    await expect(recipient.page.locator(".shared-canvas")).toContainText(
      "Bring a sketchbook",
    );
    await dialog
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Keep link", exact: true })
      .click();
    await expect(
      dialog.getByRole("textbox", { name: "Read-only planner link" }),
    ).toHaveCount(1);
    await dialog
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Confirm revoke", exact: true })
      .click();
    await expect(
      dialog.getByRole("textbox", { name: "Read-only planner link" }),
    ).toHaveCount(0);
    await recipient.page
      .getByRole("button", { name: "Refresh planner", exact: true })
      .click();
    await expect(recipient.page.getByRole("alert")).toContainText(
      "expired or been revoked",
    );
    await expect(recipient.page.locator(".schedule-paper")).toHaveCount(0);
    await recipient.page.goto("/");
    await settings(recipient.page);
    await expect(profile).toHaveValue("Recipient’s own plans");
  } finally {
    await owner.context.close();
    await recipient.context.close();
    await api.close();
  }
});

test("protected viewers require a password, lose access after rotation and expiration, and never cache API snapshots", async ({
  browser,
}) => {
  const api = await backend(),
    owner = await device(browser, api.base),
    recipient = await device(browser, api.base);
  try {
    await owner.page.goto("/");
    const { dialog, url } = await createLink(owner.page, true);
    await recipient.page.goto(url);
    await expect(
      recipient.page.getByLabel("Link password", { exact: true }),
    ).toBeVisible();
    await expect(recipient.page.locator(".schedule-paper")).toHaveCount(0);
    await recipient.page
      .getByLabel("Link password", { exact: true })
      .fill("wrong password");
    await recipient.page
      .getByRole("button", { name: "View planner", exact: true })
      .click();
    await expect(recipient.page.getByRole("alert")).toContainText("incorrect");
    await recipient.page
      .getByLabel("Link password", { exact: true })
      .fill(password);
    await recipient.page
      .getByRole("button", { name: "View planner", exact: true })
      .click();
    await expect(recipient.page.locator(".schedule-paper")).toBeVisible();
    await dialog
      .getByRole("button", { name: "Edit link", exact: true })
      .click();
    await dialog
      .getByLabel("Link password", { exact: true })
      .fill("a-new-link-only-secret-password");
    await dialog
      .getByRole("button", { name: "Update shared copy", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Shared copy updated",
    );
    await recipient.page
      .getByRole("button", { name: "Refresh planner", exact: true })
      .click();
    await expect(
      recipient.page.getByLabel("Link password", { exact: true }),
    ).toBeVisible();
    await recipient.page
      .getByLabel("Link password", { exact: true })
      .fill("a-new-link-only-secret-password");
    await recipient.page
      .getByRole("button", { name: "View planner", exact: true })
      .click();
    await expect(recipient.page.locator(".schedule-paper")).toBeVisible();
    const cached = await recipient.page.evaluate(async () =>
      (
        await Promise.all(
          (await caches.keys()).map(async (name) =>
            (await (await caches.open(name)).keys()).map(
              (request) => request.url,
            ),
          ),
        )
      ).flat(),
    );
    expect(cached.some((url) => url.includes("/api/shared-planner"))).toBe(
      false,
    );
    expect(
      await recipient.page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).not.toContain("secret-password");
    api.advance(8 * 86400000);
    await recipient.page
      .getByRole("button", { name: "Refresh planner", exact: true })
      .click();
    await expect(recipient.page.getByRole("alert")).toContainText(
      "expired or been revoked",
    );
  } finally {
    await owner.context.close();
    await recipient.context.close();
    await api.close();
  }
});

test("sharing controls and the standalone viewer fit desktop and phone screens; public views fail closed offline", async ({
  browser,
}) => {
  const api = await backend(),
    owner = await device(browser, api.base),
    recipient = await device(browser, api.base);
  try {
    await owner.page.goto("/");
    const { dialog, url } = await createLink(owner.page);
    await dialog.screenshot({
      path: ".sites-runtime/sharing-dialog-desktop.png",
    });
    await recipient.page.goto(url);
    await expect(recipient.page.locator(".schedule-paper")).toBeVisible();
    await recipient.page.screenshot({
      path: ".sites-runtime/shared-planner-desktop.png",
    });
    await owner.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await dialog.screenshot({
      path: ".sites-runtime/sharing-dialog-mobile.png",
    });
    await recipient.page.setViewportSize({ width: 390, height: 844 });
    await recipient.page
      .getByRole("button", { name: "Day", exact: true })
      .click();
    // Friday displays a useful daily preview even when tests run on the weekend.
    for (
      let attempts = 0;
      attempts < 7 &&
      !(await recipient.page.locator(".schedule-block").count());
      attempts++
    ) {
      await recipient.page
        .getByRole("button", { name: "Previous period", exact: true })
        .click();
    }
    expect(
      await recipient.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await recipient.page.screenshot({
      path: ".sites-runtime/shared-planner-mobile.png",
    });
    await recipient.page.route("**/api/shared-planner", (route) =>
      route.abort(),
    );
    await recipient.page
      .getByRole("button", { name: "Refresh planner", exact: true })
      .click();
    await expect(recipient.page.getByRole("alert")).toContainText(
      "Connect to the MochiPlan server",
    );
    await expect(recipient.page.locator(".schedule-paper")).toHaveCount(0);
  } finally {
    await owner.context.close();
    await recipient.context.close();
    await api.close();
  }
});

test("Settings can revoke saved links after their local planner is replaced", async ({
  browser,
}) => {
  const api = await backend(),
    owner = await device(browser, api.base),
    recipient = await device(browser, api.base);
  try {
    await owner.page.goto("/");
    const { dialog, url } = await createLink(owner.page);
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const imported = workspace();
    imported.schedules[0].name = "Imported planner";
    await restore(owner.page, imported);
    await settings(owner.page);
    await owner.page
      .getByRole("button", { name: "Manage shared links", exact: true })
      .click();
    const manager = owner.page.getByRole("dialog", {
      name: "Manage shared links",
      exact: true,
    });
    await expect(manager.locator(".share-planner-name")).toHaveText(
      "Spring semester",
    );
    await manager
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    await manager
      .getByRole("button", { name: "Confirm revoke", exact: true })
      .click();
    await expect(manager.getByRole("status")).toContainText("Link revoked");
    await recipient.page.goto(url);
    await expect(recipient.page.getByRole("alert")).toContainText(
      "expired or been revoked",
    );
  } finally {
    await owner.context.close();
    await recipient.context.close();
    await api.close();
  }
});
