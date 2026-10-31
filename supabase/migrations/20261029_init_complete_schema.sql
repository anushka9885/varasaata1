-- ==============================================================================
-- VARASAATA: Complete Database Initialization Migration
-- Target: Supabase Postgres
-- Includes: profiles, policy_consents, game_stats, online_rooms, game_invitations
--           Constraints, Indexes, Auth Triggers, RPC, RLS, and Realtime publication
-- ==============================================================================

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  display_name text NOT NULL DEFAULT 'Player',
  avatar text NOT NULL DEFAULT '🦚',
  p1_color text NOT NULL DEFAULT 'emerald',
  p2_color text NOT NULL DEFAULT 'ruby',
  board_theme text NOT NULL DEFAULT 'wood',
  theme_mode text NOT NULL DEFAULT 'dark',
  language text NOT NULL DEFAULT 'en',
  sound_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique index for usernames
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (LOWER(username));

-- Alphanumeric username constraint (3-30 chars)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format
      CHECK (username IS NULL OR (char_length(username) >= 3 AND char_length(username) <= 30 AND username ~ '^[a-zA-Z0-9_]+$'));
  END IF;
END $$;

-- 2. Policy Consents Table (Terms & Privacy version tracking)
CREATE TABLE IF NOT EXISTS public.policy_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  privacy_policy_version text NOT NULL,
  terms_version text NOT NULL,
  consent_source text NOT NULL DEFAULT 'web',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_consents_user_versions_unique UNIQUE (user_id, privacy_policy_version, terms_version)
);

CREATE INDEX IF NOT EXISTS policy_consents_user_idx ON public.policy_consents(user_id);

-- 3. Game Stats Table (Match history and win/loss records)
CREATE TABLE IF NOT EXISTS public.game_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  difficulty text,
  result text NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  rounds_total int NOT NULL,
  rounds_won int NOT NULL DEFAULT 0,
  rounds_lost int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_stats_user_created_idx ON public.game_stats(user_id, created_at DESC);

-- 4. Online Rooms Table (Multiplayer game state)
CREATE TABLE IF NOT EXISTS public.online_rooms (
  code text PRIMARY KEY,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'cancelled')),
  host_color text NOT NULL DEFAULT 'emerald',
  guest_color text NOT NULL DEFAULT 'ruby',
  timer int NOT NULL DEFAULT 0,
  rounds int NOT NULL DEFAULT 3,
  game_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS online_rooms_host_idx ON public.online_rooms(host_id);
CREATE INDEX IF NOT EXISTS online_rooms_guest_idx ON public.online_rooms(guest_id);
CREATE INDEX IF NOT EXISTS online_rooms_status_idx ON public.online_rooms(status);

-- 5. Game Invitations Table (User-to-user lobby challenges)
CREATE TABLE IF NOT EXISTS public.game_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_invitations_to_user_idx ON public.game_invitations(to_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS game_invitations_from_user_idx ON public.game_invitations(from_user_id, status);
CREATE INDEX IF NOT EXISTS game_invitations_room_code_idx ON public.game_invitations(room_code);

-- 6. Auth Trigger: Create profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_display_name text;
BEGIN
  v_username := NULLIF(trim(NEW.raw_user_meta_data->>'username'), '');
  v_display_name := COALESCE(NULLIF(left(trim(NEW.raw_user_meta_data->>'display_name'), 60), ''), v_username, 'Player');
  
  INSERT INTO public.profiles (user_id, username, display_name)
  VALUES (NEW.id, v_username, v_display_name)
  ON CONFLICT (user_id) DO UPDATE SET
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. RPC: Resolve Login Email by Username
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_username IS NULL OR trim(p_username) = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE LOWER(p.username) = LOWER(TRIM(p_username))
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated, service_role;

-- 8. Row Level Security (RLS) Configuration

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_invitations ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.online_rooms TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Policies: Profiles
DROP POLICY IF EXISTS "profiles read all" ON public.profiles;
CREATE POLICY "profiles read all" ON public.profiles
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "profiles insert self" ON public.profiles;
CREATE POLICY "profiles insert self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles update self" ON public.profiles;
CREATE POLICY "profiles update self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies: Policy Consents
DROP POLICY IF EXISTS "policy_consents select self" ON public.policy_consents;
CREATE POLICY "policy_consents select self" ON public.policy_consents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "policy_consents insert self" ON public.policy_consents;
CREATE POLICY "policy_consents insert self" ON public.policy_consents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "policy_consents update self" ON public.policy_consents;
CREATE POLICY "policy_consents update self" ON public.policy_consents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies: Game Stats
DROP POLICY IF EXISTS "game_stats select self" ON public.game_stats;
CREATE POLICY "game_stats select self" ON public.game_stats
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_stats insert self" ON public.game_stats;
CREATE POLICY "game_stats insert self" ON public.game_stats
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_stats update self" ON public.game_stats;
CREATE POLICY "game_stats update self" ON public.game_stats
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies: Online Rooms
DROP POLICY IF EXISTS "online_rooms select all" ON public.online_rooms;
CREATE POLICY "online_rooms select all" ON public.online_rooms
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "online_rooms insert host" ON public.online_rooms;
CREATE POLICY "online_rooms insert host" ON public.online_rooms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "online_rooms update participants" ON public.online_rooms;
CREATE POLICY "online_rooms update participants" ON public.online_rooms
  FOR UPDATE TO authenticated
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR guest_id IS NULL)
  WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id OR guest_id IS NULL);

-- Policies: Game Invitations
DROP POLICY IF EXISTS "game_invitations select participants" ON public.game_invitations;
CREATE POLICY "game_invitations select participants" ON public.game_invitations
  FOR SELECT TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

DROP POLICY IF EXISTS "game_invitations insert sender" ON public.game_invitations;
CREATE POLICY "game_invitations insert sender" ON public.game_invitations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user_id);

DROP POLICY IF EXISTS "game_invitations update participants" ON public.game_invitations;
CREATE POLICY "game_invitations update participants" ON public.game_invitations
  FOR UPDATE TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- 9. Realtime Publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invitations;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.online_rooms;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
