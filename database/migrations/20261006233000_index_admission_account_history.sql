-- Read the current account's latest request without scanning another account's history.
CREATE INDEX admission_request_account_history_idx
  ON public.academy_admission_requests(tribe_id,user_id,submitted_at DESC,id DESC);
