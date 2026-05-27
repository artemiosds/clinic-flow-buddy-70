-- Garantir que a função de update_at exista
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Evolução da tabela PTS
ALTER TABLE public.pts 
ADD COLUMN IF NOT EXISTS prioridade text DEFAULT 'media',
ADD COLUMN IF NOT EXISTS contextos_afetados text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS fatores_risco_vulnerabilidade text DEFAULT '',
ADD COLUMN IF NOT EXISTS rede_apoio text DEFAULT '',
ADD COLUMN IF NOT EXISTS tipo_atendimento text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS necessidade_interdisciplinar boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS motivo_encaminhamento text DEFAULT '',
ADD COLUMN IF NOT EXISTS barreiras text DEFAULT '',
ADD COLUMN IF NOT EXISTS potencialidades text DEFAULT '',
ADD COLUMN IF NOT EXISTS objetivos_especificos text DEFAULT '',
ADD COLUMN IF NOT EXISTS observacoes_especialidade jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS plano_conduta text DEFAULT '',
ADD COLUMN IF NOT EXISTS data_ultima_revisao date,
ADD COLUMN IF NOT EXISTS data_proxima_revisao date,
ADD COLUMN IF NOT EXISTS revisao_obrigatoria boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS observacoes_revisao text DEFAULT '',
ADD COLUMN IF NOT EXISTS criterio_alta_atingido boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS motivo_encerramento text DEFAULT '',
ADD COLUMN IF NOT EXISTS resumo_alta_encerramento text DEFAULT '',
ADD COLUMN IF NOT EXISTS orientacoes_finais text DEFAULT '',
ADD COLUMN IF NOT EXISTS encaminhamentos_pos_alta text DEFAULT '',
ADD COLUMN IF NOT EXISTS ciencia_familia boolean DEFAULT false;

-- Tabela de Metas Estruturadas
CREATE TABLE IF NOT EXISTS public.pts_metas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pts_id uuid NOT NULL REFERENCES public.pts(id) ON DELETE CASCADE,
    titulo text NOT NULL,
    descricao text DEFAULT '',
    categoria text DEFAULT 'curto', -- curto, medio, longo
    especialidade text,
    responsavel_id text,
    prioridade text DEFAULT 'media',
    prazo date,
    indicador_sucesso text DEFAULT '',
    status text DEFAULT 'nao_iniciado', -- nao_iniciado, em_andamento, parcialmente_atingida, atingida, suspensa, cancelada
    observacoes text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de Histórico de Revisões
CREATE TABLE IF NOT EXISTS public.pts_revisoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pts_id uuid NOT NULL REFERENCES public.pts(id) ON DELETE CASCADE,
    profissional_id text NOT NULL,
    data_revisao date NOT NULL DEFAULT CURRENT_DATE,
    alteracoes_realizadas text DEFAULT '',
    observacoes text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Adicionar vínculo na tabela de prontuários (evoluções)
ALTER TABLE public.prontuarios 
ADD COLUMN IF NOT EXISTS pts_meta_id uuid REFERENCES public.pts_metas(id) ON DELETE SET NULL;

-- Habilitar RLS e conceder permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pts_metas TO authenticated;
GRANT ALL ON public.pts_metas TO service_role;
ALTER TABLE public.pts_metas ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth users manage pts_metas') THEN
        CREATE POLICY "Auth users manage pts_metas" ON public.pts_metas
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pts_revisoes TO authenticated;
GRANT ALL ON public.pts_revisoes TO service_role;
ALTER TABLE public.pts_revisoes ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth users manage pts_revisoes') THEN
        CREATE POLICY "Auth users manage pts_revisoes" ON public.pts_revisoes
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Trigger para atualizar updated_at em pts_metas
DROP TRIGGER IF EXISTS update_pts_metas_updated_at ON public.pts_metas;
CREATE TRIGGER update_pts_metas_updated_at
BEFORE UPDATE ON public.pts_metas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
