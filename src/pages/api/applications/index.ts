import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { apiRoute, fail, jsonResponse, readLimitedBytes } from "../../../lib/server/http";
import { clientIp, rateLimit, sha256hex } from "../../../lib/server/security";
import { randomId, generateReference } from "../../../lib/server/ids";
import { ageInYears, emailField, isoDateField, moneyDollarsField, phoneField, str } from "../../../lib/server/validate";
import { DOCUMENTS, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from "../../../lib/content";
import { seasonState } from "../../../lib/seasons";
import type { ApplicationData, DocumentToInsert } from "../../../lib/server/db";
import {
  buildApplicationStatements,
  findApplicationByEmail,
  findApplicationByIdempotency,
  getSeasonForApplication,
} from "../../../lib/server/db";

// A little headroom over MAX_TOTAL_BYTES (25MB) for multipart boundaries/field overhead.
const MAX_REQUEST_BYTES = 27 * 1024 * 1024;
const STUDY_LEVELS = new Set(["Incoming first-year", "Undergraduate", "Graduate", "Other"]);
const DUPLICATE_MESSAGE =
  "An application already exists for this email for this season. Contact scholarship@springrise.org if you need to make changes.";

export const POST: APIRoute = apiRoute(async ({ request }) => {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength && Number(declaredLength) > MAX_REQUEST_BYTES) fail(413, "That upload is too large.");

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) fail(415, "Expected a multipart form submission.");

  await rateLimit(env.DB, { bucket: "applications", subject: clientIp(request), limit: 5, windowMs: 3_600_000 });

  const bytes = await readLimitedBytes(request, MAX_REQUEST_BYTES);
  let form: FormData;
  try {
    form = await new Request(request.url, { method: "POST", headers: { "Content-Type": contentType }, body: bytes as BodyInit }).formData();
  } catch {
    fail(400, "Invalid form submission.");
  }

  const seasonId = str(form.get("seasonId"), { field: "seasonId", label: "Season", max: 100 });
  const season = await getSeasonForApplication(env.DB, seasonId);
  if (!season || season.status !== "published" || seasonState(season) !== "open") {
    fail(409, "Applications for this season are closed.");
  }

  if (str(form.get("consent"), { field: "consent", label: "Consent", max: 10 }) !== "yes") {
    fail(400, "You must agree to the consent statement.", "consent");
  }

  const email = emailField(form.get("email"), "email");
  const reference1Email = emailField(form.get("reference1Email"), "reference1Email", "Reference 1 email");
  const reference2Email = emailField(form.get("reference2Email"), "reference2Email", "Reference 2 email");
  if (reference1Email === email) fail(400, "Reference 1 must use a different email than the applicant.", "reference1Email");
  if (reference2Email === email) fail(400, "Reference 2 must use a different email than the applicant.", "reference2Email");
  if (reference1Email === reference2Email) fail(400, "The two references must use different email addresses.", "reference2Email");

  const birthday = isoDateField(form.get("birthday"), "birthday", "Birthday");
  const age = ageInYears(birthday);
  if (age < 14 || age > 100) fail(400, "The applicant must be between 14 and 100 years old.", "birthday");

  const studyLevel = str(form.get("studyLevel"), { field: "studyLevel", label: "Study level", max: 40 });
  if (!STUDY_LEVELS.has(studyLevel)) fail(400, "Please choose a valid study level.", "studyLevel");

  const tuitionCents = moneyDollarsField(form.get("tuitionAmount"), "tuitionAmount", "Tuition amount", 100_000);

  const data: ApplicationData = {
    firstName: str(form.get("firstName"), { field: "firstName", label: "First name", max: 200 }),
    lastName: str(form.get("lastName"), { field: "lastName", label: "Last name", max: 200 }),
    email,
    phone: phoneField(form.get("phone"), "phone", "Phone"),
    birthday,
    country: str(form.get("country"), { field: "country", label: "Country", max: 200 }),
    address: str(form.get("address"), { field: "address", label: "Address", max: 200 }),
    address2: str(form.get("address2"), { field: "address2", label: "Address line 2", max: 200, required: false }),
    city: str(form.get("city"), { field: "city", label: "City", max: 200 }),
    region: str(form.get("region"), { field: "region", label: "State / region", max: 200, required: false }),
    postalCode: str(form.get("postalCode"), { field: "postalCode", label: "Postal code", max: 200 }),
    institution: str(form.get("institution"), { field: "institution", label: "Institution", max: 200 }),
    studyLevel,
    major: str(form.get("major"), { field: "major", label: "Major", max: 200, required: false }),
    tuitionDeadline: isoDateField(form.get("tuitionDeadline"), "tuitionDeadline", "Tuition deadline"),
    reference1Name: str(form.get("reference1Name"), { field: "reference1Name", label: "Reference 1 name", max: 200 }),
    reference1Email,
    reference1Phone: phoneField(form.get("reference1Phone"), "reference1Phone", "Reference 1 phone"),
    reference1Relationship: str(form.get("reference1Relationship"), {
      field: "reference1Relationship",
      label: "Reference 1 relationship",
      max: 200,
      required: false,
    }),
    reference2Name: str(form.get("reference2Name"), { field: "reference2Name", label: "Reference 2 name", max: 200 }),
    reference2Email,
    reference2Phone: phoneField(form.get("reference2Phone"), "reference2Phone", "Reference 2 phone"),
    reference2Relationship: str(form.get("reference2Relationship"), {
      field: "reference2Relationship",
      label: "Reference 2 relationship",
      max: 200,
      required: false,
    }),
    note: str(form.get("note"), { field: "note", label: "Note", max: 2000, required: false }),
  };

  // Idempotency: replay of the same key returns the original reference instead of creating a duplicate.
  const idempotencyKeyHeader = request.headers.get("Idempotency-Key");
  if (idempotencyKeyHeader && !/^[A-Za-z0-9_-]{8,200}$/.test(idempotencyKeyHeader)) {
    fail(400, "Invalid Idempotency-Key header.");
  }
  const idempotencyHash = idempotencyKeyHeader ? await sha256hex(`${seasonId}:${idempotencyKeyHeader}`) : null;
  if (idempotencyHash) {
    const prior = await findApplicationByIdempotency(env.DB, seasonId, idempotencyHash);
    if (prior) {
      if (prior.email_normalized !== email) fail(409, "This idempotency key was already used for a different application.");
      return jsonResponse({ reference: prior.reference, email, season: season.title, submittedAt: prior.created_at });
    }
  }

  const existing = await findApplicationByEmail(env.DB, seasonId, email);
  if (existing) fail(409, DUPLICATE_MESSAGE);

  // Files: every DOCUMENTS key except "disability" is required; each must be a real, size-bounded PDF.
  const filesToUpload: { kind: string; file: File }[] = [];
  let totalBytes = 0;
  for (const doc of DOCUMENTS) {
    const value = form.get(doc.key);
    const isEmpty = value === null || value === "";
    if (isEmpty) {
      if (doc.required) fail(400, `${doc.label} is required.`, doc.key);
      continue;
    }
    if (!(value instanceof File)) fail(400, `${doc.label} must be an uploaded file.`, doc.key);
    if (!value.name.toLowerCase().endsWith(".pdf")) fail(400, `${doc.label} must be a PDF file.`, doc.key);
    if (value.size <= 0 || value.size > MAX_FILE_BYTES) fail(400, `${doc.label} must be a PDF under 5 MB.`, doc.key);
    const header = new Uint8Array(await value.slice(0, 5).arrayBuffer());
    if (new TextDecoder().decode(header) !== "%PDF-") fail(400, `${doc.label} must be a valid PDF file.`, doc.key);
    totalBytes += value.size;
    if (totalBytes > MAX_TOTAL_BYTES) fail(400, "Total upload size must be under 25 MB.");
    filesToUpload.push({ kind: doc.key, file: value });
  }

  const applicationId = randomId();
  const reference = await generateReference(env.DB, season);
  const submittedAt = new Date().toISOString();

  const uploadedKeys: string[] = [];
  const documents: DocumentToInsert[] = [];
  try {
    for (const { kind, file } of filesToUpload) {
      const objectKey = `applications/${seasonId}/${applicationId}/${kind}.pdf`;
      await env.DOCS.put(objectKey, file.stream(), {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { originalFilename: (file.name || `${kind}.pdf`).slice(0, 200) },
      });
      uploadedKeys.push(objectKey);
      documents.push({
        id: randomId(),
        kind,
        objectKey,
        filename: (file.name || `${kind}.pdf`).slice(0, 200),
        size: file.size,
      });
    }

    const statements = buildApplicationStatements(
      env.DB,
      {
        id: applicationId,
        reference,
        seasonId,
        firstName: data.firstName,
        lastName: data.lastName,
        email,
        emailNormalized: email,
        phone: data.phone,
        institution: data.institution,
        tuitionCents,
        dataJson: JSON.stringify(data),
        idempotencyHash,
        createdAt: submittedAt,
      },
      documents,
    );
    await env.DB.batch(statements);
  } catch (err) {
    await Promise.allSettled(uploadedKeys.map((key) => env.DOCS.delete(key)));

    // A concurrent request may have won the race on the same idempotency key or email.
    if (idempotencyHash) {
      const prior = await findApplicationByIdempotency(env.DB, seasonId, idempotencyHash);
      if (prior && prior.email_normalized === email) {
        return jsonResponse({ reference: prior.reference, email, season: season.title, submittedAt: prior.created_at });
      }
    }
    const duplicate = await findApplicationByEmail(env.DB, seasonId, email);
    if (duplicate) fail(409, DUPLICATE_MESSAGE);
    throw err;
  }

  return jsonResponse({ reference, email, season: season.title, submittedAt }, 201);
});
