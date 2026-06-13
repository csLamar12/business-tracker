// Spins up an in-memory MongoDB *replica set* for local development.
// Prisma's MongoDB connector requires a replica set (for transactions used by
// nested writes), which a plain `mongod` single node isn't. Run this in its own
// terminal:  `npm run db:local`  then use the printed DATABASE_URL.
//
// Requires the `mongodb-memory-server` dev dependency (downloads a mongod
// binary on first run).
import { MongoMemoryReplSet } from "mongodb-memory-server";

const PORT = Number(process.env.MONGO_PORT || 27017);

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: "rs0", count: 1 },
  instanceOpts: [{ port: PORT }],
});

const uri = `mongodb://127.0.0.1:${PORT}/schoolhub?replicaSet=rs0&directConnection=true`;

console.log("✓ MongoDB replica set is running.");
console.log("  Set this in your .env:");
console.log(`  DATABASE_URL="${uri}"`);
console.log("\n  Leave this process running. Press Ctrl+C to stop.");

async function shutdown() {
  await replSet.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Keep the process alive.
setInterval(() => {}, 1 << 30);
