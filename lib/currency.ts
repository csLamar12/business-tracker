import { Currency, DEFAULT_FX_RATE } from "./types";

const SYMBOL: Record<string, string> = { USD: "$", JMD: "J$" };

/** Port of db.convert — USD↔JMD only; rate is JMD per 1 USD. */
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rate: number = DEFAULT_FX_RATE,
): number {
  if (from === to) return amount;
  if (from === "USD" && to === "JMD") return amount * rate;
  if (from === "JMD" && to === "USD") return amount / rate;
  return amount;
}

/** Port of ui.fmt_money — "$1,234.56 USD". */
export function fmtMoney(value: number, currency: Currency = "USD"): string {
  const n = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${SYMBOL[currency] ?? ""}${n} ${currency}`;
}
