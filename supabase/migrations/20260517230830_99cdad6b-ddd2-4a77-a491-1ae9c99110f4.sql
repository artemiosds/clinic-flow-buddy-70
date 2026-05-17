
CREATE OR REPLACE FUNCTION public.atualizar_status_falta(p_paciente_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_consec int := 0;
  v_status_anterior text;
  v_status_novo text;
  v_limite_alerta int := 2;
  v_limite_bloqueio int := 4;
  v_cfg jsonb;
  v_proxima_posicao int;
  v_paciente_nome text;
  v_unidade_id text;
  r record;
BEGIN
  IF p_paciente_id IS NULL OR p_paciente_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_id');
  END IF;

  -- Buscar thresholds em system_config (configuracoes jsonb)
  SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
  FROM public.system_config
  WHERE id = 'default'
  LIMIT 1;

  IF v_cfg IS NOT NULL THEN
    v_limite_alerta := COALESCE((v_cfg->>'limiteAlerta')::int, v_limite_alerta);
    v_limite_bloqueio := COALESCE((v_cfg->>'limiteBloqueio')::int, v_limite_bloqueio);
  END IF;

  -- Contar faltas em agendamentos
  SELECT COUNT(*) INTO v_total
  FROM public.agendamentos
  WHERE paciente_id = p_paciente_id AND status = 'falta';

  -- Acrescentar faltas em treatment_sessions sem agendamento vinculado
  SELECT v_total + COUNT(*) INTO v_total
  FROM public.treatment_sessions ts
  WHERE ts.patient_id = p_paciente_id
    AND ts.status = 'falta'
    AND (ts.appointment_id IS NULL OR ts.appointment_id = '');

  v_consec := 0;
  FOR r IN
    SELECT status FROM public.agendamentos
    WHERE paciente_id = p_paciente_id
      AND status IN ('falta','concluido','realizada')
    ORDER BY data DESC, hora DESC
  LOOP
    IF r.status = 'falta' THEN v_consec := v_consec + 1; ELSE EXIT; END IF;
  END LOOP;

  IF v_total >= v_limite_bloqueio THEN
    v_status_novo := 'BLOQUEADO';
  ELSIF v_total >= v_limite_alerta THEN
    v_status_novo := 'FALTOSO';
  ELSE
    v_status_novo := 'REGULAR';
  END IF;

  SELECT status_falta, nome INTO v_status_anterior, v_paciente_nome
  FROM public.pacientes WHERE id = p_paciente_id;

  UPDATE public.pacientes
    SET total_faltas = v_total,
        faltas_consecutivas = v_consec,
        status_falta = v_status_novo
   WHERE id = p_paciente_id;

  IF v_status_novo = 'BLOQUEADO' AND COALESCE(v_status_anterior,'REGULAR') <> 'BLOQUEADO' THEN
    SELECT unidade_id INTO v_unidade_id FROM public.agendamentos
      WHERE paciente_id = p_paciente_id ORDER BY data DESC LIMIT 1;
    SELECT COALESCE(MAX(posicao),0)+1 INTO v_proxima_posicao FROM public.fila_espera;

    IF NOT EXISTS (
      SELECT 1 FROM public.fila_espera
      WHERE paciente_id = p_paciente_id
        AND status = 'aguardando'
        AND COALESCE(origem_cadastro,'') = 'BLOQUEIO_FALTA'
    ) THEN
      INSERT INTO public.fila_espera (
        id, paciente_id, paciente_nome, unidade_id, status, posicao,
        prioridade, origem_cadastro, observacoes, criado_em
      ) VALUES (
        'fe_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text),1,6),
        p_paciente_id, v_paciente_nome, v_unidade_id,
        'aguardando', v_proxima_posicao,
        'normal', 'BLOQUEIO_FALTA',
        'Paciente bloqueado automaticamente por excesso de faltas ('||v_total||')',
        now()
      );
    END IF;

    INSERT INTO public.notification_logs (canal, evento, payload, status)
    VALUES ('sistema','paciente_bloqueado_faltas',
      jsonb_build_object('paciente_id',p_paciente_id,'paciente_nome',v_paciente_nome,'total_faltas',v_total),
      'pendente');

  ELSIF v_status_novo = 'FALTOSO' AND COALESCE(v_status_anterior,'REGULAR') = 'REGULAR' THEN
    INSERT INTO public.notification_logs (canal, evento, payload, status)
    VALUES ('sistema','paciente_faltoso_alerta',
      jsonb_build_object('paciente_id',p_paciente_id,'paciente_nome',v_paciente_nome,'total_faltas',v_total),
      'pendente');
  END IF;

  RETURN jsonb_build_object('ok',true,'total_faltas',v_total,'faltas_consecutivas',v_consec,
    'status_anterior',v_status_anterior,'status_falta',v_status_novo);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Reexecuta backfill agora com leitura correta de config
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT paciente_id FROM public.agendamentos WHERE status = 'falta'
    UNION
    SELECT DISTINCT patient_id FROM public.treatment_sessions WHERE status = 'falta' AND patient_id IS NOT NULL
  LOOP
    PERFORM public.atualizar_status_falta(r.paciente_id);
  END LOOP;
END $$;
