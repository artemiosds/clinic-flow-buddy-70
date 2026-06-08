-- Migration for flexible clinical documents
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS especialidade_id TEXT;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS profissao_id TEXT;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS historico_edicoes JSONB DEFAULT '[]'::jsonb;

-- Create a table for template history to avoid bloating the main table if JSONB gets too large, 
-- but for now, the user requested it in the same table or accessible.
-- We'll stick to a robust JSONB field 'historico_edicoes' for simplicity in this MVP but structured.

-- Ensure documentos_gerados tracks the specific template version
ALTER TABLE public.documentos_gerados ADD COLUMN IF NOT EXISTS modelo_versao INTEGER;
ALTER TABLE public.documentos_gerados ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Update existing records to version 1
UPDATE public.document_templates SET version = 1 WHERE version IS NULL;

-- Permissions for document_templates
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;

-- Permissions for documentos_gerados
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos_gerados TO authenticated;
GRANT ALL ON public.documentos_gerados TO service_role;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_document_templates_tipo ON public.document_templates(tipo);
CREATE INDEX IF NOT EXISTS idx_document_templates_unidade_id ON public.document_templates(unidade_id);
CREATE INDEX IF NOT EXISTS idx_documentos_gerados_paciente_id ON public.documentos_gerados(paciente_id);
