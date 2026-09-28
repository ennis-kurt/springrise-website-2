// Site-wide progressive enhancement. Everything here is optional: the page works without it.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Reveal on scroll: .rv, .split, [data-inview] */
const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      e.target.dispatchEvent(new CustomEvent("inview"));
      seen.unobserve(e.target);
    }
  },
  { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
);
document.querySelectorAll(".rv, .split, [data-inview]").forEach((el) => seen.observe(el));

/* Count-up numbers: <span data-count="128143" data-prefix="$" data-decimals="0">0</span> */
const fmt = (n: number, d: number) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
function countUp(el: HTMLElement) {
  const to = Number(el.dataset.count);
  const d = Number(el.dataset.decimals ?? 0);
  const pre = el.dataset.prefix ?? "";
  const suf = el.dataset.suffix ?? "";
  if (reduce) { el.textContent = pre + fmt(to, d) + suf; return; }
  const dur = Number(el.dataset.duration ?? 1800);
  const t0 = performance.now();
  const tick = (t: number) => {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 4);
    el.textContent = pre + fmt(to * eased, d) + suf;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const counters = new IntersectionObserver(
  (entries) => entries.forEach((e) => { if (e.isIntersecting) { countUp(e.target as HTMLElement); counters.unobserve(e.target); } }),
  { threshold: 0.4 },
);
document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => counters.observe(el));

/* Copy buttons: <button data-copy="text"><span data-copy-label>Copy</span></button> */
document.addEventListener("click", async (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-copy]");
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy!);
    const label = btn.querySelector("[data-copy-label]") ?? btn;
    const prev = label.textContent;
    label.textContent = "Copied ✓";
    setTimeout(() => (label.textContent = prev), 1800);
  } catch { /* clipboard blocked */ }
});

/* Simple forms: <form data-form data-ok="Thanks"> posts JSON to its action and reports into [data-msg] */
document.querySelectorAll<HTMLFormElement>("form[data-form]").forEach((form) => {
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = form.querySelector<HTMLElement>("[data-msg]");
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]");
    btn?.setAttribute("disabled", "");
    if (msg) { msg.className = "form-msg"; msg.textContent = "Sending…"; }
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong — please try again.");
      if (msg) { msg.textContent = form.dataset.ok || "Thank you."; msg.classList.add("is-ok"); }
      form.reset();
    } catch (err) {
      if (msg) { msg.textContent = (err as Error).message; msg.classList.add("is-err"); }
    } finally {
      btn?.removeAttribute("disabled");
    }
  });
});

/* Magnetic buttons: [data-magnetic] */
if (!reduce && matchMedia("(pointer: fine)").matches) {
  document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
}

/* Live countdowns: <span data-countdown="ISO"> */
const cds = document.querySelectorAll<HTMLElement>("[data-countdown]");
if (cds.length) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const draw = () => cds.forEach((el) => {
    const ms = Math.max(0, Date.parse(el.dataset.countdown!) - Date.now());
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    el.querySelector("[data-d]")!.textContent = String(d);
    el.querySelector("[data-h]")!.textContent = pad(h);
    el.querySelector("[data-m]")!.textContent = pad(m);
    el.querySelector("[data-s]")!.textContent = pad(s);
  });
  draw();
  setInterval(draw, 1000);
}
