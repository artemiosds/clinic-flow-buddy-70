-- Tabela para rastrear faltas por profissional
CREATE TABLE IF NOT EXISTS public.paciente_faltas_profissional (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id TEXT, -- Compatível com a tabela pacientes
    profissional_id UUID REFERENCES public.funcionarios(id) ON DELETE CASCADE,
    total_faltas INTEGER DEFAULT 0,
    faltas_consecutivas INTEGER DEFAULT 0,
    status_falta TEXT DEFAULT 'OK', -- OK, FALTOSO, BLOQUEADO
    ultima_falta TIMESTAMP WITH TIME ZONE,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(paciente_id, profissional_id)
);

-- Habilitar RLS
ALTER TABLE public.paciente_faltas_profissional ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Acesso público leitura faltas profissional" ON public.paciente_faltas_profissional FOR SELECT USING (true);
CREATE POLICY "Acesso total service role faltas profissional" ON public.paciente_faltas_profissional FOR ALL USING (true) WITH CHECK (true);

-- Função para recalcular status de falta (Versão Pro Profissional)
CREATE OR REPLACE FUNCTION public.recalcular_status_falta_paciente(p_paciente_id TEXT)
RETURNS void AS $$
DECLARE
    r_paciente RECORD;
    r_falta RECORD;
    v_limit_bloqueio INTEGER := 3; -- Configuração padrão
    v_is_isento BOOLEAN := FALSE;
BEGIN
    -- Busca dados do paciente
    SELECT * INTO r_paciente FROM public.pacientes WHERE id = p_paciente_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- TFD e Ordem Judicial isentam bloqueio total
    v_is_isento := COALESCE(r_paciente.is_tfd, FALSE) OR COALESCE(r_paciente.possui_ordem_judicial, FALSE);

    -- 1. Limpa contadores atuais para reconstruir se necessário ou apenas atualiza
    -- Para cada profissional que o paciente já teve falta registrada
    FOR r_falta IN 
        SELECT profissional_id, count(*) as total, max(data) as ultima
        FROM public.agendamentos 
        WHERE paciente_id = p_paciente_id AND status = 'falta'
        GROUP BY profissional_id
    LOOP
        -- Lógica de consecutivas reais
        DECLARE
            v_cons INTEGER := 0;
            v_curr_status TEXT;
            c_ags CURSOR FOR SELECT status FROM public.agendamentos 
                            WHERE paciente_id = p_paciente_id AND profissional_id = r_falta.profissional_id
                            ORDER BY data DESC, hora DESC;
        BEGIN
            OPEN c_ags;
            LOOP
                FETCH c_ags INTO v_curr_status;
                EXIT WHEN NOT FOUND OR v_curr_status <> 'falta';
                v_cons := v_cons + 1;
            END LOOP;
            CLOSE c_ags;

            -- Upsert na tabela de faltas por profissional
            INSERT INTO public.paciente_faltas_profissional (paciente_id, profissional_id, total_faltas, faltas_consecutivas, status_falta, ultima_falta, atualizado_em)
            VALUES (
                p_paciente_id, 
                r_falta.profissional_id, 
                r_falta.total, 
                v_cons,
                CASE 
                    WHEN v_is_isento THEN 'OK'
                    WHEN v_cons >= 2 OR r_falta.total >= v_limit_bloqueio THEN 'BLOQUEADO'
                    WHEN r_falta.total > 0 THEN 'FALTOSO'
                    ELSE 'OK'
                END,
                r_falta.ultima::timestamp with time zone,
                now()
            )
            ON CONFLICT (paciente_id, profissional_id) DO UPDATE SET
                total_faltas = EXCLUDED.total_faltas,
                faltas_consecutivas = EXCLUDED.faltas_consecutivas,
                status_falta = EXCLUDED.status_falta,
                ultima_falta = EXCLUDED.ultima_falta,
                atualizado_em = now();
        END;
    END LOOP;

    -- 2. Atualiza o status GLOBAL do paciente (para compatibilidade com legado)
    DECLARE
        v_global_status TEXT := 'OK';
        v_max_faltas INTEGER := 0;
        v_max_cons INTEGER := 0;
    BEGIN
        SELECT 
            CASE WHEN bool_or(status_falta = 'BLOQUEADO') THEN 'BLOQUEADO'
                 WHEN bool_or(status_falta = 'FALTOSO') THEN 'FALTOSO'
                 ELSE 'OK' END,
            MAX(total_faltas),
            MAX(faltas_consecutivas)
        INTO v_global_status, v_max_faltas, v_max_cons
        FROM public.paciente_faltas_profissional
        WHERE paciente_id = p_paciente_id;

        UPDATE public.pacientes SET
            status_falta = COALESCE(v_global_status, 'OK'),
            total_faltas = COALESCE(v_max_faltas, 0),
            faltas_consecutivas = COALESCE(v_max_cons, 0),
            atualizado_em = now()
        WHERE id = p_paciente_id;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para regularizar faltas (Versão Pro Profissional)
CREATE OR REPLACE FUNCTION public.regularizar_faltas_paciente(
    p_paciente_id TEXT, 
    p_motivo TEXT, 
    p_liberar_todas BOOLEAN DEFAULT FALSE,
    p_profissional_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    IF p_profissional_id IS NOT NULL THEN
        IF p_liberar_todas THEN
            UPDATE public.agendamentos 
            SET status = 'confirmado', observacoes = COALESCE(observacoes, '') || '\n[Regularização: ' || p_motivo || ']'
            WHERE paciente_id = p_paciente_id AND profissional_id = p_profissional_id AND status = 'falta';
        ELSE
            UPDATE public.agendamentos 
            SET status = 'confirmado', observacoes = COALESCE(observacoes, '') || '\n[Regularização: ' || p_motivo || ']'
            WHERE id = (
                SELECT id FROM public.agendamentos 
                WHERE paciente_id = p_paciente_id AND profissional_id = p_profissional_id AND status = 'falta'
                ORDER BY data DESC, hora DESC LIMIT 1
            );
        END IF;
    ELSE
        IF p_liberar_todas THEN
            UPDATE public.agendamentos 
            SET status = 'confirmado', observacoes = COALESCE(observacoes, '') || '\n[Regularização Global: ' || p_motivo || ']'
            WHERE paciente_id = p_paciente_id AND status = 'falta';
        ELSE
            UPDATE public.agendamentos 
            SET status = 'confirmado', observacoes = COALESCE(observacoes, '') || '\n[Regularização Global: ' || p_motivo || ']'
            WHERE id = (
                SELECT id FROM public.agendamentos 
                WHERE paciente_id = p_paciente_id AND status = 'falta'
                ORDER BY data DESC, hora DESC LIMIT 1
            );
        END IF;
    END IF;

    PERFORM public.recalcular_status_falta_paciente(p_paciente_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
