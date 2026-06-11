-- Add client_operation_id to key tables for offline idempotency
ALTER TABLE public.atendimentos ADD COLUMN IF NOT EXISTS client_operation_id UUID;
ALTER TABLE public.atendimentos ADD CONSTRAINT unique_atendimento_client_op UNIQUE (client_operation_id);

ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS client_operation_id UUID;
ALTER TABLE public.pacientes ADD CONSTRAINT unique_paciente_client_op UNIQUE (client_operation_id);

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS client_operation_id UUID;
ALTER TABLE public.agendamentos ADD CONSTRAINT unique_agendamento_client_op UNIQUE (client_operation_id);
