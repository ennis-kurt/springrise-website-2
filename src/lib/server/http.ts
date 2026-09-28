// Small helpers shared by API routes.

export interface ApiError { error: string; field?: string }

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });

export const fail = (status: number, error: string, field?: string, headers: HeadersInit = {}) =>
  json(field ? { error, field } : { error }, status, headers);

export class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string) {
    super(message);
  }
}

/** Client IP as seen by Cloudflare ('local' in dev without the header). */
export const clientIp = (request: Request) => request.headers.get("CF-Connecting-IP")?.trim() || "local";

/** True when a classic (non-JS) HTML form made the request and expects a page back. */
export function wantsHtml(request: Request): boolean {
  const type = request.headers.get("Content-Type") ?? "";
  if (type.includes("application/json")) return false;
  const accept = request.headers.get("Accept") ?? "";
  const html = accept.indexOf("text/html");
  if (html < 0) return false;
  const js = accept.indexOf("application/json");
  return js < 0 || html < js;
}

/** 303 back to a same-origin Referer (or fallback) with ?sent=1 or ?error=… */
export function redirectBack(
  request: Request,
  result: { sent: true; extra?: Record<string, string> } | { error: string; field?: string },
  fallback = "/",
): Response {
  const here = new URL(request.url);
  let target = new URL(fallback, here);
  const ref = request.headers.get("Referer");
  if (ref) {
    try {
      const r = new URL(ref);
      if (r.origin === here.origin) target = r;
    } catch { /* ignore malformed referer */ }
  }
  for (const k of ["sent", "error", "field", "code"]) target.searchParams.delete(k);
  if ("sent" in result) {
    target.searchParams.set("sent", "1");
    for (const [k, v] of Object.entries(result.extra ?? {})) target.searchParams.set(k, v);
  } else {
    target.searchParams.set("error", result.error);
    if (result.field) target.searchParams.set("field", result.field);
  }
  target.hash = "";
  return new Response(null, { status: 303, headers: { Location: target.pathname + target.search } });
}

/** Parse a JSON or form-encoded body into a flat string map. */
export async function readFields(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("Content-Type") ?? "";
  const out: Record<string, string> = {};
  if (type.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "The request body isn't valid JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Expected a JSON object.");
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
      else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
    }
    return out;
  }
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, "The form data couldn't be read.");
    }
    for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
    return out;
  }
  throw new HttpError(415, "Send the form as JSON or form data.");
}

/** Run an API handler, turning HttpError into JSON (or a redirect for HTML forms). */
export async function handle(
  request: Request,
  fn: () => Promise<Response>,
  fallback = "/",
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      if (wantsHtml(request)) return redirectBack(request, { error: err.message, field: err.field }, fallback);
      return fail(err.status, err.message, err.field, err.status === 429 ? { "Retry-After": "900" } : {});
    }
    console.error("Unhandled API error", err);
    const msg = "Something went wrong on our side. Please try again in a few minutes.";
    return wantsHtml(request) ? redirectBack(request, { error: msg }, fallback) : fail(500, msg);
  }
}
