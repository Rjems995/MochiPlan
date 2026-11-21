import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./errors.mjs";

const derive = promisify(scrypt);
let hashing = 0;
export function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function passwordHash(
  password,
  salt = randomBytes(16).toString("hex"),
) {
  if (hashing >= 2)
    throw new HttpError(
      503,
      "Password verification is busy. Try again in a moment.",
    );
  hashing++;
  try {
    const result = await derive(password, salt, 32, {
      N: 131072,
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    });
    return { salt, hash: result.toString("hex") };
  } finally {
    hashing--;
  }
}
