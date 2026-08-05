-- ═══════════════════════════════════════════════════════════════════════════
-- PLV NaviSync — Supabase Database Schema
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this entire file in your Supabase SQL Editor to set up the database.
-- After running, go to Authentication → Settings and enable email/password auth.
-- Then run: pnpm supabase gen types --lang=ts > src/services/database.gen.ts
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Enable UUID extension ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 2. CAMPUSES ─────────────────────────────────────────────────────────────
CREATE TABLE campuses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 3. BUILDINGS ────────────────────────────────────────────────────────────
CREATE TABLE buildings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id       UUID REFERENCES campuses(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  description     TEXT,
  category        TEXT CHECK (category IN ('academic','admin','facility','sports','dormitory')),
  floor_count     INTEGER DEFAULT 1,
  image_url       TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  departments     TEXT[] DEFAULT '{}',
  operating_hours TEXT,
  contact         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_buildings_campus ON buildings(campus_id);

-- ── 4. FLOOR PLANS ─────────────────────────────────────────────────────────
CREATE TABLE floor_plans (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  floor_number INTEGER NOT NULL,
  label       TEXT,
  width       INTEGER DEFAULT 440,
  height      INTEGER DEFAULT 290,
  thumbnail   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(building_id, floor_number)
);

CREATE TABLE floor_rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  floor_id    UUID REFERENCES floor_plans(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT CHECK (type IN ('classroom','office','lab','lobby','restroom','stairs','storage','elevator')),
  x           DOUBLE PRECISION NOT NULL,
  y           DOUBLE PRECISION NOT NULL,
  w           DOUBLE PRECISION NOT NULL,
  h           DOUBLE PRECISION NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_floor_rooms_floor ON floor_rooms(floor_id);

-- ── 5. ANNOUNCEMENTS ───────────────────────────────────────────────────────
CREATE TABLE announcements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT CHECK (category IN ('general','academic','event','emergency','maintenance')),
  priority    TEXT CHECK (priority IN ('low','normal','high','urgent')) DEFAULT 'normal',
  author      TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 6. CAMPUS LOCATIONS (assets: gates, parking, landmarks) ─────────────────
CREATE TABLE campus_locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  type        TEXT CHECK (type IN ('entrance','parking','landmark','restroom','canteen','atm','clinic')),
  description TEXT,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 7. NAVIGATION ROUTES ───────────────────────────────────────────────────
CREATE TABLE navigation_routes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  description     TEXT,
  from_building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  to_building_id   UUID REFERENCES buildings(id) ON DELETE CASCADE,
  waypoints       JSONB DEFAULT '[]',
  distance_m      INTEGER,
  duration_min    INTEGER,
  type            TEXT CHECK (type IN ('walking','accessible','emergency')) DEFAULT 'walking',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 8. CAMPUS EVENTS ────────────────────────────────────────────────────────
CREATE TABLE campus_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  description     TEXT,
  venue           TEXT NOT NULL,
  date_start      DATE,
  date_end        DATE,
  status          TEXT CHECK (status IN ('draft','scheduled','active','ended')) DEFAULT 'draft',
  marker_count    INTEGER DEFAULT 0,
  organizer       TEXT,
  affected_areas  TEXT[] DEFAULT '{}',
  temp_features   TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 9. REPORTS ──────────────────────────────────────────────────────────────
CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            TEXT NOT NULL,
  building        TEXT,
  location_detail TEXT,
  description     TEXT NOT NULL,
  reporter_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name   TEXT,
  status          TEXT CHECK (status IN ('pending','investigating','approved','rejected','resolved')) DEFAULT 'pending',
  image_url       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 10. SETTINGS ───────────────────────────────────────────────────────────
CREATE TABLE settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT NOT NULL UNIQUE,
  value       JSONB,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 11. PROFILES (syncs with auth.users) ──────────────────────────────────
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  full_name   TEXT,
  role        TEXT DEFAULT 'student' CHECK (role IN ('student','faculty','staff','admin')),
  department  TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 12. AUTO-UPDATE updated_at TRIGGER ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
  tables_list TEXT[] := ARRAY[
    'campuses','buildings','floor_plans','floor_rooms',
    'announcements','campus_locations','navigation_routes',
    'campus_events','reports','settings','profiles'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_list
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s; CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END;
$$;

-- ── 13. ROW LEVEL SECURITY ─────────────────────────────────────────────────
-- Enable RLS on all tables
ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE navigation_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Public read access for most tables (students, visitors can view)
CREATE POLICY "Public read campuses" ON campuses FOR SELECT USING (true);
CREATE POLICY "Public read buildings" ON buildings FOR SELECT USING (true);
CREATE POLICY "Public read floor_plans" ON floor_plans FOR SELECT USING (true);
CREATE POLICY "Public read floor_rooms" ON floor_rooms FOR SELECT USING (true);
CREATE POLICY "Public read announcements" ON announcements FOR SELECT USING (is_active = true);
CREATE POLICY "Public read campus_locations" ON campus_locations FOR SELECT USING (true);
CREATE POLICY "Public read navigation_routes" ON navigation_routes FOR SELECT USING (is_active = true);
CREATE POLICY "Public read campus_events" ON campus_events FOR SELECT USING (status IN ('scheduled','active'));
CREATE POLICY "Public read profiles" ON profiles FOR SELECT USING (true);

-- Authenticated users can insert reports
CREATE POLICY "Authenticated insert reports" ON reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated read own reports" ON reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());

-- Admin-only write access
CREATE POLICY "Admin all campuses" ON campuses FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin all buildings" ON buildings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin all floor_plans" ON floor_plans FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin all floor_rooms" ON floor_rooms FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin all announcements" ON announcements FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin all campus_locations" ON campus_locations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin all navigation_routes" ON navigation_routes FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin all campus_events" ON campus_events FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin all reports" ON reports FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin all settings" ON settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── 14. AUTO-CREATE PROFILE ON SIGNUP ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'student'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
