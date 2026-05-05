-- Alterar tabela de procedimentos do prontuário para incluir campos necessários para BPA e histórico
ALTER TABLE public.prontuario_procedimentos 
ADD COLUMN IF NOT EXISTS paciente_id TEXT,
ADD COLUMN IF NOT EXISTS agendamento_id TEXT,
ADD COLUMN IF NOT EXISTS profissional_id TEXT,
ADD COLUMN IF NOT EXISTS unidade_id TEXT,
ADD COLUMN IF NOT EXISTS codigo_sigtap TEXT,
ADD COLUMN IF NOT EXISTS nome_procedimento TEXT,
ADD COLUMN IF NOT EXISTS especialidade TEXT,
ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS cid TEXT,
ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'sigtap',
ADD COLUMN IF NOT EXISTS criado_por UUID,
ADD COLUMN IF NOT EXISTS atualizado_por UUID,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Garantir que RLS está habilitado
ALTER TABLE public.prontuario_procedimentos ENABLE ROW LEVEL SECURITY;

-- Criar política de acesso simplificada se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prontuario_procedimentos' AND policyname = 'Permitir acesso total para autenticados') THEN
        CREATE POLICY "Permitir acesso total para autenticados" ON public.prontuario_procedimentos FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;
