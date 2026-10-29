// lib/db/src/seed/leads.ts — give an organization its first funnel and its
// first form.
//
// Runs for every organization on every boot and once more when an
// organization is created, so it has to be safe to repeat against a live
// agency's data. The rule here is stricter than the credentialing seed's:
// THE AGENCY OWNS EVERYTHING. Labels, order, required flags and whether a
// question is still in use are theirs the moment the rows exist, so a re-seed
// only ever adds rows that are missing and never touches one that is there.
//
// The default questions are the public site's contact form as it shipped
// (site/contact.html), so the static markup and the seeded form agree.
import type { SqlExecutor } from "./requirements";

export interface DefaultLeadStage {
  key: string;
  label: string;
  kind: "open" | "won" | "lost";
  isSystem: boolean;
  sortOrder: number;
}

export interface DefaultLeadQuestion {
  key: string;
  label: string;
  helpText: string | null;
  type: "short_text" | "long_text" | "email" | "phone" | "select" | "yes_no";
  options: string[];
  required: boolean;
  isSystem: boolean;
  sortOrder: number;
}

/**
 * The funnel as recommended to the owner. `new` is where the website puts a
 * submission; `converted` and `closed` are the two ways a lead leaves the
 * funnel. Those three are structural: the inbox and the conversion flow look
 * them up by kind, so they can be relabelled and reordered but not removed.
 */
export const DEFAULT_LEAD_STAGES: readonly DefaultLeadStage[] = [
  { key: "new", label: "New", kind: "open", isSystem: true, sortOrder: 10 },
  { key: "contacted", label: "Contacted", kind: "open", isSystem: false, sortOrder: 20 },
  { key: "consultation", label: "Consultation", kind: "open", isSystem: false, sortOrder: 30 },
  { key: "qualified", label: "Qualified", kind: "open", isSystem: false, sortOrder: 40 },
  { key: "converted", label: "Converted", kind: "won", isSystem: true, sortOrder: 50 },
  { key: "closed", label: "Closed", kind: "lost", isSystem: true, sortOrder: 60 },
];

/** Keys the inbox and the conversion flow rely on; the form editor cannot retire them. */
export const SYSTEM_LEAD_QUESTION_KEYS = ["firstName", "lastName", "email", "consent"] as const;

export const DEFAULT_LEAD_QUESTIONS: readonly DefaultLeadQuestion[] = [
  { key: "firstName", label: "First name", helpText: null, type: "short_text", options: [], required: true, isSystem: true, sortOrder: 10 },
  { key: "lastName", label: "Last name", helpText: null, type: "short_text", options: [], required: true, isSystem: true, sortOrder: 20 },
  { key: "email", label: "Email", helpText: null, type: "email", options: [], required: true, isSystem: true, sortOrder: 30 },
  { key: "phone", label: "Phone", helpText: null, type: "phone", options: [], required: false, isSystem: false, sortOrder: 40 },
  {
    key: "role",
    label: "I am a…",
    helpText: null,
    type: "select",
    options: ["Individual", "Family / guardian", "Referring someone", "Employer"],
    required: false,
    isSystem: false,
    sortOrder: 50,
  },
  {
    key: "service",
    label: "What are you interested in?",
    helpText: null,
    type: "select",
    options: [
      "Customized Support Plans",
      "Personalized Employment Pathways",
      "Employment Workshops and Training",
      "Support Services for Career Advancement",
      "Assistive Technology Solutions",
      "Agency and Community Collaboration",
      "Business Partnership Opportunities",
    ],
    required: false,
    isSystem: false,
    sortOrder: 60,
  },
  {
    key: "message",
    label: "How can we help?",
    helpText: "Please do not include medical records or other sensitive personal information.",
    type: "long_text",
    options: [],
    required: false,
    isSystem: false,
    sortOrder: 70,
  },
  {
    key: "consent",
    label: "I agree to be contacted by Durable Life Skills, Inc. about my request. We never sell your information.",
    helpText: null,
    type: "yes_no",
    options: [],
    required: true,
    isSystem: true,
    sortOrder: 80,
  },
];

const INSERT_STAGE = `
  INSERT INTO lead_stages (org_id, key, label, kind, is_system, sort_order)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (org_id, key) DO NOTHING
`;

const INSERT_QUESTION = `
  INSERT INTO lead_form_questions (org_id, key, label, help_text, type, options, required, is_system, sort_order)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (org_id, key) DO NOTHING
`;

export interface LeadSeedResult {
  stages: number;
  questions: number;
}

/** Add any default stage or question the organization does not have yet. Never overwrites. */
export async function seedLeadDefaults(exec: SqlExecutor, orgId: string): Promise<LeadSeedResult> {
  for (const s of DEFAULT_LEAD_STAGES) {
    await exec(INSERT_STAGE, [orgId, s.key, s.label, s.kind, s.isSystem, s.sortOrder]);
  }
  for (const q of DEFAULT_LEAD_QUESTIONS) {
    await exec(INSERT_QUESTION, [
      orgId, q.key, q.label, q.helpText, q.type, JSON.stringify(q.options), q.required, q.isSystem, q.sortOrder,
    ]);
  }
  return { stages: DEFAULT_LEAD_STAGES.length, questions: DEFAULT_LEAD_QUESTIONS.length };
}
