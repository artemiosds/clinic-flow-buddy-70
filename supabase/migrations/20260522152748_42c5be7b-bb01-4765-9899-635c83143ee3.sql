-- Adicionar colunas de exceção na tabela pacientes
ALTER TABLE public.pacientes 
ADD COLUMN IF NOT EXISTS is_tfd BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS possui_ordem_judicial BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS motivo_excecao_bloqueio TEXT,
ADD COLUMN IF NOT EXISTS observacao_tfd_ordem_judicial TEXT,
ADD COLUMN IF NOT EXISTS data_marcacao_excecao TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS marcado_por UUID REFERENCES auth.users(id);

-- Adicionar colunas de regularização na tabela agendamentos (para registrar no histórico da falta)
ALTER TABLE public.agendamentos
ADD COLUMN IF NOT EXISTS falta_liberada BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS liberada_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS liberada_por UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS motivo_liberacao TEXT,
ADD COLUMN IF NOT EXISTS regularizada BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS status_falta_registro TEXT; -- 'injustificada', 'justificada', 'regularizada'

-- Adicionar coluna de justificativa de falta caso não exista (reforço)
ALTER TABLE public.agendamentos
ADD COLUMN IF NOT EXISTS falta_justificada BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS motivo_falta_justificada TEXT;

-- Função para recalcular o status de falta do paciente
CREATE OR REPLACE FUNCTION public.recalcular_status_falta_paciente(p_paciente_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_total_injustificadas INTEGER;
    v_consecutivas_injustificadas INTEGER;
    v_limite_falta INTEGER := 3; -- Padrão, pode ser obtido de system_config
    v_limite_bloqueio INTEGER := 5; -- Padrão
    v_is_isento BOOLEAN;
    v_new_status TEXT;
BEGIN
    -- Verificar se é isento (TFD ou Ordem Judicial)
    SELECT (is_tfd OR possui_ordem_judicial) INTO v_is_isento
    FROM public.pacientes WHERE id = p_paciente_id;

    -- Se for isento, status é sempre ATIVO e contadores podem ser zerados ou mantidos (aqui manteremos para histórico mas status limpo)
    IF v_is_isento THEN
        UPDATE public.pacientes 
        SET status_falta = 'ATIVO',
            faltas_consecutivas = 0 -- Opcional: zerar para liberar agenda imediatamente
        WHERE id = p_paciente_id;
        RETURN;
    END IF;

    -- Obter limites das configurações se existirem
    BEGIN
        SELECT (configuracoes->>'limite_faltas_consecutivas')::int, (configuracoes->>'limite_faltas_total')::int 
        INTO v_limite_falta, v_limite_bloqueio
        FROM public.system_config WHERE id = 'config_faltas' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        -- Manter padrões
    END;

    -- Contar faltas injustificadas (status='falta' AND falta_justificada=false AND regularizada=false)
    SELECT count(*) INTO v_total_injustificadas
    FROM public.agendamentos
    WHERE paciente_id = p_paciente_id 
      AND status = 'falta' 
      AND (falta_justificada IS FALSE OR falta_justificada IS NULL)
      AND (regularizada IS FALSE OR regularizada IS NULL);

    -- Contar consecutivas injustificadas (considerando os últimos registros)
    WITH ultimos AS (
        SELECT status, falta_justificada, regularizada
        FROM public.agendamentos
        WHERE paciente_id = p_paciente_id
        ORDER BY data DESC, hora DESC
    ),
    consecutivas AS (
        SELECT status, falta_justificada, regularizada,
               row_number() OVER () - row_number() OVER (PARTITION BY (status = 'falta' AND (falta_justificada IS FALSE OR falta_justificada IS NULL) AND (regularizada IS FALSE OR regularizada IS NULL)) ORDER BY row_number() OVER ()) as grp
        FROM (SELECT row_number() OVER () as rn, * FROM ultimos) t
    )
    SELECT count(*) INTO v_consecutivas_injustificadas
    FROM ultimos
    WHERE status = 'falta' 
      AND (falta_justificada IS FALSE OR falta_justificada IS NULL)
      AND (regularizada IS FALSE OR regularizada IS NULL)
      -- Lógica simplificada: se o mais recente não for falta injustificada, consecutivas = 0
      AND (SELECT status FROM ultimos LIMIT 1) = 'falta'
      AND (SELECT (falta_justificada IS FALSE OR falta_justificada IS NULL) FROM ultimos LIMIT 1)
      AND (SELECT (regularizada IS FALSE OR regularizada IS NULL) FROM ultimos LIMIT 1);

    -- Definir novo status
    IF v_consecutivas_injustificadas >= v_limite_bloqueio OR v_total_injustificadas >= v_limite_bloqueio THEN
        v_new_status := 'BLOQUEADO';
    ELSIF v_consecutivas_injustificadas >= v_limite_falta OR v_total_injustificadas >= v_limite_falta THEN
        v_new_status := 'FALTOSO';
    ELSE
        v_new_status := 'ATIVO';
    END IF;

    -- Atualizar paciente
    UPDATE public.pacientes
    SET total_faltas = v_total_injustificadas,
        faltas_consecutivas = COALESCE(v_consecutivas_injustificadas, 0),
        status_falta = v_new_status,
        atualizado_em = now()
    WHERE id = p_paciente_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função RPC para regularizar faltas
CREATE OR REPLACE FUNCTION public.regularizar_faltas_paciente(
    p_paciente_id TEXT,
    p_motivo TEXT,
    p_liberar_todas BOOLEAN DEFAULT false
)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF p_liberar_todas THEN
        -- Marcar todas as faltas injustificadas como regularizadas
        UPDATE public.agendamentos
        SET regularizada = true,
            falta_liberada = true,
            liberada_em = now(),
            liberada_por = v_user_id,
            motivo_liberacao = p_motivo,
            status_falta_registro = 'regularizada'
        WHERE paciente_id = p_paciente_id 
          AND status = 'falta' 
          AND (falta_justificada IS FALSE OR falta_justificada IS NULL)
          AND (regularizada IS FALSE OR regularizada IS NULL);
    ELSE
        -- Marcar apenas a última falta injustificada
        UPDATE public.agendamentos
        SET regularizada = true,
            falta_liberada = true,
            liberada_em = now(),
            liberada_por = v_user_id,
            motivo_liberacao = p_motivo,
            status_falta_registro = 'regularizada'
        WHERE id = (
            SELECT id FROM public.agendamentos
            WHERE paciente_id = p_paciente_id 
              AND status = 'falta' 
              AND (falta_justificada IS FALSE OR falta_justificada IS NULL)
              AND (regularizada IS FALSE OR regularizada IS NULL)
            ORDER BY data DESC, hora DESC
            LIMIT 1
        );
    END IF;

    -- Recalcular status do paciente
    PERFORM public.recalcular_status_falta_paciente(p_paciente_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
