CREATE OR REPLACE FUNCTION public.recalcular_status_falta_paciente(p_paciente_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

    -- Limpa registros antigos para este paciente para recalcular do zero
    DELETE FROM public.paciente_faltas_profissional WHERE paciente_id = p_paciente_id;

    -- Consolidar faltas de Agendamentos e Treatment Sessions
    -- Apenas faltas injustificadas e não regularizadas
    FOR r_falta IN
        WITH all_absences AS (
            SELECT 
                profissional_id, 
                data as data_falta,
                hora as hora_falta
            FROM public.agendamentos
            WHERE paciente_id = p_paciente_id 
              AND status = 'falta'
              AND (falta_justificada IS FALSE OR falta_justificada IS NULL)
              AND (regularizada IS FALSE OR regularizada IS NULL)
            
            UNION ALL
            
            SELECT 
                professional_id as profissional_id,
                scheduled_date as data_falta,
                '00:00' as hora_falta 
            FROM public.treatment_sessions
            WHERE patient_id = p_paciente_id
              AND status = 'falta'
              -- treatment_sessions não tem flags de justificativa no schema atual, pegamos status 'falta'
        )
        SELECT 
            profissional_id, 
            count(*) as total, 
            max(data_falta) as ultima
        FROM all_absences
        GROUP BY profissional_id
    LOOP
        -- Lógica de consecutivas reais para este profissional
        DECLARE
            v_cons INTEGER := 0;
            v_curr_status TEXT;
            c_ags CURSOR FOR 
                WITH history AS (
                    SELECT status, data as d, hora as h FROM public.agendamentos
                    WHERE paciente_id = p_paciente_id AND profissional_id = r_falta.profissional_id
                    UNION ALL
                    SELECT status, scheduled_date as d, '00:00' as h FROM public.treatment_sessions
                    WHERE patient_id = p_paciente_id AND professional_id = r_falta.profissional_id
                )
                SELECT status FROM history
                ORDER BY d DESC, h DESC;
        BEGIN
            OPEN c_ags;
            LOOP
                FETCH c_ags INTO v_curr_status;
                EXIT WHEN NOT FOUND OR v_curr_status <> 'falta';
                v_cons := v_cons + 1;
            END LOOP;
            CLOSE c_ags;

            -- Upsert na tabela de faltas por profissional
            INSERT INTO public.paciente_faltas_profissional (
                paciente_id, 
                profissional_id, 
                total_faltas, 
                faltas_consecutivas, 
                status_falta, 
                ultima_falta, 
                atualizado_em
            )
            VALUES (
                p_paciente_id,
                r_falta.profissional_id::uuid, -- CAST TO UUID
                r_falta.total,
                v_cons,
                CASE
                    WHEN v_is_isento THEN 'OK'
                    WHEN v_cons >= v_limit_bloqueio OR r_falta.total >= 5 THEN 'BLOQUEADO'
                    WHEN r_falta.total > 0 THEN 'FALTOSO'
                    ELSE 'OK'
                END,
                r_falta.ultima::timestamp with time zone,
                now()
            );
        END;
    END LOOP;
END;
$function$;