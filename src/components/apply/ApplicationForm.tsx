/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";

type Doc = { key: string; label: string; help: string; required: boolean };
type SeasonInfo = { id: string; slug: string; title: string; term: string; year: number; closesLabel: string };
type Props = { season: SeasonInfo; documents: Doc[]; preview: boolean; maxFile: number; maxTotal: number };
type Data = Record<string, string>;
type Errors = Record<string, string>;

const STEPS = [
  { key: "you", title: "About you", blurb: "Your contact details and mailing address." },
  { key: "study", title: "Study & tuition", blurb: "Where you study and the tuition you need." },
  { key: "refs", title: "References", blurb: "Two people who know your strengths." },
  { key: "docs", title: "Documents", blurb: "Five PDFs, plus one optional." },
  { key: "review", title: "Review & submit", blurb: "Check everything, then send." },
] as const;

const LEVELS = ["Incoming first-year", "Undergraduate", "Graduate", "Other"];

const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" ");

const REQUIRED: Record<number, string[]> = {
  0: ["firstName", "lastName", "email", "phone", "birthday", "country", "address", "city", "postalCode"],
  1: ["institution", "studyLevel", "tuitionAmount", "tuitionDeadline"],
  2: ["reference1Name", "reference1Email", "reference1Phone", "reference2Name", "reference2Email", "reference2Phone"],
};

const LABELS: Record<string, string> = {
  firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone", birthday: "Date of birth",
  country: "Country", address: "Street address", address2: "Apartment, suite, etc.", city: "City", region: "State / province",
  postalCode: "ZIP / postal code", institution: "College or university", studyLevel: "Level of study", major: "Major or program",
  tuitionAmount: "Tuition requested (USD)", tuitionDeadline: "Tuition payment deadline",
  reference1Name: "Full name", reference1Email: "Email", reference1Phone: "Phone", reference1Relationship: "Relationship",
  reference2Name: "Full name", reference2Email: "Email", reference2Phone: "Phone", reference2Relationship: "Relationship",
  note: "Anything else we should know?",
};

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const phoneOk = (v: string) => { const d = v.replace(/\D/g, ""); return d.length >= 7 && d.length <= 20; };
const money = (v: string | number) => Number(v || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/* ---------- Draft persistence: fields in localStorage, PDFs in IndexedDB ---------- */
const idb = {
  open(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
      const r = indexedDB.open("springrise-drafts", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = await idb.open();
    return new Promise((res, rej) => {
      const tx = db.transaction("files", mode);
      const req = fn(tx.objectStore("files"));
      tx.oncomplete = () => res(req ? (req as IDBRequest<T>).result : undefined);
      tx.onerror = () => rej(tx.error);
    });
  },
  put: (k: string, f: File) => idb.run("readwrite", (s) => s.put(f, k)),
  del: (k: string) => idb.run("readwrite", (s) => s.delete(k)),
  get: (k: string) => idb.run<File>("readonly", (s) => s.get(k)),
};

export default function ApplicationForm({ season, documents, preview, maxFile, maxTotal }: Props) {
  const draftKey = `springrise-draft:${season.id}`;
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Data>({ country: "United States" });
  const [files, setFiles] = useState<Record<string, File>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [receipt, setReceipt] = useState<null | { reference: string; email: string; submittedAt: string }>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [calc, setCalc] = useState({ owed: "", aid: "" });
  const idem = useRef<string>("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ready = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  /* restore draft */
  useEffect(() => {
    setHydrated(true);
    (async () => {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved?.data) { setData({ country: "United States", ...saved.data }); setRestored(true); }
          if (typeof saved?.step === "number") setStep(Math.min(saved.step, STEPS.length - 1));
          idem.current = saved?.idem || "";
          const restoredFiles: Record<string, File> = {};
          for (const d of documents) {
            const f = await idb.get(`${season.id}:${d.key}`).catch(() => undefined);
            if (f) restoredFiles[d.key] = f;
          }
          if (Object.keys(restoredFiles).length) { setFiles(restoredFiles); setRestored(true); }
        }
      } catch { /* storage unavailable */ }
      if (!idem.current) idem.current = crypto.randomUUID();
      ready.current = true;
    })();
  }, []);

  /* persist draft */
  useEffect(() => {
    if (!ready.current || receipt) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ data, step, idem: idem.current, savedAt: Date.now() })); } catch { /* ignore */ }
  }, [data, step]);

  /* warn before leaving with unsaved uploads in flight */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (busy) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);

  const set = (k: string) => (e: JSX.TargetedEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    setData((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((er) => { const n = { ...er }; delete n[k]; return n; });
  };

  const totalBytes = useMemo(() => Object.values(files).reduce((n, f) => n + f.size, 0), [files]);
  const requiredDocs = documents.filter((d) => d.required);
  const docsDone = requiredDocs.filter((d) => files[d.key]).length;

  function validate(s: number): Errors {
    const e: Errors = {};
    for (const k of REQUIRED[s] ?? []) if (!String(data[k] ?? "").trim()) e[k] = `Please enter your ${LABELS[k].toLowerCase()}.`;
    if (s === 0) {
      if (data.email && !emailOk(data.email)) e.email = "Please enter a valid email address.";
      if (data.phone && !phoneOk(data.phone)) e.phone = "Please enter a valid phone number.";
      if (data.birthday) {
        const age = (Date.now() - Date.parse(data.birthday)) / (365.25 * 864e5);
        if (!(age >= 14 && age <= 100)) e.birthday = "Please check your date of birth.";
      }
      if (!e.firstName && !data.firstName?.trim()) e.firstName = "Please enter your first name.";
    }
    if (s === 1) {
      const amt = Number(data.tuitionAmount);
      if (data.tuitionAmount && (!(amt > 0) || amt > 100000 || !/^\d+(\.\d{1,2})?$/.test(data.tuitionAmount.trim())))
        e.tuitionAmount = "Enter an amount in dollars, e.g. 4250 or 4250.50.";
      if (!data.studyLevel) e.studyLevel = "Please choose your level of study.";
    }
    if (s === 2) {
      for (const n of [1, 2]) {
        const em = data[`reference${n}Email`] ?? "";
        if (em && !emailOk(em)) e[`reference${n}Email`] = "Please enter a valid email address.";
        const ph = data[`reference${n}Phone`] ?? "";
        if (ph && !phoneOk(ph)) e[`reference${n}Phone`] = "Please enter a valid phone number.";
        if (em && data.email && em.trim().toLowerCase() === data.email.trim().toLowerCase())
          e[`reference${n}Email`] = "A reference can't use your own email address.";
      }
      const a = (data.reference1Email ?? "").trim().toLowerCase(), b = (data.reference2Email ?? "").trim().toLowerCase();
      if (a && b && a === b) e.reference2Email = "Please give two different references.";
    }
    if (s === 3) {
      for (const d of requiredDocs) if (!files[d.key]) e[`file-${d.key}`] = `Please add your ${d.label.toLowerCase()}.`;
      if (totalBytes > maxTotal) e["file-total"] = `Your documents add up to ${kb(totalBytes)}. Please keep the total under ${kb(maxTotal)}.`;
    }
    if (s === 4 && data.consent !== "yes") e.consent = "Please confirm the declaration to submit.";
    return e;
  }

  function focusFirstError(e: Errors) {
    const first = Object.keys(e)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(first.startsWith("file-") ? first : `f-${first}`) as HTMLElement | null;
      el?.focus({ preventScroll: false });
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function go(n: number) {
    setStep(n);
    setFormError("");
    setErrors({});
    requestAnimationFrame(() => {
      document.getElementById("apply-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
      headingRef.current?.focus({ preventScroll: true });
    });
  }

  function next(ev?: Event) {
    ev?.preventDefault();
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) { setFormError("Please fix the highlighted fields."); focusFirstError(e); return; }
    setFormError("");
    if (step < STEPS.length - 1) go(step + 1);
    else submit();
  }

  function canJump(i: number) {
    if (i <= step) return true;
    for (let s = 0; s < i; s++) if (Object.keys(validate(s)).length) return false;
    return true;
  }

  async function addFile(key: string, f: File | undefined | null) {
    if (!f) return;
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) { setErrors((e) => ({ ...e, [`file-${key}`]: "That file isn't a PDF. Please export or scan it as a PDF." })); return; }
    if (f.size > maxFile) { setErrors((e) => ({ ...e, [`file-${key}`]: `That PDF is ${kb(f.size)}. The limit is ${kb(maxFile)} — try compressing it.` })); return; }
    const head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== "%PDF-") { setErrors((e) => ({ ...e, [`file-${key}`]: "That file doesn't look like a valid PDF." })); return; }
    setFiles((fs) => ({ ...fs, [key]: f }));
    setErrors((e) => { const n = { ...e }; delete n[`file-${key}`]; delete n["file-total"]; return n; });
    idb.put(`${season.id}:${key}`, f).catch(() => {});
  }

  function removeFile(key: string) {
    setFiles((fs) => { const n = { ...fs }; delete n[key]; return n; });
    idb.del(`${season.id}:${key}`).catch(() => {});
  }

  async function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    await Promise.all(documents.map((d) => idb.del(`${season.id}:${d.key}`).catch(() => {})));
  }

  async function startOver() {
    if (!confirm("Clear everything you've entered and start again?")) return;
    await clearDraft();
    setData({ country: "United States" }); setFiles({}); setErrors({}); setRestored(false);
    idem.current = crypto.randomUUID();
    go(0);
  }

  function submit() {
    if (preview) { setFormError("This is a preview — applications for this season are not being accepted right now."); return; }
    const fd = new FormData();
    fd.append("seasonId", season.id);
    for (const [k, v] of Object.entries(data)) if (typeof v === "string") fd.append(k, v.trim());
    fd.set("consent", "yes");
    for (const d of documents) if (files[d.key]) fd.append(d.key, files[d.key], files[d.key].name);

    setBusy(true); setProgress(0); setFormError("");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/applications");
    xhr.setRequestHeader("Idempotency-Key", idem.current);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = async () => {
      let body: any = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.reference) {
        await clearDraft();
        setReceipt({ reference: body.reference, email: body.email ?? data.email, submittedAt: body.submittedAt ?? new Date().toISOString() });
        setBusy(false);
        requestAnimationFrame(() => document.getElementById("apply-top")?.scrollIntoView({ behavior: "smooth" }));
        return;
      }
      setBusy(false);
      const msg = body.error || (xhr.status === 413 ? "Your files are too large to send. Please compress them and try again." : "We couldn't submit your application. Please try again in a moment.");
      setFormError(msg);
      if (body.field) {
        const stepOf = Object.entries(REQUIRED).find(([, ks]) => ks.includes(body.field))?.[0];
        const docStep = documents.some((d) => d.key === body.field) ? 3 : undefined;
        const target = docStep ?? (stepOf !== undefined ? Number(stepOf) : undefined);
        const fieldKey = docStep !== undefined ? `file-${body.field}` : body.field;
        setErrors({ [fieldKey]: msg });
        if (target !== undefined && target !== step) setStep(target);
        focusFirstError({ [fieldKey]: msg });
      }
    };
    xhr.onerror = () => { setBusy(false); setFormError("Network problem — your draft is safe. Check your connection and submit again."); };
    xhr.send(fd);
  }

  function downloadReceipt() {
    if (!receipt) return;
    const lines = [
      "SPRINGRISE FOUNDATION — APPLICATION RECEIPT", "",
      `Season:      ${season.title}`,
      `Reference:   ${receipt.reference}`,
      `Applicant:   ${data.firstName} ${data.lastName}`,
      `Email:       ${receipt.email}`,
      `Submitted:   ${new Date(receipt.submittedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "long", timeStyle: "short" })} ET`,
      `Documents:   ${documents.filter((d) => files[d.key] || d.required).map((d) => d.label).join(", ")}`, "",
      "Keep this reference for any follow-up. A submission is not an award decision.",
      "Check your status any time at https://springrise.org/scholarships/status",
      "Questions: scholarship@springrise.org · (973) 804-9082",
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `springrise-${receipt.reference}.txt` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- field renderers ---------- */
  const field = (k: string, o: { type?: string; optional?: boolean; ac?: string; hint?: string; placeholder?: string; inputMode?: string; max?: string; min?: string; span?: 1 | 2 } = {}) => {
    const err = errors[k];
    return (
      <div class={`field ${o.span === 2 ? "span-2" : ""}`}>
        <label for={`f-${k}`}>{LABELS[k]}{o.optional && <small>Optional</small>}</label>
        <input
          id={`f-${k}`} name={k} class="input" type={o.type ?? "text"} value={data[k] ?? ""} onInput={set(k)}
          autoComplete={o.ac} placeholder={o.placeholder} inputMode={o.inputMode as any} max={o.max} min={o.min}
          maxLength={200} required={!o.optional} aria-invalid={err ? "true" : undefined}
          aria-describedby={[o.hint && `h-${k}`, err && `e-${k}`].filter(Boolean).join(" ") || undefined}
        />
        {o.hint && <p class="field__hint" id={`h-${k}`}>{o.hint}</p>}
        {err && <p class="field__error" id={`e-${k}`}>{err}</p>}
      </div>
    );
  };

  /* ---------- success ---------- */
  if (receipt) {
    return (
      <div class="apply-success" id="apply-top">
        <div class="apply-success__burst" aria-hidden="true"><span /><span /><span /></div>
        <p class="eyebrow eyebrow--plain">Application received</p>
        <h2 class="display" tabIndex={-1}>Thank you, {data.firstName}. <em>Your story is with us.</em></h2>
        <p class="lead">Your application for the {season.title} has been received. We've recorded it under the reference below — keep it for any follow-up.</p>
        <div class="receipt">
          <div><span class="label">Reference</span><strong class="receipt__ref">{receipt.reference}</strong></div>
          <div><span class="label">Applicant</span><strong>{data.firstName} {data.lastName}</strong><span>{receipt.email}</span></div>
          <div><span class="label">Submitted</span><strong>{new Date(receipt.submittedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET</strong></div>
        </div>
        <div class="apply-success__actions">
          <button type="button" class="btn btn--cobalt btn--lg" onClick={downloadReceipt}>Download receipt</button>
          <button type="button" class="btn btn--ghost btn--lg" onClick={() => window.print()}>Print this page</button>
          <a class="link-arrow" href="/scholarships/status">Check your status any time →</a>
        </div>
        <ol class="next-steps" role="list">
          <li><span>01</span><strong>Review</strong><p>After the deadline, the Board of Directors reviews every application holistically.</p></li>
          <li><span>02</span><strong>We may reach out</strong><p>If anything is missing we'll email you. Reply to scholarship@springrise.org with your reference.</p></li>
          <li><span>03</span><strong>Decision</strong><p>Awards are paid directly to your institution. A submission is not a guarantee of an award.</p></li>
        </ol>
      </div>
    );
  }

  const pct = Math.round((step / (STEPS.length - 1)) * 100);

  return (
    <div class="apply" id="apply-top">
      {/* ---------- Stepper ---------- */}
      <aside class="apply__rail" aria-label="Application progress">
        <div class="apply__meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <ol class="stepper" role="list">
          {STEPS.map((s, i) => {
            const state = i === step ? "current" : i < step ? "done" : "todo";
            const clickable = canJump(i) && i !== step;
            return (
              <li class={`stepper__item is-${state}`}>
                <button type="button" disabled={!clickable || busy} onClick={() => go(i)} aria-current={i === step ? "step" : undefined}>
                  <span class="stepper__num">{state === "done" ? "✓" : String(i + 1).padStart(2, "0")}</span>
                  <span class="stepper__text"><strong>{s.title}</strong><small>{s.blurb}</small></span>
                </button>
              </li>
            );
          })}
        </ol>
        <div class="apply__aside">
          <p><strong>Saved as you go.</strong> Your answers and PDFs stay on this device until you submit, so you can close the tab and come back.</p>
          <p>Questions? <a href="mailto:scholarship@springrise.org">scholarship@springrise.org</a></p>
          {(restored || Object.keys(data).length > 1) && <button type="button" class="apply__reset" onClick={startOver}>Clear draft & start over</button>}
        </div>
      </aside>

      {/* ---------- Form ---------- */}
      <form class="apply__form" onSubmit={next} noValidate method="post" action="#">
        {preview && (
          <div class="notice notice--warning apply__preview">
            <span><strong>Preview mode.</strong> Explore every step — nothing will be submitted while this season is not accepting applications.</span>
          </div>
        )}
        {restored && step === 0 && (
          <div class="notice apply__restored"><span>Welcome back — we restored your saved draft.</span></div>
        )}
        <header class="apply__head">
          <p class="label">Step {step + 1} of {STEPS.length}</p>
          <h2 class="h2" ref={headingRef} tabIndex={-1}>{STEPS[step].title}</h2>
        </header>

        {step === 0 && (
          <div class="apply__body">
            <div class="grid-2">
              {field("firstName", { ac: "given-name" })}
              {field("lastName", { ac: "family-name" })}
              {field("email", { type: "email", ac: "email", hint: "We'll send updates about your application here." })}
              {field("phone", { type: "tel", ac: "tel", inputMode: "tel" })}
              {field("birthday", { type: "date", ac: "bday", max: new Date().toISOString().slice(0, 10) })}
              <div class="field">
                <label for="f-country">{LABELS.country}</label>
                <select id="f-country" class="select" value={data.country} onChange={set("country")} autoComplete="country-name">
                  <option>United States</option>
                  <option>Türkiye</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
            <fieldset class="apply__group">
              <legend>Mailing address</legend>
              <div class="grid-2">
                {field("address", { ac: "address-line1", span: 2 })}
                {field("address2", { ac: "address-line2", optional: true, span: 2 })}
                {field("city", { ac: "address-level2" })}
                {data.country === "United States" ? (
                  <div class="field">
                    <label for="f-region">State</label>
                    <select id="f-region" class="select" value={data.region ?? ""} onChange={set("region")} autoComplete="address-level1">
                      <option value="">Select…</option>
                      {US_STATES.map((s) => <option>{s}</option>)}
                    </select>
                  </div>
                ) : field("region", { ac: "address-level1", optional: true })}
                {field("postalCode", { ac: "postal-code" })}
              </div>
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div class="apply__body">
            <div class="grid-2">
              {field("institution", { ac: "organization", span: 2, hint: "Accredited U.S. institution you attend or have been accepted to.", placeholder: "e.g. Rutgers University" })}
            </div>
            <fieldset class="apply__group" aria-describedby={errors.studyLevel ? "e-studyLevel" : undefined}>
              <legend>Level of study</legend>
              <div class="choice-grid" id="f-studyLevel" tabIndex={-1}>
                {LEVELS.map((l) => (
                  <label class={`choice ${data.studyLevel === l ? "is-on" : ""}`}>
                    <input type="radio" name="studyLevel" value={l} checked={data.studyLevel === l} onChange={set("studyLevel")} />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
              {errors.studyLevel && <p class="field__error" id="e-studyLevel">{errors.studyLevel}</p>}
            </fieldset>
            <div class="grid-2">
              {field("major", { optional: true, span: 2, placeholder: "e.g. Mechanical Engineering" })}
            </div>

            <div class="calc">
              <div class="calc__head">
                <p class="label">Work out your request</p>
                <p>Request only the tuition you still owe after other scholarships and grants — no housing, insurance or other fees.</p>
              </div>
              <div class="calc__row">
                <label>Tuition owed<span class="money"><input class="input" inputMode="decimal" value={calc.owed} onInput={(e) => setCalc((c) => ({ ...c, owed: e.currentTarget.value }))} placeholder="0" /></span></label>
                <span class="calc__op">−</span>
                <label>Other aid<span class="money"><input class="input" inputMode="decimal" value={calc.aid} onInput={(e) => setCalc((c) => ({ ...c, aid: e.currentTarget.value }))} placeholder="0" /></span></label>
                <span class="calc__op">=</span>
                <div class="calc__result">
                  <span class="label">Your request</span>
                  <strong>{money(Math.max(0, (Number(calc.owed) || 0) - (Number(calc.aid) || 0)))}</strong>
                  <button type="button" class="btn btn--sm btn--ghost" disabled={!(Number(calc.owed) > 0)}
                    onClick={() => { const v = Math.max(0, (Number(calc.owed) || 0) - (Number(calc.aid) || 0)); setData((d) => ({ ...d, tuitionAmount: v.toFixed(2).replace(/\.00$/, "") })); setErrors((e) => { const n = { ...e }; delete n.tuitionAmount; return n; }); }}>
                    Use this amount
                  </button>
                </div>
              </div>
            </div>

            <div class="grid-2">
              <div class="field">
                <label for="f-tuitionAmount">{LABELS.tuitionAmount}</label>
                <span class="money money--lg">
                  <input id="f-tuitionAmount" class="input" inputMode="decimal" value={data.tuitionAmount ?? ""} onInput={set("tuitionAmount")} placeholder="0.00"
                    aria-invalid={errors.tuitionAmount ? "true" : undefined} aria-describedby={errors.tuitionAmount ? "e-tuitionAmount" : "h-tuitionAmount"} />
                </span>
                <p class="field__hint" id="h-tuitionAmount">Must match the balance on the tuition statement you upload.</p>
                {errors.tuitionAmount && <p class="field__error" id="e-tuitionAmount">{errors.tuitionAmount}</p>}
              </div>
              {field("tuitionDeadline", { type: "date", hint: "When your school needs payment for this semester." })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div class="apply__body">
            <p class="apply__intro">Choose two people who can speak to your character, achievements and potential — a professor, teacher, counselor, employer or community leader. <strong>References can't be relatives.</strong> Let them know we may contact them.</p>
            {[1, 2].map((n) => (
              <fieldset class="apply__group ref-card">
                <legend><span class="ref-card__num">0{n}</span> Reference {n}</legend>
                <div class="grid-2">
                  {field(`reference${n}Name`, { ac: "off" })}
                  {field(`reference${n}Relationship`, { optional: true, placeholder: "e.g. Professor, Supervisor" })}
                  {field(`reference${n}Email`, { type: "email", ac: "off" })}
                  {field(`reference${n}Phone`, { type: "tel", ac: "off", inputMode: "tel" })}
                </div>
              </fieldset>
            ))}
          </div>
        )}

        {step === 3 && (
          <div class="apply__body">
            <div class="docs-meter">
              <div><strong>{docsDone} of {requiredDocs.length}</strong> required documents added</div>
              <div class="docs-meter__bar"><span style={{ width: `${(docsDone / requiredDocs.length) * 100}%` }} /></div>
              <div class="docs-meter__size">{kb(totalBytes)} of {kb(maxTotal)}</div>
            </div>
            <p class="apply__intro">Upload clear PDF copies, up to {kb(maxFile)} each. Please remove Social Security numbers and banking details before uploading.</p>
            <ul class="drops" role="list">
              {documents.map((d) => {
                const f = files[d.key];
                const err = errors[`file-${d.key}`];
                return (
                  <li class={`drop ${f ? "has-file" : ""} ${dragging === d.key ? "is-drag" : ""} ${err ? "has-error" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(d.key); }}
                    onDragLeave={() => setDragging(null)}
                    onDrop={(e) => { e.preventDefault(); setDragging(null); addFile(d.key, e.dataTransfer?.files?.[0]); }}>
                    <div class="drop__icon" aria-hidden="true">{f ? "✓" : "PDF"}</div>
                    <div class="drop__text">
                      <p class="drop__label">{d.label} {!d.required && <small>Optional</small>}</p>
                      <p class="drop__help">{f ? <><span class="drop__file">{f.name}</span> · {kb(f.size)}</> : d.help}</p>
                      {err && <p class="field__error" id={`e-file-${d.key}`}>{err}</p>}
                    </div>
                    <div class="drop__actions">
                      <label class={`btn btn--sm ${f ? "btn--ghost" : ""}`}>
                        {f ? "Replace" : "Choose PDF"}
                        <input id={`file-${d.key}`} type="file" accept="application/pdf,.pdf" class="visually-hidden"
                          aria-label={`${d.label}${d.required ? "" : " (optional)"}`} aria-invalid={err ? "true" : undefined}
                          aria-describedby={err ? `e-file-${d.key}` : undefined}
                          onChange={(e) => { addFile(d.key, e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
                      </label>
                      {f && <button type="button" class="drop__remove" onClick={() => removeFile(d.key)} aria-label={`Remove ${d.label}`}>Remove</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {errors["file-total"] && <p class="field__error">{errors["file-total"]}</p>}
          </div>
        )}

        {step === 4 && (
          <div class="apply__body">
            <ReviewBlock title="About you" onEdit={() => go(0)} rows={[
              ["Name", `${data.firstName ?? ""} ${data.lastName ?? ""}`], ["Email", data.email], ["Phone", data.phone],
              ["Date of birth", data.birthday], ["Address", [data.address, data.address2, [data.city, data.region, data.postalCode].filter(Boolean).join(", "), data.country].filter(Boolean).join(" · ")],
            ]} />
            <ReviewBlock title="Study & tuition" onEdit={() => go(1)} rows={[
              ["Institution", data.institution], ["Level", data.studyLevel], ["Major", data.major || "—"],
              ["Tuition requested", data.tuitionAmount ? money(data.tuitionAmount) : ""], ["Payment deadline", data.tuitionDeadline],
            ]} />
            <ReviewBlock title="References" onEdit={() => go(2)} rows={[1, 2].map((n) => [
              `Reference ${n}`, [data[`reference${n}Name`], data[`reference${n}Relationship`], data[`reference${n}Email`], data[`reference${n}Phone`]].filter(Boolean).join(" · "),
            ])} />
            <ReviewBlock title="Documents" onEdit={() => go(3)} rows={documents.map((d) => [d.label, files[d.key] ? `${files[d.key].name} (${kb(files[d.key].size)})` : d.required ? "Missing" : "Not included"])} />

            <div class="field">
              <label for="f-note">{LABELS.note}<small>Optional</small></label>
              <textarea id="f-note" class="textarea" maxLength={2000} value={data.note ?? ""} onInput={set("note")} placeholder="Circumstances you'd like the committee to consider, a GPA explanation, anything else." />
            </div>

            <label class={`consent ${errors.consent ? "has-error" : ""}`}>
              <input id="f-consent" type="checkbox" checked={data.consent === "yes"}
                onChange={(e) => { setData((d) => ({ ...d, consent: e.currentTarget.checked ? "yes" : "" })); setErrors((er) => { const n = { ...er }; delete n.consent; return n; }); }} />
              <span>I confirm the information I've provided is accurate and complete, my references are not relatives, and I've read the eligibility requirements. I consent to Springrise Foundation using this information and my documents to review and administer my application, as described in the <a href="/privacy" target="_blank" rel="noopener">privacy notice</a>. I understand that submitting does not guarantee an award.</span>
            </label>
            {errors.consent && <p class="field__error">{errors.consent}</p>}
          </div>
        )}

        {formError && <div class="notice notice--error apply__error" role="alert">{formError}</div>}

        {busy && (
          <div class="upload-progress" role="status" aria-live="polite">
            <div class="upload-progress__bar"><span style={{ width: `${progress}%` }} /></div>
            <span>{progress < 100 ? `Uploading securely… ${progress}%` : "Finishing up…"}</span>
          </div>
        )}

        <div class="apply__nav">
          {step > 0 ? <button type="button" class="btn btn--ghost" onClick={() => go(step - 1)} disabled={busy}>← Back</button> : <span />}
          <button type="submit" class={`btn btn--lg ${step === STEPS.length - 1 ? "btn--cobalt" : ""}`} disabled={!hydrated || busy || (step === STEPS.length - 1 && preview)}>
            {step === STEPS.length - 1 ? (preview ? "Submission unavailable in preview" : busy ? "Submitting…" : `Submit application`) : `Continue to ${STEPS[step + 1].title.toLowerCase()}`}
            {!busy && <span aria-hidden="true"> →</span>}
          </button>
        </div>
        <p class="apply__foot">Deadline: {season.closesLabel}. Submit once — you'll get a reference number immediately.</p>
      </form>
    </div>
  );
}

function ReviewBlock({ title, rows, onEdit }: { title: string; rows: (string | undefined)[][]; onEdit: () => void }) {
  return (
    <section class="review">
      <header><h3>{title}</h3><button type="button" class="review__edit" onClick={onEdit}>Edit</button></header>
      <dl>
        {rows.map(([k, v]) => (
          <div class={v === "Missing" ? "is-missing" : ""}><dt>{k}</dt><dd>{v || "—"}</dd></div>
        ))}
      </dl>
    </section>
  );
}
