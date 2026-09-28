import type { APIRoute } from "astro";
import { STAGES } from "../../../../lib/season";
import { csvResponse, toCsv } from "../../../../lib/server/csv";
import { filterFrom, listApplications } from "../../../../lib/server/db";
import { dollars } from "../../../../lib/server/format";
import { formatEt } from "../../../../lib/server/time";

export const GET: APIRoute = async ({ url }) => {
  const f = filterFrom(url);
  const { rows } = await listApplications(f, 10_000, 0);
  const header = [
    "Code", "Season", "Stage", "First name", "Last name", "Email", "Phone", "School", "Level", "Major",
    "City", "State", "Country", "Tuition owed (USD)", "Tuition due", "Award (USD)", "Submitted (ET)", "Updated (ET)", "Notes",
  ];
  const data = rows.map((r) => {
    let a: Record<string, string> = {};
    try { a = JSON.parse(r.answers); } catch { /* keep empty */ }
    return [
      r.code, r.season_slug, STAGES[r.stage] ?? r.stage, r.first_name, r.last_name, r.email, r.phone, r.school, r.level,
      a.major ?? "", a.city ?? "", a.state ?? "", a.country ?? "", dollars(r.tuition_cents), a.tuitionDueDate ?? "",
      dollars(r.award_cents), formatEt(r.created_at, false), formatEt(r.updated_at, false), r.notes,
    ];
  });
  const tag = [f.season, f.stage].filter(Boolean).join("-");
  return csvResponse(`springrise-applications${tag ? "-" + tag : ""}.csv`, toCsv(header, data));
};
