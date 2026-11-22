import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { once } from "node:events";
import { createApp } from "../../../backend/src/server.mjs";

const password = "a-long-offline-test-password";
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
async function device(browser: Browser, base: string, mobile = false) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    timezoneId: "Asia/Manila",
  });
  let offline = false;
  await context.route("**/api/**", async (route) => {
    if (offline) return route.abort();
    await route.fulfill({
      response: await route.fetch({
        url: base + new URL(route.request().url()).pathname,
      }),
    });
  });
  const page = await context.newPage();
  await page.goto("/");
  await settings(page);
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
const profile = (page: Page) =>
  page.locator('.settings-grid input[maxlength="40"]');
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
  const dialog = page.getByRole("dialog", {
    name: "Keep your recovery code safe",
  });
  await expect(dialog).toBeVisible();
  const code = await dialog.locator("code").innerText();
  await dialog
    .getByRole("button", { name: "I’ve saved my code", exact: true })
    .click();
  await settings(page);
  await synced(page);
  return code;
}
async function login(page: Page, username: string, secret = password) {
  const form = page.locator(".account-form");
  await form.getByLabel("Username", { exact: true }).fill(username);
  await form.getByLabel("Password", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "Sign in and sync", exact: true })
    .click();
  await expect(page.locator(".account-form")).toHaveCount(0);
  await settings(page);
  await synced(page);
}
async function synced(page: Page) {
  await expect(page.locator(".account-sync-status")).toContainText(
    "Your account plans are up to date.",
    { timeout: 15000 },
  );
}
async function syncNow(page: Page) {
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await synced(page);
}

test("phone and computer merge offline edits, survive an offline reload, and retain device choices", async ({
  browser,
}) => {
  const api = await backend(),
    computer = await device(browser, api.base),
    phone = await device(browser, api.base, true);
  try {
    await profile(computer.page).fill("Device-only computer plans");
    await register(computer.page, "shared_student");
    await login(phone.page, "shared_student");
    await expect(profile(phone.page)).toHaveValue("Device-only computer plans");
    await phone.page
      .getByRole("combobox", { name: "Remind me before", exact: true })
      .selectOption("30");
    await phone.offline(true);
    await profile(phone.page).fill("Edited offline on phone");
    await expect(phone.page.locator(".connection-status")).toContainText(
      "Offline",
    );
    await phone.page.reload();
    await settings(phone.page);
    await expect(profile(phone.page)).toHaveValue("Edited offline on phone");
    await computer.page
      .getByRole("button", { name: "Little to-dos", exact: true })
      .click();
    await computer.page
      .getByRole("button", { name: "Add a to-do", exact: true })
      .click();
    await computer.page
      .getByPlaceholder("Finish my moodboard")
      .fill("Added from computer");
    await computer.page
      .getByRole("button", { name: "Add my to-do", exact: true })
      .click();
    await settings(computer.page);
    await syncNow(computer.page);
    await phone.offline(false);
    await synced(phone.page);
    await expect(profile(phone.page)).toHaveValue("Edited offline on phone");
    await expect(
      phone.page.getByRole("combobox", {
        name: "Remind me before",
        exact: true,
      }),
    ).toHaveValue("30");
    await syncNow(computer.page);
    await expect(profile(computer.page)).toHaveValue("Edited offline on phone");
    await expect(
      computer.page.getByRole("combobox", {
        name: "Remind me before",
        exact: true,
      }),
    ).toHaveValue("10");
    await phone.page
      .getByRole("button", { name: "To-dos", exact: true })
      .click();
    await expect(
      phone.page
        .locator(".task-row")
        .filter({ hasText: "Added from computer" }),
    ).toHaveCount(1);
    const cookies = await phone.context.cookies();
    expect(
      cookies.find((cookie) => cookie.name === "mochiplan_session")?.httpOnly,
    ).toBe(true);
    expect(
      await phone.page.evaluate(() =>
        document.cookie.includes("mochiplan_session"),
      ),
    ).toBe(false);
  } finally {
    await computer.context.close();
    await phone.context.close();
    await api.close();
  }
});

test("overlapping class edits pause sync and keep-both preserves both activities in one planner", async ({
  browser,
}) => {
  const api = await backend(),
    computer = await device(browser, api.base),
    phone = await device(browser, api.base);
  async function editClass(page: Page, title: string) {
    await page.goto("/");
    await page
      .locator(".canvas-inner .schedule-block")
      .filter({ hasText: "Design principles" })
      .first()
      .click();
    await page
      .getByRole("radio", { name: "Entire series", exact: true })
      .check();
    await page.getByPlaceholder("e.g. Design principles").fill(title);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await settings(page);
  }
  try {
    await register(computer.page, "conflict_student");
    await login(phone.page, "conflict_student");
    await computer.offline(true);
    await phone.offline(true);
    await editClass(computer.page, "Computer studio");
    await editClass(phone.page, "Phone studio");
    await computer.offline(false);
    await synced(computer.page);
    await phone.offline(false);
    await expect(
      phone.page.getByRole("button", {
        name: "Review sync conflict",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await phone.page
      .getByRole("button", { name: "Review sync conflict", exact: true })
      .click();
    const dialog = phone.page.getByRole("dialog", {
      name: "Bring your changes together",
    });
    await expect(dialog).toBeVisible();
    await expect(phone.page.locator(".modal-backdrop")).toHaveCSS(
      "opacity",
      "1",
    );
    await phone.page.screenshot({
      path: ".sites-runtime/account-conflict-desktop.png",
    });
    await phone.page.setViewportSize({ width: 390, height: 844 });
    const size = await dialog.evaluate((el) => ({
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
    await phone.page.screenshot({
      path: ".sites-runtime/account-conflict-mobile.png",
    });
    await dialog.getByRole("radio", { name: "Keep both", exact: true }).check();
    await dialog
      .getByRole("button", { name: "Apply reviewed changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await synced(phone.page);
    await phone.page.goto("/");
    await expect(
      phone.page
        .getByRole("combobox", { name: "Active planner", exact: true })
        .locator("option"),
    ).toHaveCount(1);
    await phone.page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(
      phone.page
        .locator(".canvas-inner .schedule-block")
        .filter({ hasText: "Phone studio" })
        .first(),
    ).toBeVisible();
  } finally {
    await computer.context.close();
    await phone.context.close();
    await api.close();
  }
});

test("signing out restores device-only plans and separates different account caches", async ({
  browser,
}) => {
  const api = await backend(),
    deviceOne = await device(browser, api.base),
    page = deviceOne.page;
  try {
    await profile(page).fill("Private device-only plans");
    await register(page, "first_account");
    await profile(page).fill("First account plans");
    await syncNow(page);
    await page
      .getByRole("button", {
        name: "Sign out and open device-only plans",
        exact: true,
      })
      .click();
    await settings(page);
    await expect(profile(page)).toHaveValue("Private device-only plans");
    await register(page, "second_account");
    await expect(profile(page)).toHaveValue("Private device-only plans");
    await profile(page).fill("Second account plans");
    await syncNow(page);
    await page
      .getByRole("button", {
        name: "Sign out and open device-only plans",
        exact: true,
      })
      .click();
    await settings(page);
    await expect(profile(page)).toHaveValue("Private device-only plans");
    await login(page, "first_account");
    await expect(profile(page)).toHaveValue("First account plans");
  } finally {
    await deviceOne.context.close();
    await api.close();
  }
});

test("recovery resets the password and keeps saved account plans", async ({
  browser,
}) => {
  const api = await backend(),
    first = await device(browser, api.base),
    page = first.page;
  try {
    const code = await register(page, "recovery_student");
    await profile(page).fill("Account plans survive recovery");
    await syncNow(page);
    await page
      .getByRole("button", {
        name: "Sign out and open device-only plans",
        exact: true,
      })
      .click();
    await settings(page);
    await page
      .getByRole("button", { name: "Recover account", exact: true })
      .click();
    const form = page.locator(".account-form");
    await form.getByLabel("Username", { exact: true }).fill("recovery_student");
    await form.getByLabel("Recovery code", { exact: true }).fill(code);
    await form
      .getByLabel("New password", { exact: true })
      .fill("a-new-recovered-password");
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Keep your recovery code safe",
    });
    await expect(dialog).toBeVisible();
    expect(await dialog.locator("code").innerText()).not.toBe(code);
    await dialog
      .getByRole("button", { name: "I’ve saved my code", exact: true })
      .click();
    await settings(page);
    await synced(page);
    await expect(profile(page)).toHaveValue("Account plans survive recovery");
    await page
      .locator(".account-settings")
      .screenshot({ path: ".sites-runtime/account-settings-desktop.png" });
  } finally {
    await first.context.close();
    await api.close();
  }
});
