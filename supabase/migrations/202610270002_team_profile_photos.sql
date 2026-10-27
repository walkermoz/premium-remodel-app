-- A photo belongs to a company membership, not the person's shared profile.
-- The existing private remodel-files bucket stores the image bytes.
alter table public.remodel_memberships
  add column if not exists avatar_path text,
  add column if not exists avatar_updated_at timestamptz;
