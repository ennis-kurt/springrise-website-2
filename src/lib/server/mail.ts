// Optional transactional email via Resend's HTTP API (no SDK).
// Disabled unless RESEND_API_KEY is set; never throws.
import { env } from "cloudflare:workers";
import type { Season } from "../season";
import { STAGES, type Stage } from "../season";
import { hmacHex, safeEqual, sha256 } from "./crypto";
import { escapeHtml, siteUrl } from "./format";
import { formatEt } from "./time";

export type SendResult = { ok: true; id?: string } | { skipped: true } | { ok: false; error: string };

export interface Message {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

const TIMEOUT_MS = 4000;
export const emailEnabled = () => !!env.RESEND_API_KEY;
const from = () => env.EMAIL_FROM || "Springrise Foundation <no-reply@springrise.org>";
const site = () => siteUrl(env.SITE_URL);

async function post(path: string, body: unknown): Promise<SendResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.resend.com${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.warn("Email provider error", res.status, detail);
      return { ok: false, error: `Provider returned ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    console.warn("Email send failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  } finally {
    clearTimeout(timer);
  }
}

const payload = (m: Message) => ({
  from: from(),
  to: Array.isArray(m.to) ? m.to : [m.to],
  subject: m.subject,
  html: m.html,
  text: m.text,
  ...(m.replyTo ? { reply_to: m.replyTo } : {}),
  ...(m.headers ? { headers: m.headers } : {}),
});

export async function send(m: Message): Promise<SendResult> {
  if (!emailEnabled()) return { skipped: true };
  return post("/emails", payload(m));
}

/** Resend batch endpoint, 100 messages per request. Returns how many were accepted. */
export async function sendBatch(messages: Message[]): Promise<{ skipped: true } | { sent: number; failed: number }> {
  if (!emailEnabled()) return { skipped: true };
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const r = await post("/emails/batch", chunk.map(payload));
    if ("ok" in r && r.ok) sent += chunk.length;
    else failed += chunk.length;
  }
  return { sent, failed };
}

// ---------- layout ----------

interface Block { heading: string; paragraphs: string[]; facts?: [string, string][]; button?: { href: string; label: string }; footer?: string; unsubscribe?: string }

/** Minimal branded HTML. Every string passed in is escaped here. */
export function layout(b: Block): string {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const facts = b.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-collapse:collapse">${b.facts
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;border-top:1px solid #ddd8ca;color:#55526a;font-size:13px;width:38%">${escapeHtml(k)}</td><td style="padding:8px 0;border-top:1px solid #ddd8ca;font-size:15px;font-weight:600">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const button = b.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(b.button.href)}" style="display:inline-block;background:#2b2320;color:#f0b44c;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${escapeHtml(b.button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f1e7">
<div style="background:#f7f1e7;padding:32px 16px;font-family:${font};color:#2b2320">
<div style="max-width:560px;margin:0 auto;background:#fbfaf6;border:1px solid #ddd8ca;border-radius:18px;padding:32px">
<p style="margin:0 0 24px;font-weight:700;font-size:20px;letter-spacing:-0.03em">springrise</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${escapeHtml(b.heading)}</h1>
${b.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escapeHtml(p)}</p>`).join("")}
${facts}${button}
</div>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#55526a;text-align:center">${escapeHtml(
    b.footer ?? "Springrise Foundation, Inc. · P.O. Box 55, Denville, NJ 07834",
  )}${b.unsubscribe ? ` <a href="${escapeHtml(b.unsubscribe)}" style="color:#55526a">Unsubscribe</a>` : ""}</p>
</div></body></html>`;
}

function plain(b: Block): string {
  return [
    b.heading,
    "",
    ...b.paragraphs.flatMap((p) => [p, ""]),
    ...(b.facts ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(b.button ? ["", `${b.button.label}: ${b.button.href}`] : []),
    "",
    "--",
    b.footer ?? "Springrise Foundation, Inc. · P.O. Box 55, Denville, NJ 07834",
    ...(b.unsubscribe ? [`Unsubscribe: ${b.unsubscribe}`] : []),
  ].join("\n");
}

const message = (to: string | string[], subject: string, b: Block, extra: Partial<Message> = {}): Message => ({
  to,
  subject,
  html: layout(b),
  text: plain(b),
  ...extra,
});

// ---------- (a) applicant confirmation ----------

export interface SubmittedApp { id: string; code: string; firstName: string; lastName: string; email: string; seasonTitle: string; submittedAt: string }

export function applicantConfirmation(a: SubmittedApp) {
  return send(
    message(a.email, `We received your application (${a.code})`, {
      heading: `Thank you, ${a.firstName}. Your application is in.`,
      paragraphs: [
        `We received your ${a.seasonTitle} application. Keep your reference code. You'll need it, with this email address, to check your status.`,
        "Please note: a submitted application is not an award. The Board reviews every application after the season closes, and we'll contact you by email.",
      ],
      facts: [
        ["Reference code", a.code],
        ["Season", a.seasonTitle],
        ["Submitted", formatEt(a.submittedAt)],
      ],
      button: { href: `${site()}/scholarships/status`, label: "Check your status" },
      footer: "Questions? Reply to this email or write to scholarship@springrise.org.",
    }, { replyTo: "scholarship@springrise.org" }),
  );
}

// ---------- (b) staff notice ----------

export function staffNotice(a: SubmittedApp) {
  return send(
    message(env.STAFF_EMAIL || "scholarship@springrise.org", `New application: ${a.firstName} ${a.lastName} (${a.code})`, {
      heading: "A new application arrived",
      paragraphs: [`${a.firstName} ${a.lastName} applied for the ${a.seasonTitle}.`],
      facts: [
        ["Applicant", `${a.firstName} ${a.lastName}`],
        ["Code", a.code],
        ["Season", a.seasonTitle],
        ["Submitted", formatEt(a.submittedAt)],
      ],
      button: { href: `${site()}/staff/applications/${a.id}`, label: "Open in staff workspace" },
      footer: "Staff notice from springrise.org. Documents are only available in the staff workspace.",
    }),
  );
}

// ---------- (c) inquiry notice ----------

export function inquiryNotice(i: { name: string; email: string; phone: string; reason: string; message: string }) {
  return send(
    message("info@springrise.org", `Website inquiry (${i.reason}) from ${i.name}`, {
      heading: "New message from the website",
      paragraphs: i.message.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean),
      facts: [
        ["From", i.name],
        ["Email", i.email],
        ...(i.phone ? ([["Phone", i.phone]] as [string, string][]) : []),
        ["Topic", i.reason],
      ],
      button: { href: `${site()}/staff/inquiries`, label: "View in staff workspace" },
      footer: "Reply directly to this email to answer the sender.",
    }, { replyTo: i.email }),
  );
}

// ---------- (d) season announcement ----------

async function signingKey(): Promise<Uint8Array<ArrayBuffer>> {
  if (env.SIGNING_SECRET) return new TextEncoder().encode(env.SIGNING_SECRET);
  return sha256(`springrise-unsubscribe-v1:${env.ADMIN_PASSWORD ?? ""}`);
}

export async function unsubscribeToken(email: string): Promise<string> {
  return (await hmacHex(await signingKey(), `unsubscribe:${email.trim().toLowerCase()}`)).slice(0, 32);
}

export async function verifyUnsubscribe(email: string, token: string): Promise<boolean> {
  if (!env.SIGNING_SECRET && (env.ADMIN_PASSWORD ?? "").length < 16) return false;
  if (!email || !/^[0-9a-f]{32}$/.test(token)) return false;
  return safeEqual(await unsubscribeToken(email), token);
}

export async function unsubscribeUrl(email: string): Promise<string> {
  const e = email.trim().toLowerCase();
  return `${site()}/unsubscribe?e=${encodeURIComponent(e)}&t=${await unsubscribeToken(e)}`;
}

export async function announceSeason(season: Season, emails: string[]) {
  const url = `${site()}/scholarships/${season.slug}`;
  const when = season.opens_at && season.closes_at
    ? `Applications open ${formatEt(season.opens_at)} and close ${formatEt(season.closes_at)}.`
    : "";
  const paras = [season.headline, ...season.announcement.split(/\r?\n\s*\r?\n/), when].map((p) => p.trim()).filter(Boolean);
  const messages: Message[] = [];
  for (const e of emails) {
    const unsub = await unsubscribeUrl(e);
    messages.push(
      message(e, `${season.title}: applications`, {
        heading: season.title,
        paragraphs: paras,
        button: { href: url, label: "See details and apply" },
        footer: "You're receiving this because you asked Springrise Foundation for scholarship updates.",
        unsubscribe: unsub,
      }, { headers: { "List-Unsubscribe": `<${unsub}>` } }),
    );
  }
  return sendBatch(messages);
}

// ---------- (e) stage change ----------

export function stageChange(a: { email: string; firstName: string; code: string; seasonTitle: string; stage: Stage; note: string }) {
  return send(
    message(a.email, `Update on your application ${a.code}`, {
      heading: `An update on your ${a.seasonTitle} application`,
      paragraphs: [
        `Hello ${a.firstName},`,
        `Your application status is now: ${STAGES[a.stage]}.`,
        ...a.note.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean),
      ],
      facts: [["Reference code", a.code]],
      button: { href: `${site()}/scholarships/status`, label: "Check your status" },
      footer: "Questions? Reply to this email or write to scholarship@springrise.org.",
    }, { replyTo: "scholarship@springrise.org" }),
  );
}
