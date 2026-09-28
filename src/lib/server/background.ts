/** Run work after the response is sent when the platform allows it; never rejects. */
export function later(locals: App.Locals, work: Promise<unknown>): void {
  const safe = work.catch((err) => console.warn("Background task failed", err));
  const ctx = (locals as { cfContext?: ExecutionContext }).cfContext;
  try {
    if (ctx?.waitUntil) return ctx.waitUntil(safe);
  } catch { /* fall through */ }
  void safe;
}
