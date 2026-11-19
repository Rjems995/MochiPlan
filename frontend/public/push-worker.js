/* Loaded by the generated service worker; offline caching stays managed by Workbox. */
(() => {
  function safeURL(value) {
    try {
      const url = new URL(value || "/", self.location.origin);
      return url.origin === self.location.origin
        ? url.href
        : self.location.origin + "/";
    } catch {
      return self.location.origin + "/";
    }
  }
  async function claim(id) {
    return new Promise((resolve) => {
      const request = indexedDB.open("mochiplan-reminder-delivery", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("seen", { keyPath: "id" });
      request.onerror = () => resolve(true);
      request.onsuccess = () => {
        const db = request.result,
          transaction = db.transaction("seen", "readwrite"),
          store = transaction.objectStore("seen");
        let fresh = true;
        const add = store.add({ id, at: Date.now() });
        add.onerror = (event) => {
          event.preventDefault();
          event.stopPropagation();
          fresh = false;
        };
        // Keep a month of delivery IDs without retaining planner contents.
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (item) {
            if (item.value.at < Date.now() - 30 * 86400000) item.delete();
            item.continue();
          }
        };
        transaction.oncomplete = () => {
          db.close();
          resolve(fresh);
        };
        transaction.onabort = () => {
          db.close();
          resolve(true);
        };
      };
    });
  }
  async function forget(id) {
    return new Promise((resolve) => {
      const request = indexedDB.open("mochiplan-reminder-delivery", 1);
      request.onerror = () => resolve();
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("seen")) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction("seen", "readwrite");
        tx.objectStore("seen").delete(id);
        tx.oncomplete = tx.onabort = () => {
          db.close();
          resolve();
        };
      };
    });
  }
  async function show(payload) {
    if (
      !payload ||
      payload.type !== "mochi-reminder" ||
      typeof payload.id !== "string" ||
      payload.id.length > 200
    )
      return;
    if (Number.isFinite(payload.expiresAt) && payload.expiresAt < Date.now())
      return;
    if (!(await claim(payload.id))) return;
    try {
      await self.registration.showNotification(
        String(payload.title || "A little MochiPlan reminder").slice(0, 150),
        {
          body: String(
            payload.body || "Your next activity is coming up.",
          ).slice(0, 500),
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: `mochi-${payload.id}`,
          renotify: false,
          data: { url: safeURL(payload.url) },
        },
      );
    } catch (error) {
      await forget(payload.id);
      throw error;
    }
  }
  self.addEventListener("push", (event) => {
    let payload;
    try {
      payload = event.data?.json();
    } catch {
      payload = null;
    }
    event.waitUntil(show(payload));
  });
  self.addEventListener("message", (event) => {
    if (event.data?.type !== "MOCHI_LOCAL_REMINDER") return;
    event.waitUntil(
      show(event.data.payload).then(
        () => event.ports[0]?.postMessage({ ok: true }),
        () => event.ports[0]?.postMessage({ ok: false }),
      ),
    );
  });
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = safeURL(event.notification.data?.url);
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        const client = clients.find(
          (c) => new URL(c.url).origin === self.location.origin,
        );
        if (client) {
          await client.focus();
          client.postMessage({ type: "MOCHI_OPEN_REMINDER", url });
        } else await self.clients.openWindow(url);
      })(),
    );
  });
  self.addEventListener("pushsubscriptionchange", (event) => {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "MOCHI_PUSH_CHANGED" }),
        );
      }),
    );
  });
})();
