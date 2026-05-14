-- Habilitar extensão pg_trgm para busca textual performática
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Índices para Tabelas Operacionais (Melhoria de Busca e Filtro)
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_status ON public.agendamentos (data, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_prof ON public.agendamentos (unidade_id, profissional_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente ON public.agendamentos (paciente_id);

CREATE INDEX IF NOT EXISTS idx_atendimentos_data_unidade ON public.atendimentos (data, unidade_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_profissional ON public.atendimentos (profissional_id);

CREATE INDEX IF NOT EXISTS idx_fila_espera_status_unidade ON public.fila_espera (status, unidade_id);
CREATE INDEX IF NOT EXISTS idx_fila_espera_prioridade ON public.fila_espera (prioridade);

CREATE INDEX IF NOT EXISTS idx_pacientes_nome_trgm ON public.pacientes USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pacientes_unidade ON public.pacientes (unidade_id);

-- 2. View Materializada para Relatórios (Performance Analítica)
-- Nota: Usando CAST(f.id AS TEXT) para evitar erro de comparação UUID = TEXT se profissional_id for TEXT em atendimentos
DROP MATERIALIZED VIEW IF EXISTS public.mv_relatorio_producao;
CREATE MATERIALIZED VIEW public.mv_relatorio_producao AS
SELECT 
    at.unidade_id,
    u.nome as unidade_nome,
    at.profissional_id,
    at.profissional_nome,
    f.profissao,
    at.data,
    at.status,
    COUNT(at.id) as total_atendimentos,
    SUM(at.duracao_minutos) as tempo_total_minutos
FROM public.atendimentos at
LEFT JOIN public.unidades u ON u.id = at.unidade_id
LEFT JOIN public.funcionarios f ON CAST(f.id AS TEXT) = at.profissional_id
GROUP BY 1, 2, 3, 4, 5, 6, 7;

CREATE INDEX IF NOT EXISTS idx_mv_relatorio_producao_unidade_data ON public.mv_relatorio_producao (unidade_id, data);

-- 3. Função RPC para KPIs do Dashboard (Redução de requests)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_unidade_id UUID DEFAULT NULL, p_profissional_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
    result JSON;
    v_today DATE := CURRENT_DATE;
BEGIN
    SELECT json_build_object(
        'hoje_total', (SELECT count(*) FROM agendamentos WHERE data = v_today::text AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id) AND (p_profissional_id IS NULL OR profissional_id = p_profissional_id)),
        'fila_aguardando', (SELECT count(*) FROM fila_espera WHERE status = 'aguardando' AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)),
        'atendimentos_30d', (SELECT count(*) FROM atendimentos WHERE data >= (v_today - INTERVAL '30 days')::text AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id) AND (p_profissional_id IS NULL OR profissional_id = CAST(p_profissional_id AS TEXT))),
        'taxa_falta_30d', (
            SELECT ROUND(COALESCE(count(*) FILTER (WHERE status = 'falta')::NUMERIC / NULLIF(count(*), 0) * 100, 0), 1)
            FROM agendamentos 
            WHERE data >= (v_today - INTERVAL '30 days')::text AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id) AND (p_profissional_id IS NULL OR profissional_id = p_profissional_id)
        )
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
