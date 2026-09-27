// Small HTTP helpers shared by every API route: a typed error, JSON
// responses, body readers with size limits, and the JSON/HTML content
// negotiation used by the no-JS-friendly public forms.
import type { APIContext, APIRoute } from "astro";

export class ApiError extends Error {
  status: number;
  field?: string;
  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export function fail(status: number, message: string, field?: string): never {
  throw new ApiError(status, message, field);
}

export function errorBody(err: ApiError): { error: string; field?: string } {
  return err.field ? { error: err.message, field: err.field } : { error: err.message };
}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

/** Wraps a route handler so thrown ApiErrors (and anything else) become JSON error responses. */
export function apiRoute(handler: (ctx: APIContext) => Promise<Response>): APIRoute {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      if (err instanceof ApiError) return jsonResponse(errorBody(err), err.status);
      // Never log request bodies, applicant data, or credentials.
      console.error("api error", err);
      return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}

/** Reads the whole request body up to `maxBytes`, failing fast on an honest Content-Length and mid-stream. */
export async function readLimitedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("Content-Length");
  if (declared && Number(declared) > maxBytes) fail(413, "That upload is too large.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Invalid request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      fail(413, "That upload is too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Parses a JSON body, bounded by `maxBytes`, into a plain object. */
export async function readJsonBody(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) fail(415, "Expected a JSON request body.");
  const bytes = await readLimitedBytes(request, maxBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, "That request body isn't valid JSON.");
  }
  if (!isPlainRecord(parsed)) fail(400, "Invalid request body.");
  return parsed;
}

/** Accepts JSON, url-encoded, or multipart bodies and normalizes to a plain string map (public no-JS forms). */
export async function readFormOrJsonBody(request: Request, maxBytes = 32_768): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  if (contentType.includes("application/json")) return readJsonBody(request, maxBytes);
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const bytes = await readLimitedBytes(request, maxBytes);
    let form: FormData;
    try {
      form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": request.headers.get("Content-Type") || "" },
        body: bytes as BodyInit,
      }).formData();
    } catch {
      fail(400, "Invalid form submission.");
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) if (typeof value === "string") out[key] = value;
    return out;
  }
  fail(415, "Unsupported content type.");
}

/** True when the request's Accept header favors an HTML page over JSON — i.e. a plain browser form post. */
export function prefersHtml(request: Request): boolean {
  const accept = request.headers.get("Accept") || "";
  return accept.includes("text/html");
}

/** The same-origin path a form was posted from, for a safe post/redirect/get back to the page. */
export function refererPath(request: Request): string {
  const referer = request.headers.get("Referer");
  if (!referer) return "/";
  try {
    const refUrl = new URL(referer);
    const selfUrl = new URL(request.url);
    if (refUrl.origin !== selfUrl.origin) return "/";
    return refUrl.pathname || "/";
  } catch {
    return "/";
  }
}

/** 303s a no-JS form submission back to the referring page with a status query string. */
export function formRedirect(request: Request, params: Record<string, string>): Response {
  const path = refererPath(request);
  const search = new URLSearchParams(params).toString();
  return new Response(null, { status: 303, headers: { Location: search ? `${path}?${search}` : path } });
}
