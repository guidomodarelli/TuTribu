-- Every terminal owner captures original request provenance at its decision.
-- No raw contact, provider payload, credential or verification secret is kept.
CREATE FUNCTION public.capture_admission_decision_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE request_record public.academy_admission_requests%ROWTYPE; evidence_reference uuid; evidence_verified_at timestamptz;
BEGIN
  SELECT * INTO request_record FROM public.academy_admission_requests
    WHERE id=NEW.request_id AND tribe_id=NEW.tribe_id AND user_id=NEW.user_id FOR SHARE;
  IF NOT FOUND OR NEW.request_version IS DISTINCT FROM request_record.version THEN
    RAISE EXCEPTION 'admission decision evidence request/version is unavailable' USING ERRCODE='23514';
  END IF;
  IF request_record.evidence_source='local' THEN
    evidence_reference=request_record.proof_id;
    SELECT verified_at INTO evidence_verified_at FROM public.academy_admission_verification_proofs
      WHERE id=evidence_reference AND applied_request_id=request_record.id AND tribe_id=request_record.tribe_id AND user_id=request_record.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'admission decision applied proof is unavailable' USING ERRCODE='23514'; END IF;
  ELSIF request_record.evidence_source='base' THEN
    evidence_reference=request_record.global_identity_evidence_id;
    SELECT verified_at INTO evidence_verified_at FROM public.global_identity_evidence WHERE id=evidence_reference AND user_id=request_record.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'admission decision base evidence is unavailable' USING ERRCODE='23514'; END IF;
  END IF;
  NEW.evidence_snapshot=jsonb_build_object('kind',request_record.evidence_source,'referenceId',evidence_reference,
    'verifiedAt',CASE WHEN evidence_verified_at IS NULL THEN NULL ELSE to_char(evidence_verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_admission_decision_evidence() FROM PUBLIC;
CREATE TRIGGER admission_decision_evidence_capture BEFORE INSERT ON public.academy_admission_decisions
  FOR EACH ROW EXECUTE FUNCTION public.capture_admission_decision_evidence();

CREATE FUNCTION public.guard_admission_decision_evidence_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evidence_snapshot IS DISTINCT FROM OLD.evidence_snapshot THEN
    RAISE EXCEPTION 'admission decision evidence history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_decision_evidence_history() FROM PUBLIC;
CREATE TRIGGER admission_decision_evidence_history BEFORE UPDATE ON public.academy_admission_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_decision_evidence_history();
