import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { csvResponse } from "../../../../lib/server/csv";
import { listApplicationsForExport } from "../../../../lib/server/db";
import type { ApplicationData } from "../../../../lib/server/db";

const COLUMNS = [
  "reference",
  "season",
  "submitted_at",
  "status",
  "last_name",
  "first_name",
  "email",
  "phone",
  "birthday",
  "address",
  "address2",
  "city",
  "region",
  "postal_code",
  "country",
  "institution",
  "study_level",
  "major",
  "tuition_amount",
  "tuition_deadline",
  "reference1_name",
  "reference1_email",
  "reference1_phone",
  "reference1_relationship",
  "reference2_name",
  "reference2_email",
  "reference2_phone",
  "reference2_relationship",
  "award_amount",
  "notes",
];

export const GET: APIRoute = async ({ url }) => {
  const seasonId = url.searchParams.get("season") || undefined;
  const rows = await listApplicationsForExport(env.DB, seasonId);

  const csvRows = rows.map((row) => {
    let data: ApplicationData;
    try {
      data = JSON.parse(row.data_json) as ApplicationData;
    } catch {
      data = {} as ApplicationData;
    }
    return {
      reference: row.reference,
      season: row.season_title,
      submitted_at: row.created_at,
      status: row.status,
      last_name: row.last_name,
      first_name: row.first_name,
      email: row.email,
      phone: row.phone,
      birthday: data.birthday,
      address: data.address,
      address2: data.address2,
      city: data.city,
      region: data.region,
      postal_code: data.postalCode,
      country: data.country,
      institution: row.institution,
      study_level: data.studyLevel,
      major: data.major,
      tuition_amount: (row.tuition_cents / 100).toFixed(2),
      tuition_deadline: data.tuitionDeadline,
      reference1_name: data.reference1Name,
      reference1_email: data.reference1Email,
      reference1_phone: data.reference1Phone,
      reference1_relationship: data.reference1Relationship,
      reference2_name: data.reference2Name,
      reference2_email: data.reference2Email,
      reference2_phone: data.reference2Phone,
      reference2_relationship: data.reference2Relationship,
      award_amount: row.award_cents != null ? (row.award_cents / 100).toFixed(2) : "",
      notes: row.staff_notes,
    };
  });

  return csvResponse("springrise-applications.csv", COLUMNS, csvRows);
};
