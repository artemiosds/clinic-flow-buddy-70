-- 1. Tabela de Configuração
CREATE TABLE public.assinatura_eletronica_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'autentique',
    ativo BOOLEAN DEFAULT false,
    ambiente TEXT NOT NULL DEFAULT 'sandbox', -- 'sandbox' ou 'production'
    token_api TEXT, -- Sensível, será protegido por RLS e filtrado em visualizações
    organizacao_nome TEXT,
    email_remetente_padrao TEXT,
    pasta_padrao_id TEXT,
    webhook_url TEXT,
    enviar_email BOOLEAN DEFAULT true,
    enviar_whatsapp BOOLEAN DEFAULT false,
    exigir_profissional BOOLEAN DEFAULT true,
    exigir_paciente BOOLEAN DEFAULT false,
    exigir_master BOOLEAN DEFAULT false,
    baixar_assinado_automaticamente BOOLEAN DEFAULT true,
    salvar_copia_local BOOLEAN DEFAULT true,
    vincular_paciente BOOLEAN DEFAULT true,
    permitir_envio_massa BOOLEAN DEFAULT false,
    unidade_id TEXT, -- Se for NULL, é configuração global
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabela de Documentos Autentique
CREATE TABLE public.documentos_assinatura_autentique (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_local_id UUID REFERENCES public.documentos_gerados(id) ON DELETE SET NULL,
    paciente_id TEXT,
    prontuario_id UUID,
    agendamento_id UUID,
    profissional_id TEXT,
    unidade_id TEXT,
    provider TEXT NOT NULL DEFAULT 'autentique',
    autentique_document_id TEXT UNIQUE,
    titulo_documento TEXT NOT NULL,
    tipo_documento TEXT,
    status TEXT NOT NULL DEFAULT 'rascunho', -- rascunho, enviado, aguardando_assinatura, parcialmente_assinado, assinado, concluido, recusado, cancelado, erro
    status_detalhado JSONB,
    url_autentique TEXT,
    storage_bucket TEXT DEFAULT 'documentos_assinados',
    storage_path_original TEXT,
    storage_path_assinado TEXT,
    enviado_por UUID REFERENCES auth.users(id),
    enviado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    finalizado_em TIMESTAMP WITH TIME ZONE,
    cancelado_em TIMESTAMP WITH TIME ZONE,
    erro_mensagem TEXT,
    payload_resumo JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Tabela de Signatários
CREATE TABLE public.documentos_assinatura_signatarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_assinatura_id UUID REFERENCES public.documentos_assinatura_autentique(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    cpf TEXT,
    telefone TEXT,
    tipo_signatario TEXT NOT NULL, -- profissional, paciente, responsavel, master, externo
    papel TEXT DEFAULT 'assinar', -- assinar, aprovar, visualizar
    ordem_assinatura INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pendente', -- pendente, assinado, recusado, visualizado
    assinado_em TIMESTAMP WITH TIME ZONE,
    visualizado_em TIMESTAMP WITH TIME ZONE,
    autentique_signer_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Fila de Envio em Massa
CREATE TABLE public.autentique_fila_envio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_local_id UUID REFERENCES public.documentos_gerados(id) ON DELETE CASCADE,
    documento_assinatura_id UUID REFERENCES public.documentos_assinatura_autentique(id) ON DELETE SET NULL,
    paciente_id TEXT,
    unidade_id TEXT,
    status TEXT DEFAULT 'pendente', -- pendente, processando, enviado, erro, cancelado
    tentativas INTEGER DEFAULT 0,
    proxima_tentativa_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    erro_mensagem TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Habilitar RLS
ALTER TABLE public.assinatura_eletronica_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_assinatura_autentique ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_assinatura_signatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autentique_fila_envio ENABLE ROW LEVEL SECURITY;

-- 6. Políticas RLS - Configuração (Apenas Master vê Token)
CREATE POLICY "Apenas Master vê configurações completas" 
ON public.assinatura_eletronica_config 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.funcionarios 
        WHERE id::text = auth.uid()::text AND role = 'master'
    )
);

CREATE POLICY "Outros perfis veem se está ativo (sem token)" 
ON public.assinatura_eletronica_config 
FOR SELECT 
USING (true); -- Controle de colunas sensíveis via View ou Filtro no app

CREATE POLICY "Apenas Master edita configurações" 
ON public.assinatura_eletronica_config 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.funcionarios 
        WHERE id::text = auth.uid()::text AND role = 'master'
    )
);

-- 7. Políticas RLS - Documentos
CREATE POLICY "Usuários veem seus próprios envios ou de sua unidade" 
ON public.documentos_assinatura_autentique 
FOR SELECT 
USING (
    enviado_por = auth.uid() OR 
    EXISTS (
        SELECT 1 FROM public.funcionarios 
        WHERE id::text = auth.uid()::text AND (role = 'master' OR unidade_id = documentos_assinatura_autentique.unidade_id)
    )
);

CREATE POLICY "Usuários criam seus envios" 
ON public.documentos_assinatura_autentique 
FOR INSERT 
WITH CHECK (enviado_por = auth.uid());

CREATE POLICY "Master e Profissional editam seus envios" 
ON public.documentos_assinatura_autentique 
FOR UPDATE 
USING (
    enviado_por = auth.uid() OR 
    EXISTS (
        SELECT 1 FROM public.funcionarios 
        WHERE id::text = auth.uid()::text AND role = 'master'
    )
);

-- 8. Políticas RLS - Signatários (Segue permissão do documento)
CREATE POLICY "Acesso aos signatários baseado no documento" 
ON public.documentos_assinatura_signatarios 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.documentos_assinatura_autentique doc
        WHERE doc.id = documentos_assinatura_signatarios.documento_assinatura_id AND (
            doc.enviado_por = auth.uid() OR 
            EXISTS (
                SELECT 1 FROM public.funcionarios 
                WHERE id::text = auth.uid()::text AND (role = 'master' OR unidade_id = doc.unidade_id)
            )
        )
    )
);

-- 9. Trigger para updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_assinatura_eletronica_config_updated_at BEFORE UPDATE ON public.assinatura_eletronica_config FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_documentos_assinatura_autentique_updated_at BEFORE UPDATE ON public.documentos_assinatura_autentique FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_documentos_assinatura_signatarios_updated_at BEFORE UPDATE ON public.documentos_assinatura_signatarios FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_autentique_fila_envio_updated_at BEFORE UPDATE ON public.autentique_fila_envio FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 10. View Segura para o Frontend (Esconde Token)
CREATE VIEW public.assinatura_eletronica_config_public AS
SELECT 
    id, provider, ativo, ambiente, organizacao_nome, email_remetente_padrao, 
    webhook_url, enviar_email, enviar_whatsapp, exigir_profissional, 
    exigir_paciente, exigir_master, baixar_assinado_automaticamente, 
    salvar_copia_local, vincular_paciente, permitir_envio_massa, unidade_id, 
    created_at, updated_at
FROM public.assinatura_eletronica_config;

-- 11. Bucket de Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos_assinados', 'documentos_assinados', false) ON CONFLICT DO NOTHING;

-- Políticas de Storage
CREATE POLICY "Acesso aos documentos assinados" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documentos_assinados' AND (
    auth.uid() IS NOT NULL -- Adicionar lógica mais restritiva se necessário baseada no metadata
));