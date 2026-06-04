-- Seed data: a starter chapter calendar (leaders can edit/add more) and a
-- baseline profanity filter list. Safe to re-run; uses INSERT OR IGNORE.

INSERT OR IGNORE INTO events (id, slug, title, description, location, url, starts_at, ends_at, all_day, created_by, created_at) VALUES
  ('evt_summer_bonfire',  'summer-bonfire',          'Summer Hang & Bonfire',     'A laid-back summer night by the lake — s''mores, lawn games, and good company. Bring a friend.', 'Picnic Rocks Beach, Marquette',        NULL, '2026-06-12T19:00:00-04:00', NULL,                        0, NULL, '2026-06-01T12:00:00Z'),
  ('evt_welcome_cookout', 'welcome-week-cookout',     'Welcome Week Cookout',      'Kick off the year with free food and lawn games. Everyone welcome — come meet the chapter.',     'Lakeshore Boulevard, Marquette',       NULL, '2026-09-12T17:00:00-04:00', NULL,                        0, NULL, '2026-06-01T12:00:00Z'),
  ('evt_fall_retreat',    'fall-retreat',             'Fall Retreat',              'A weekend away on Lake Superior: worship, teaching, bonfires, and rest. Scholarships available.', 'Camp on Lake Superior',                NULL, '2026-10-23T17:00:00-04:00', '2026-10-25T14:00:00-04:00', 0, NULL, '2026-06-01T12:00:00Z'),
  ('evt_worship_night',   'worship-night',            'Worship Night',             'An evening of worship and prayer, open to everyone on campus.',                                  'Jamrich Hall, Room 1100',              NULL, '2026-11-14T19:00:00-05:00', NULL,                        0, NULL, '2026-06-01T12:00:00Z'),
  ('evt_spring_project',  'spring-break-urban-project','Spring Break Urban Project','Serve alongside a city partner over spring break. Applications open in January.',                'Detroit, MI',                          NULL, '2027-03-07T09:00:00-05:00', '2027-03-13T17:00:00-05:00', 1, NULL, '2026-06-01T12:00:00Z');

INSERT OR IGNORE INTO banned_terms (id, term, created_by, created_at) VALUES
  ('trm_seed_1', 'fuck',    NULL, '2026-06-01T12:00:00Z'),
  ('trm_seed_2', 'shit',    NULL, '2026-06-01T12:00:00Z'),
  ('trm_seed_3', 'bitch',   NULL, '2026-06-01T12:00:00Z'),
  ('trm_seed_4', 'asshole', NULL, '2026-06-01T12:00:00Z');
