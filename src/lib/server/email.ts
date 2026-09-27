// Optional transactional email via the Resend HTTP API (no SDK). Every export
// here is safe to call whether or not email is configured: when it isn't,
// sends are skipped and callers get `{ ok: false, skipped: true }` instead of
// a thrown error. Callers should never let a failed send break a request.
import { env } from "cloudflare:workers";
import { fmtDate, fmtDateTime } from "../seasons";
import { sha256hex, timingSafeEqual } from "./security";

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const BATCH_CHUNK_SIZE = 100;
const SEND_TIMEOUT_MS = 4_000;
const BATCH_TIMEOUT_MS = 8_000;

const DEFAULT_FROM = "Springrise Foundation <scholarship@springrise.org>";
const DEFAULT_STAFF_NOTIFY = "scholarship@springrise.org";
const DEFAULT_CONTACT_NOTIFY = "info@springrise.org";
const DEFAULT_SITE_URL = "https://springrise.org";

// Fixed prefix for the ADMIN_PASSWORD-derived fallback signing secret. Bumping
// this invalidates every previously-issued unsubscribe link.
const SIGNING_SECRET_PREFIX = "springrise-unsubscribe-v1:";

const encoder = new TextEncoder();

export function emailEnabled(): boolean {
  return !!env.RESEND_API_KEY;
}

export function emailFrom(): string {
  return env.EMAIL_FROM || DEFAULT_FROM;
}

export function staffNotifyEmail(): string {
  return env.STAFF_NOTIFY_EMAIL || DEFAULT_STAFF_NOTIFY;
}

export function contactNotifyEmail(): string {
  return env.CONTACT_NOTIFY_EMAIL || env.STAFF_NOTIFY_EMAIL || DEFAULT_CONTACT_NOTIFY;
}

export function siteUrl(): string {
  return (env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface EmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface BatchEmailResult {
  ok: boolean;
  sent: number;
  skipped?: boolean;
  error?: string;
}

function resendPayload(message: EmailMessage) {
  return {
    from: emailFrom(),
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    ...(message.headers ? { headers: message.headers } : {}),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Sends one email. Never throws — check `.ok`. */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!emailEnabled()) return { ok: false, skipped: true };
  try {
    const res = await fetchWithTimeout(
      RESEND_URL,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(resendPayload(message)),
      },
      SEND_TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("email send failed", res.status, body.slice(0, 500));
      return { ok: false, error: `Email provider responded ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("email send error", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}

/** Sends many emails in chunks of 100 (Resend's batch limit). Never throws — check `.ok`. */
export async function sendBatch(messages: EmailMessage[]): Promise<BatchEmailResult> {
  if (!emailEnabled()) return { ok: false, sent: 0, skipped: true };
  if (messages.length === 0) return { ok: true, sent: 0 };

  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + BATCH_CHUNK_SIZE);
    try {
      const res = await fetchWithTimeout(
        RESEND_BATCH_URL,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(chunk.map(resendPayload)),
        },
        BATCH_TIMEOUT_MS,
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("email batch send failed", res.status, body.slice(0, 500));
        return { ok: sent > 0, sent, error: `Email provider responded ${res.status}` };
      }
      sent += chunk.length;
    } catch (err) {
      console.error("email batch send error", err);
      return { ok: sent > 0, sent, error: err instanceof Error ? err.message : "Unknown email error" };
    }
  }
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------
// Unsubscribe signing (HMAC-SHA256, ADMIN_PASSWORD fallback)
// ---------------------------------------------------------------------------

async function signingSecret(): Promise<string> {
  if (env.EMAIL_SIGNING_SECRET) return env.EMAIL_SIGNING_SECRET;
  // Fallback so unsubscribe links keep working even without a dedicated secret configured.
  return sha256hex(`${SIGNING_SECRET_PREFIX}${env.ADMIN_PASSWORD ?? ""}`);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signUnsubscribeToken(email: string): Promise<string> {
  const secret = await signingSecret();
  return hmacHex(secret, email.trim().toLowerCase());
}

export async function verifyUnsubscribeToken(email: string, token: string): Promise<boolean> {
  if (!email || !token) return false;
  const expected = await signUnsubscribeToken(email);
  return timingSafeEqual(expected, token);
}

// ---------------------------------------------------------------------------
// Branded template (table layout, inline styles — for email client compatibility)
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** An escaped paragraph, ready to drop into `renderEmailHtml`'s `bodyHtml`. */
export function paragraph(text: string): string {
  if (!text) return "";
  return `<p style="margin:0 0 14px;">${escapeHtml(text)}</p>`;
}

export interface EmailTemplateOptions {
  heading: string;
  /** Pre-built, already-escaped inner HTML — see `paragraph()`. */
  bodyHtml: string;
  buttonLabel?: string;
  buttonUrl?: string;
  /** Extra HTML shown above the standard footer, e.g. an unsubscribe link. Caller must escape any user data. */
  footerNote?: string;
}

export function renderEmailHtml(opts: EmailTemplateOptions): string {
  const button =
    opts.buttonLabel && opts.buttonUrl
      ? `<tr><td style="padding:4px 32px 8px;">
           <a href="${escapeHtml(opts.buttonUrl)}" style="display:inline-block;background:#2344c4;color:#fffdf8;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(opts.buttonLabel)}</a>
         </td></tr>`
      : `<tr><td style="height:8px;"></td></tr>`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(opts.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f7f2e9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e9;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid rgba(13,23,51,0.12);">
          <tr><td style="padding:28px 32px 4px;">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#0d1733;">Springrise Foundation</p>
          </td></tr>
          <tr><td style="padding:12px 32px 0;">
            <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:20px;color:#0d1733;">${escapeHtml(opts.heading)}</h1>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1b2750;">${opts.bodyHtml}</div>
          </td></tr>
          ${button}
          <tr><td style="padding:18px 32px 28px;border-top:1px solid rgba(13,23,51,0.1);">
            ${opts.footerNote ? `<p style="margin:14px 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7b819a;">${opts.footerNote}</p>` : ""}
            <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7b819a;line-height:1.5;">
              Springrise Foundation Inc &middot; P.O. Box 55, Denville, NJ 07834<br />
              A 501(c)(3) nonprofit organization.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderEmailText(heading: string, paragraphs: (string | false | undefined)[]): string {
  const lines = [heading, "", ...paragraphs.filter((p): p is string => !!p)];
  lines.push("", "Springrise Foundation Inc -- P.O. Box 55, Denville, NJ 07834", "A 501(c)(3) nonprofit organization.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Application flows
// ---------------------------------------------------------------------------

export async function sendApplicationConfirmationEmail(opts: {
  to: string;
  firstName: string;
  reference: string;
  seasonTitle: string;
  submittedAtIso: string;
}): Promise<EmailResult> {
  const statusUrl = `${siteUrl()}/scholarships/status`;
  const submitted = fmtDateTime(opts.submittedAtIso);
  const greeting = `Hi ${opts.firstName || "there"},`;
  const p1 = `We've received your application for the ${opts.seasonTitle}. Your reference number is ${opts.reference} — submitted ${submitted}.`;
  const p2 = "Our Board of Directors reviews applications in the order they're received. You can check your status any time using your reference and the email you applied with.";
  const p3 = "Submitting an application does not guarantee an award — we'll email you again as your application moves through review.";
  return sendEmail({
    to: opts.to,
    subject: `Application received — ${opts.reference}`,
    html: renderEmailHtml({
      heading: "We've received your application",
      bodyHtml: paragraph(greeting) + paragraph(p1) + paragraph(p2) + paragraph(p3),
      buttonLabel: "Check your status",
      buttonUrl: statusUrl,
    }),
    text: renderEmailText("We've received your application", [greeting, p1, p2, p3, `Check your status: ${statusUrl}`]),
  });
}

export async function sendStaffNewApplicationEmail(opts: {
  firstName: string;
  lastName: string;
  reference: string;
  seasonTitle: string;
  applicationId: string;
}): Promise<EmailResult> {
  // Deliberately no personal documents or date of birth in this notification.
  const link = `${siteUrl()}/admin/applications/${opts.applicationId}`;
  const p1 = `${opts.firstName} ${opts.lastName} submitted a new application for the ${opts.seasonTitle}.`;
  const p2 = `Reference: ${opts.reference}`;
  return sendEmail({
    to: staffNotifyEmail(),
    subject: `New application — ${opts.reference}`,
    html: renderEmailHtml({ heading: "New scholarship application", bodyHtml: paragraph(p1) + paragraph(p2), buttonLabel: "Review application", buttonUrl: link }),
    text: renderEmailText("New scholarship application", [p1, p2, `Review: ${link}`]),
  });
}

export async function sendStaffContactNotificationEmail(opts: { name: string; email: string; topic: string; message: string }): Promise<EmailResult> {
  const excerpt = opts.message.length > 500 ? `${opts.message.slice(0, 500)}…` : opts.message;
  const link = `${siteUrl()}/admin/messages`;
  const p1 = `Topic: ${opts.topic}`;
  const p2 = `From: ${opts.name} <${opts.email}>`;
  return sendEmail({
    to: contactNotifyEmail(),
    subject: `New contact message from ${opts.name}`,
    replyTo: opts.email,
    html: renderEmailHtml({ heading: "New contact message", bodyHtml: paragraph(p1) + paragraph(p2) + paragraph(excerpt), buttonLabel: "View messages", buttonUrl: link }),
    text: renderEmailText("New contact message", [p1, p2, excerpt, `View messages: ${link}`]),
  });
}

export async function sendApplicantStatusEmail(opts: {
  to: string;
  firstName: string;
  statusLabel: string;
  seasonTitle: string;
  message: string;
}): Promise<EmailResult> {
  const statusUrl = `${siteUrl()}/scholarships/status`;
  const greeting = `Hi ${opts.firstName || "there"},`;
  const p1 = `Your ${opts.seasonTitle} application status has been updated to: ${opts.statusLabel}.`;
  const p2 = "You can check full details any time using your reference and the email you applied with.";
  return sendEmail({
    to: opts.to,
    subject: `Application update: ${opts.statusLabel}`,
    html: renderEmailHtml({
      heading: "Your application status has changed",
      bodyHtml: paragraph(greeting) + paragraph(p1) + (opts.message ? paragraph(opts.message) : "") + paragraph(p2),
      buttonLabel: "Check your status",
      buttonUrl: statusUrl,
    }),
    text: renderEmailText("Your application status has changed", [greeting, p1, opts.message || undefined, p2, `Check your status: ${statusUrl}`]),
  });
}

// ---------------------------------------------------------------------------
// Season announcement
// ---------------------------------------------------------------------------

export interface AnnouncementSeason {
  title: string;
  slug: string;
  opens_at: string | null;
  closes_at: string | null;
}

export function announcementSubject(season: AnnouncementSeason, state: "upcoming" | "open"): string {
  if (state === "open") {
    return `${season.title} — applications are now open${season.closes_at ? ` — apply by ${fmtDate(season.closes_at)}` : ""}`;
  }
  return `${season.title} — applications open ${season.opens_at ? fmtDate(season.opens_at) : "soon"}`;
}

export async function buildAnnouncementMessage(
  season: AnnouncementSeason,
  state: "upcoming" | "open",
  subscriberEmail: string,
): Promise<EmailMessage> {
  const subject = announcementSubject(season, state);
  const applyUrl = `${siteUrl()}/scholarships/${season.slug}`;
  const token = await signUnsubscribeToken(subscriberEmail);
  const unsubUrl = `${siteUrl()}/unsubscribe?e=${encodeURIComponent(subscriberEmail)}&t=${token}`;

  const p1 =
    state === "open"
      ? `Applications for the ${season.title} are now open.`
      : `Applications for the ${season.title} open ${season.opens_at ? fmtDateTime(season.opens_at) : "soon"}.`;
  const p2 = season.closes_at ? `Apply by ${fmtDateTime(season.closes_at)}.` : "";
  const footerNote = `You're receiving this because you subscribed for Springrise scholarship updates. <a href="${escapeHtml(unsubUrl)}" style="color:#2344c4;">Unsubscribe</a>.`;

  return {
    to: subscriberEmail,
    subject,
    html: renderEmailHtml({
      heading: subject,
      bodyHtml: paragraph(p1) + (p2 ? paragraph(p2) : ""),
      buttonLabel: "View scholarship details",
      buttonUrl: applyUrl,
      footerNote,
    }),
    text: renderEmailText(subject, [p1, p2 || undefined, `Details: ${applyUrl}`, `Unsubscribe: ${unsubUrl}`]),
    headers: { "List-Unsubscribe": `<${unsubUrl}>` },
  };
}
