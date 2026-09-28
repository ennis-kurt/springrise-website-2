// Every fact on the site lives here. Sources:
//  - springrise.org (mission, programs, eligibility, contact, giving methods)
//  - "Springrise Foundation, General Organization Presentation" (financials, reach, pillars, gift tiers, IRS status)
//  - By-Laws of Springrise Foundation, Inc.

export const ORG = {
  name: "Springrise Foundation",
  legal: "Springrise Foundation, Inc.",
  purpose:
    "Empowering students of Turkish descent to become self-confident, socially conscious, life-long learners.",
  summary:
    "Springrise supports academic success and career impact for students of Turkish descent in U.S. higher education through scholarships, internships and mentorship.",
  state: "New Jersey",
  ein: "93-2396404",
  exemptSince: "June 29, 2023",
  address: ["P.O. Box 55", "Denville, NJ 07834"],
  phone: "(973) 804-9082",
  phoneHref: "tel:+19738049082",
  email: { info: "info@springrise.org", scholarship: "scholarship@springrise.org", giving: "donation@springrise.org" },
  zelle: { to: "donation@springrise.org", name: "Springrise Foundation Inc" },
} as const;

/** Fiscal-year results (from the foundation's presentation). Amounts in USD. */
export const FINANCE = {
  years: ["FY 2024", "FY 2025"] as const,
  contributions: [110618.99, 128143.43],
  scholarships: [57334.77, 89609.78],
  operations: [709.21, 2709.75],
  netIncome: [52575.01, 35893.78],
  /** share of FY 2025 spending that went directly to students */
  directAid: 0.971,
  note: "Net surplus decreased because scholarship giving was intentionally prioritized over accumulation.",
};

export const REACH = {
  students: [
    { year: 2024, count: 19 },
    { year: 2025, count: 25 },
  ],
  growth: 0.315,
};

export const PILLARS = [
  {
    key: "scholarships",
    title: "Scholarships",
    line: "Direct bursaries that lift the weight of tuition so students can focus on learning.",
    detail: "Seasonal, need-based awards each Spring and Fall, paid straight to the student's college or university.",
  },
  {
    key: "internships",
    title: "Internships",
    line: "Coordination that helps students find and secure professional internships.",
    detail: "We connect students with opportunities and people who can open the first door of a career.",
  },
  {
    key: "mentorship",
    title: "Mentorship",
    line: "Professional guidance to navigate higher education and the road to a career.",
    detail: "One-to-one guidance on courses, applications, first jobs and the questions no syllabus answers.",
  },
] as const;

export const COMMUNITY = [
  { k: "Who", v: "Students of Turkish descent living in the United States." },
  { k: "Circumstances", v: "From low- to middle-income families with limited financial resources." },
  { k: "Promise", v: "High academic potential, facing socioeconomic disadvantage." },
];

export const GIFTS = [
  { amount: 4000, label: "Essential support", line: "A partial scholarship that closes a tuition gap for one student." },
  { amount: 8000, label: "Full scholarship", line: "Full scholarship support for a 3rd- or 4th-year student." },
  { amount: 12000, label: "A full year", line: "One full year of scholarship support for one student." },
];

export const ELIGIBILITY = [
  "Of Turkish descent, pursuing higher education in the United States and facing socioeconomic challenges.",
  "Enrolled, or accepted for enrollment, at an accredited U.S. college or university.",
  "Cumulative GPA of at least 3.0. A lower GPA may be considered only in extremely limited circumstances, explained in your personal statement, and only once per applicant.",
  "Incoming first-year students: high-school GPA of at least 3.5 (4.0 scale) and an SAT score of at least 1350.",
  "First-semester ESL students: satisfactory (S) grades.",
  "Students with a documented disability may request an individualized, holistic review.",
];

export const TERMS = [
  "Request only the tuition you still owe after other scholarships and grants. Not housing, insurance or other fees.",
  "Awards are paid directly to your institution as tuition, never to the student.",
  "Each application covers one semester; apply again each season you need support.",
  "Recipients keep making steady progress toward their degree. A failed course can't be funded twice.",
  "Community service, volunteering and leadership are favorably considered.",
  "Award amounts are set by the Board and reflect need, academics, tuition cost, references and engagement.",
];

export const DOCUMENTS = [
  { key: "resume", label: "Resume", help: "Education, work, service and leadership.", required: true },
  { key: "transcript", label: "Latest transcript", help: "From your most recent semester. Unofficial is fine.", required: true },
  { key: "enrollment", label: "Proof of enrollment", help: "Enrollment verification or your acceptance letter.", required: true },
  { key: "statement", label: "Personal statement", help: "300+ words: your goals, achievements, financial need and challenges.", required: true },
  { key: "tuitionBill", label: "Tuition bill", help: "Your school statement showing the balance you owe.", required: true },
  { key: "disability", label: "Disability documentation", help: "Include only if you'd like an individualized review.", required: false },
] as const;
export type DocKey = (typeof DOCUMENTS)[number]["key"];
export const FILE_LIMIT = 5 * 1024 * 1024;
export const TOTAL_LIMIT = 25 * 1024 * 1024;

export const LEVELS = ["Incoming first-year", "Undergraduate", "Graduate", "Other"] as const;

export const NAV = [
  { href: "/scholarships", label: "Scholarships" },
  { href: "/impact", label: "Impact" },
  { href: "/about", label: "About" },
  { href: "/get-involved", label: "Get involved" },
] as const;

/** Old Wix URLs → new pages */
export const REDIRECTS: Record<string, string> = {
  "/about-4": "/about",
  "/blank-2": "/contact",
  "/general-4-1": "/give",
  "/blank-5": "/get-involved",
  "/blank-3": "/about",
  "/copy-of-contact": "/scholarships",
  "/donate": "/give",
};
