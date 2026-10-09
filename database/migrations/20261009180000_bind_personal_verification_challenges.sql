-- Personal code requests retain immutable invitation provenance without token material.
ALTER TABLE public.academy_admission_requests
  ADD CONSTRAINT admission_request_personal_origin_key UNIQUE(id,tribe_id,user_id,invitation_id);

ALTER TABLE public.contact_verification_challenges
  ADD COLUMN personal_invitation_id uuid,
  ADD COLUMN personal_request_id uuid,
  ADD CONSTRAINT admission_challenge_personal_invitation_fkey
    FOREIGN KEY(personal_invitation_id,tribe_id)
    REFERENCES public.academy_personal_invitations(id,tribe_id) ON DELETE RESTRICT,
  ADD CONSTRAINT admission_challenge_personal_purpose_check
    CHECK(personal_invitation_id IS NULL OR purpose='admission'),
  ADD CONSTRAINT admission_challenge_personal_request_fkey
    FOREIGN KEY(personal_request_id,tribe_id,user_id,personal_invitation_id)
    REFERENCES public.academy_admission_requests(id,tribe_id,user_id,invitation_id) ON DELETE RESTRICT,
  ADD CONSTRAINT admission_challenge_personal_request_origin_check
    CHECK(personal_request_id IS NULL OR personal_invitation_id IS NOT NULL);

CREATE FUNCTION public.guard_personal_verification_origin() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.personal_invitation_id,NEW.personal_request_id) IS DISTINCT FROM ROW(OLD.personal_invitation_id,OLD.personal_request_id) THEN
    RAISE EXCEPTION 'personal verification challenge origin is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_personal_verification_origin() FROM PUBLIC;
CREATE TRIGGER admission_challenge_personal_origin_guard BEFORE UPDATE
  ON public.contact_verification_challenges FOR EACH ROW
  EXECUTE FUNCTION public.guard_personal_verification_origin();
