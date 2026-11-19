import { randomUUID } from "node:crypto";
import { dueReminders } from "./reminder-plan.mjs";
import { HttpError } from "./errors.mjs";

export class ReminderScheduler {
  constructor(
    store,
    {
      config = { configured: false },
      send,
      now = Date.now,
      intervalMs = 15000,
    } = {},
  ) {
    this.store = store;
    this.config = config;
    this.send = send;
    this.now = now;
    this.intervalMs = intervalMs;
    this.running = null;
    this.closed = false;
    this.timer = null;
  }
  start() {
    if (!this.config.configured || !this.intervalMs) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }
  stop() {
    this.closed = true;
    clearInterval(this.timer);
  }
  tick() {
    if (this.closed || !this.config.configured) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.run()
      .catch(() => {
        /* Durable jobs retry on the next tick; never expose subscription secrets in logs. */
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }
  async run() {
    const now = this.now();
    this.store.prune(now);
    for (const device of this.store.devices()) {
      if (this.closed) return;
      this.store.enqueue(device, dueReminders(JSON.parse(device.plan), now));
    }
    // Bound a tick so subscription failures cannot monopolize the server.
    for (let i = 0; i < 50 && !this.closed; i++) {
      const job = this.store.claim(this.now());
      if (!job) break;
      let error;
      try {
        await this.send(JSON.parse(job.subscription), JSON.parse(job.payload), {
          TTL: Math.max(
            0,
            Math.min(120, Math.floor((job.expires_at - this.now()) / 1000)),
          ),
          topic: job.id.slice(0, 32),
        });
      } catch (failure) {
        error = failure;
      }
      if (this.closed) return;
      this.store.finish(job, this.now(), error);
    }
  }
  async test(key, id) {
    if (!this.config.configured)
      throw new HttpError(
        503,
        "Background reminders are not configured on this server yet.",
      );
    const device = this.store.testSlot(key, id, this.now());
    try {
      await this.send(
        JSON.parse(device.subscription),
        {
          type: "mochi-reminder",
          id: `test-${randomUUID()}`,
          title: "A little nudge from MochiPlan",
          body: "Background reminders are ready on this device.",
          url: "/",
          expiresAt: this.now() + 120000,
        },
        { TTL: 120 },
      );
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) {
        this.store.expire(key, id);
        throw new HttpError(
          410,
          "This push subscription expired. Reconnect background reminders on this device.",
        );
      }
      throw new HttpError(
        502,
        "The push service could not accept the test reminder. Reconnect reminders if this continues.",
      );
    }
    return { version: 1, accepted: true };
  }
}
