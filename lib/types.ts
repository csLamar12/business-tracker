// Shared domain types + constants, ported from the desktop app's db.py.

export const CURRENCIES = ["USD", "JMD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_FX_RATE = 157.0; // JMD per 1 USD

export const PHASES = [
  "Ideation",
  "Launch",
  "Growth",
  "Scaling",
  "Maintenance",
  "Wind-down",
] as const;
export type Phase = (typeof PHASES)[number];

export const PLAN_STATUSES = [
  "Not Started",
  "In Progress",
  "Done",
  "On Hold",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export type TxnType = "income" | "expense";

export type NotificationKind = "mention" | "invite" | "invite_accepted" | "access_granted";
export type InviteStatus = "pending" | "accepted" | "declined";

// ── Stored documents (Mongo). ids are strings in the API layer. ──────────────

export interface TrackerUser {
  _id: string; // anchor-auth `sub`
  email: string;
  displayName: string;
  displayNameSet: boolean; // false until the user confirms a name at first login
  color: string;
  displayCurrency: Currency;
  lastSeenAt: string | null; // ISO
  isAdmin: boolean;
  createdAt: string;
}

export interface Business {
  _id: string;
  name: string;
  parentId: string | null;
  phase: Phase;
  phaseNotes: string;
  ownerId: string | null; // null on subsidiaries
  memberIds: string[]; // root only
  createdBy: string;
  createdAt: string;
}

export interface Transaction {
  _id: string;
  businessId: string;
  type: TxnType;
  date: string; // YYYY-MM-DD
  label: string; // source (income) / category (expense)
  amount: number;
  currency: Currency;
  fxRate: number; // locked at creation
  notes: string;
  createdBy: string;
  createdAt: string;
  /** Set when this row came from a recurring rule. */
  recurrenceId?: string | null;
  /** Generated but not yet confirmed — excluded from totals until ticked. */
  pending?: boolean;
  /** Scheduled instant, ISO. Carries the time for sub-daily periods. */
  occurrenceAt?: string | null;
}

export interface Recurrence {
  _id: string;
  businessId: string;
  type: TxnType;
  label: string;
  amount: number;
  currency: Currency;
  fxRate: number;
  notes: string;
  period: "hourly" | "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  startDate: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface Plan {
  _id: string;
  businessId: string;
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD or "" — goal to start
  targetDate: string; // YYYY-MM-DD or "" — goal to finish
  status: PlanStatus;
  createdBy: string;
  createdAt: string;
}

export interface Invite {
  _id: string;
  businessId: string; // root
  inviterId: string;
  inviteeId: string;
  status: InviteStatus;
  createdAt: string;
  resolvedAt: string | null;
  businessName?: string; // joined for display
}

export interface Notification {
  _id: string;
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  businessId: string | null;
  createdById: string;
  createdAt: string;
  seen: boolean;
}

// Public shape of a user for the client (no sensitive fields; all are safe).
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  displayNameSet: boolean;
  color: string;
  displayCurrency: Currency;
  isAdmin: boolean;
  /** Read-only account: may view, but not change data. */
  suspended: boolean;
  online?: boolean;
}

// Session claims we trust from a verified access token.
export interface Session {
  sub: string;
  role: string;
}
