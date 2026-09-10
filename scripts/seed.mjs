import { Pool } from "pg";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { hashPassword, hashPhone } from "@/lib/password";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2))
);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const uid = () => crypto.randomUUID();
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const SCHOOLS = [
  ["Govt UPS Rampur",        "Rampur",      26.8520, 80.9490, 214],
  ["Govt PS Bhagwantpur",    "Bhagwantpur", 26.8710, 80.9310, 96],
  ["Govt UPS Kesarganj",     "Kesarganj",   26.8330, 80.9720, 268],
  ["Govt PS Nariyawal",      "Nariyawal",   26.8905, 80.9155, 74],
  ["Govt UPS Sarai Mohan",   "Sarai Mohan", 26.8188, 80.9885, 331],
  ["Govt PS Chandpur",       "Chandpur",    26.9012, 80.9402, 118],
  ["Govt UPS Dhaurahra",     "Dhaurahra",   26.8442, 80.9008, 189],
  ["Govt PS Itaunja",        "Itaunja",     26.9188, 80.9633, 88],
  ["Govt UPS Mohanlalganj",  "Mohanlalganj",26.8071, 80.9241, 402],
  ["Govt PS Bakshi Ka Talab","BKT",         26.9350, 80.9080, 142],
  ["Govt UPS Gosaiganj",     "Gosaiganj",   26.7955, 81.0102, 236],
  ["Govt PS Kakori",         "Kakori",      26.8615, 80.8380, 109],
];

// work types with a plausible survival profile — paint holds, electrical does not
const PROFILE = {
  toilet_repair:     { fail7: 0.02, fail90: 0.28, fail180: 0.46, fail365: 0.67 },
  water_handpump:    { fail7: 0.01, fail90: 0.19, fail180: 0.32, fail365: 0.48 },
  water_tank:        { fail7: 0.03, fail90: 0.22, fail180: 0.35, fail365: 0.50 },
  electrical_fans:   { fail7: 0.02, fail90: 0.36, fail180: 0.57, fail365: 0.79 },
  electrical_lights: { fail7: 0.02, fail90: 0.33, fail180: 0.55, fail365: 0.76 },
  paint:             { fail7: 0.00, fail90: 0.06, fail180: 0.12, fail365: 0.23 },
  classroom_repair:  { fail7: 0.01, fail90: 0.10, fail180: 0.18, fail365: 0.30 },
  furniture_supply:  { fail7: 0.01, fail90: 0.14, fail180: 0.24, fail365: 0.38 },
};

const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query(`TRUNCATE orgs CASCADE`);

  const orgId = uid();
  await c.query(`INSERT INTO orgs (id, name) VALUES ($1,$2)`, [orgId, "CJP School Programme"]);

  // users
  const coordinator = uid();
  const fieldA = uid(), fieldB = uid();
  const locals = [uid(), uid(), uid(), uid(), uid(), uid()];
  // Real ten-digit numbers, because the number is now the sign-in identifier.
  // A block that belongs to nobody: a seeded demo must not put a real person's
  // phone into a database.
  const users = [
    [coordinator, "9900000001", "Anita Verma",   "coordinator", "Rampur", false],
    [fieldA,      "9900000002", "Ravi Kumar",    "volunteer",   "Rampur", false],
    [fieldB,      "9900000003", "Imran Sheikh",  "volunteer",   "Rampur", false],
    [locals[0],   "9900000004", "Sunita Devi",   "volunteer",   "Rampur", true],
    [locals[1],   "9900000005", "Meena Yadav",   "volunteer",   "Rampur", true],
    [locals[2],   "9900000006", "Rakesh Pal",    "volunteer",   "Rampur", true],
    [locals[3],   "9900000007", "Shabana Khatun","volunteer",   "Rampur", true],
    [locals[4],   "9900000008", "Dinesh Rawat",  "volunteer",   "Rampur", true],
    [locals[5],   "9900000009", "Kamla Singh",   "volunteer",   "Rampur", true],
  ];

  // One password across the demo roster, printed at the end of the run. It is
  // deliberately not must_change_password: these are shared demo logins, and a
  // forced change would mean the first person in locks everybody else out of
  // the account. Real people get a temp password from `npm run user`, which
  // does force it. SEED_FORCE_PASSWORD_CHANGE=1 rehearses that path.
  const seedPassword = process.env.SEED_PASSWORD || "sarvekshan-demo";
  const forceChange = process.env.SEED_FORCE_PASSWORD_CHANGE === "1";
  const seedPasswordHash = await hashPassword(seedPassword);

  for (const [id, phone, name, role, block, local] of users) {
    await c.query(
      `INSERT INTO users (id, org_id, phone_hash, phone_last4, name, role, block, is_local_checker,
                          password_hash, password_set_at, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6::user_role,$7,$8,$9,now(),$10)`,
      [id, orgId, hashPhone(phone), phone.slice(-4), name, role, block, local,
       seedPasswordHash, forceChange]
    );
  }

  // schools
  const schoolIds = [];
  for (const [name, village, lat, lng, enrolment] of SCHOOLS) {
    const id = uid();
    schoolIds.push(id);
    await c.query(
      `INSERT INTO schools (id, org_id, udise_code, name, village, block, district, state, lat, lng, enrolment, is_public)
       VALUES ($1,$2,$3,$4,$5,'Rampur','Lucknow','Uttar Pradesh',$6,$7,$8,$9)`,
      [id, orgId, "0901" + Math.floor(Math.random() * 9e5 + 1e5), name, village, lat, lng, enrolment, Math.random() < 0.4]
    );
  }

  // photo points
  const facilities = ["toilet_girls", "drinking_water", "classroom", "electrical", "boundary"];
  for (const sid of schoolIds) {
    for (const f of facilities) {
      if (Math.random() < 0.7) {
        await c.query(
          `INSERT INTO photo_points (org_id, school_id, facility_key, landmark_note)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [orgId, sid, f, pick([
            "Stand at the veranda corner, hand-pump on your left",
            "From the gate, facing the block, tree in frame on the right",
            "Back wall of the courtyard, water tank visible above",
            "Beside the notice board, facing the classroom door",
          ])]
        );
      }
    }
  }

  // works, backdated so a full year of checks exists
  let workCount = 0, checkDone = 0;
  const workTypes = Object.keys(PROFILE);
  // the last two schools are deliberately left unaudited: the UI must show a
  // school nobody has visited as a visible gap, not omit it
  const auditable = schoolIds.slice(0, -2);
  for (const sid of auditable) {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const wt = pick(workTypes);
      const { rows: [wtRow] } = await c.query(`SELECT facility_key FROM work_types WHERE key=$1`, [wt]);
      const age = 30 + Math.floor(Math.random() * 400);
      const cost = (2000 + Math.floor(Math.random() * 40000)) * 100;
      const wid = uid();
      await c.query(
        `INSERT INTO works (id, org_id, school_id, facility_key, work_type_key, description, status,
                            est_cost_paise, actual_cost_paise, performed_by_id, performed_by_org_id,
                            done_on, client_uuid)
         VALUES ($1,$2,$3,$4,$5,$6,'done',$7,$8,$9,$2,$10,$11)`,
        [wid, orgId, sid, wtRow.facility_key ?? "classroom", wt,
         null, cost, cost, pick([fieldA, fieldB]), daysAgo(age), uid()]
      );
      workCount++;

      // complete the checks that are already due
      const { rows: ck } = await c.query(
        `SELECT id, offset_days, due_on FROM checks WHERE work_id=$1 ORDER BY offset_days`, [wid]
      );
      for (const k of ck) {
        const dueAge = (Date.now() - new Date(k.due_on).getTime()) / 864e5;
        if (dueAge < 0) continue;                 // not due yet
        if (Math.random() < 0.14) {               // real-world: some checks just never happen
          await c.query(`UPDATE checks SET state='missed' WHERE id=$1`, [k.id]);
          continue;
        }
        const p = PROFILE[wt][`fail${k.offset_days}`] ?? 0.3;
        const r = Math.random();
        const result = r < p * 0.65 ? "failed" : r < p ? "degraded" : "functional";
        await c.query(
          `UPDATE checks SET state='done', result=$1::check_result, by_user_id=$2,
                  completed_at = (due_on + interval '2 days')
             WHERE id=$3`,
          [result, pick(locals), k.id]
        );
        checkDone++;
      }
    }
  }

  // grants — the four-stage reconciliation. Composite School Grant slabs by
  // enrolment, with the statutory 10% WASH earmark carried on the row.
  const slab = (n) => (n <= 100 ? 25000 : n <= 250 ? 50000 : n <= 1000 ? 75000 : 100000);
  for (let i = 0; i < schoolIds.length; i++) {
    const sid = schoolIds[i];
    const enrolment = SCHOOLS[i][4];
    const sanctioned = slab(enrolment) * 100;
    // most grants are released in full; a few are short or late
    const released = Math.random() < 0.15 ? Math.round(sanctioned * 0.5) : sanctioned;
    // paperwork accounts for some of it; site verification for less again
    const accounted = Math.round(released * (0.45 + Math.random() * 0.5));
    const verified = Math.round(accounted * (0.2 + Math.random() * 0.6));
    await c.query(
      `INSERT INTO grants (org_id, school_id, ay, head, amount_sanctioned_paise,
                           amount_released_paise, amount_accounted_paise,
                           amount_verified_paise, released_on, earmark_share,
                           earmark_label, source_url)
       VALUES ($1,$2,'2025-26','composite_school_grant',$3,$4,$5,$6,$7,0.10,
               'Swachhta / WASH','https://samagrashiksha.example/release-2025-26.pdf')
       ON CONFLICT DO NOTHING`,
      [orgId, sid, sanctioned, released, accounted, verified,
       daysAgo(60 + Math.floor(Math.random() * 120))]
    );
  }

  // Open repairs — the queue /repairs exists to work through. Until now every
  // seeded work was already 'done', so the repair screens rendered empty and the
  // editable path was unreachable: a completed repair is read-only on purpose.
  //
  // Each one is born the way a real one is — a report someone filed, triaged
  // into a repair — so the record shows the report it came from instead of a
  // repair that appeared from nowhere.
  //
  // Status stays short of 'done', so works_schedule_checks() returns early and
  // nothing here schedules a check. Checks belong to completed work, and they
  // come from the trigger.
  //
  // The mix is written out rather than randomised: a random draw can easily
  // produce no overdue repair and nothing unassigned, and then the queue looks
  // empty again for the next person who seeds it. Every state the UI can show
  // is guaranteed to be present.
  //   target: days from today, negative is overdue, null is not set yet
  //   est:    rupees, null is not estimated yet
  //   owner:  null is unassigned
  const OPEN_REPAIRS = [
    ["water_handpump",   "in_progress", "field", -12, 8500,
     "Handle assembly loose and the water comes up muddy. Mechanic has seen it, parts on order.",
     "Handle assembly, washers, riser pipe if the bore is scored"],
    ["toilet_repair",    "in_progress", "field", -6, 14000,
     "Girls' block: two doors without working latches, one pan cracked. Not being used at present.",
     "Latches, hinges, one pan, cement"],
    ["electrical_fans",  "in_progress", "field", 3, 6200,
     "Three fans dead in the upper primary room since the storm. Wiring checked, capacitors gone.",
     "Capacitors, one replacement fan, switch board"],
    ["classroom_repair", "in_progress", "local", 9, 23000,
     "Ceiling leaks above the back row whenever it rains. Children moved to the front for now.",
     "Roof sheets, sealant, two rafters"],
    ["water_tank",       "in_progress", "field", 16, 31000,
     "Overhead tank empties overnight. Motor runs but the float valve is stuck open.",
     "Float valve, foot valve, 20mm pipe"],
    ["electrical_lights","in_progress", "local", 21, 4800,
     "Two rooms have no working light. Wiring is exposed near the door and needs boxing in.",
     "Tube fittings, conduit, junction boxes"],

    ["boundary_repair",  "planned", "field", -19, 47000,
     "Boundary wall down for about twelve feet on the road side. Cattle are getting into the yard.",
     ""],
    ["furniture_supply", "planned", "field", -3, 38000,
     "Two classrooms are short of benches; children are sitting on the floor at the back.",
     ""],
    ["paint",            "planned", "local", 27, 16500,
     "Front block has not been painted in four years. Plaster is sound, only surface work needed.",
     ""],
    ["kitchen_repair",   "planned", "field", 34, 12000,
     "Kitchen chimney blocked and the smoke stays in the room while the meal is cooked.",
     ""],
    ["notice_board_repair", "planned", "local", 12, null,
     "Notice board frame has come away from the wall. Needs refixing before the term notices go up.",
     ""],
    ["playground_equip", "planned", null, 45, 21000,
     "Swing frame is rusted through at one joint and has been roped off. Needs replacing, not patching.",
     ""],
    ["water_purifier",   "planned", null, null, 18000,
     "No working purifier; children drink straight from the handpump. Waiting on a quote.",
     ""],
    ["toilet_build",     "planned", null, null, null,
     "Boys have no usable toilet on site. Awaiting a site decision before this can be estimated.",
     ""],
  ];

  const REPORTED = {
    water_handpump: "Handpump handle loose, water muddy",
    toilet_repair: "Door latch broken, girls not using it",
    electrical_fans: "Fans not working since the storm",
    classroom_repair: "Ceiling leaking above the back row",
    water_tank: "Tank empty by morning every day",
    electrical_lights: "No light in two rooms, wires hanging near the door",
    boundary_repair: "Wall broken on the road side, cattle coming in",
    furniture_supply: "Children sitting on the floor, benches short",
    paint: "Walls dirty and peeling in the front block",
    kitchen_repair: "Kitchen fills with smoke while cooking",
    notice_board_repair: "Notice board hanging off the wall",
    playground_equip: "Swing frame rusted through, tied off",
    water_purifier: "No purifier, children drinking from the handpump",
    toilet_build: "Boys have no toilet they can use",
  };

  let openCount = 0;
  for (let i = 0; i < OPEN_REPAIRS.length; i++) {
    const [wt, status, ownerKind, target, est, description, materials] = OPEN_REPAIRS[i];
    const sid = auditable[i % auditable.length];
    const { rows: [wtRow] } = await c.query(`SELECT facility_key FROM work_types WHERE key=$1`, [wt]);
    const facility = wtRow.facility_key;
    const owner = ownerKind === "field" ? pick([fieldA, fieldB]) : ownerKind === "local" ? pick(locals) : null;

    // the report that started it, filed before the repair was planned
    const reportedDaysAgo = 8 + Math.floor(Math.random() * 30);
    const vid = uid();
    await c.query(
      `INSERT INTO visits (id, org_id, school_id, by_user_id, source, occurred_at, client_uuid)
       VALUES ($1,$2,$3,$4,'app', now() - ($5||' days')::interval, $6)`,
      [vid, orgId, sid, pick([fieldA, fieldB, ...locals]), reportedDaysAgo, uid()]
    );
    const { rows: [obs] } = await c.query(
      `INSERT INTO observations (org_id, visit_id, school_id, facility_key, state, note_text,
                                 created_at, triaged_at)
       VALUES ($1,$2,$3,$4,'broken',$5, now() - ($6||' days')::interval,
               now() - ($7||' days')::interval)
       RETURNING id`,
      [orgId, vid, sid, facility, REPORTED[wt] ?? null, reportedDaysAgo, Math.max(0, reportedDaysAgo - 4)]
    );

    const wid = uid();
    await c.query(
      `INSERT INTO works (id, org_id, school_id, facility_key, work_type_key, description, materials,
                          status, est_cost_paise, assigned_to_id, target_date, client_uuid, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::work_status,$9,$10,
               $11::date, $12, now() - ($13||' days')::interval)`,
      [wid, orgId, sid, facility, wt, description, materials || null, status,
       est === null ? null : est * 100, owner,
       target === null ? null : new Date(Date.now() + target * 864e5).toISOString().slice(0, 10),
       uid(), Math.max(0, reportedDaysAgo - 4)]
    );
    await c.query(`INSERT INTO work_observations (work_id, observation_id) VALUES ($1,$2)`, [wid, obs.id]);
    openCount++;
  }

  // a handful of untriaged observations for the coordinator inbox
  for (let i = 0; i < 14; i++) {
    const sid = pick(auditable);
    const vid = uid();
    await c.query(
      `INSERT INTO visits (id, org_id, school_id, by_user_id, source, occurred_at, client_uuid)
       VALUES ($1,$2,$3,$4,'app', now() - ($5||' days')::interval, $6)`,
      [vid, orgId, sid, pick([fieldA, fieldB, ...locals]), Math.floor(Math.random() * 20), uid()]
    );
    await c.query(
      `INSERT INTO observations (org_id, visit_id, school_id, facility_key, state, note_text)
       VALUES ($1,$2,$3,$4,$5::facility_state,$6)`,
      [orgId, vid, sid, pick(facilities), pick(["problem", "broken", "broken"]),
       pick([
         "Tap is running continuously, washer gone",
         "Door latch broken, girls not using it",
         "Two fans not working since the storm",
         "Handpump handle loose, water muddy",
         "Ceiling leaking above the back row",
         null,
       ])]
    );
  }

  await c.query("COMMIT");
  const { rows: [stat] } = await pool.query(
    `SELECT (SELECT count(*) FROM schools) schools,
            (SELECT count(*) FROM works) works,
            (SELECT count(*) FROM checks) checks,
            (SELECT count(*) FROM checks WHERE state='done') done,
            (SELECT count(*) FROM checks WHERE state='pending' AND due_on <= current_date) overdue,
            (SELECT count(*) FROM observations WHERE triaged_at IS NULL) inbox,
            (SELECT count(*) FROM grants) grants`
  );
  console.log("seeded:", stat);
  console.log(`works created: ${workCount} completed + ${openCount} open, checks completed: ${checkDone}`);

  const rule = "\u2500".repeat(60);
  console.log(`\n${rule}\n  SIGN IN AT /signin\n${rule}`);
  console.log(`  password, all of them:  ${seedPassword}\n`);
  for (const [, phone, name, role, , local] of users) {
    console.log(`  ${phone}   ${name.padEnd(16)}${role}${local ? "  \u00b7 local checker" : ""}`);
  }
  console.log(rule);
  console.log("  Shared demo logins. For a real deployment give each person their");
  console.log("  own:  npm run user add -- --phone 9876543210 --name \"...\"");
  console.log(`${rule}\n`);
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
