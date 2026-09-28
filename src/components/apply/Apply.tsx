/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

type Doc = { key: string; label: string; help: string; required: boolean };
type Props = {
  season: { slug: string; title: string; term: string; year: number; deadline: string };
  docs: Doc[];
  levels: string[];
  preview: boolean;
  fileLimit: number;
  totalLimit: number;
};
type Answers = Record<string, string>;
type Errs = Record<string, string>;
type Receipt = { code: string; email: string; submittedAt: string };

const CHAPTERS = [
  { title: "You", sub: "Who you are and where to reach you" },
  { title: "Your studies", sub: "Your school and the tuition you need" },
  { title: "Your people", sub: "Two references who know your strengths" },
  { title: "Documents", sub: "Five PDFs, one optional" },
  { title: "Send", sub: "Review everything, then submit" },
];

const REQUIRED: string[][] = [
  ["firstName", "lastName", "email", "phone", "birthDate", "country", "address1", "city", "postalCode"],
  ["school", "level", "tuitionAmount", "tuitionDueDate"],
  ["ref1Name", "ref1Email", "ref1Phone", "ref2Name", "ref2Email", "ref2Phone"],
];

const LABEL: Record<string, string> = {
  firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone", birthDate: "Date of birth",
  country: "Country", address1: "Street address", address2: "Apt, suite, unit", city: "City", state: "State",
  postalCode: "ZIP / postal code", school: "College or university", level: "Level of study", major: "Major or program",
  tuitionAmount: "Tuition you're requesting", tuitionDueDate: "Tuition due date",
  ref1Name: "Full name", ref1Email: "Email", ref1Phone: "Phone", ref1Relation: "How they know you",
  ref2Name: "Full name", ref2Email: "Email", ref2Phone: "Phone", ref2Relation: "How they know you",
  note: "Anything else we should know",
};

const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const isPhone = (v: string) => { const n = v.replace(/\D/g, "").length; return n >= 7 && n <= 20; };
const usd = (v: string | number) => Number(v || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/* PDFs persist in IndexedDB so a draft survives closing the tab. */
const store = {
  db: null as IDBDatabase | null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("springrise-application", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async tx<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) {
    const db = await this.open();
    return new Promise<T>((res, rej) => {
      const req = op(db.transaction("files", mode).objectStore("files"));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  put: (k: string, f: File) => store.tx("readwrite", (s) => s.put(f, k)),
  get: (k: string) => store.tx<File | undefined>("readonly", (s) => s.get(k)),
  del: (k: string) => store.tx("readwrite", (s) => s.delete(k)),
};

export default function Apply({ season, docs, levels, preview, fileLimit, totalLimit }: Props) {
  const draftKey = `springrise-application:${season.slug}`;
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ country: "United States" });
  const [files, setFiles] = useState<Record<string, File>>({});
  const [errs, setErrs] = useState<Errs>({});
  const [banner, setBanner] = useState("");
  const [restored, setRestored] = useState(false);
  const [sending, setSending] = useState(false);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState<Receipt | null>(null);
  const [drag, setDrag] = useState("");
  const [calc, setCalc] = useState({ owed: "", aid: "" });
  const key = useRef("");
  const head = useRef<HTMLHeadingElement>(null);

  /* restore */
  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
        if (saved?.a) { setA({ country: "United States", ...saved.a }); setStep(Math.min(saved.step ?? 0, 4)); key.current = saved.key ?? ""; setRestored(true); }
        const got: Record<string, File> = {};
        for (const d of docs) { const f = await store.get(`${season.slug}:${d.key}`).catch(() => undefined); if (f) got[d.key] = f; }
        if (Object.keys(got).length) { setFiles(got); setRestored(true); }
      } catch { /* storage unavailable; continue without drafts */ }
      if (!key.current) key.current = crypto.randomUUID();
      setReady(true);
    })();
  }, []);

  /* autosave */
  useEffect(() => {
    if (!ready || done) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ a, step, key: key.current, at: Date.now() })); } catch { /* ignore */ }
  }, [a, step, ready]);

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (sending) e.preventDefault(); };
    addEventListener("beforeunload", guard);
    return () => removeEventListener("beforeunload", guard);
  }, [sending]);

  const total = useMemo(() => Object.values(files).reduce((n, f) => n + f.size, 0), [files]);
  const needed = docs.filter((d) => d.required);
  const have = needed.filter((d) => files[d.key]).length;

  const on = (k: string) => (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    setA((x) => ({ ...x, [k]: v }));
    if (errs[k]) setErrs((x) => { const n = { ...x }; delete n[k]; return n; });
  };

  function check(s: number): Errs {
    const e: Errs = {};
    for (const k of REQUIRED[s] ?? []) if (!(a[k] ?? "").trim()) e[k] = `${LABEL[k]} is required.`;
    if (s === 0) {
      if (a.email && !isEmail(a.email)) e.email = "That email doesn't look right.";
      if (a.phone && !isPhone(a.phone)) e.phone = "Please enter a phone number we can call.";
      if (a.birthDate) { const age = (Date.now() - Date.parse(a.birthDate)) / 31557600000; if (!(age >= 14 && age <= 100)) e.birthDate = "Please check your date of birth."; }
    }
    if (s === 1 && a.tuitionAmount) {
      const n = Number(a.tuitionAmount);
      if (!/^\d+(\.\d{1,2})?$/.test(a.tuitionAmount.trim()) || n <= 0 || n > 100000) e.tuitionAmount = "Enter dollars and cents, e.g. 4250 or 4250.50.";
    }
    if (s === 2) {
      for (const n of [1, 2]) {
        const em = (a[`ref${n}Email`] ?? "").trim().toLowerCase();
        if (em && !isEmail(em)) e[`ref${n}Email`] = "That email doesn't look right.";
        if (em && em === (a.email ?? "").trim().toLowerCase()) e[`ref${n}Email`] = "A reference can't use your email.";
        const ph = a[`ref${n}Phone`] ?? "";
        if (ph && !isPhone(ph)) e[`ref${n}Phone`] = "Please enter a phone number.";
      }
      const r1 = (a.ref1Email ?? "").trim().toLowerCase(), r2 = (a.ref2Email ?? "").trim().toLowerCase();
      if (r1 && r1 === r2) e.ref2Email = "Please list two different people.";
    }
    if (s === 3) {
      for (const d of needed) if (!files[d.key]) e[`file-${d.key}`] = `Add your ${d.label.toLowerCase()}.`;
      if (total > totalLimit) e["file-total"] = `These add up to ${size(total)}. Please keep the total under ${size(totalLimit)}.`;
    }
    if (s === 4 && a.consent !== "yes") e.consent = "Please confirm the declaration.";
    return e;
  }

  function focusFirst(e: Errs) {
    const k = Object.keys(e)[0];
    if (!k) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(k.startsWith("file-") ? k : `q-${k}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el as HTMLElement | null)?.focus({ preventScroll: true });
    });
  }

  function go(n: number) {
    setStep(n); setErrs({}); setBanner("");
    requestAnimationFrame(() => {
      document.getElementById("application")?.scrollIntoView({ behavior: "smooth", block: "start" });
      head.current?.focus({ preventScroll: true });
    });
  }

  const reachable = (i: number) => { for (let s = 0; s < i; s++) if (Object.keys(check(s)).length) return false; return true; };

  function next(ev?: Event) {
    ev?.preventDefault();
    const e = check(step);
    setErrs(e);
    if (Object.keys(e).length) { setBanner("A few things need your attention."); focusFirst(e); return; }
    if (step < 4) go(step + 1); else submit();
  }

  async function addFile(k: string, f?: File | null) {
    if (!f) return;
    const bad = (m: string) => setErrs((x) => ({ ...x, [`file-${k}`]: m }));
    if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) return bad("That isn't a PDF. Please export or scan it as a PDF.");
    if (f.size > fileLimit) return bad(`That file is ${size(f.size)}; the limit is ${size(fileLimit)}. Try compressing it.`);
    const sig = new Uint8Array(await f.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...sig) !== "%PDF-") return bad("That file doesn't look like a valid PDF.");
    setFiles((x) => ({ ...x, [k]: f }));
    setErrs((x) => { const n = { ...x }; delete n[`file-${k}`]; delete n["file-total"]; return n; });
    store.put(`${season.slug}:${k}`, f).catch(() => {});
  }
  function dropFile(k: string) {
    setFiles((x) => { const n = { ...x }; delete n[k]; return n; });
    store.del(`${season.slug}:${k}`).catch(() => {});
  }
  async function clear() {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    await Promise.all(docs.map((d) => store.del(`${season.slug}:${d.key}`).catch(() => {})));
  }
  async function restart() {
    if (!confirm("Clear this draft and start again?")) return;
    await clear();
    setA({ country: "United States" }); setFiles({}); setRestored(false); key.current = crypto.randomUUID(); go(0);
  }

  function submit() {
    if (preview) { setBanner("Preview mode: this season isn't accepting applications, so nothing will be sent."); return; }
    const fd = new FormData();
    fd.append("season", season.slug);
    for (const [k, v] of Object.entries(a)) fd.append(k, (v ?? "").trim());
    fd.set("consent", "yes");
    for (const d of docs) if (files[d.key]) fd.append(d.key, files[d.key], files[d.key].name);
    setSending(true); setPct(0); setBanner("");
    const x = new XMLHttpRequest();
    x.open("POST", "/api/apply");
    x.setRequestHeader("Idempotency-Key", key.current);
    x.setRequestHeader("Accept", "application/json");
    x.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
    x.onload = async () => {
      let body: any = {};
      try { body = JSON.parse(x.responseText); } catch { /* not json */ }
      setSending(false);
      if (x.status >= 200 && x.status < 300 && body.code) {
        await clear();
        setDone({ code: body.code, email: body.email ?? a.email, submittedAt: body.submittedAt ?? new Date().toISOString() });
        requestAnimationFrame(() => document.getElementById("application")?.scrollIntoView({ behavior: "smooth" }));
        return;
      }
      const msg = body.error || (x.status === 413 ? "Those files are too large to send. Please compress them." : "We couldn't send your application. Your draft is safe; please try again.");
      setBanner(msg);
      if (body.field) {
        const isDoc = docs.some((d) => d.key === body.field);
        const target = isDoc ? 3 : REQUIRED.findIndex((ks) => ks.includes(body.field));
        const fk = isDoc ? `file-${body.field}` : body.field;
        setErrs({ [fk]: msg });
        if (target >= 0 && target !== step) setStep(target);
        focusFirst({ [fk]: msg });
      }
    };
    x.onerror = () => { setSending(false); setBanner("Connection lost, but your draft is safe. Check your internet and send again."); };
    x.send(fd);
  }

  function receipt() {
    if (!done) return;
    const when = new Date(done.submittedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "long", timeStyle: "short" });
    const text = [
      "SPRINGRISE FOUNDATION · APPLICATION RECEIPT", "",
      `Season      ${season.title}`, `Reference   ${done.code}`, `Applicant   ${a.firstName} ${a.lastName}`,
      `Email       ${done.email}`, `Submitted   ${when} ET`, "",
      "Keep this reference for any follow-up. Submitting is not an award decision.",
      "Status: https://springrise.org/scholarships/status", "Questions: scholarship@springrise.org · (973) 804-9082",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    Object.assign(document.createElement("a"), { href: url, download: `springrise-${done.code}.txt` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const q = (k: string, o: { type?: string; opt?: boolean; ac?: string; hint?: string; ph?: string; wide?: boolean; mode?: string; max?: string } = {}) => (
    <div class={`field${o.wide ? " wide" : ""}`}>
      <label for={`q-${k}`}>{LABEL[k]}{o.opt && <small class="opt">optional</small>}</label>
      <input id={`q-${k}`} name={k} class="input" type={o.type ?? "text"} value={a[k] ?? ""} onInput={on(k)} autoComplete={o.ac}
        placeholder={o.ph} inputMode={o.mode as any} max={o.max} maxLength={200} aria-invalid={errs[k] ? "true" : undefined}
        aria-describedby={[o.hint && `h-${k}`, errs[k] && `e-${k}`].filter(Boolean).join(" ") || undefined} />
      {o.hint && <p class="field__hint" id={`h-${k}`}>{o.hint}</p>}
      {errs[k] && <p class="field__error" id={`e-${k}`}>{errs[k]}</p>}
    </div>
  );

  /* ---------------- done ---------------- */
  if (done) {
    return (
      <div class="ap-done" id="application">
        <svg class="ap-done__stem" viewBox="0 0 120 260" aria-hidden="true">
          <path d="M60 258C60 190 52 140 70 40" pathLength="1" />
          <path class="leaf" d="M62 150c-14-4-26-16-28-32 16 2 26 14 28 32Z" />
          <path class="leaf leaf--2" d="M66 110c14-6 26-18 26-34-16 4-25 16-26 34Z" />
          <circle cx="70" cy="36" r="9" />
        </svg>
        <div class="ap-done__body">
          <p class="kicker">Application received</p>
          <h2 class="t-1">Welcome to the field, <span class="hl">{a.firstName}.</span></h2>
          <p class="lead">Your application for the {season.title} is in. Keep this reference. It's how we'll find you quickly.</p>
          <div class="ap-ticket">
            <div><span class="mono">Reference</span><strong class="mono">{done.code}</strong></div>
            <div><span class="mono">Applicant</span><strong>{a.firstName} {a.lastName}</strong><em>{done.email}</em></div>
            <div><span class="mono">Submitted</span><strong>{new Date(done.submittedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET</strong></div>
          </div>
          <div class="ap-done__actions">
            <button type="button" class="btn btn--shoot btn--lg" onClick={receipt}>Download receipt</button>
            <button type="button" class="btn btn--line btn--lg" onClick={() => print()}>Print</button>
            <a class="link" href="/scholarships/status">Check your status anytime →</a>
          </div>
          <ol class="ap-next" role="list">
            <li><b>Review</b><span>After the deadline, the Board reviews every application as a whole.</span></li>
            <li><b>We may write</b><span>If anything's missing we'll email you. Just reply with your reference.</span></li>
            <li><b>Decision</b><span>Awards go straight to your school. Submitting isn't a guarantee of an award.</span></li>
          </ol>
        </div>
      </div>
    );
  }

  const progress = (step / 4) * 100;

  /* ---------------- form ---------------- */
  return (
    <div class="ap" id="application">
      <aside class="ap-rail" aria-label="Progress">
        <div class="ap-stem" aria-hidden="true">
          <span class="ap-stem__line" style={{ height: `${Math.max(4, progress)}%` }} />
          <span class="ap-stem__bud" style={{ top: `${Math.max(4, progress)}%` }} />
        </div>
        <ol class="ap-steps" role="list">
          {CHAPTERS.map((c, i) => {
            const state = i === step ? "now" : i < step ? "done" : "todo";
            return (
              <li class={`is-${state}`}>
                <button type="button" onClick={() => go(i)} disabled={!ready || sending || i === step || !reachable(i)} aria-current={i === step ? "step" : undefined}>
                  <span class="mono">{state === "done" ? "✓" : `0${i + 1}`}</span>
                  <span><b>{c.title}</b><small>{c.sub}</small></span>
                </button>
              </li>
            );
          })}
        </ol>
        <div class="ap-rail__note">
          <p><b>Autosaved.</b> Your answers and PDFs stay on this device until you send, so you can close the tab and come back anytime.</p>
          <p>Stuck? <a href="mailto:scholarship@springrise.org">scholarship@springrise.org</a></p>
          {restored && <button type="button" class="ap-reset" onClick={restart}>Start over</button>}
        </div>
      </aside>

      <form class="ap-form" onSubmit={next} noValidate method="post" action="#">
        {preview && <div class="note note--warn"><span><b>Preview.</b> Explore every step freely. Nothing is sent while this season isn't open.</span></div>}
        {restored && step === 0 && <div class="note"><span>Welcome back! We restored your draft.</span></div>}

        <header class="ap-head">
          <p class="mono ap-head__n">Chapter {step + 1} of 5</p>
          <h2 class="t-2" ref={head} tabIndex={-1}>{CHAPTERS[step].title}</h2>
          <p class="muted">{CHAPTERS[step].sub}.</p>
        </header>

        {step === 0 && (
          <div class="ap-body">
            <div class="ap-grid">
              {q("firstName", { ac: "given-name" })}
              {q("lastName", { ac: "family-name" })}
              {q("email", { type: "email", ac: "email", hint: "We'll send your confirmation and any updates here." })}
              {q("phone", { type: "tel", ac: "tel", mode: "tel" })}
              {q("birthDate", { type: "date", ac: "bday", max: new Date().toISOString().slice(0, 10) })}
              <div class="field">
                <label for="q-country">{LABEL.country}</label>
                <select id="q-country" class="select" value={a.country} onChange={on("country")} autoComplete="country-name">
                  <option>United States</option><option>Türkiye</option><option>Other</option>
                </select>
              </div>
            </div>
            <fieldset class="ap-set">
              <legend>Mailing address</legend>
              <div class="ap-grid">
                {q("address1", { ac: "address-line1", wide: true })}
                {q("address2", { ac: "address-line2", opt: true, wide: true })}
                {q("city", { ac: "address-level2" })}
                {a.country === "United States" ? (
                  <div class="field">
                    <label for="q-state">{LABEL.state}</label>
                    <select id="q-state" class="select" value={a.state ?? ""} onChange={on("state")} autoComplete="address-level1">
                      <option value="">Choose…</option>{STATES.map((s) => <option>{s}</option>)}
                    </select>
                  </div>
                ) : q("state", { ac: "address-level1", opt: true })}
                {q("postalCode", { ac: "postal-code" })}
              </div>
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div class="ap-body">
            <div class="ap-grid">{q("school", { ac: "organization", wide: true, ph: "e.g. Rutgers University", hint: "An accredited U.S. institution you attend or have been accepted to." })}</div>
            <fieldset class="ap-set">
              <legend id="q-level" tabIndex={-1}>{LABEL.level}</legend>
              <div class="ap-choices">
                {levels.map((l) => (
                  <label class={`ap-choice${a.level === l ? " is-on" : ""}`}>
                    <input type="radio" name="level" value={l} checked={a.level === l} onChange={on("level")} />{l}
                  </label>
                ))}
              </div>
              {errs.level && <p class="field__error">{errs.level}</p>}
            </fieldset>
            <div class="ap-grid">{q("major", { opt: true, wide: true, ph: "e.g. Civil Engineering" })}</div>

            <div class="ap-calc">
              <p class="mono ap-calc__k">Tuition calculator</p>
              <p class="muted small">Ask only for what you still owe after other scholarships and grants. Tuition only, no housing, insurance or fees.</p>
              <div class="ap-calc__row">
                <label>Tuition owed<span class="usd"><input class="input" inputMode="decimal" placeholder="0" value={calc.owed} onInput={(e) => setCalc((c) => ({ ...c, owed: e.currentTarget.value }))} /></span></label>
                <span class="ap-calc__op" aria-hidden="true">−</span>
                <label>Other aid<span class="usd"><input class="input" inputMode="decimal" placeholder="0" value={calc.aid} onInput={(e) => setCalc((c) => ({ ...c, aid: e.currentTarget.value }))} /></span></label>
                <span class="ap-calc__op" aria-hidden="true">=</span>
                <div class="ap-calc__out">
                  <b>{usd(Math.max(0, (Number(calc.owed) || 0) - (Number(calc.aid) || 0)))}</b>
                  <button type="button" class="btn btn--sm" disabled={!(Number(calc.owed) > 0)} onClick={() => {
                    const v = Math.max(0, (Number(calc.owed) || 0) - (Number(calc.aid) || 0));
                    setA((x) => ({ ...x, tuitionAmount: String(Math.round(v * 100) / 100) }));
                    setErrs((x) => { const n = { ...x }; delete n.tuitionAmount; return n; });
                  }}>Use this</button>
                </div>
              </div>
            </div>

            <div class="ap-grid">
              <div class="field">
                <label for="q-tuitionAmount">{LABEL.tuitionAmount}</label>
                <span class="usd usd--lg"><input id="q-tuitionAmount" class="input" inputMode="decimal" placeholder="0.00" value={a.tuitionAmount ?? ""} onInput={on("tuitionAmount")}
                  aria-invalid={errs.tuitionAmount ? "true" : undefined} aria-describedby={errs.tuitionAmount ? "e-tuitionAmount" : "h-tuitionAmount"} /></span>
                <p class="field__hint" id="h-tuitionAmount">Should match the balance on the tuition bill you upload.</p>
                {errs.tuitionAmount && <p class="field__error" id="e-tuitionAmount">{errs.tuitionAmount}</p>}
              </div>
              {q("tuitionDueDate", { type: "date", hint: "When your school needs payment." })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div class="ap-body">
            <p class="ap-intro">Pick two people who can speak to your character, achievements and potential: a professor, teacher, counselor, employer or community leader. <b>Not relatives.</b> Let them know we may be in touch.</p>
            {[1, 2].map((n) => (
              <fieldset class="ap-set ap-ref">
                <legend><span class="mono">0{n}</span> Reference {n}</legend>
                <div class="ap-grid">
                  {q(`ref${n}Name`)}
                  {q(`ref${n}Relation`, { opt: true, ph: "e.g. Professor, Supervisor" })}
                  {q(`ref${n}Email`, { type: "email" })}
                  {q(`ref${n}Phone`, { type: "tel", mode: "tel" })}
                </div>
              </fieldset>
            ))}
          </div>
        )}

        {step === 3 && (
          <div class="ap-body">
            <div class="ap-meter">
              <span><b>{have}/{needed.length}</b> required</span>
              <span class="ap-meter__bar"><i style={{ width: `${(have / needed.length) * 100}%` }} /></span>
              <span class="mono">{size(total)} / {size(totalLimit)}</span>
            </div>
            <p class="ap-intro">PDFs only, up to {size(fileLimit)} each. Please black out Social Security numbers and bank details first.</p>
            <ul class="ap-drops" role="list">
              {docs.map((d) => {
                const f = files[d.key], e = errs[`file-${d.key}`];
                return (
                  <li class={`ap-drop${f ? " has-file" : ""}${drag === d.key ? " is-drag" : ""}${e ? " has-err" : ""}`}
                    onDragOver={(ev) => { ev.preventDefault(); setDrag(d.key); }} onDragLeave={() => setDrag("")}
                    onDrop={(ev) => { ev.preventDefault(); setDrag(""); addFile(d.key, ev.dataTransfer?.files?.[0]); }}>
                    <span class="ap-drop__ic mono" aria-hidden="true">{f ? "✓" : "PDF"}</span>
                    <span class="ap-drop__txt">
                      <b>{d.label}{!d.required && <small class="opt">optional</small>}</b>
                      <span>{f ? <><em>{f.name}</em> · {size(f.size)}</> : d.help}</span>
                      {e && <span class="field__error" id={`e-file-${d.key}`}>{e}</span>}
                    </span>
                    <span class="ap-drop__act">
                      <label class={`btn btn--sm${f ? " btn--line" : ""}`}>
                        {f ? "Replace" : "Choose file"}
                        <input id={`file-${d.key}`} type="file" accept="application/pdf,.pdf" class="sr-only" aria-label={d.label}
                          aria-invalid={e ? "true" : undefined} aria-describedby={e ? `e-file-${d.key}` : undefined}
                          onChange={(ev) => { addFile(d.key, ev.currentTarget.files?.[0]); ev.currentTarget.value = ""; }} />
                      </label>
                      {f && <button type="button" class="ap-x" onClick={() => dropFile(d.key)} aria-label={`Remove ${d.label}`}>Remove</button>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {errs["file-total"] && <p class="field__error">{errs["file-total"]}</p>}
          </div>
        )}

        {step === 4 && (
          <div class="ap-body">
            <Review title="You" edit={() => go(0)} rows={[
              ["Name", `${a.firstName ?? ""} ${a.lastName ?? ""}`], ["Email", a.email], ["Phone", a.phone], ["Born", a.birthDate],
              ["Address", [a.address1, a.address2, [a.city, a.state, a.postalCode].filter(Boolean).join(", "), a.country].filter(Boolean).join(" · ")],
            ]} />
            <Review title="Your studies" edit={() => go(1)} rows={[
              ["School", a.school], ["Level", a.level], ["Major", a.major || "Not given"], ["Requesting", a.tuitionAmount ? usd(a.tuitionAmount) : ""], ["Due", a.tuitionDueDate],
            ]} />
            <Review title="Your people" edit={() => go(2)} rows={[1, 2].map((n) => [`Reference ${n}`, [a[`ref${n}Name`], a[`ref${n}Relation`], a[`ref${n}Email`], a[`ref${n}Phone`]].filter(Boolean).join(" · ")])} />
            <Review title="Documents" edit={() => go(3)} rows={docs.map((d) => [d.label, files[d.key] ? `${files[d.key].name} · ${size(files[d.key].size)}` : d.required ? "Missing" : "Not included"])} />
            <div class="field">
              <label for="q-note">{LABEL.note}<small class="opt">optional</small></label>
              <textarea id="q-note" class="textarea" maxLength={2000} value={a.note ?? ""} onInput={on("note")} placeholder="Circumstances you'd like considered, context for your GPA, anything else." />
            </div>
            <label class={`ap-consent${errs.consent ? " has-err" : ""}`}>
              <input id="q-consent" type="checkbox" checked={a.consent === "yes"} onChange={(e) => { setA((x) => ({ ...x, consent: e.currentTarget.checked ? "yes" : "" })); setErrs({}); }} />
              <span>I confirm everything here is accurate and complete, my references aren't relatives, and I've read the eligibility criteria. I agree that Springrise Foundation may use this information and my documents to review and administer my application, as described in the <a href="/privacy" target="_blank" rel="noopener">privacy notice</a>. I understand that applying doesn't guarantee an award.</span>
            </label>
            {errs.consent && <p class="field__error">{errs.consent}</p>}
          </div>
        )}

        {banner && <div class="note note--err" role="alert"><span>{banner}</span></div>}
        {sending && (
          <div class="ap-send" role="status" aria-live="polite">
            <span class="ap-send__bar"><i style={{ width: `${pct}%` }} /></span>
            <span>{pct < 100 ? `Uploading securely · ${pct}%` : "Almost there…"}</span>
          </div>
        )}

        <nav class="ap-nav" aria-label="Application steps">
          {step > 0 ? <button type="button" class="btn btn--line" onClick={() => go(step - 1)} disabled={sending}>← Back</button> : <span />}
          <button type="submit" class={`btn btn--lg${step === 4 ? " btn--shoot" : ""}`} disabled={!ready || sending || (step === 4 && preview)}>
            {step < 4 ? `Next: ${CHAPTERS[step + 1].title}` : preview ? "Sending is off in preview" : sending ? "Sending…" : "Send my application"}
            {!sending && <span class="arr">→</span>}
          </button>
        </nav>
        <p class="ap-foot mono">Deadline · {season.deadline}</p>
      </form>
    </div>
  );
}

function Review({ title, rows, edit }: { title: string; rows: (string | undefined)[][]; edit: () => void }) {
  return (
    <section class="ap-review">
      <header><h3>{title}</h3><button type="button" onClick={edit}>Edit</button></header>
      <dl>{rows.map(([k, v]) => <div class={v === "Missing" ? "is-missing" : ""}><dt>{k}</dt><dd>{v || "Not given"}</dd></div>)}</dl>
    </section>
  );
}
