import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const coordinate = (min: number, max: number, label: string) => z.string().trim()
  .refine((value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max), `Enter a valid ${label}.`)
  .transform((value) => value === "" ? null : Number(value));

export const schoolInput = z.object({
  client_uuid: z.uuid(),
  name: z.string().trim().min(1, "Enter the school name.").max(200, "Keep the school name under 200 characters."),
  udise_code: z.string().trim().max(20).regex(/^\d*$/, "Use digits only for the UDISE code.").transform((value) => value || null),
  village: optionalText(150),
  block: optionalText(150),
  district: optionalText(150),
  state: optionalText(150),
  enrolment: z.string().trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) <= 2147483647), "Enter a whole, non-negative pupil count.")
    .transform((value) => value === "" ? null : Number(value)),
  lat: coordinate(-90, 90, "latitude between -90 and 90"),
  lng: coordinate(-180, 180, "longitude between -180 and 180"),
}).superRefine((school, context) => {
  if ((school.lat === null) !== (school.lng === null)) {
    context.addIssue({ code: "custom", path: ["lat"], message: "Enter both latitude and longitude, or leave both blank." });
  }
});
