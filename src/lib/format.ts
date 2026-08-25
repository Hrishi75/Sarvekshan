/** Formatting helpers. Pure, dependency-free — usable from lib and components alike. */

/** Paise -> ₹ with Indian digit grouping, compacted above a lakh. */
export function rupees(paise: number | null | undefined, compact = false): string {
  if (paise == null) return "—";
  const r = Math.round(paise / 100);
  if (compact) {
    if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
    if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  }
  return "₹" + r.toLocaleString("en-IN");
}

export function relativeDays(days: number | null): string {
  if (days == null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** Composite School Grant enrolment slab. */
export function grantSlab(enrolment: number | null): string {
  if (enrolment == null) return "—";
  if (enrolment <= 100) return "A";
  if (enrolment <= 250) return "B";
  if (enrolment <= 1000) return "C";
  return "D";
}
