-- 1. Índices para Agendamentos (Tabela central)
-- Otimiza busca por unidade + profissional + data (comum na agenda)
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_prof_data_status 
ON public.agendamentos (unidade_id, profissional_id, data, status);

-- Otimiza busca por paciente para histórico
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente_data_desc 
ON public.agendamentos (paciente_id, data DESC);

-- 2. Índices para Prontuários
-- Otimiza busca de histórico do paciente
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente_data_desc 
ON public.prontuarios (paciente_id, data_atendimento DESC);

-- Otimiza busca por profissional e unidade
CREATE INDEX IF NOT EXISTS idx_prontuarios_prof_unidade_data 
ON public.prontuarios (profissional_id, unidade_id, data_atendimento DESC);

-- 3. Índices para Atendimentos
CREATE INDEX IF NOT EXISTS idx_atendimentos_paciente_data 
ON public.atendimentos (paciente_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_atendimentos_unidade_prof_data 
ON public.atendimentos (unidade_id, profissional_id, data DESC);

-- 4. Índices para Fila de Espera
-- Otimiza a ordenação e filtros da fila operacional
CREATE INDEX IF NOT EXISTS idx_fila_espera_unidade_status_posicao 
ON public.fila_espera (unidade_id, status, posicao);

-- 5. Busca Textual Performática em Pacientes (se trgm já habilitado)
-- Nome e CPF são os mais buscados
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf_lookup ON public.pacientes (cpf) WHERE (cpf IS NOT NULL AND cpf <> '');
CREATE INDEX IF NOT EXISTS idx_pacientes_nome_lower ON public.pacientes (lower(nome));

-- 6. SIGTAP - Tabela grande que precisa de índices para busca
CREATE INDEX IF NOT EXISTS idx_sigtap_procedimentos_codigo ON public.sigtap_procedimentos (codigo);
CREATE INDEX IF NOT EXISTS idx_sigtap_procedimentos_nome_trgm ON public.sigtap_procedimentos USING gin (nome gin_trgm_ops);

-- 7. Função RPC para carregar histórico de prontuário com paginação
-- Evita que o frontend carregue 3000 registros de uma vez
CREATE OR REPLACE FUNCTION public.get_patient_history(
    p_paciente_id UUID,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    data_atendimento TEXT,
    hora_atendimento TEXT,
    profissional_nome TEXT,
    tipo_registro TEXT,
    evolucao TEXT,
    queixa_principal TEXT,
    procedimentos_texto TEXT,
    unidade_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.id,
        pr.data_atendimento,
        pr.hora_atendimento,
        pr.profissional_nome,
        pr.tipo_registro,
        pr.evolucao,
        pr.queixa_principal,
        pr.procedimentos_texto,
        pr.unidade_id
    FROM public.prontuarios pr
    WHERE pr.paciente_id = p_paciente_id
    ORDER BY pr.data_atendimento DESC, pr.hora_atendimento DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Função para contar registros para paginação
CREATE OR REPLACE FUNCTION public.count_patient_history(p_paciente_id UUID)
RETURNS BIGINT AS $$
BEGIN
    RETURN (SELECT count(*) FROM public.prontuarios WHERE paciente_id = p_paciente_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
