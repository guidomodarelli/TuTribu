-- Keep bounded chronological notification reads independent from the total delivery history.
CREATE INDEX idx_notification_delivery_catalog
  ON public.message_deliveries (tribe_id, created_at DESC, id DESC)
  WHERE purpose = 'admission_notification';
