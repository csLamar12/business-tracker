import { col } from "@/lib/db";
import { DEFAULT_FX_RATE } from "@/lib/types";

export async function getFxRate(): Promise<number> {
  const s = await (await col.settings()).findOne({ _id: "global" });
  return s?.fxJmdPerUsd ?? DEFAULT_FX_RATE;
}

export async function setFxRate(rate: number): Promise<void> {
  await (await col.settings()).updateOne(
    { _id: "global" },
    { $set: { fxJmdPerUsd: rate } },
    { upsert: true },
  );
}
