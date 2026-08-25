export type UserRole = "volunteer" | "coordinator" | "admin";
export type FacilityState = "working" | "problem" | "broken";
export type WorkStatus = "planned" | "in_progress" | "done" | "cancelled";
export type CheckState = "pending" | "sent" | "done" | "missed" | "escalated";
export type CheckResult = "functional" | "degraded" | "failed" | "inaccessible";
export type Independence = "independent" | "affiliated" | "self";

export type FacilityType = {
  key: string;
  label_en: string;
  label_hi: string;
  sort_order: number;
};

export type School = {
  id: string;
  udise_code: string | null;
  name: string;
  village: string | null;
  block: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  enrolment: number | null;
  is_public: boolean;
};

export type SessionUser = {
  id: string;
  org_id: string;
  name: string;
  role: UserRole;
  block: string | null;
  is_local_checker: boolean;
};

/** One captured observation, as it exists on the device before it reaches the server. */
export type PendingObservation = {
  client_uuid: string;
  visit_client_uuid: string;
  school_id: string;
  facility_key: string;
  state: FacilityState;
  note_text?: string;
  occurred_at: string;
  photo?: Blob;
  photo_client_uuid?: string;
  voice?: Blob;
  voice_client_uuid?: string;
  lat?: number;
  lng?: number;
};
