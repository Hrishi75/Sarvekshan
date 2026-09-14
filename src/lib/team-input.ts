import { z } from "zod";
import type { UserRole } from "./types";

const member = {
  id: z.uuid(),
  revision: z.string().regex(/^\d+$/, "Reload the team list before trying again."),
};

export const teamInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    client_uuid: z.uuid(),
    name: z.string().trim().min(1, "Enter the person's name.").max(120),
    phone: z.string().trim().max(24).transform((value) => value.replace(/[\s()-]/g, ""))
      .pipe(z.string().regex(/^(?:\+?91)?[6-9]\d{9}$/, "Enter a ten-digit Indian mobile number."))
      .transform((value) => value.slice(-10)),
    role: z.enum(["volunteer", "coordinator"]),
    block: z.string().trim().max(150).transform((value) => value || null),
    is_local_checker: z.boolean(),
  }).strict(),
  z.object({ action: z.enum(["renew", "recover", "deactivate", "reactivate"]), ...member }).strict(),
]);

export type TeamInput = z.infer<typeof teamInput>;
export type TeamStatus = "active" | "invited" | "expired" | "invitation_locked" | "not_activated" | "temporary" | "locked" | "inactive";
export type TeamMember = {
  id: string;
  name: string;
  role: UserRole;
  block: string | null;
  phone_last4: string | null;
  is_local_checker: boolean;
  active: boolean;
  has_password: boolean;
  status: TeamStatus;
  revision: string;
  invitation_expires_at: string | null;
  last_login_at: string | null;
  open_repairs: number;
  pending_checks: number;
};

export type TeamResult = {
  id: string;
  name: string;
  message: string;
  credential?: { kind: "invitation" | "password"; value: string };
};

export function canManageMember(actor: { id: string; role: UserRole }, member: { id: string; role: UserRole }): boolean {
  return actor.id !== member.id && member.role !== "admin" &&
    (actor.role === "admin" || (actor.role === "coordinator" && member.role === "volunteer"));
}
