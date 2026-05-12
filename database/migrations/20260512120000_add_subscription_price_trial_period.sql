ALTER TABLE public.tribe_subscription_prices
ADD COLUMN IF NOT EXISTS trial_frequency integer;

ALTER TABLE public.tribe_subscription_prices
ADD COLUMN IF NOT EXISTS trial_frequency_type text;

ALTER TABLE public.tribe_subscription_prices
DROP CONSTRAINT IF EXISTS tribe_subscription_prices_trial_period_check;

ALTER TABLE public.tribe_subscription_prices
ADD CONSTRAINT tribe_subscription_prices_trial_period_check
CHECK (
  (
    trial_frequency IS NULL
    AND trial_frequency_type IS NULL
  )
        OR (
          trial_frequency > 0
          AND trial_frequency_type IS NOT NULL
          AND trial_frequency_type IN ('days', 'months')
        )
      );
