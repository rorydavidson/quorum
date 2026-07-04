import nodemailer, { type Transporter } from "nodemailer";

// ---------------------------------------------------------------------------
// SMTP mailer.
//
// Configured entirely from env vars (never hardcoded):
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true"/"false"), SMTP_USER, SMTP_PASS,
//   SMTP_FROM (e.g. "Quorum <no-reply@example.com>")
//
// When SMTP_HOST is not set the mailer runs in "mock" mode: it logs the email
// it *would* have sent instead of dialling out. This keeps local dev and tests
// self-contained, matching how the Drive/Calendar services degrade.
// ---------------------------------------------------------------------------

let _transport: Transporter | null = null;

function isConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

function transport(): Transporter {
  if (_transport) return _transport;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  _transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Default: implicit TLS on 465, STARTTLS otherwise. Override with SMTP_SECURE.
    secure:
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === "true"
        : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return _transport;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends a single email. Returns true on success, false on failure — never
 * throws, so a mail outage can't break the request that triggered it.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const from = process.env.SMTP_FROM ?? "Quorum <no-reply@localhost>";

  if (!isConfigured()) {
    console.log(
      `[mailer] (mock — SMTP not configured) would email ${mail.to}: "${mail.subject}"`,
    );
    return true;
  }

  try {
    await transport().sendMail({ from, ...mail });
    return true;
  } catch (err) {
    console.error(`[mailer] Failed to send to ${mail.to}:`, err);
    return false;
  }
}
