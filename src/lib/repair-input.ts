import { z } from "zod";
import type { WorkStatus } from "./types";

export const REPAIR_STATUS: Record<WorkStatus, { label: string; tone: "plain" | "brand" | "good" }> = {
  planned: { label: "Planned", tone: "plain" },
  in_progress: { label: "In progress", tone: "brand" },
  done: { label: "Completed", tone: "good" },
  cancelled: { label: "Cancelled", tone: "plain" },
};

// Accept decimal rupees and convert exactly to paise; blank is unknown, zero is free.
const money = z.string().trim()
  .regex(/^(?:\d{1,11}(?:\.\d{1,2})?)?$/, "Enter a positive amount with up to two decimal places, or 0.")
  .transform((value) => {
    if (!value) return null;
    const [whole, fraction = ""] = value.split(".");
    return (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))).toString();
  });
const person = z.union([z.uuid(), z.literal("")]).transform((value) => value || null);
const date = z.union([z.iso.date(), z.literal("")]).transform((value) => value || null);

export const repairInput = z.object({
  revision: z.string().regex(/^\d+$/),
  work_type_key: z.string().min(1).max(100),
  status: z.enum(["planned", "in_progress", "done"]),
  description: z.string().trim().max(2000),
  materials: z.string().trim().max(2000),
  assigned_to_id: person,
  performed_by_id: person,
  target_date: date,
  done_on: date,
  est_cost: money,
  actual_cost: money,
}).superRefine((value, ctx) => {
  if (value.status === "in_progress" && !value.assigned_to_id) {
    ctx.addIssue({ code: "custom", path: ["assigned_to_id"], message: "Choose who is responsible before starting the repair." });
  }
  if (value.status === "done") {
    if (!value.performed_by_id) ctx.addIssue({ code: "custom", path: ["performed_by_id"], message: "Record who did the repair so follow-ups can be assigned to someone else." });
    if (!value.done_on) ctx.addIssue({ code: "custom", path: ["done_on"], message: "Enter the completion date." });
    if (value.actual_cost === null) ctx.addIssue({ code: "custom", path: ["actual_cost"], message: "Enter the final cost, including 0 for a repair with no cost." });
  }
});

export type RepairInput = z.infer<typeof repairInput>;

export function editableRepair(status: WorkStatus) {
  return status === "planned" || status === "in_progress";
}

export function paiseToInput(value: string | null): string {
  if (value === null) return "";
  return (Number(value) / 100).toFixed(2);
}
