import nodemailer, { type Transporter } from "nodemailer";

// Gmail SMTP over SSL (465), reusing the desktop app's app-password approach.
// Best-effort: a failure is logged and swallowed, never thrown into a request.

let _transport: Transporter | null = null;

function transport(): Transporter | null {
  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return null;
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_APP_PASSWORD,
      },
    });
  }
  return _transport;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<boolean> {
  const t = transport();
  if (!t || !to) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject,
      text: body,
    });
    return true;
  } catch (e) {
    console.error("[mail] send failed:", (e as Error).message);
    return false;
  }
}
