UPDATE public.tribe_members
SET
  status = 'active',
  status_reason = 'none'
WHERE role IN ('leader', 'guardian')
  AND status IN ('blocked', 'removed')
  AND status_reason IN ('payment_blocked', 'subscription_inactive');
