// "Enum-like" values. Stored as plain strings in SQLite (see schema.prisma) and
// validated here / in zod schemas so the app layer stays type-safe.

export const PLANS = ["STANDARD", "PREMIUM"] as const;
export type Plan = (typeof PLANS)[number];

export const ROLES = ["SUPERADMIN", "SCHOOL_ADMIN", "EDITOR"] as const;
export type Role = (typeof ROLES)[number];

export const CALENDAR_CATEGORIES = [
  "TERM",
  "HOLIDAY",
  "EXAM",
  "SPORTS",
  "PTA",
  "OTHER",
] as const;
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

export const CALENDAR_CATEGORY_LABELS: Record<CalendarCategory, string> = {
  TERM: "Term",
  HOLIDAY: "Holiday",
  EXAM: "Examinations",
  SPORTS: "Sports",
  PTA: "PTA",
  OTHER: "Other",
};

export const CALENDAR_CATEGORY_COLORS: Record<CalendarCategory, string> = {
  TERM: "#0a4d8c",
  HOLIDAY: "#16a34a",
  EXAM: "#dc2626",
  SPORTS: "#ea580c",
  PTA: "#7c3aed",
  OTHER: "#64748b",
};

export interface PlanInfo {
  id: Plan;
  name: string;
  tagline: string;
  priceJmd: string;
  period: string;
  highlight: boolean;
  features: string[];
  customDomain: boolean;
}

// Pricing is presented for marketing only — there is no billing integration yet.
export const PLAN_INFO: Record<Plan, PlanInfo> = {
  STANDARD: {
    id: "STANDARD",
    name: "Standard",
    tagline: "A polished website on a SchoolHub subdomain.",
    priceJmd: "$4,500",
    period: "/month",
    highlight: false,
    customDomain: false,
    features: [
      "yourschool.schoolhubja.com subdomain",
      "Announcements & news",
      "Academic calendar",
      "Admissions information",
      "Staff directory",
      "Events & student achievements",
      "Alumni registration & directory",
      "Hosting, SSL & ongoing maintenance",
    ],
  },
  PREMIUM: {
    id: "PREMIUM",
    name: "Premium",
    tagline: "Everything in Standard, on your own custom domain.",
    priceJmd: "$9,500",
    period: "/month",
    highlight: true,
    customDomain: true,
    features: [
      "Connect your own domain (e.g. www.yourschool.edu.jm)",
      "Everything in Standard",
      "Priority content updates",
      "Custom theme colours & branding",
      "Advanced alumni engagement tools",
      "Dedicated onboarding & training",
    ],
  },
};
