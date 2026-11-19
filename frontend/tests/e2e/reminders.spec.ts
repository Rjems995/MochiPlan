import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { once } from "node:events";
import { createECDH, randomBytes } from "node:crypto";
import { generateVAPIDKeys } from "web-push";
import { createApp } from "../../../backend/src/server.mjs";
import { loadPushConfig } from "../../../backend/src/push-config.mjs";
import { workspace } from "../../../backend/tests/fixture.mjs";

test.use({ timezoneId: "Asia/Manila" });
const config = loadPushConfig({
  subject: "mailto:test@example.com",
  ...generateVAPIDKeys(),
});
async function start(page: Page, context: BrowserContext, configured = true) {
  const received: { payload: any; subscription: any }[] = [];
  const syncedPlans: any[] = [];
  let now = Date.parse("2026-11-16T00:49:00Z");
  const server = createApp({
    databasePath: ":memory:",
    push: {
      config: configured ? config : { configured: false },
      intervalMs: 0,
      now: () => now,
      send: async (subscription: any, payload: any) => {
        received.push({ subscription, payload });
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  await context.route("**/api/**", async (route) => {
    if (
      route.request().method() === "PUT" &&
      route.request().url().includes("/api/push/devices/")
    )
      syncedPlans.push(route.request().postDataJSON().plan);
    await route.fulfill({
      response: await route.fetch({
        url: base + new URL(route.request().url()).pathname,
      }),
    });
  });
  await context.grantPermissions(["notifications"]);
  const curve = createECDH("prime256v1");
  curve.generateKeys();
  await context.addInitScript(
    ({ p256dh, auth }) => {
      if (!("PushManager" in window)) return;
      function subscription(value: any) {
        if (!value) return null;
        return {
          ...value,
          options: {},
          toJSON: () => value,
          unsubscribe: async () => {
            localStorage.removeItem("test-push-subscription");
            return true;
          },
        };
      }
      PushManager.prototype.getSubscription = async () =>
        subscription(
          JSON.parse(localStorage.getItem("test-push-subscription") || "null"),
        );
      PushManager.prototype.subscribe = async () => {
        const value = {
          endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`,
          expirationTime: null,
          keys: { p256dh, auth },
        };
        localStorage.setItem("test-push-subscription", JSON.stringify(value));
        return subscription(value);
      };
    },
    {
      p256dh: curve.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  );
  return {
    base,
    received,
    syncedPlans,
    server,
    advance: (ms: number) => (now += ms),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Profile settings", exact: true })
    .click();
  await expect(page.locator(".reminder-settings")).toBeVisible();
}
async function restoreFixture(page: Page, data = workspace()) {
  await page
    .locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles({
      name: "reminder-workspace.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 1, data })),
    });
  await page
    .getByRole("button", { name: "Restore my workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await settings(page);
}
async function device(page: Page) {
  return page.evaluate(() => ({
    key: localStorage.getItem("mochiplan-server-key"),
    id: JSON.parse(
      localStorage.getItem("mochiplan-background-reminders") || "null",
    ).deviceId,
  }));
}

test("server schedules a reminder with the app closed; the service worker displays and deduplicates push", async ({
  page,
  context,
}) => {
  const api = await start(page, context);
  try {
    await page.goto("/");
    await settings(page);
    await restoreFixture(page);
    await page
      .getByRole("button", { name: "Enable background reminders", exact: true })
      .click();
    await expect(page.locator(".reminder-device-status")).toContainText(
      "Background reminders are on",
    );
    await expect(page.locator(".reminder-sync-details")).toContainText(
      "Asia/Manila",
    );
    const identity = await device(page);
    // Keep only an about:blank inspection target; no MochiPlan document remains open.
    const inspector = await context.newPage(),
      cdp = await context.newCDPSession(inspector);
    let registrationId = "";
    cdp.on("ServiceWorker.workerRegistrationUpdated", (event) => {
      registrationId =
        event.registrations.find((r) => r.scopeURL === "http://127.0.0.1:4173/")
          ?.registrationId || registrationId;
    });
    await cdp.send("ServiceWorker.enable");
    await expect.poll(() => registrationId).not.toBe("");
    await page.close();
    api.advance(60000);
    await api.server.reminderScheduler.tick();
    expect(api.received).toHaveLength(1);
    const payload = api.received[0].payload;
    // Browser clock and scheduler clock differ in this test; preserve real payload data and give delivery a fresh TTL.
    payload.expiresAt = Date.now() + 120000;
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: "http://127.0.0.1:4173",
      registrationId,
      data: JSON.stringify(payload),
    });
    const reopened = await context.newPage();
    await reopened.goto("/");
    await expect
      .poll(() =>
        reopened.evaluate(async () =>
          (await (await navigator.serviceWorker.ready).getNotifications()).map(
            (n) => n.title,
          ),
        ),
      )
      .toContain("Coming up: Design principles");
    await reopened.evaluate(async () => {
      for (const notification of await (
        await navigator.serviceWorker.ready
      ).getNotifications())
        notification.close();
    });
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: "http://127.0.0.1:4173",
      registrationId,
      data: JSON.stringify(payload),
    });
    expect(
      await reopened.evaluate(
        async () =>
          (await (await navigator.serviceWorker.ready).getNotifications())
            .length,
      ),
    ).toBe(0);
    await reopened.goto(payload.url);
    await expect(
      reopened.locator('.canvas-inner .day-column[data-date="2026-11-16"]'),
    ).toBeVisible();
    await settings(reopened);
    await expect(
      reopened.getByRole("button", {
        name: "Turn off background reminders",
        exact: true,
      }),
    ).toBeVisible();
    const state = await (
      await fetch(`${api.base}/api/push/devices/${identity.id}`, {
        headers: { Authorization: `Bearer ${identity.key}` },
      })
    ).json();
    expect(state.lastSentAt).toBeTruthy();
    await cdp.detach();
    await inspector.close();
  } finally {
    await api.close();
  }
});

test("schedule changes and cancellations sync without automatic backups, and disabling removes the device", async ({
  page,
  context,
}) => {
  const api = await start(page, context);
  try {
    await page.goto("/");
    await settings(page);
    await restoreFixture(page);
    await page
      .getByRole("checkbox", { name: "Automatic server backups", exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Enable background reminders", exact: true })
      .click();
    await expect(page.locator(".reminder-device-status")).toContainText(
      "Background reminders are on",
    );
    await page
      .getByRole("combobox", { name: "Remind me before", exact: true })
      .selectOption("15");
    await expect.poll(() => api.syncedPlans.at(-1)?.minutes).toBe(15);
    await expect(page.locator(".reminder-device-status")).toContainText(
      "Background reminders are on",
    );
    const identity = await device(page),
      headers = { Authorization: `Bearer ${identity.key}` };
    const before = await (
      await fetch(`${api.base}/api/push/devices/${identity.id}`, { headers })
    ).json();
    const cancelled = workspace();
    cancelled.preferences.reminderMinutes = 15;
    cancelled.schedules[0].entries[0].cancelledDates = ["2026-11-16"];
    await restoreFixture(page, cancelled);
    await expect
      .poll(
        () => api.syncedPlans.at(-1)?.schedules[0].entries[0].cancelledDates,
      )
      .toEqual(["2026-11-16"]);
    await expect(page.locator(".reminder-device-status")).toContainText(
      "Background reminders are on",
    );
    await page
      .getByRole("button", { name: "Send a test reminder", exact: true })
      .click();
    await expect(page.locator(".toast")).toContainText(
      "Test reminder accepted",
    );
    expect(api.received).toHaveLength(1);
    await page
      .getByRole("button", {
        name: "Turn off background reminders",
        exact: true,
      })
      .click();
    await expect(page.locator(".reminder-device-status")).toContainText(
      "Background reminders are off",
    );
    expect(
      (
        await (
          await fetch(`${api.base}/api/push/devices/${identity.id}`, {
            headers,
          })
        ).json()
      ).enabled,
    ).toBe(false);
    expect(
      await page.evaluate(() => localStorage.getItem("test-push-subscription")),
    ).toBeNull();
    await page.reload();
    await settings(page);
    await expect(
      page.getByRole("button", {
        name: "Enable background reminders",
        exact: true,
      }),
    ).toBeEnabled();
    expect(before.enabled).toBe(true);
  } finally {
    await api.close();
  }
});

test("background reminder setup and controls fit mobile; unconfigured servers keep local reminders available", async ({
  page,
  context,
}) => {
  const api = await start(page, context, false);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await settings(page);
    const card = page.locator(".reminder-settings");
    await expect(card).toContainText("server needs background reminder setup");
    await expect(
      page.getByRole("button", {
        name: "Enable background reminders",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Enable gentle reminders",
        exact: true,
      }),
    ).toBeEnabled();
    const size = await card.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
    await expect(card.locator(".reminder-description").first()).toHaveCSS(
      "font-size",
      "16px",
    );
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: ".sites-runtime/reminders-mobile.png",
      fullPage: true,
    });
  } finally {
    await api.close();
  }
});

test("offline disabling unsubscribes immediately and cleans up the server after reconnecting", async ({
  page,
  context,
}) => {
  const api = await start(page, context);
  try {
    await page.goto("/");
    await settings(page);
    await page
      .getByRole("button", { name: "Enable background reminders", exact: true })
      .click();
    await expect(page.locator(".reminder-device-status")).toContainText(
      "Background reminders are on",
    );
    const identity = await device(page),
      headers = { Authorization: `Bearer ${identity.key}` };
    let offline = true;
    await context.route("**/api/push/**", (route) =>
      offline ? route.abort() : route.fallback(),
    );
    await context.setOffline(true);
    await page
      .getByRole("button", {
        name: "Turn off background reminders",
        exact: true,
      })
      .click();
    await expect(page.locator(".reminder-device-status")).toContainText(
      "Background reminders are off",
    );
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("test-push-subscription")),
      )
      .toBeNull();
    expect(
      (
        await (
          await fetch(`${api.base}/api/push/devices/${identity.id}`, {
            headers,
          })
        ).json()
      ).enabled,
    ).toBe(true);
    offline = false;
    await context.setOffline(false);
    await expect
      .poll(
        async () =>
          (
            await (
              await fetch(`${api.base}/api/push/devices/${identity.id}`, {
                headers,
              })
            ).json()
          ).enabled,
      )
      .toBe(false);
  } finally {
    await context.setOffline(false);
    await api.close();
  }
});

test("expired subscriptions reconnect without losing local plans", async ({
  page,
  context,
}) => {
  const api = await start(page, context);
  try {
    await page.goto("/");
    await settings(page);
    await page
      .locator('.settings-grid input[maxlength="40"]')
      .fill("My plans stay here");
    await page
      .getByRole("button", { name: "Enable background reminders", exact: true })
      .click();
    await expect(page.locator(".reminder-device-status")).toContainText(
      "Background reminders are on",
    );
    const original = await page.evaluate(() =>
      localStorage.getItem("test-push-subscription"),
    );
    api.server.reminderScheduler.send = async () => {
      throw Object.assign(Error("Expired"), { statusCode: 410 });
    };
    await page
      .getByRole("button", { name: "Send a test reminder", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Reconnect background reminders",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Reconnect background reminders",
        exact: true,
      })
      .click();
    await expect(page.locator(".reminder-device-status")).toContainText(
      "Background reminders are on",
    );
    expect(
      await page.evaluate(() => localStorage.getItem("test-push-subscription")),
    ).not.toBe(original);
    await expect(
      page.locator('.settings-grid input[maxlength="40"]'),
    ).toHaveValue("My plans stay here");
    const dismiss = page.getByRole("button", {
      name: "Dismiss notification",
      exact: true,
    });
    if (await dismiss.count()) await dismiss.click();
    await expect(page.locator(".toast")).toHaveCount(0);
    await page
      .locator(".reminder-settings")
      .screenshot({ path: ".sites-runtime/reminders-desktop.png" });
  } finally {
    await api.close();
  }
});
