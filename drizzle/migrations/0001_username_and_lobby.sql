-- Migration: Add username support to profiles, create online_rooms and game_invitations tables

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (LOWER(username));

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

DROP POLICY IF EXISTS "own profile read" ON public.profiles;
DROP POLICY IF EXISTS "profiles read authenticated" ON public.profiles;
CREATE POLICY "profiles read authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

CREATE TABLE IF NOT EXISTS public.online_rooms (
  code text PRIMARY KEY,
  host_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
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

GRANT SELECT, INSERT, UPDATE ON public.online_rooms TO authenticated;
GRANT ALL ON public.online_rooms TO service_role;

ALTER TABLE public.online_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "online_rooms select" ON public.online_rooms;
CREATE POLICY "online_rooms select" ON public.online_rooms
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "online_rooms insert" ON public.online_rooms;
CREATE POLICY "online_rooms insert" ON public.online_rooms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "online_rooms update" ON public.online_rooms;
CREATE POLICY "online_rooms update" ON public.online_rooms
  FOR UPDATE TO authenticated
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR guest_id IS NULL)
  WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id OR guest_id IS NULL);

CREATE TABLE IF NOT EXISTS public.game_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  room_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_invitations_to_user_idx ON public.game_invitations(to_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS game_invitations_from_user_idx ON public.game_invitations(from_user_id, status);
CREATE INDEX IF NOT EXISTS game_invitations_room_code_idx ON public.game_invitations(room_code);

GRANT SELECT, INSERT, UPDATE ON public.game_invitations TO authenticated;
GRANT ALL ON public.game_invitations TO service_role;

ALTER TABLE public.game_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_invitations select" ON public.game_invitations;
CREATE POLICY "game_invitations select" ON public.game_invitations
  FOR SELECT TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

DROP POLICY IF EXISTS "game_invitations insert" ON public.game_invitations;
CREATE POLICY "game_invitations insert" ON public.game_invitations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user_id);

DROP POLICY IF EXISTS "game_invitations update" ON public.game_invitations;
CREATE POLICY "game_invitations update" ON public.game_invitations
  FOR UPDATE TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = from_user_id OR auth.uid() = to_user_id);

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
