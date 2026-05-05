-- Create referral status type
DO $$ BEGIN
    CREATE TYPE public.paciente_encaminhamento_status AS ENUM ('pendente', 'realizado', 'cancelado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create table for UBS referrals (Encaminhamentos)
CREATE TABLE IF NOT EXISTS public.paciente_encaminhamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id TEXT REFERENCES public.pacientes(id) ON DELETE CASCADE,
    unidade_id TEXT,
    profissional_id UUID,
    especialidade_destino TEXT NOT NULL,
    ubs_origem TEXT,
    profissional_solicitante TEXT,
    tipo_encaminhamento TEXT,
    cid TEXT,
    diagnostico_resumido TEXT,
    justificativa TEXT,
    data_encaminhamento DATE DEFAULT CURRENT_DATE,
    status public.paciente_encaminhamento_status DEFAULT 'pendente',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID
);

-- Create table for referral attachments
CREATE TABLE IF NOT EXISTS public.paciente_encaminhamento_anexos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encaminhamento_id UUID REFERENCES public.paciente_encaminhamentos(id) ON DELETE CASCADE,
    nome_arquivo TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    tamanho_bytes BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    uploaded_by UUID
);

-- Enable RLS
ALTER TABLE public.paciente_encaminhamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paciente_encaminhamento_anexos ENABLE ROW LEVEL SECURITY;

-- Policies for encaminhamentos
CREATE POLICY "Enable read for authenticated users on encaminhamentos"
ON public.paciente_encaminhamentos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert for authenticated users on encaminhamentos"
ON public.paciente_encaminhamentos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users on encaminhamentos"
ON public.paciente_encaminhamentos FOR UPDATE
TO authenticated
USING (true);

-- Policies for anexos
CREATE POLICY "Enable read for authenticated users on encaminhamento_anexos"
ON public.paciente_encaminhamento_anexos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert for authenticated users on encaminhamento_anexos"
ON public.paciente_encaminhamento_anexos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users on encaminhamento_anexos"
ON public.paciente_encaminhamento_anexos FOR DELETE
TO authenticated
USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_encaminhamentos ON public.paciente_encaminhamentos;
CREATE TRIGGER set_updated_at_encaminhamentos
BEFORE UPDATE ON public.paciente_encaminhamentos
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();