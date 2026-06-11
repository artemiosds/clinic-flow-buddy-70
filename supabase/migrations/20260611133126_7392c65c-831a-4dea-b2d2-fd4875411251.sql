-- Padronização de idempotência em tabelas principais com tratamento de constraints existentes

-- Função auxiliar para dropar constraints que dependem de índices antes de renomear/recriar
DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Lista de nomes antigos que queremos limpar/padronizar
    FOR r IN (
        SELECT conname, relname 
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        WHERE conname IN ('unique_agendamento_client_op', 'unique_atendimento_client_op', 'unique_paciente_client_op', 'unique_triage_client_op', 'unique_fila_client_op', 'unique_action_log_client_op')
    ) LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.relname) || ' DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Agendamentos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'agendamentos' AND column_name = 'client_operation_id') THEN
    ALTER TABLE public.agendamentos ADD COLUMN client_operation_id UUID;
  END IF;
END $$;
DROP INDEX IF EXISTS public.unique_agendamento_client_op;
CREATE UNIQUE INDEX IF NOT EXISTS unique_agendamentos_client_op ON public.agendamentos (client_operation_id) WHERE client_operation_id IS NOT NULL;

-- Atendimentos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'atendimentos' AND column_name = 'client_operation_id') THEN
    ALTER TABLE public.atendimentos ADD COLUMN client_operation_id UUID;
  END IF;
END $$;
DROP INDEX IF EXISTS public.unique_atendimento_client_op;
CREATE UNIQUE INDEX IF NOT EXISTS unique_atendimentos_client_op ON public.atendimentos (client_operation_id) WHERE client_operation_id IS NOT NULL;

-- Pacientes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'pacientes' AND column_name = 'client_operation_id') THEN
    ALTER TABLE public.pacientes ADD COLUMN client_operation_id UUID;
  END IF;
END $$;
DROP INDEX IF EXISTS public.unique_paciente_client_op;
CREATE UNIQUE INDEX IF NOT EXISTS unique_pacientes_client_op ON public.pacientes (client_operation_id) WHERE client_operation_id IS NOT NULL;

-- Triagem (triage_records)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'triage_records' AND column_name = 'client_operation_id') THEN
    ALTER TABLE public.triage_records ADD COLUMN client_operation_id UUID;
  END IF;
END $$;
DROP INDEX IF EXISTS public.unique_triage_client_op;
CREATE UNIQUE INDEX IF NOT EXISTS unique_triage_records_client_op ON public.triage_records (client_operation_id) WHERE client_operation_id IS NOT NULL;

-- Fila de Espera
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'fila_espera' AND column_name = 'client_operation_id') THEN
    ALTER TABLE public.fila_espera ADD COLUMN client_operation_id UUID;
  END IF;
END $$;
DROP INDEX IF EXISTS public.unique_fila_client_op;
CREATE UNIQUE INDEX IF NOT EXISTS unique_fila_espera_client_op ON public.fila_espera (client_operation_id) WHERE client_operation_id IS NOT NULL;

-- Auditoria (action_logs)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'action_logs' AND column_name = 'client_operation_id') THEN
    ALTER TABLE public.action_logs ADD COLUMN client_operation_id UUID;
  END IF;
END $$;
DROP INDEX IF EXISTS public.unique_action_log_client_op;
CREATE UNIQUE INDEX IF NOT EXISTS unique_action_logs_client_op ON public.action_logs (client_operation_id) WHERE client_operation_id IS NOT NULL;
