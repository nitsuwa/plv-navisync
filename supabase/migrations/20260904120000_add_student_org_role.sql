-- Migration: Add 'student_org' to profiles role CHECK constraint
-- This allows student organizations to have a dedicated role for event map management.
--
-- The event map feature requires a "Student Org" role that sits between
-- regular students and administrators. Student Orgs can:
-- - Create and submit event map layouts (booths, tents, stages)
-- - View their own event submissions
-- - Cannot access admin features or modify the base campus map

-- Drop the existing CHECK constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Re-add the constraint with 'student_org' included
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'admin', 'student_org'));

-- Update the admin_update_profile function to accept 'student_org'
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id uuid,
  p_first_name text,
  p_last_name text,
  p_department text,
  p_student_number text,
  p_role text,
  p_is_active boolean
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_role text;
BEGIN
  -- Verify the caller is an admin
  SELECT role INTO _caller_role FROM public.profiles WHERE id = auth.uid();
  IF _caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only administrators can update user profiles';
  END IF;

  -- Validate role value
  IF p_role NOT IN ('student', 'admin', 'student_org') THEN
    RAISE EXCEPTION 'Invalid role: %. Must be student, admin, or student_org', p_role;
  END IF;

  -- Prevent self-demotion
  IF p_target_id = auth.uid() AND p_role != 'admin' THEN
    RAISE EXCEPTION 'Administrators cannot remove their own admin role';
  END IF;

  RETURN QUERY
  UPDATE public.profiles
  SET
    first_name = p_first_name,
    last_name = p_last_name,
    department = p_department,
    student_number = p_student_number,
    role = p_role,
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_target_id
  RETURNING *;
END;
$$;

-- Add comment for documentation
COMMENT ON CONSTRAINT profiles_role_check ON public.profiles
  IS 'Role values: student (default), admin (full access), student_org (event map management)';
