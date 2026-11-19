import * as webpush from "web-push";
import { createECDH } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function loadPushConfig({
  subject,
  keyPath,
  publicKey,
  privateKey,
} = {}) {
  if (!subject) return { configured: false, publicKey: null };
  let contact;
  try {
    contact = new URL(subject);
  } catch {
    throw Error("VAPID_SUBJECT must be a mailto: contact or public HTTPS URL.");
  }
  if (!(
    (contact.protocol === "mailto:" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.pathname)) ||
    (contact.protocol === "https:" && contact.hostname !== "localhost")
  ))
    throw Error("VAPID_SUBJECT must be a mailto: contact or public HTTPS URL.");
  if (!!publicKey !== !!privateKey)
    throw Error("Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, or neither.");
  if (!publicKey) {
    if (!keyPath) throw Error("A persistent VAPID key path is required.");
    mkdirSync(dirname(keyPath), { recursive: true });
    try {
      ({ publicKey, privateKey } = JSON.parse(readFileSync(keyPath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT")
        throw Error("The saved push keys could not be read.");
      const keys = webpush.generateVAPIDKeys();
      try {
        writeFileSync(keyPath, JSON.stringify(keys), {
          flag: "wx",
          mode: 0o600,
        });
      } catch (writeError) {
        if (writeError.code !== "EEXIST") throw writeError;
      }
      ({ publicKey, privateKey } = JSON.parse(readFileSync(keyPath, "utf8")));
    }
  }
  try {
    const key = createECDH("prime256v1");
    key.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (key.getPublicKey().toString("base64url") !== publicKey) throw Error();
  } catch {
    throw Error("The VAPID key pair is invalid.");
  }
  return {
    configured: true,
    publicKey,
    vapidDetails: { subject, publicKey, privateKey },
  };
}
export function createPushSender(config) {
  return (subscription, payload, options = {}) =>
    webpush.sendNotification(subscription, JSON.stringify(payload), {
      vapidDetails: config.vapidDetails,
      timeout: 10000,
      urgency: "high",
      TTL: 120,
      ...options,
    });
}
