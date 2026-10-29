// components/admin/leads/lead-form-preview.tsx — the website form as it will
// render, so an Admin editing questions sees the result without leaving the
// portal. Read-only; the real form lives on the public site.
"use client";

import type { LeadQuestion } from "@/lib/api/admin";

const HALF = new Set(["short_text", "email", "phone"]);

function Control({ q }: { q: LeadQuestion }) {
  const base = "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground";
  switch (q.type) {
    case "long_text":
      return <div className={`${base} min-h-[84px]`} aria-hidden />;
    case "select":
      return (
        <div className={`${base} flex items-center justify-between`} aria-hidden>
          <span>{q.required ? "Choose one" : "Not sure yet"}</span>
          <span>▾</span>
        </div>
      );
    case "yes_no":
      return null;
    default:
      return <div className={`${base} h-10`} aria-hidden />;
  }
}

export function LeadFormPreview({ questions }: { questions: LeadQuestion[] }) {
  return (
    <div className="rounded-card border border-border bg-muted/30 p-4">
      <div className="label-caps text-muted-foreground">Preview · website form</div>
      <div className="mt-1 font-serif text-lg font-semibold text-plum">Request a consultation</div>
      <p className="text-sm text-muted-foreground">Tell us a little about your situation. We&rsquo;ll follow up within one business day.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {questions.map((q) => (
          <div key={q.id} className={HALF.has(q.type) ? "space-y-1" : "space-y-1 sm:col-span-2"}>
            {q.type === "yes_no" ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" disabled className="mt-1 h-4 w-4" />
                <span>{q.label}</span>
              </label>
            ) : (
              <>
                <div className="text-sm font-medium">
                  {q.label}
                  {!q.required && <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>}
                </div>
                {q.helpText && <div className="text-xs text-muted-foreground">{q.helpText}</div>}
                <Control q={q} />
                {q.type === "select" && q.options.length > 0 && (
                  <div className="text-xs text-muted-foreground">{q.options.join(" · ")}</div>
                )}
              </>
            )}
          </div>
        ))}
        <div className="sm:col-span-2">
          <div className="inline-flex h-10 items-center rounded-btn bg-plum px-4 text-sm font-medium text-white opacity-70">Request a Consultation</div>
        </div>
      </div>
    </div>
  );
}
