-- Repairs admission policies saved before their academy had a usable messaging selection.
-- Until this release a policy only followed a selection that replaced the one it already
-- referenced, so rules saved first kept a null reference and contact codes stayed closed.
-- Each such policy is attached to the tribe's selected connection version (at most one per
-- tribe by messaging_connection_selected_key) when it is active or degraded and not retired.
-- The guard trigger requires the single version increment; every repair leaves the same
-- system audit fact as a first binding: no actor, no original operation, no prior reference.
WITH bound AS (
  UPDATE public.academy_admission_policies policy
  SET messaging_connection_id=connection.id,
    messaging_connection_version=connection.selected_version,
    version=policy.version+1,
    updated_at=clock_timestamp()
  FROM public.tenant_messaging_connections connection
  WHERE policy.messaging_connection_id IS NULL
    AND policy.messaging_connection_version IS NULL
    AND connection.tribe_id=policy.tribe_id
    AND connection.is_selected
    AND connection.selected_version IS NOT NULL
    AND connection.retired_at IS NULL
    AND connection.state IN ('active','degraded')
    AND EXISTS(SELECT 1 FROM public.messaging_connection_versions resource
      WHERE resource.connection_id=connection.id AND resource.tribe_id=connection.tribe_id
        AND resource.version=connection.selected_version AND resource.retired_at IS NULL)
  RETURNING policy.tribe_id,policy.version,policy.verification_epoch,policy.updated_at,
    connection.id AS connection_id,connection.selected_version AS connection_version
)
INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,cause,resource_version,metadata,created_at)
SELECT bound.tribe_id,NULL,'admission_policy',bound.tribe_id,NULL,'messaging_selection_replaced','messaging_connection_replaced','messaging_connection_replaced',bound.version,
  jsonb_build_object('previousVersion',bound.version-1,'previousConnectionId',NULL,'previousConnectionVersion',NULL,
    'connectionId',bound.connection_id,'connectionVersion',bound.connection_version,'verificationEpoch',bound.verification_epoch),
  bound.updated_at
FROM bound;
