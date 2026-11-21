import { test, expect, type Browser, type Page } from "@playwright/test";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createApp } from "../../../backend/src/server.mjs";

const password = "original-account-management-password",
  nextPassword = "my-new-account-management-password";
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
async function device(browser: Browser, base: string, phone = false) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: phone
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    timezoneId: "Asia/Manila",
    userAgent: phone
      ? "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36"
      : "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  });
  await context.route("**/api/**", async (route) =>
    route.fulfill({
      response: await route.fetch({
        url: base + new URL(route.request().url()).pathname,
      }),
    }),
  );
  const page = await context.newPage();
  await page.goto("/");
  await settings(page);
  return { page, context };
}
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Profile settings", exact: true })
    .click();
  await expect(page.locator(".account-settings")).toBeVisible();
}
const profile = (page: Page) =>
  page.locator('.settings-grid input[maxlength="40"]');
async function synced(page: Page) {
  await expect(page.locator(".account-sync-status")).toContainText(
    "Your account plans are up to date.",
    { timeout: 15000 },
  );
}
async function register(page: Page, username: string) {
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const form = page.locator(".account-form");
  await form.getByLabel("Username", { exact: true }).fill(username);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create my account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I’ve saved my code", exact: true })
    .click();
  await settings(page);
  await synced(page);
}
async function login(page: Page, username: string, secret = password) {
  const form = page.locator(".account-form");
  await form.getByLabel("Username", { exact: true }).fill(username);
  await form.getByLabel("Password", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "Sign in and sync", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  await settings(page);
  await synced(page);
}
async function manage(page: Page) {
  await page
    .getByRole("button", { name: "Manage account", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Manage your account" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".account-session-row")).not.toHaveCount(0);
  return dialog;
}

test("signed-in devices can be reviewed and revoked from desktop and mobile", async ({
  browser,
}) => {
  const api = await backend(),
    computer = await device(browser, api.base),
    phone = await device(browser, api.base, true);
  try {
    await register(computer.page, "device_student");
    await login(phone.page, "device_student");
    const dialog = await manage(computer.page);
    await expect(dialog.locator(".account-session-row")).toHaveCount(2);
    await expect(dialog.locator(".account-current-device")).toHaveText(
      "This device",
    );
    await expect(
      dialog
        .locator(".account-session-row")
        .filter({ hasText: "Chrome on Windows" }),
    ).toContainText("This device");
    await expect(computer.page.locator(".modal-backdrop")).toHaveCSS(
      "opacity",
      "1",
    );
    await computer.page.screenshot({
      path: ".sites-runtime/account-devices-desktop.png",
    });
    await computer.page.setViewportSize({ width: 390, height: 844 });
    const size = await dialog.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
    await computer.page.screenshot({
      path: ".sites-runtime/account-devices-mobile.png",
    });
    const other = dialog
      .locator(".account-session-row")
      .filter({ hasText: "Chrome on Android" });
    await other.getByRole("button", { name: "Sign out", exact: true }).click();
    const confirm = dialog.getByRole("group", {
      name: "Confirm session sign-out",
    });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog.locator(".account-session-row")).toHaveCount(2);
    await other.getByRole("button", { name: "Sign out", exact: true }).click();
    await confirm
      .getByRole("button", { name: "Confirm sign out", exact: true })
      .click();
    await expect(dialog.locator(".account-session-row")).toHaveCount(1);
    await phone.page
      .getByRole("button", { name: "Sync now", exact: true })
      .click();
    await expect(phone.page.locator(".account-form")).toBeVisible();
    await expect(profile(phone.page)).toHaveValue("friend");
  } finally {
    await computer.context.close();
    await phone.context.close();
    await api.close();
  }
});

test("sign out all other devices keeps the current session usable", async ({
  browser,
}) => {
  const api = await backend(),
    current = await device(browser, api.base),
    other = await device(browser, api.base),
    third = await device(browser, api.base);
  try {
    await register(current.page, "revoke_student");
    await login(other.page, "revoke_student");
    await login(third.page, "revoke_student");
    const dialog = await manage(current.page);
    await expect(dialog.locator(".account-session-row")).toHaveCount(3);
    await dialog
      .getByRole("button", { name: "Sign out all other devices", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Confirm sign out", exact: true })
      .click();
    await expect(dialog.locator(".account-session-row")).toHaveCount(1);
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await current.page
      .getByRole("button", { name: "Sync now", exact: true })
      .click();
    await synced(current.page);
    await other.page
      .getByRole("button", { name: "Sync now", exact: true })
      .click();
    await expect(other.page.locator(".account-form")).toBeVisible();
    await third.page
      .getByRole("button", { name: "Sync now", exact: true })
      .click();
    await expect(third.page.locator(".account-form")).toBeVisible();
  } finally {
    await current.context.close();
    await other.context.close();
    await third.context.close();
    await api.close();
  }
});

test("changing a password validates input, rotates recovery and signs out other sessions without losing plans", async ({
  browser,
}) => {
  const api = await backend(),
    computer = await device(browser, api.base),
    phone = await device(browser, api.base);
  try {
    await register(computer.page, "password_student");
    await profile(computer.page).fill("Plans survive a password change");
    await computer.page
      .getByRole("button", { name: "Sync now", exact: true })
      .click();
    await synced(computer.page);
    await login(phone.page, "password_student");
    const dialog = await manage(computer.page);
    await dialog.getByRole("button", { name: "Password", exact: true }).click();
    const form = dialog.getByRole("form", { name: "Change password" });
    await form.getByLabel("Current password", { exact: true }).fill(password);
    await form.getByLabel("New password", { exact: true }).fill(nextPassword);
    await form
      .getByLabel("Confirm new password", { exact: true })
      .fill("a-non-matching-password");
    await form
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("do not match");
    await form
      .getByLabel("Confirm new password", { exact: true })
      .fill(nextPassword);
    await form
      .getByLabel("Current password", { exact: true })
      .fill("a-wrong-current-password");
    await form
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "current password is incorrect",
    );
    await form.getByLabel("Current password", { exact: true }).fill(password);
    await form
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(
      computer.page.getByRole("dialog", {
        name: "Keep your recovery code safe",
      }),
    ).toBeVisible();
    await computer.page
      .getByRole("button", { name: "I’ve saved my code", exact: true })
      .click();
    await synced(computer.page);
    await expect(profile(computer.page)).toHaveValue(
      "Plans survive a password change",
    );
    await phone.page
      .getByRole("button", { name: "Sync now", exact: true })
      .click();
    await expect(phone.page.locator(".account-form")).toBeVisible();
    await computer.page
      .getByRole("button", {
        name: "Sign out and open device-only plans",
        exact: true,
      })
      .click();
    await settings(computer.page);
    const signIn = computer.page.locator(".account-form");
    await signIn
      .getByLabel("Username", { exact: true })
      .fill("password_student");
    await signIn.getByLabel("Password", { exact: true }).fill(password);
    await signIn
      .getByRole("button", { name: "Sign in and sync", exact: true })
      .click();
    await expect(
      computer.page.locator(".account-settings").getByRole("alert"),
    ).toContainText("username or password is incorrect");
    await login(computer.page, "password_student", nextPassword);
    await expect(profile(computer.page)).toHaveValue(
      "Plans survive a password change",
    );
  } finally {
    await computer.context.close();
    await phone.context.close();
    await api.close();
  }
});

test("account deletion confirms identity, offers a backup and removes its local cache while keeping device-only plans", async ({
  browser,
}) => {
  const api = await backend(),
    current = await device(browser, api.base),
    page = current.page;
  try {
    await profile(page).fill("Separate device-only plans");
    await register(page, "delete_student");
    await profile(page).fill("Account plans to delete");
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await synced(page);
    const accountId = await page.evaluate(() =>
      localStorage.getItem("mochiplan-active-profile"),
    );
    const dialog = await manage(page);
    await dialog
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    const downloadEvent = page.waitForEvent("download");
    await dialog
      .getByRole("button", {
        name: "Download my account backup first",
        exact: true,
      })
      .click();
    const backup = await downloadEvent;
    const exported = JSON.parse(await readFile((await backup.path())!, "utf8"));
    expect(exported.data.preferences.name).toBe("Account plans to delete");
    const form = dialog.getByRole("form", { name: "Delete account" });
    await form.getByLabel("Current password", { exact: true }).fill(password);
    await form
      .getByLabel("Type your username to confirm", { exact: true })
      .fill("wrong");
    await expect(
      form.getByRole("button", { name: "Delete my account", exact: true }),
    ).toBeDisabled();
    await form
      .getByLabel("Type your username to confirm", { exact: true })
      .fill("delete_student");
    await form
      .getByLabel("Current password", { exact: true })
      .fill("a-wrong-current-password");
    await form
      .getByRole("button", { name: "Delete my account", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "current password is incorrect",
    );
    await form.getByLabel("Current password", { exact: true }).fill(password);
    await form
      .getByRole("button", { name: "Delete my account", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await settings(page);
    await expect(profile(page)).toHaveValue("Separate device-only plans");
    const remaining = await page.evaluate(async (id) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("mochiplan");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      async function record(store: string, key: string) {
        return new Promise((resolve, reject) => {
          const request = database
            .transaction(store)
            .objectStore(store)
            .get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
      }
      const result = {
        workspace: await record("state", `account:${id}`),
        sync: await record("sync", id!),
        metadata: localStorage.getItem(`mochiplan-account:${id}`),
      };
      database.close();
      return result;
    }, accountId);
    expect(remaining).toEqual({ workspace: null, sync: null, metadata: null });
    await page.reload();
    await settings(page);
    await expect(profile(page)).toHaveValue("Separate device-only plans");
    await expect(
      page.getByRole("button", { name: "Sign in and sync", exact: true }),
    ).toBeVisible();
  } finally {
    await current.context.close();
    await api.close();
  }
});
