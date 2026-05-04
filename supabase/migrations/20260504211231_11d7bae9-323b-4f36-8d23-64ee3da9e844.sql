-- Create patient documents table
CREATE TABLE IF NOT EXISTS public.paciente_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id TEXT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
    unidade_id TEXT,
    nome_arquivo TEXT NOT NULL,
    nome_original TEXT NOT NULL,
    tipo_documento TEXT, -- 'Identificação', 'Exame', 'Laudo', 'Receita', 'Outros'
    mime_type TEXT,
    tamanho_bytes BIGINT,
    storage_bucket TEXT NOT NULL DEFAULT 'paciente-documentos',
    storage_path TEXT NOT NULL,
    uploaded_by TEXT, -- user ID
    uploaded_by_nome TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by TEXT
);

-- Enable RLS
ALTER TABLE public.paciente_documentos ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_paciente_docs_paciente_id ON public.paciente_documentos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_paciente_docs_unidade_id ON public.paciente_documentos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_paciente_docs_ativo ON public.paciente_documentos(ativo);

-- RLS Policies
CREATE POLICY "Staff can view patient documents" ON public.paciente_documentos
    FOR SELECT USING (is_staff_member() OR is_external_professional());

CREATE POLICY "Staff can insert patient documents" ON public.paciente_documentos
    FOR INSERT WITH CHECK (is_staff_member() OR is_external_professional());

CREATE POLICY "Staff can update their unit documents" ON public.paciente_documentos
    FOR UPDATE USING (is_staff_member() OR is_external_professional());

CREATE POLICY "Staff can delete patient documents" ON public.paciente_documentos
    FOR DELETE USING (is_staff_member() OR is_external_professional());

-- Storage Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('paciente-documentos', 'paciente-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Authenticated users can upload documents" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'paciente-documentos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view documents" ON storage.objects
    FOR SELECT USING (bucket_id = 'paciente-documentos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete documents" ON storage.objects
    FOR DELETE USING (bucket_id = 'paciente-documentos' AND auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_paciente_documentos_updated_at
    BEFORE UPDATE ON public.paciente_documentos
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Data Migration: move existing documento_url to the new table
-- Note: existing urls are in 'sms' bucket under 'documentos/'
INSERT INTO public.paciente_documentos (
    paciente_id,
    unidade_id,
    nome_arquivo,
    nome_original,
    tipo_documento,
    storage_bucket,
    storage_path,
    created_at
)
SELECT 
    id as paciente_id,
    unidade_id,
    'Documento Legado' as nome_arquivo,
    'documento_legado.pdf' as nome_original,
    'Outros' as tipo_documento,
    'sms' as storage_bucket,
    documento_url as storage_path,
    criado_em as created_at
FROM public.pacientes
WHERE documento_url IS NOT NULL AND documento_url != '';
