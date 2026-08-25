-- The follow-up engine.
-- Checks are written by the system the moment work is marked done.
-- Implemented as a trigger, not application code, so no code path can skip it.

CREATE OR REPLACE FUNCTION schedule_checks_for_work() RETURNS trigger AS $$
DECLARE
  offsets   integer[] := ARRAY[7, 90, 180, 365];
  d         integer;
  checker   uuid;
  pp        uuid;
BEGIN
  -- only fire on the transition into 'done' with a completion date
  IF NEW.status <> 'done' OR NEW.done_on IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'done' AND OLD.done_on IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- prefer a local resident checker for this school's block who did NOT do the work
  SELECT u.id INTO checker
  FROM users u
  JOIN schools s ON s.id = NEW.school_id
  WHERE u.org_id = NEW.org_id
    AND u.active
    AND u.is_local_checker
    AND (u.block IS NULL OR u.block = s.block)
    AND (NEW.performed_by_id IS NULL OR u.id <> NEW.performed_by_id)
  ORDER BY random()
  LIMIT 1;

  SELECT id INTO pp FROM photo_points
  WHERE school_id = NEW.school_id AND facility_key = NEW.facility_key;

  FOREACH d IN ARRAY offsets LOOP
    INSERT INTO checks (
      org_id, work_id, school_id, facility_key, photo_point_id,
      offset_days, due_on, assigned_to_id, state
    ) VALUES (
      NEW.org_id, NEW.id, NEW.school_id, NEW.facility_key, pp,
      d, NEW.done_on + d, checker, 'pending'
    )
    ON CONFLICT (work_id, offset_days) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER works_schedule_checks
  AFTER INSERT OR UPDATE OF status, done_on ON works
  FOR EACH ROW EXECUTE FUNCTION schedule_checks_for_work();

-- ── independence is derived, never hand-entered ──────────────────────────────
CREATE OR REPLACE FUNCTION derive_check_independence() RETURNS trigger AS $$
DECLARE
  w_performer uuid;
  w_org       uuid;
  u_org       uuid;
  u_local     boolean;
BEGIN
  IF NEW.by_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT performed_by_id, COALESCE(performed_by_org_id, org_id)
    INTO w_performer, w_org
  FROM works WHERE id = NEW.work_id;

  SELECT org_id, is_local_checker INTO u_org, u_local
  FROM users WHERE id = NEW.by_user_id;

  IF w_performer IS NOT NULL AND NEW.by_user_id = w_performer THEN
    NEW.independence := 'self';
  ELSIF u_local THEN
    NEW.independence := 'independent';
  ELSIF u_org = w_org THEN
    NEW.independence := 'affiliated';
  ELSE
    NEW.independence := 'independent';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER checks_derive_independence
  BEFORE INSERT OR UPDATE OF by_user_id ON checks
  FOR EACH ROW EXECUTE FUNCTION derive_check_independence();

-- ── reference data ───────────────────────────────────────────────────────────
INSERT INTO facility_types (key, label_en, label_hi, sort_order) VALUES
  ('toilet_girls', 'Girls toilet',   'बालिका शौचालय', 1),
  ('toilet_boys',  'Boys toilet',    'बालक शौचालय',   2),
  ('drinking_water','Drinking water','पेयजल',         3),
  ('classroom',    'Classroom',      'कक्षा',          4),
  ('electrical',   'Fans & lights',  'पंखे और लाइट',   5),
  ('kitchen',      'Kitchen',        'रसोई',           6),
  ('boundary',     'Boundary wall',  'चारदीवारी',      7),
  ('playground',   'Playground',     'खेल का मैदान',   8),
  ('furniture',    'Furniture',      'फर्नीचर',        9),
  ('notice_board', 'Notice board',   'सूचना पट',      10)
ON CONFLICT (key) DO NOTHING;

INSERT INTO work_types (key, label_en, facility_key, sort_order) VALUES
  ('toilet_repair',    'Toilet repair',            'toilet_girls',   1),
  ('toilet_build',     'New toilet',               'toilet_girls',   2),
  ('water_handpump',   'Handpump repair',          'drinking_water', 3),
  ('water_tank',       'Tank / motor',             'drinking_water', 4),
  ('water_purifier',   'Water purifier',           'drinking_water', 5),
  ('electrical_fans',  'Fans',                     'electrical',     6),
  ('electrical_lights','Lights & wiring',          'electrical',     7),
  ('classroom_repair', 'Classroom repair',         'classroom',      8),
  ('paint',            'Painting',                 'classroom',      9),
  ('furniture_supply', 'Desks & benches',          'furniture',     10),
  ('boundary_repair',  'Boundary wall repair',     'boundary',      11),
  ('kitchen_repair',   'Kitchen repair',           'kitchen',       12),
  ('playground_equip', 'Playground equipment',     'playground',    13)
ON CONFLICT (key) DO NOTHING;
