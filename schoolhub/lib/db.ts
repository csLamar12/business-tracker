import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

// Reuse a single client across hot reloads / invocations.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // On Cloudflare Workers, MongoDB is reached through Prisma Accelerate
  // (DATABASE_URL is a `prisma://…` connection string) because there is no
  // MongoDB driver adapter for the Workers runtime. In Node runtimes (local
  // dev, seeding, Vercel) it's a direct `mongodb://…` URL and no extension is
  // needed.
  if ((process.env.DATABASE_URL ?? "").startsWith("prisma://")) {
    return client.$extends(withAccelerate()) as unknown as PrismaClient;
  }
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
