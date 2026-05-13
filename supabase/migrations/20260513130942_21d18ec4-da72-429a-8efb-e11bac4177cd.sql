-- 1. Melhorar tabela profissionais_externos
ALTER TABLE public.profissionais_externos 
ADD COLUMN IF NOT EXISTS telefone TEXT,
ADD COLUMN IF NOT EXISTS documento_registro TEXT,
ADD COLUMN IF NOT EXISTS unidade_origem TEXT,
ADD COLUMN IF NOT EXISTS responsavel TEXT,
ADD COLUMN IF NOT EXISTS observacoes TEXT,
ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{
  "can_schedule": true,
  "can_view_own": true,
  "can_cancel": true,
  "can_edit_patient": true,
  "can_create_patient": true,
  "can_select_patient": true,
  "can_attach_docs": false,
  "can_use_online_agenda": false
}'::jsonb,
ADD COLUMN IF NOT EXISTS token_acesso TEXT,
ADD COLUMN IF NOT EXISTS validade_acesso TIMESTAMP WITH TIME ZONE;

-- 2. Melhorar tabela quotas_externas para suportar turnos e horários
ALTER TABLE public.quotas_externas
ADD COLUMN IF NOT EXISTS especialidade TEXT,
ADD COLUMN IF NOT EXISTS dia_semana INTEGER, -- 0-6
ADD COLUMN IF NOT EXISTS turno TEXT DEFAULT 'Integral', -- Manhã, Tarde, Noite, Integral, Personalizado
ADD COLUMN IF NOT EXISTS hora_inicio TIME,
ADD COLUMN IF NOT EXISTS hora_fim TIME,
ADD COLUMN IF NOT EXISTS duracao_padrao INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- 3. Criar tabela de logs/agendamentos externos se não existir
CREATE TABLE IF NOT EXISTS public.agendamentos_externos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    paciente_id TEXT NOT NULL,
    profissional_externo_id UUID NOT NULL REFERENCES public.profissionais_externos(id),
    profissional_destino_id TEXT NOT NULL,
    unidade_id TEXT NOT NULL,
    cota_id UUID REFERENCES public.quotas_externas(id),
    data DATE NOT NULL,
    hora TIME NOT NULL,
    turno TEXT,
    status TEXT DEFAULT 'pendente',
    observacoes TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for agendamentos_externos
ALTER TABLE public.agendamentos_externos ENABLE ROW LEVEL SECURITY;

-- Policies for agendamentos_externos
CREATE POLICY "Profissionais externos veem seus próprios agendamentos" 
ON public.agendamentos_externos FOR SELECT 
USING (auth.uid() IN (SELECT auth_user_id FROM public.profissionais_externos WHERE id = profissional_externo_id));

CREATE POLICY "Master vê todos os agendamentos externos" 
ON public.agendamentos_externos FOR ALL 
USING (auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' ILIKE 'master'));

-- 4. Garantir que a tabela pacientes tenha todos os campos necessários para o padrão oficial
ALTER TABLE public.pacientes
ADD COLUMN IF NOT EXISTS nacionalidade TEXT DEFAULT 'Brasileira',
ADD COLUMN IF NOT EXISTS situacao_rua BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS etnia TEXT,
ADD COLUMN IF NOT EXISTS etnia_outra TEXT,
ADD COLUMN IF NOT EXISTS pais_nascimento TEXT DEFAULT 'Brasil',
ADD COLUMN IF NOT EXISTS tipo_logradouro_codigo TEXT;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_agendamentos_externos_prof_ext ON public.agendamentos_externos(profissional_externo_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_externos_paciente ON public.agendamentos_externos(paciente_id);
