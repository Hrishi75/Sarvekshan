-- Every reportable facility needs a matching repair type at triage.
-- Boys' toilets share the toilet repair/build taxonomy with girls' toilets.
INSERT INTO work_types (key, label_en, facility_key, sort_order)
VALUES ('notice_board_repair', 'Notice board repair', 'notice_board', 14)
ON CONFLICT (key) DO NOTHING;
