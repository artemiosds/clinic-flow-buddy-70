-- Tabela para logs de webhook (Auditoria)
CREATE TABLE IF NOT EXISTS public.autentique_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payload JSONB NOT NULL,
    event_type TEXT,
    document_id TEXT,
    status_code INTEGER,
    processado BOOLEAN DEFAULT false,
    erro TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS nos logs
ALTER TABLE public.autentique_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Política para Master ver logs
CREATE POLICY "Masters podem ver logs de webhook" 
ON public.autentique_webhook_logs 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.funcionarios 
        WHERE auth_user_id = auth.uid() AND role = 'master'
    )
);

-- Garantir que a tabela de documentos tenha a coluna origem
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documentos_assinatura_autentique' AND column_name = 'origem') THEN
        ALTER TABLE public.documentos_assinatura_autentique ADD COLUMN origem TEXT DEFAULT 'gerado_sistema';
    END IF;
END $$;

-- Adicionar colunas de cache para nomes (facilita listagem rápida)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documentos_assinatura_autentique' AND column_name = 'paciente_nome') THEN
        ALTER TABLE public.documentos_assinatura_autentique ADD COLUMN paciente_nome TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documentos_assinatura_autentique' AND column_name = 'profissional_nome') THEN
        ALTER TABLE public.documentos_assinatura_autentique ADD COLUMN profissional_nome TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documentos_assinatura_autentique' AND column_name = 'unidade_nome') THEN
        ALTER TABLE public.documentos_assinatura_autentique ADD COLUMN unidade_nome TEXT;
    END IF;
END $$;

-- Atualizar políticas de RLS para documentos_assinatura_autentique
-- Master vê tudo
DROP POLICY IF EXISTS "Masters vêm todos os documentos da unidade" ON public.documentos_assinatura_autentique;
CREATE POLICY "Masters vêm todos os documentos da unidade" 
ON public.documentos_assinatura_autentique 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.funcionarios 
        WHERE auth_user_id = auth.uid() AND role = 'master'
    )
);

-- Profissional vê seus documentos
DROP POLICY IF EXISTS "Profissionais vêm seus próprios documentos" ON public.documentos_assinatura_autentique;
CREATE POLICY "Profissionais vêm seus próprios documentos" 
ON public.documentos_assinatura_autentique 
FOR SELECT 
USING (
    profissional_id::text = (SELECT id::text FROM public.funcionarios WHERE auth_user_id = auth.uid())
);
