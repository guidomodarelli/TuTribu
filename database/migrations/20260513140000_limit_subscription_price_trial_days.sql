ALTER TABLE public.tribe_subscription_prices
DROP CONSTRAINT IF EXISTS tribe_subscription_prices_trial_period_check;

UPDATE public.tribe_subscription_prices
SET trial_frequency = 1
WHERE trial_frequency_type = 'days'
  AND trial_frequency IS NOT NULL
  AND trial_frequency < 1
  AND mercado_pago_preapproval_plan_id IS NULL;

UPDATE public.tribe_subscription_prices
SET trial_frequency = 14
WHERE trial_frequency_type = 'days'
  AND trial_frequency IS NOT NULL
  AND trial_frequency > 14
  AND mercado_pago_preapproval_plan_id IS NULL;

ALTER TABLE public.tribe_subscription_prices
ADD CONSTRAINT tribe_subscription_prices_trial_period_check
CHECK (
  (
    trial_frequency IS NULL
    AND trial_frequency_type IS NULL
  )
  OR (
    trial_frequency IS NOT NULL
    AND trial_frequency_type IS NOT NULL
    AND (
      (
        trial_frequency_type = 'days'
        AND trial_frequency BETWEEN 1 AND 14
      )
      OR (
        trial_frequency_type = 'days'
        AND trial_frequency > 0
        AND mercado_pago_preapproval_plan_id IS NOT NULL
      )
      OR (
        trial_frequency_type = 'months'
        AND trial_frequency > 0
      )
    )
  )
);
