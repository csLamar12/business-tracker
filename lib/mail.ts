import nodemailer, { type Transporter } from "nodemailer";

// Transactional email, best-effort (failures are logged, never thrown).
//
// Primary path is Resend's HTTP API (port 443) because Railway blocks outbound
// SMTP — so nodemailer/SMTP only works off-Railway (e.g. local dev) and is kept
// as a fallback. Set RESEND_API_KEY + EMAIL_FROM (a verified-domain sender) to
// use Resend.

function fromAddress(): string {
  return (
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER ||
    "Business Tracker <noreply@anchorpointja.com>"
  );
}

async function sendViaResend(to: string, subject: string, body: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, text: body }),
    });
    if (!res.ok) {
      console.error("[mail] resend failed:", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mail] resend error:", (e as Error).message);
    return false;
  }
}

// SMTP fallback (nodemailer, Gmail SSL 465). Blocked on Railway; works locally.
let _transport: Transporter | null = null;
function transport(): Transporter | null {
  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return null;
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD },
    });
  }
  return _transport;
}

async function sendViaSmtp(to: string, subject: string, body: string): Promise<boolean> {
  const t = transport();
  if (!t) return false;
  try {
    await t.sendMail({ from: fromAddress(), to, subject, text: body });
    return true;
  } catch (e) {
    console.error("[mail] smtp send failed:", (e as Error).message);
    return false;
  }
}

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!to) return false;
  if (process.env.RESEND_API_KEY) return sendViaResend(to, subject, body);
  return sendViaSmtp(to, subject, body);
}
