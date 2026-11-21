import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(
  new URL("../public/push-worker.js", import.meta.url),
  "utf8",
);
async function click(clients) {
  const handlers = new Map(),
    opened = [];
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://mochi.test" },
      addEventListener: (name, handler) => handlers.set(name, handler),
      clients: {
        matchAll: async () => clients,
        openWindow: async (url) => opened.push(url),
      },
    },
  });
  let work;
  handlers.get("notificationclick")({
    notification: {
      close() {},
      data: { url: "/?task=reading&profile=device" },
    },
    waitUntil: (promise) => {
      work = promise;
    },
  });
  await work;
  return opened;
}
test("a task notification opens the workspace when only a read-only planner tab is open", async () => {
  let focused = false;
  const opened = await click([
    {
      url: "https://mochi.test/share/#a-private-view-token",
      focus: async () => {
        focused = true;
      },
      postMessage: () =>
        assert.fail("Shared viewers must not receive task navigation."),
    },
  ]);
  assert.equal(focused, false);
  assert.deepEqual(opened, ["https://mochi.test/?task=reading&profile=device"]);
});
test("a task notification reuses the workspace while leaving a shared planner tab untouched", async () => {
  const messages = [];
  let focused = false;
  const opened = await click([
    {
      url: "https://mochi.test/share/",
      focus: async () => assert.fail("Do not focus the shared view."),
      postMessage: () => assert.fail("Do not message the shared view."),
    },
    {
      url: "https://mochi.test/",
      focus: async () => {
        focused = true;
      },
      postMessage: (message) => messages.push(message),
    },
  ]);
  assert.equal(focused, true);
  assert.deepEqual(opened, []);
  assert.equal(messages[0].type, "MOCHI_OPEN_REMINDER");
  assert.equal(
    messages[0].url,
    "https://mochi.test/?task=reading&profile=device",
  );
});
