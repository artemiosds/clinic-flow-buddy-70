CREATE OR REPLACE FUNCTION public.handle_treatment_early_discharge(
    p_cycle_id UUID,
    p_professional_id TEXT,
    p_reason TEXT,
    p_final_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_patient_id TEXT;
    v_appt_ids TEXT[];
BEGIN
    -- 1. Obter o paciente vinculado ao ciclo
    SELECT patient_id INTO v_patient_id 
    FROM public.treatment_cycles 
    WHERE id = p_cycle_id;
    
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Ciclo de tratamento não encontrado.';
    END IF;

    -- 2. Registrar a alta
    INSERT INTO public.patient_discharges (
        cycle_id,
        patient_id,
        professional_id,
        discharge_date,
        reason,
        final_notes
    ) VALUES (
        p_cycle_id,
        v_patient_id,
        p_professional_id,
        CURRENT_DATE,
        p_reason,
        p_final_notes
    );

    -- 3. Atualizar o status do ciclo
    UPDATE public.treatment_cycles 
    SET status = 'finalizado_alta',
        updated_at = NOW()
    WHERE id = p_cycle_id;

    -- 4. Identificar IDs de agendamentos vinculados a este ciclo
    SELECT ARRAY_AGG(DISTINCT appointment_id) INTO v_appt_ids
    FROM public.treatment_sessions
    WHERE cycle_id = p_cycle_id
      AND appointment_id IS NOT NULL;

    -- 5. Cancelar agendamentos futuros vinculados
    IF v_appt_ids IS NOT NULL AND array_length(v_appt_ids, 1) > 0 THEN
        UPDATE public.agendamentos
        SET status = 'cancelado',
            observacoes = 'Alta Antecipada: ' || p_reason
        WHERE id = ANY(v_appt_ids)
          AND profissional_id = p_professional_id
          AND data >= CURRENT_DATE
          AND status NOT IN ('realizada', 'cancelado', 'falta', 'remarcado');
    END IF;

    -- 6. Tratamento de Duplicidades e limpeza extra
    -- Localiza qualquer agendamento futuro do paciente com este profissional
    -- que NÃO esteja vinculado a outro ciclo ATIVO (evitando deletar agendas de outros tratamentos legítimos)
    -- e que possa ser uma duplicidade deste tratamento que está sendo encerrado.
    
    UPDATE public.agendamentos
    SET status = 'cancelado',
        observacoes = 'Cancelado por Alta Antecipada (Limpeza de Duplicidade/Tratamento Encerrado)'
    WHERE paciente_id = v_patient_id
      AND profissional_id = p_professional_id
      AND data >= CURRENT_DATE
      AND status NOT IN ('realizada', 'cancelado', 'falta', 'remarcado')
      AND (
          id = ANY(v_appt_ids) -- Já coberto, mas reforça
          OR 
          NOT EXISTS (
              -- Garante que não estamos cancelando algo de OUTRO ciclo que ainda está em andamento
              SELECT 1 
              FROM public.treatment_sessions ts
              JOIN public.treatment_cycles tc ON tc.id = ts.cycle_id
              WHERE ts.appointment_id = public.agendamentos.id
                AND tc.id != p_cycle_id
                AND tc.status = 'em_andamento'
          )
      );

    -- 7. Cancelar todas as sessões do ciclo que não foram realizadas
    UPDATE public.treatment_sessions
    SET status = 'cancelada'
    WHERE cycle_id = p_cycle_id
      AND status IN ('pendente_agendamento', 'agendada');

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;