-- Add client_operation_id to fila_espera for offline idempotency
ALTER TABLE public.fila_espera ADD COLUMN IF NOT EXISTS client_operation_id UUID;
ALTER TABLE public.fila_espera ADD CONSTRAINT unique_fila_client_op UNIQUE (client_operation_id);

-- Add client_operation_id to action_logs for offline idempotency
ALTER TABLE public.action_logs ADD COLUMN IF NOT EXISTS client_operation_id UUID;
ALTER TABLE public.action_logs ADD CONSTRAINT unique_action_log_client_op UNIQUE (client_operation_id);

-- Index for sync performance
CREATE INDEX IF NOT EXISTS idx_fila_espera_client_op ON public.fila_espera(client_operation_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_client_op ON public.action_logs(client_operation_id);
