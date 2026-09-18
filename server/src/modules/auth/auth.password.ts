import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedPasswordHash: string) {
  const [salt, storedHash] = storedPasswordHash.split(":");

  if (!salt || !storedHash) {
    return false;
  }

  const storedKey = Buffer.from(storedHash, "hex");
  const derivedKey = (await scryptAsync(password, salt, storedKey.length)) as Buffer;

  return timingSafeEqual(storedKey, derivedKey);
}
