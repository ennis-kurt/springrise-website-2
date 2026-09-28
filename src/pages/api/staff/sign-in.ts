import type { APIRoute } from "astro";
import { safeNext, setSessionCookie, signIn } from "../../../lib/server/auth";
import { clientIp, fail, handle, json, readFields, wantsHtml } from "../../../lib/server/http";

export const POST: APIRoute = ({ request, cookies, url, redirect }) =>
  handle(request, async () => {
    const f = await readFields(request);
    const r = await signIn(f.password ?? "", clientIp(request));
    const html = wantsHtml(request);
    if (!r.ok) {
      if (html) return redirect(`/staff/sign-in?error=${encodeURIComponent(r.error)}&next=${encodeURIComponent(safeNext(f.next))}`, 303);
      return fail(r.status, r.error, r.status === 401 ? "password" : undefined);
    }
    setSessionCookie(cookies, r.token, url);
    return html ? redirect(safeNext(f.next), 303) : json({ ok: true });
  }, "/staff/sign-in");
