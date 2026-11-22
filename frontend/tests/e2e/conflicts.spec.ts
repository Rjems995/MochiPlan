import { test, expect, type Browser, type Page } from "@playwright/test";
import { once } from "node:events";
import { createApp } from "../../../backend/src/server.mjs";
import { workspace } from "../../../backend/tests/fixture.mjs";

const password = "a-detailed-conflict-test-password";
async function backend() {
  const server = createApp({ databasePath: ":memory:" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
async function device(browser: Browser, base: string) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Manila",
  });
  let offline = false;
  await context.route("**/api/**", async (route) => {
    if (offline) return route.abort();
    const url = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({ url: base + url.pathname + url.search }),
    });
  });
  const page = await context.newPage();
  await page.goto("/");
  return {
    page,
    context,
    offline: async (value: boolean) => {
      offline = value;
      await context.setOffline(value);
    },
  };
}
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Profile settings", exact: true })
    .click();
  await expect(page.locator(".account-settings")).toBeVisible();
}
async function restore(page: Page, data: any) {
  await settings(page);
  await page
    .locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles({
      name: "conflict-plans.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 1, data })),
    });
  await page
    .getByRole("button", { name: "Restore my workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const request = indexedDB.open("mochiplan");
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const read = database
            .transaction("state")
            .objectStore("state")
            .getAll();
          return await new Promise<any[]>((resolve, reject) => {
            read.onsuccess = () =>
              resolve(read.result.map((record) => record.data));
            read.onerror = () => reject(read.error);
          });
        } finally {
          database.close();
        }
      }),
    )
    .toContainEqual(data);
}
async function synced(page: Page) {
  await expect(page.locator(".account-sync-status")).toContainText(
    "Your account plans are up to date.",
    { timeout: 15000 },
  );
}
async function accountSnapshot(page: Page, changeTask = false) {
  return page.evaluate(async (change) => {
    const session = await (await fetch("/api/account/session")).json();
    const headers = {
      "X-Mochi-Account": session.user.id,
      "X-Mochi-CSRF": session.csrfToken,
      "Content-Type": "application/json",
    };
    const result = await (
      await fetch("/api/sync/workspace", { headers })
    ).json();
    if (change) {
      result.data.tasks[0].title = "Account changed during review";
      const response = await fetch("/api/sync/workspace", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          version: 1,
          revision: result.revision,
          data: result.data,
        }),
      });
      if (!response.ok) throw Error("Test account edit failed.");
      return response.json();
    }
    return result;
  }, changeTask);
}
async function pair(browser: Browser, count = 2, deletion = false) {
  const api = await backend();
  let computer: Awaited<ReturnType<typeof device>> | undefined,
    phone: Awaited<ReturnType<typeof device>> | undefined;
  const close = async () => {
    await computer?.context.close();
    await phone?.context.close();
    await api.close();
  };
  try {
    computer = await device(browser, api.base);
    phone = await device(browser, api.base);
    const base = workspace(),
      original = base.schedules[0].entries[0];
    base.schedules[0].entries = Array.from(
      { length: count + 2 },
      (_, index) => ({
        ...original,
        id: `class-${index}`,
        title: `Seminar ${index + 1}`,
        day: index % 5,
      }),
    );
    await restore(computer.page, base);
    await settings(computer.page);
    await computer.page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    const register = computer.page.locator(".account-form");
    await register
      .getByLabel("Username", { exact: true })
      .fill("review_student");
    await register.getByLabel("Password", { exact: true }).fill(password);
    await computer.page
      .getByRole("button", { name: "Create my account", exact: true })
      .click();
    await computer.page
      .getByRole("button", { name: "I’ve saved my code", exact: true })
      .click();
    await settings(computer.page);
    await synced(computer.page);
    await settings(phone.page);
    const login = phone.page.locator(".account-form");
    await login.getByLabel("Username", { exact: true }).fill("review_student");
    await login.getByLabel("Password", { exact: true }).fill(password);
    await phone.page
      .getByRole("button", { name: "Sign in and sync", exact: true })
      .click();
    await expect(phone.page.locator(".account-form")).toHaveCount(0);
    await settings(phone.page);
    await synced(phone.page);
    await computer.offline(true);
    await phone.offline(true);
    const account = structuredClone(base),
      local = structuredClone(base);
    for (let index = 0; index < count; index++) {
      account.schedules[0].entries[index].title =
        `Account seminar ${index + 1}`;
      local.schedules[0].entries[index].title = `Phone seminar ${index + 1}`;
    }
    local.schedules[0].entries[0].cancelledDates = ["2026-11-23"];
    account.schedules[0].entries[0].cancelledDates = ["2026-11-30"];
    local.schedules[0].entries[count].notes = "Phone sketchbook notes";
    account.schedules[0].entries[count + 1].location = "Updated account room";
    local.tasks[0].done = true;
    local.preferences.name = "Phone profile";
    account.preferences.avatar = "🐱";
    if (deletion)
      local.schedules[0].entries = local.schedules[0].entries.filter(
        (entry) => entry.id !== "class-0",
      );
    await restore(computer.page, account);
    await restore(phone.page, local);
    await computer.offline(false);
    await settings(computer.page);
    await synced(computer.page);
    await phone.offline(false);
    await settings(phone.page);
    await phone.page
      .getByRole("button", { name: "Review sync conflict", exact: true })
      .click({ timeout: 15000 });
    const dialog = phone.page.getByRole("dialog", {
      name: "Bring your changes together",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const dismiss = phone.page.getByRole("button", {
      name: "Dismiss notification",
      exact: true,
    });
    if (await dismiss.count()) await dismiss.click();
    await expect(phone.page.locator(".toast")).toHaveCount(0);
    return { computer, phone, dialog, close, count };
  } catch (failure) {
    await close();
    throw failure;
  }
}

test("each activity conflict shows exact changes and independent choices preserve unrelated edits", async ({
  browser,
}) => {
  const current = await pair(browser);
  try {
    const { dialog, phone } = current,
      apply = dialog.getByRole("button", {
        name: "Apply reviewed changes",
        exact: true,
      });
    await expect(dialog.locator(".sync-conflict-card")).toHaveCount(2);
    await expect(apply).toBeDisabled();
    const first = dialog.locator(".sync-conflict-card").filter({
      has: phone.page.getByRole("heading", {
        name: "Seminar 1",
        exact: true,
      }),
    });
    const second = dialog.locator(".sync-conflict-card").filter({
      has: phone.page.getByRole("heading", {
        name: "Seminar 2",
        exact: true,
      }),
    });
    await expect(first).toContainText("Phone seminar 1");
    await expect(first).toContainText("Account seminar 1");
    await expect(first).toContainText("Nov 23, 2026");
    await expect(first).toContainText("Nov 30, 2026");
    await first
      .getByRole("radio", { name: "Use this device", exact: true })
      .check();
    await expect(apply).toBeDisabled();
    await second
      .getByRole("radio", { name: "Use account", exact: true })
      .check();
    await expect(apply).toBeEnabled();
    await dialog.locator(".sync-other-changes > summary").click();
    const automatic = dialog
      .locator(".sync-automatic-item")
      .filter({ hasText: "Seminar 3" });
    await automatic.locator("summary").click();
    await expect(
      automatic.getByText("Phone sketchbook notes", { exact: true }),
    ).toBeVisible();
    await dialog.evaluate((element) => {
      element.scrollTop = 0;
    });
    await phone.page.screenshot({
      path: ".sites-runtime/sync-review-desktop.png",
    });
    await phone.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await phone.page.screenshot({
      path: ".sites-runtime/sync-review-mobile.png",
    });
    await apply.click();
    await expect(dialog).toHaveCount(0);
    await synced(phone.page);
    const saved = (await accountSnapshot(phone.page)).data,
      entries = saved.schedules[0].entries;
    expect(saved.schedules).toHaveLength(1);
    expect(entries.find((entry: any) => entry.id === "class-0").title).toBe(
      "Phone seminar 1",
    );
    expect(
      entries.find((entry: any) => entry.id === "class-0").cancelledDates,
    ).toEqual(["2026-11-23"]);
    expect(entries.find((entry: any) => entry.id === "class-1").title).toBe(
      "Account seminar 2",
    );
    expect(entries.find((entry: any) => entry.id === "class-2").notes).toBe(
      "Phone sketchbook notes",
    );
    expect(entries.find((entry: any) => entry.id === "class-3").location).toBe(
      "Updated account room",
    );
    expect(saved.tasks[0].done).toBe(true);
    expect(saved.preferences.name).toBe("Phone profile");
    expect(saved.preferences.avatar).toBe("🐱");
  } finally {
    await current.close();
  }
});

test("account changes during review clear stale choices before any upload", async ({
  browser,
}) => {
  const current = await pair(browser, 1);
  try {
    const { dialog, phone, computer } = current;
    await dialog
      .getByRole("radio", { name: "Use this device", exact: true })
      .check();
    const changed = await accountSnapshot(computer.page, true);
    await dialog
      .getByRole("button", { name: "Apply reviewed changes", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "plans changed while you were reviewing",
    );
    await expect(
      dialog.getByRole("radio", { name: "Use this device", exact: true }),
    ).not.toBeChecked();
    await expect(
      dialog.getByRole("button", {
        name: "Apply reviewed changes",
        exact: true,
      }),
    ).toBeDisabled();
    expect((await accountSnapshot(computer.page)).revision).toBe(
      changed.revision,
    );
    await dialog
      .getByRole("radio", { name: "Use this device", exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Apply reviewed changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await synced(phone.page);
    const saved = (await accountSnapshot(phone.page)).data;
    expect(saved.tasks[0].title).toBe("Account changed during review");
    expect(saved.tasks[0].done).toBe(true);
  } finally {
    await current.close();
  }
});

test("conflict pages retain choices and bulk choices affect only unresolved items", async ({
  browser,
}) => {
  const current = await pair(browser, 6);
  try {
    const { dialog, phone } = current;
    await expect(dialog.locator(".sync-conflict-card")).toHaveCount(4);
    await dialog
      .locator(".sync-conflict-card")
      .first()
      .getByRole("radio", { name: "Keep both", exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Next conflicts", exact: true })
      .click();
    await expect(dialog.locator(".sync-conflict-card")).toHaveCount(2);
    await dialog
      .getByRole("button", { name: "Previous conflicts", exact: true })
      .click();
    await expect(
      dialog
        .locator(".sync-conflict-card")
        .first()
        .getByRole("radio", { name: "Keep both", exact: true }),
    ).toBeChecked();
    await dialog
      .getByRole("button", { name: "Use account for unresolved", exact: true })
      .click();
    await expect(
      dialog
        .locator(".sync-conflict-card")
        .first()
        .getByRole("radio", { name: "Keep both", exact: true }),
    ).toBeChecked();
    await expect(
      dialog.getByText("6 of 6 conflicts resolved", { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Apply reviewed changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await synced(phone.page);
    const saved = (await accountSnapshot(phone.page)).data;
    expect(saved.schedules).toHaveLength(1);
    expect(saved.schedules[0].entries).toHaveLength(9);
    expect(
      saved.schedules[0].entries.some(
        (entry: any) => entry.title === "Phone seminar 1",
      ),
    ).toBe(true);
    expect(
      saved.schedules[0].entries.some(
        (entry: any) => entry.title === "Account seminar 1",
      ),
    ).toBe(true);
  } finally {
    await current.close();
  }
});

test("delete-versus-edit review can remove just the selected activity", async ({
  browser,
}) => {
  const current = await pair(browser, 1, true);
  try {
    const { dialog, phone } = current;
    await expect(
      dialog.getByText("Deleted", { exact: true }).first(),
    ).toBeVisible();
    await dialog
      .getByRole("radio", { name: "Use this device", exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Apply reviewed changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await synced(phone.page);
    const saved = (await accountSnapshot(phone.page)).data;
    expect(saved.schedules[0].entries).toHaveLength(2);
    expect(
      saved.schedules[0].entries.some((entry: any) => entry.id === "class-0"),
    ).toBe(false);
    expect(saved.tasks[0].done).toBe(true);
  } finally {
    await current.close();
  }
});
