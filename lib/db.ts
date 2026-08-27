import { MongoClient, Db, Collection, ObjectId } from "mongodb";
import type {
  Currency,
  InviteStatus,
  NotificationKind,
  Phase,
  PlanStatus,
  TxnType,
} from "./types";

// ── Mongo-side document shapes (ObjectId ids; Date timestamps). ──────────────
// The repository layer maps these to the string-id API types in ./types.

export interface UserDoc {
  _id: string; // anchor-auth `sub`
  email: string;
  displayName: string;
  displayNameSet: boolean;
  color: string;
  displayCurrency: Currency;
  lastSeenAt: Date | null;
  isAdmin: boolean;
  /** Read-only account: may view, but not change data. Absent = active. */
  suspended?: boolean;
  createdAt: Date;
}

export interface BusinessDoc {
  _id: ObjectId;
  name: string;
  parentId: ObjectId | null;
  phase: Phase;
  phaseNotes: string;
  ownerId: string | null;
  memberIds: string[];
  createdBy: string;
  createdAt: Date;
}

export interface TransactionDoc {
  _id: ObjectId;
  businessId: ObjectId;
  type: TxnType;
  date: string;
  label: string;
  amount: number;
  currency: Currency;
  fxRate: number;
  notes: string;
  createdBy: string;
  createdAt: Date;
}

export interface PlanDoc {
  _id: ObjectId;
  businessId: ObjectId;
  title: string;
  description: string;
  startDate: string;
  targetDate: string;
  status: PlanStatus;
  createdBy: string;
  createdAt: Date;
}

export interface InviteDoc {
  _id: ObjectId;
  businessId: ObjectId;
  inviterId: string;
  inviteeId: string;
  status: InviteStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface NotificationDoc {
  _id: ObjectId;
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  businessId: ObjectId | null;
  createdById: string;
  createdAt: Date;
  seen: boolean;
}

export interface MentionStateDoc {
  _id: ObjectId;
  entityType: string;
  entityId: string;
  field: string;
  userId: string;
  notifiedAt: Date;
}

export interface SettingsDoc {
  _id: string;
  fxJmdPerUsd: number;
}

export interface EventDoc {
  _id: ObjectId;
  actorId: string;
  action: string; // e.g. "created business", "added income"
  detail: string;
  businessId: ObjectId | null;
  createdAt: Date;
}

// ── Lazy, HMR-safe singleton client. Only connects when first queried, so
// `next build` doesn't need a live Mongo. ───────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function clientPromise(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    global._mongoClientPromise = new MongoClient(uri).connect();
  }
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB || "tracker");
}

export const col = {
  users: async () => (await getDb()).collection<UserDoc>("users"),
  businesses: async () => (await getDb()).collection<BusinessDoc>("businesses"),
  transactions: async () =>
    (await getDb()).collection<TransactionDoc>("transactions"),
  plans: async () => (await getDb()).collection<PlanDoc>("plans"),
  invites: async () => (await getDb()).collection<InviteDoc>("invites"),
  notifications: async () =>
    (await getDb()).collection<NotificationDoc>("notifications"),
  mentionState: async () =>
    (await getDb()).collection<MentionStateDoc>("mentionState"),
  settings: async () => (await getDb()).collection<SettingsDoc>("settings"),
  events: async () => (await getDb()).collection<EventDoc>("events"),
};

export function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// Idempotent index creation. Run once at startup (or on demand).
let _indexed = false;
export async function ensureIndexes(): Promise<void> {
  if (_indexed) return;
  const db = await getDb();
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ displayName: 1 }, { unique: true }),
    db.collection("businesses").createIndex({ parentId: 1, name: 1 }),
    db.collection("businesses").createIndex({ ownerId: 1 }),
    db.collection("businesses").createIndex({ memberIds: 1 }),
    db.collection("transactions").createIndex({ businessId: 1, date: -1 }),
    db.collection("transactions").createIndex({ businessId: 1, type: 1 }),
    db.collection("plans").createIndex({ businessId: 1 }),
    db.collection("invites").createIndex(
      { businessId: 1, inviteeId: 1 },
      { unique: true, partialFilterExpression: { status: "pending" } },
    ),
    db.collection("invites").createIndex({ inviteeId: 1, status: 1 }),
    db.collection("invites").createIndex({ inviterId: 1, status: 1 }),
    db.collection("notifications").createIndex({ recipientId: 1, seen: 1 }),
    db
      .collection("notifications")
      .createIndex({ recipientId: 1, createdAt: -1 }),
    db.collection("mentionState").createIndex(
      { entityType: 1, entityId: 1, field: 1, userId: 1 },
      { unique: true },
    ),
    db.collection("events").createIndex({ createdAt: -1 }),
  ]);
  _indexed = true;
}
