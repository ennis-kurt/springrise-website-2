import type { APIRoute } from "astro";
import { submitApplication } from "../../lib/server/apply";
import { later } from "../../lib/server/background";
import { clientIp, handle, json, redirectBack, wantsHtml } from "../../lib/server/http";
import { applicantConfirmation, staffNotice } from "../../lib/server/mail";
import { enforce } from "../../lib/server/throttle";

export const POST: APIRoute = ({ request, locals }) =>
  handle(request, async () => {
    await enforce("apply", clientIp(request));
    const s = await submitApplication(request);
    if (!s.replay) {
      const info = {
        id: s.id, code: s.code, firstName: s.firstName, lastName: s.lastName, email: s.email,
        seasonTitle: s.season.title, submittedAt: s.submittedAt,
      };
      later(locals, Promise.all([applicantConfirmation(info), staffNotice(info)]));
    }
    if (wantsHtml(request)) return redirectBack(request, { sent: true, extra: { code: s.code } }, "/scholarships/apply");
    return json({ code: s.code, email: s.email, season: s.season.title, submittedAt: s.submittedAt }, s.replay ? 200 : 201);
  }, "/scholarships/apply");
