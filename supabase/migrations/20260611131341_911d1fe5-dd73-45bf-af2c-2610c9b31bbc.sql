-- Add client_operation_id to triage_records for offline idempotency
ALTER TABLE public.triage_records ADD COLUMN IF NOT EXISTS client_operation_id UUID;
ALTER TABLE public.triage_records ADD CONSTRAINT unique_triage_client_op UNIQUE (client_operation_id);

-- Update RLS policies to ensure user can only manage their own operations if needed
-- (Existing policies usually cover this by user_id or unit_id)

-- Index for sync performance
CREATE INDEX IF NOT EXISTS idx_atendimentos_client_op ON public.atendimentos(client_operation_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_client_op ON public.pacientes(client_operation_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_client_op ON public.agendamentos(client_operation_id);
CREATE INDEX IF NOT EXISTS idx_triage_records_client_op ON public.triage_records(client_operation_id);
