import { col, type UserDoc } from "@/lib/db";
import { colorFor, isOnline } from "@/lib/util";
import type { Currency, PublicUser } from "@/lib/types";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Only pre-designated admin emails may self-sign-up (bootstrap). Everyone else
 * is created by an admin. */
export function isAdminEmail(email: string): boolean {
  return adminEmails().includes((email || "").toLowerCase());
}

function baseName(email: string): string {
  const local = email.split("@")[0] || "user";
  const cleaned = local.replace(/[^A-Za-z0-9 ]/g, " ").trim() || "user";
  // Title-case the first token so "@lamar" reads nicely by default.
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function uniqueDisplayName(base: string): Promise<string> {
  const users = await col.users();
  let candidate = base;
  let n = 1;
  // Try base, base2, base3 … until free.
  while (await users.findOne({ displayName: candidate })) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

/** Ensure a tracker user exists for this auth identity; keep email/admin fresh. */
export async function upsertUserOnLogin(
  sub: string,
  email: string,
): Promise<UserDoc> {
  const users = await col.users();
  const lower = (email || "").toLowerCase();
  const admin = adminEmails().includes(lower);
  const existing = await users.findOne({ _id: sub });
  if (existing) {
    const isAdmin = existing.isAdmin || admin;
    if (existing.email !== lower || existing.isAdmin !== isAdmin) {
      await users.updateOne({ _id: sub }, { $set: { email: lower, isAdmin } });
    }
    return { ...existing, email: lower, isAdmin };
  }
  const displayName = await uniqueDisplayName(baseName(lower));
  const doc: UserDoc = {
    _id: sub,
    email: lower,
    displayName,
    displayNameSet: false,
    color: colorFor(displayName),
    displayCurrency: "USD",
    lastSeenAt: new Date(),
    isAdmin: admin,
    createdAt: new Date(),
  };
  await users.insertOne(doc);
  return doc;
}

export async function getUser(sub: string): Promise<UserDoc | null> {
  return (await col.users()).findOne({ _id: sub });
}

export async function listUsers(): Promise<UserDoc[]> {
  return (await col.users()).find().sort({ displayName: 1 }).toArray();
}

/** Users for a specific set of subs (e.g. the members of one business). */
export async function listUsersByIds(ids: string[]): Promise<UserDoc[]> {
  if (!ids.length) return [];
  return (await col.users())
    .find({ _id: { $in: ids } })
    .sort({ displayName: 1 })
    .toArray();
}

export async function setDisplayName(
  sub: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, error: "Name too short" };
  if (trimmed.includes("@")) return { ok: false, error: "No @ in names" };
  const users = await col.users();
  const clash = await users.findOne({ displayName: trimmed, _id: { $ne: sub } });
  if (clash) return { ok: false, error: "That name is taken" };
  await users.updateOne(
    { _id: sub },
    { $set: { displayName: trimmed, displayNameSet: true, color: colorFor(trimmed) } },
  );
  return { ok: true };
}

export async function setDisplayCurrency(sub: string, currency: Currency) {
  await (await col.users()).updateOne(
    { _id: sub },
    { $set: { displayCurrency: currency } },
  );
}

export async function touchPresence(sub: string) {
  await (await col.users()).updateOne(
    { _id: sub },
    { $set: { lastSeenAt: new Date() } },
  );
}

export function toPublicUser(u: UserDoc): PublicUser {
  return {
    id: u._id,
    email: u.email,
    displayName: u.displayName,
    displayNameSet: u.displayNameSet,
    color: u.color,
    displayCurrency: u.displayCurrency,
    isAdmin: u.isAdmin,
    online: isOnline(u.lastSeenAt ? u.lastSeenAt.toISOString() : null),
  };
}
