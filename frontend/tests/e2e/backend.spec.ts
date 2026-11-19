import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { createApp } from "../../../backend/src/server.mjs";

test("server backup saves and restores through the real backend without changing local saves", async ({
  page,
}) => {
  const server = createApp({ databasePath: ":memory:" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.route("**/api/workspace**", async (route) => {
      const response = await route.fetch({
        url: base + new URL(route.request().url()).pathname,
      });
      await route.fulfill({ response });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Back to my schedules" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const profile = page.locator('.settings-grid input[maxlength="40"]');
    const original = await profile.inputValue();
    await page
      .getByRole("button", { name: "Save a server backup", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Server backup saved." }),
    ).toBeVisible();
    await profile.fill("Changed after the backup");
    await page
      .getByRole("button", { name: "Restore from server", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Bring back your little workspace?",
    );
    await page
      .getByRole("button", { name: "Restore my workspace", exact: true })
      .click();
    await page.getByRole("button", { name: "Back to my schedules" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(profile).toHaveValue(original);
    await page.unroute("**/api/workspace**");
    await page.route("**/api/workspace**", (route) => route.abort());
    await profile.fill("Still saved locally");
    await page
      .getByRole("button", { name: "Save a server backup", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Your local plans are safe." }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Back to my schedules" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(profile).toHaveValue("Still saved locally");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
  }
});
