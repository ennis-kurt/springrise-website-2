// Scholarship application intake.
import { env } from "cloudflare:workers";
import { DOCUMENTS, FILE_LIMIT, LEVELS, TOTAL_LIMIT } from "../facts";
import { phaseOf, type Season } from "../season";
import { randomFrom, sha256Hex } from "./crypto";
import { activityStmt, getSeason, newId, nowIso } from "./db";
import { HttpError } from "./http";
import { etToday } from "./time";
import { ageOn, email, isoDate, oneOf, parseDollars, phone, text } from "./validate";

export const MAX_BODY = 27 * 1024 * 1024;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CLOSED = "Applications for this season are closed.";

export interface Submitted {
  id: string;
  code: string;
  email: string;
  firstName: string;
  lastName: string;
  season: Season;
  submittedAt: string;
  replay: boolean;
}

export function makeCode(season: Pick<Season, "term" | "year">): string {
  const yy = String(season.year % 100).padStart(2, "0");
  return `${season.term[0]}${yy}-${randomFrom(CODE_ALPHABET, 4)}-${randomFrom(CODE_ALPHABET, 2)}`;
}

/** Validate every text answer. Returns normalized answers (the JSON we store). */
export function readAnswers(f: Record<string, string>, today = etToday()) {
  const a = {
    firstName: text(f, "firstName", "your first name", { max: 100 }),
    lastName: text(f, "lastName", "your last name", { max: 100 }),
    email: email(f, "email", "your email address"),
    phone: phone(f, "phone", "your phone number"),
    birthDate: isoDate(f, "birthDate", "your date of birth"),
    country: text(f, "country", "your country"),
    address1: text(f, "address1", "your street address"),
    address2: text(f, "address2", "address line 2", { required: false }),
    city: text(f, "city", "your city"),
    state: text(f, "state", "your state", { required: false }),
    postalCode: text(f, "postalCode", "your postal code", { max: 20 }),
    school: text(f, "school", "your college or university"),
    level: oneOf(f, "level", "your level of study", LEVELS),
    major: text(f, "major", "your major", { required: false }),
    tuitionAmount: "",
    tuitionDueDate: isoDate(f, "tuitionDueDate", "your tuition due date"),
    ref1Name: text(f, "ref1Name", "your first reference's name"),
    ref1Email: email(f, "ref1Email", "your first reference's email"),
    ref1Phone: phone(f, "ref1Phone", "your first reference's phone"),
    ref1Relation: text(f, "ref1Relation", "your first reference's relationship", { required: false }),
    ref2Name: text(f, "ref2Name", "your second reference's name"),
    ref2Email: email(f, "ref2Email", "your second reference's email"),
    ref2Phone: phone(f, "ref2Phone", "your second reference's phone"),
    ref2Relation: text(f, "ref2Relation", "your second reference's relationship", { required: false }),
    note: text(f, "note", "your note", { required: false, max: 2000 }),
    consent: "yes" as const,
  };
  const age = ageOn(a.birthDate, today);
  if (age < 14 || age > 100) throw new HttpError(400, "Please check your date of birth.", "birthDate");

  const cents = parseDollars(f.tuitionAmount);
  if (cents == null || cents <= 0) {
    throw new HttpError(400, "Please enter the tuition you still owe in dollars, for example 4750 or 4750.50.", "tuitionAmount");
  }
  if (cents > 100_000_00) throw new HttpError(400, "The tuition amount can be at most $100,000.", "tuitionAmount");
  a.tuitionAmount = (cents / 100).toFixed(2);

  if (a.ref1Email === a.email) throw new HttpError(400, "Your first reference needs their own email address, not yours.", "ref1Email");
  if (a.ref2Email === a.email) throw new HttpError(400, "Your second reference needs their own email address, not yours.", "ref2Email");
  if (a.ref2Email === a.ref1Email) throw new HttpError(400, "Your two references need different email addresses.", "ref2Email");

  if ((f.consent ?? "").trim() !== "yes") {
    throw new HttpError(400, "Please confirm that your answers are true and that you agree to the terms.", "consent");
  }
  return { answers: a, tuitionCents: cents };
}

interface PdfFile { kind: string; file: File; bytes: Uint8Array; fileName: string }

async function readFiles(form: FormData): Promise<PdfFile[]> {
  const out: PdfFile[] = [];
  let total = 0;
  for (const doc of DOCUMENTS) {
    const v = form.get(doc.key);
    const file = v && typeof v !== "string" && v.size > 0 ? (v as File) : null;
    if (!file) {
      if (doc.required) throw new HttpError(400, `Please attach your ${doc.label.toLowerCase()} as a PDF.`, doc.key);
      continue;
    }
    const label = doc.label.toLowerCase();
    if (!/\.pdf$/i.test(file.name || "")) throw new HttpError(400, `Your ${label} must be a PDF file (.pdf).`, doc.key);
    if (file.size > FILE_LIMIT) throw new HttpError(400, `Your ${label} is larger than 5 MB. Please upload a smaller PDF.`, doc.key);
    total += file.size;
    if (total > TOTAL_LIMIT) throw new HttpError(400, "Your documents add up to more than 25 MB. Please upload smaller PDFs.", doc.key);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
      throw new HttpError(400, `Your ${label} doesn't look like a real PDF. Please export or save it as PDF and try again.`, doc.key);
    }
    const fileName = (file.name || `${doc.key}.pdf`).replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(-150);
    out.push({ kind: doc.key, file, bytes, fileName });
  }
  return out;
}

async function findByKey(slug: string, keyHash: string) {
  return env.DB.prepare("SELECT id, code, email, first_name, last_name, created_at FROM applications WHERE season_slug = ?1 AND submit_key = ?2")
    .bind(slug, keyHash)
    .first<{ id: string; code: string; email: string; first_name: string; last_name: string; created_at: string }>();
}

const duplicate = () =>
  new HttpError(
    409,
    "We already have an application from this email address for this season. If you need to change something, please write to scholarship@springrise.org and include your reference code.",
    "email",
  );

export async function submitApplication(request: Request): Promise<Submitted> {
  const len = Number(request.headers.get("Content-Length") ?? "0");
  if (len > MAX_BODY) throw new HttpError(413, "Your upload is too large. Documents may total at most 25 MB.");
  const idem = (request.headers.get("Idempotency-Key") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(idem)) {
    throw new HttpError(400, "Missing or invalid Idempotency-Key header. Please refresh the page and try again.");
  }
  if (!(request.headers.get("Content-Type") ?? "").includes("multipart/form-data")) {
    throw new HttpError(415, "Please send the application as multipart form data.");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "We couldn't read your upload. Please try again.");
  }
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;

  const slug = (fields.season ?? "").trim().slice(0, 80);
  const season = slug ? await getSeason(slug) : null;
  if (!season || season.status !== "published") throw new HttpError(409, CLOSED, "season");

  const keyHash = await sha256Hex(`${season.slug}:${idem}`);
  const prior = await findByKey(season.slug, keyHash);
  if (prior) {
    return {
      id: prior.id, code: prior.code, email: prior.email, firstName: prior.first_name, lastName: prior.last_name,
      season, submittedAt: prior.created_at, replay: true,
    };
  }
  if (phaseOf(season) !== "open") throw new HttpError(409, CLOSED, "season");

  const { answers, tuitionCents } = readAnswers(fields);
  const existing = await env.DB.prepare("SELECT 1 FROM applications WHERE season_slug = ?1 AND email = ?2")
    .bind(season.slug, answers.email)
    .first();
  if (existing) throw duplicate();

  const files = await readFiles(form);
  const id = newId();
  const at = nowIso();
  const stored: string[] = [];
  try {
    for (const f of files) {
      const key = `applications/${season.slug}/${id}/${f.kind}.pdf`;
      await env.FILES.put(key, f.bytes, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { fileName: f.fileName },
      });
      stored.push(key);
    }

    for (let attempt = 0; ; attempt++) {
      const code = makeCode(season);
      const stmts = [
        env.DB.prepare(
          `INSERT INTO applications (id, code, season_slug, first_name, last_name, email, phone, school, level, tuition_cents, answers, submit_key, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)`,
        ).bind(
          id, code, season.slug, answers.firstName, answers.lastName, answers.email, answers.phone, answers.school,
          answers.level, tuitionCents, JSON.stringify(answers), keyHash, at,
        ),
        ...files.map((f, i) =>
          env.DB.prepare(
            "INSERT INTO attachments (id, application_id, kind, storage_key, file_name, bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
          ).bind(newId(), id, f.kind, stored[i], f.fileName, f.bytes.byteLength, at),
        ),
        activityStmt(id, "Application submitted", at),
      ];
      try {
        await env.DB.batch(stmts);
        return { id, code, email: answers.email, firstName: answers.firstName, lastName: answers.lastName, season, submittedAt: at, replay: false };
      } catch (err) {
        const msg = String((err as Error)?.message ?? err);
        if (msg.includes("applications.code") && attempt < 5) continue;
        throw err;
      }
    }
  } catch (err) {
    if (stored.length) await env.FILES.delete(stored).catch(() => {});
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("applications.submit_key")) {
      const again = await findByKey(season.slug, keyHash);
      if (again) {
        return {
          id: again.id, code: again.code, email: again.email, firstName: again.first_name, lastName: again.last_name,
          season, submittedAt: again.created_at, replay: true,
        };
      }
    }
    if (msg.includes("applications.season_slug, applications.email") || msg.includes("applications.email")) throw duplicate();
    throw err;
  }
}
