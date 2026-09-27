// Verified organisational content (source: springrise.org audit, Sept 2026).
// Keep facts here so every page tells the same story.

export const ORG = {
  name: "Springrise Foundation",
  legalName: "Springrise Foundation Inc",
  tagline: "Where potential rises.",
  mission:
    "Springrise Foundation supports students of Turkish descent in the United States who face socioeconomic challenges — with scholarships, mentorship and academic resources that open the door to higher education.",
  state: "New Jersey",
  address: { line1: "P.O. Box 55", city: "Denville", region: "NJ", postal: "07834" },
  phone: "(973) 804-9082",
  phoneHref: "tel:+19738049082",
  emails: {
    info: "info@springrise.org",
    scholarship: "scholarship@springrise.org",
    donation: "donation@springrise.org",
  },
  zelle: { email: "donation@springrise.org", name: "Springrise Foundation Inc" },
  taxStatus: "501(c)(3) nonprofit",
} as const;

export const NAV = [
  { href: "/about", label: "About" },
  { href: "/scholarships", label: "Scholarships" },
  { href: "/get-involved", label: "Get involved" },
  { href: "/donate", label: "Donate" },
  { href: "/contact", label: "Contact" },
] as const;

/** Default eligibility (verified from the Fall 2026 listing). Used when a season leaves it blank. */
export const DEFAULT_ELIGIBILITY = [
  "Of Turkish descent and pursuing higher education while facing socioeconomic challenges.",
  "Currently enrolled, or accepted for enrollment, at an accredited higher-education institution in the United States.",
  "Minimum cumulative GPA of 3.0. A lower GPA may be considered only in extremely limited circumstances, must be explained in your personal statement, and can be granted once per applicant.",
  "High-school seniors entering as first-year students: minimum cumulative high-school GPA of 3.5 (4.0 scale) and a minimum SAT score of 1350.",
  "First-semester ESL students: satisfactory (S) grades.",
  "Applicants with documented disabilities may request an individualized, holistic review.",
];

/** Default requirements & award terms (verified). */
export const DEFAULT_REQUIREMENTS = [
  "Request only your remaining tuition balance after other scholarships and grants — exclude housing, health insurance and other non-tuition costs.",
  "Upload a statement or screenshot from your school's financial account showing the final amount owed.",
  "Awards are paid directly to your institution as tuition — never to the student.",
  "Each application covers one semester. Apply again each season you need support.",
  "Recipients must make continuous progress toward their degree. A failed course cannot be funded again.",
  "Community service, volunteer work and leadership at school or in your community are favorably considered.",
];

export const DOCUMENTS = [
  { key: "resume", label: "Resume", help: "Your education, experience, service and leadership.", required: true },
  { key: "transcript", label: "Most recent transcript", help: "From your most recent semester (unofficial is fine).", required: true },
  { key: "enrollment", label: "Enrollment verification", help: "Proof you are enrolled, or accepted for enrollment.", required: true },
  { key: "statement", label: "Personal statement", help: "At least 300 words on your goals, accomplishments, financial need and socioeconomic challenges.", required: true },
  { key: "tuition", label: "Tuition statement", help: "Your school bill or account screenshot showing the final tuition balance owed.", required: true },
  { key: "disability", label: "Disability documentation", help: "Optional — include only if you would like an individualized review.", required: false },
] as const;

export type DocumentKey = (typeof DOCUMENTS)[number]["key"];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export const PROGRAMS = [
  {
    key: "scholarships",
    title: "Tuition scholarships",
    body: "Seasonal, need-based tuition awards paid directly to accredited U.S. colleges and universities — so students can stay enrolled and focused.",
  },
  {
    key: "mentorship",
    title: "Mentorship & guidance",
    body: "Personalized mentoring and career guidance for scholarship recipients, connecting them with people who have walked the path before.",
  },
  {
    key: "partnerships",
    title: "Partnerships",
    body: "Working with academic institutions, local schools, community organizations and industry leaders — including training programs and financial, technical or personnel support.",
  },
  {
    key: "advocacy",
    title: "Advocacy & awareness",
    body: "Campaigns for educational funding and standards, and training on diversity, inclusion and civic-mindedness.",
  },
] as const;

export const VALUES = [
  { title: "Empowerment through education", body: "Education is the most durable way to open doors — for a student, a family and a community." },
  { title: "Equal opportunity", body: "Financial circumstances should never decide whether a capable student can continue." },
  { title: "A nurturing community", body: "Students thrive when someone believes in them. We build that circle around every recipient." },
  { title: "Collaboration", body: "We partner with schools, community organizations and industry leaders to multiply what one gift can do." },
  { title: "Socially conscious leaders", body: "We invest in students who will lift others as they rise." },
] as const;

/** Old Wix URLs → new pages. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/about-4": "/about",
  "/blank-2": "/contact",
  "/general-4-1": "/donate",
  "/blank-5": "/get-involved",
  "/blank-3": "/about",
  "/copy-of-contact": "/scholarships",
};
