-- Adiciona identificador local do sistema para uso nas integrações (saída de encaminhamentos)
ALTER TABLE public.clinica_config
ADD COLUMN IF NOT EXISTS identificador_local text NOT NULL DEFAULT '';