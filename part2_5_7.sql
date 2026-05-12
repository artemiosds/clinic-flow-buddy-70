-- PARTE 2-5-7 — SCHEMA STRUCTURE
--
-- PostgreSQL database dump
--

\restrict 3XibX7E60brHk6eQpsxTVGVpIWLJ07j0ehj5VaJBvxkt57Z79ilbKP6mWE4R3VD

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: paciente_encaminhamento_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.paciente_encaminhamento_status AS ENUM (
    'pendente',
    'realizado',
    'cancelado'
);


--
-- Name: check_slot_availability(text, text, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_slot_availability(p_profissional_id text, p_unidade_id text, p_data date, p_hora text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_vagas_por_hora integer;
  v_vagas_por_dia integer;
  v_current_hour_count integer;
  v_current_day_count integer;
  v_hora_prefix text;
  v_turno_total integer;
  v_turno_count integer;
  v_turno_start text;
  v_turno_end text;
BEGIN
  -- Check if date is blocked
  IF is_date_blocked(p_data, p_profissional_id, p_unidade_id) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'date_blocked');
  END IF;

  -- First check for turno-mode records (vagas_por_hora = 0)
  SELECT hora_inicio, hora_fim, vagas_por_dia
  INTO v_turno_start, v_turno_end, v_turno_total
  FROM disponibilidades
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND p_data >= data_inicio
    AND p_data <= data_fim
    AND EXTRACT(DOW FROM p_data)::int = ANY(dias_semana)
    AND vagas_por_hora = 0
    AND p_hora >= hora_inicio
    AND p_hora < hora_fim
  LIMIT 1;

  IF v_turno_total IS NOT NULL THEN
    -- Turno mode: count appointments in this turno range
    SELECT COUNT(*) INTO v_turno_count
    FROM agendamentos
    WHERE profissional_id = p_profissional_id
      AND unidade_id = p_unidade_id
      AND data = p_data
      AND hora >= v_turno_start
      AND hora < v_turno_end
      AND status NOT IN ('cancelado', 'falta');

    IF v_turno_count >= v_turno_total THEN
      RETURN jsonb_build_object('available', false, 'reason', 'turno_full',
        'turno_start', v_turno_start, 'turno_end', v_turno_end,
        'turno_count', v_turno_count, 'turno_total', v_turno_total);
    END IF;

    RETURN jsonb_build_object('available', true, 'mode', 'turno',
      'turno_count', v_turno_count, 'turno_total', v_turno_total);
  END IF;

  -- Standard per-hour mode
  SELECT vagas_por_hora, vagas_por_dia 
  INTO v_vagas_por_hora, v_vagas_por_dia
  FROM disponibilidades
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND p_data >= data_inicio
    AND p_data <= data_fim
    AND EXTRACT(DOW FROM p_data)::int = ANY(dias_semana)
    AND vagas_por_hora > 0
  LIMIT 1;

  IF v_vagas_por_hora IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no_availability');
  END IF;

  SELECT COUNT(*) INTO v_current_day_count
  FROM agendamentos
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND data = p_data
    AND status NOT IN ('cancelado', 'falta');

  IF v_current_day_count >= v_vagas_por_dia THEN
    RETURN jsonb_build_object('available', false, 'reason', 'day_full');
  END IF;

  v_hora_prefix := LEFT(p_hora, 3);
  SELECT COUNT(*) INTO v_current_hour_count
  FROM agendamentos
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND data = p_data
    AND hora LIKE v_hora_prefix || '%'
    AND status NOT IN ('cancelado', 'falta');

  IF v_current_hour_count >= v_vagas_por_hora THEN
    RETURN jsonb_build_object('available', false, 'reason', 'hour_full');
  END IF;

  RETURN jsonb_build_object('available', true, 'day_count', v_current_day_count, 'hour_count', v_current_hour_count);
END;
$$;


--
-- Name: exec_sql(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exec_sql(sql_query text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog', 'information_schema', 'auth', 'storage'
    AS $$
DECLARE
  result json;
  caller_role text;
  clean_query text;
BEGIN
  caller_role := current_setting('request.jwt.claims', true)::json->>'role';
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: apenas service_role pode executar esta função.';
  END IF;
  clean_query := rtrim(sql_query, '; ');
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || clean_query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;


--
-- Name: get_treatment_cycles_paginated(integer, integer, text, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_treatment_cycles_paginated(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_professional_id text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_only_own_professional boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_offset integer;
  v_cycles jsonb;
  v_user_id text;
BEGIN
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);

  IF p_only_own_professional THEN
    SELECT (f.id)::text INTO v_user_id
    FROM funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo = true
    LIMIT 1;
  END IF;

  WITH base AS (
    SELECT c.*, p.nome AS paciente_nome
    FROM treatment_cycles c
    LEFT JOIN pacientes p ON p.id = c.patient_id
    WHERE
      (p_professional_id IS NULL OR c.professional_id = p_professional_id)
      AND (p_unit_id IS NULL OR c.unit_id = p_unit_id)
      AND (p_status IS NULL OR c.status = p_status)
      AND (NOT p_only_own_professional OR (v_user_id IS NOT NULL AND c.professional_id = v_user_id))
      AND (
        p_search IS NULL OR p_search = '' OR
        p.nome ILIKE '%' || p_search || '%' OR
        p.cpf ILIKE '%' || p_search || '%' OR
        p.cns ILIKE '%' || p_search || '%' OR
        c.treatment_type ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM base
  ),
  page AS (
    SELECT b.*
    FROM base b
    ORDER BY b.created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ),
  with_stats AS (
    SELECT
      pg.*,
      COALESCE((
        SELECT COUNT(*) FROM treatment_sessions ts
        WHERE ts.cycle_id = pg.id AND ts.status = 'pendente_agendamento'
      ), 0) AS pending_ag,
      COALESCE((
        SELECT COUNT(*) FROM treatment_sessions ts
        WHERE ts.cycle_id = pg.id AND ts.status = 'paciente_faltou'
      ), 0) AS faltas
    FROM page pg
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM counted),
    'page', p_page,
    'page_size', p_page_size,
    'cycles', COALESCE(jsonb_agg(to_jsonb(with_stats.*)), '[]'::jsonb)
  )
  INTO v_cycles
  FROM with_stats;

  RETURN v_cycles;
END;
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: has_staff_role(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_staff_role(_role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios
    WHERE auth_user_id = auth.uid()
    AND ativo = true
    AND role = _role
  )
$$;


--
-- Name: iniciar_atendimento(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.iniciar_atendimento(p_agendamento_id text, p_profissional_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
  v_profissional_id text;
BEGIN
  SELECT status, profissional_id
  INTO v_status, v_profissional_id
  FROM agendamentos
  WHERE id = p_agendamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  IF v_profissional_id != p_profissional_id THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Profissional não autorizado para este agendamento';
  END IF;

  -- Allow starting from confirmado_chegada (no triage) or aguardando_atendimento (after triage)
  IF v_status NOT IN ('confirmado_chegada', 'aguardando_atendimento') THEN
    RAISE EXCEPTION 'arrival_not_confirmed'
      USING HINT = 'Chegada do paciente ainda não foi confirmada pela recepção';
  END IF;

  UPDATE agendamentos
  SET status = 'em_atendimento',
      atualizado_em = now()
  WHERE id = p_agendamento_id;
END;
$$;


--
-- Name: is_date_blocked(date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_date_blocked(p_date date, p_profissional_id text, p_unidade_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bloqueios
    WHERE p_date >= data_inicio
      AND p_date <= data_fim
      AND (
        -- Global: no unit and no professional specified
        (unidade_id IS NULL OR unidade_id = '') AND (profissional_id IS NULL OR profissional_id = '')
        -- Unit-level: matches unit, no professional
        OR ((unidade_id = p_unidade_id) AND (profissional_id IS NULL OR profissional_id = ''))
        -- Professional-level: matches professional
        OR (profissional_id = p_profissional_id)
      )
      AND (
        dia_inteiro = true
        OR (hora_inicio IS NULL OR hora_inicio = '')
      )
  );
END;
$$;


--
-- Name: is_external_professional(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_external_professional() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profissionais_externos
    WHERE auth_user_id = auth.uid()
    AND ativo = true
  )
$$;


--
-- Name: is_staff_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff_member() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios
    WHERE auth_user_id = auth.uid()
    AND ativo = true
  )
$$;


--
-- Name: notify_permissao_alterada(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_permissao_alterada() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_payload jsonb;
  v_table text := TG_TABLE_NAME;
  v_op text := TG_OP;
BEGIN
  v_payload := jsonb_build_object(
    'evento', 'permissao_alterada',
    'tabela', v_table,
    'operacao', v_op,
    'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'timestamp', now()
  );

  INSERT INTO public.notification_logs (canal, evento, payload, status)
  VALUES ('webhook', 'permissao_alterada', v_payload, 'pendente');

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: resolve_form_template(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_form_template(p_form_slug text, p_profissional_id text DEFAULT NULL::text, p_unidade_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- 1º: template do profissional (em qualquer unidade dele)
  IF p_profissional_id IS NOT NULL AND p_profissional_id <> '' THEN
    SELECT to_jsonb(t.*) INTO v_result
    FROM form_templates t
    WHERE t.form_slug = p_form_slug
      AND t.profissional_id = p_profissional_id
      AND t.ativo = true
    ORDER BY t.updated_at DESC
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN jsonb_set(v_result, '{_origem}', '"profissional"'::jsonb);
    END IF;
  END IF;

  -- 2º: template da unidade
  IF p_unidade_id IS NOT NULL AND p_unidade_id <> '' THEN
    SELECT to_jsonb(t.*) INTO v_result
    FROM form_templates t
    WHERE t.form_slug = p_form_slug
      AND t.unidade_id = p_unidade_id
      AND t.profissional_id = ''
      AND t.ativo = true
    ORDER BY t.updated_at DESC
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN jsonb_set(v_result, '{_origem}', '"unidade"'::jsonb);
    END IF;
  END IF;

  -- 3º: template global
  SELECT to_jsonb(t.*) INTO v_result
  FROM form_templates t
  WHERE t.form_slug = p_form_slug
    AND t.unidade_id = ''
    AND t.profissional_id = ''
    AND t.ativo = true
  ORDER BY t.updated_at DESC
  LIMIT 1;
  IF v_result IS NOT NULL THEN
    RETURN jsonb_set(v_result, '{_origem}', '"global"'::jsonb);
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: salvar_configuracao_autentique(boolean, text, text, text, boolean, boolean, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.salvar_configuracao_autentique(p_ativo boolean, p_ambiente text, p_token_api text, p_organizacao_nome text, p_enviar_email boolean, p_exigir_profissional boolean, p_baixar_assinado_automaticamente boolean, p_unidade_id text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_is_master BOOLEAN;
  v_token_limpo TEXT;
BEGIN
  v_user_id := auth.uid();

  -- Verificar se é master ou admin
  SELECT EXISTS (
    SELECT 1 FROM funcionarios
    WHERE auth_user_id = v_user_id
    AND (role = 'master' OR cargo ILIKE '%administrador%')
  ) INTO v_is_master;

  IF NOT v_is_master THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem salvar configurações.';
  END IF;

  -- Limpar token se for mascarado
  v_token_limpo := p_token_api;
  IF v_token_limpo LIKE '%•%' OR v_token_limpo LIKE '%*%' THEN
    v_token_limpo := NULL;
  END IF;

  INSERT INTO public.assinatura_eletronica_config (
    provider,
    ativo,
    ambiente,
    token_api,
    organizacao_nome,
    enviar_email,
    exigir_profissional,
    baixar_assinado_automaticamente,
    unidade_id,
    updated_at,
    updated_by
  ) VALUES (
    'autentique',
    p_ativo,
    p_ambiente,
    v_token_limpo,
    p_organizacao_nome,
    p_enviar_email,
    p_exigir_profissional,
    p_baixar_assinado_automaticamente,
    p_unidade_id,
    now(),
    v_user_id
  )
  ON CONFLICT (provider, COALESCE(unidade_id, 'global'))
  DO UPDATE SET
    ativo = EXCLUDED.ativo,
    ambiente = EXCLUDED.ambiente,
    token_api = CASE WHEN EXCLUDED.token_api IS NOT NULL AND EXCLUDED.token_api <> '' THEN EXCLUDED.token_api ELSE assinatura_eletronica_config.token_api END,
    organizacao_nome = EXCLUDED.organizacao_nome,
    enviar_email = EXCLUDED.enviar_email,
    exigir_profissional = EXCLUDED.exigir_profissional,
    baixar_assinado_automaticamente = EXCLUDED.baixar_assinado_automaticamente,
    updated_at = now(),
    updated_by = v_user_id;

  RETURN json_build_object('success', true, 'message', 'Configuração salva com sucesso');
END;
$$;


--
-- Name: set_agendamento_updated_at_now(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_agendamento_updated_at_now() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_pacientes_updated_at_now(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_pacientes_updated_at_now() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at_now(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_now() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_google_calendar_tokens_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_google_calendar_tokens_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_prontuarios_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_prontuarios_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text DEFAULT ''::text NOT NULL,
    user_nome text DEFAULT ''::text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    acao text NOT NULL,
    entidade text NOT NULL,
    entidade_id text DEFAULT ''::text NOT NULL,
    detalhes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    modulo text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'sucesso'::text NOT NULL,
    erro text DEFAULT ''::text,
    ip text DEFAULT ''::text
);


--
-- Name: agendamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agendamentos (
    id text NOT NULL,
    paciente_id text DEFAULT ''::text NOT NULL,
    paciente_nome text DEFAULT ''::text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    sala_id text DEFAULT ''::text NOT NULL,
    setor_id text DEFAULT ''::text NOT NULL,
    profissional_id text DEFAULT ''::text NOT NULL,
    profissional_nome text DEFAULT ''::text NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    hora text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    tipo text DEFAULT 'Consulta'::text NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    origem text DEFAULT 'recepcao'::text NOT NULL,
    google_event_id text DEFAULT ''::text,
    sync_status text DEFAULT 'pendente'::text,
    criado_em timestamp with time zone DEFAULT now(),
    criado_por text DEFAULT ''::text NOT NULL,
    prioridade_perfil text DEFAULT 'normal'::text NOT NULL,
    lembrete_24h_enviado_em timestamp with time zone,
    lembrete_proximo_enviado_em timestamp with time zone,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    procedimento_sigtap text DEFAULT ''::text,
    nome_procedimento text DEFAULT ''::text,
    turno text DEFAULT ''::text,
    agendado_por_externo text DEFAULT ''::text,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: assinatura_eletronica_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assinatura_eletronica_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'autentique'::text NOT NULL,
    ativo boolean DEFAULT false,
    ambiente text DEFAULT 'sandbox'::text NOT NULL,
    token_api text,
    organizacao_nome text,
    email_remetente_padrao text,
    pasta_padrao_id text,
    webhook_url text,
    enviar_email boolean DEFAULT true,
    enviar_whatsapp boolean DEFAULT false,
    exigir_profissional boolean DEFAULT true,
    exigir_paciente boolean DEFAULT false,
    exigir_master boolean DEFAULT false,
    baixar_assinado_automaticamente boolean DEFAULT true,
    salvar_copia_local boolean DEFAULT true,
    vincular_paciente boolean DEFAULT true,
    permitir_envio_massa boolean DEFAULT false,
    unidade_id text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status_conexao text DEFAULT 'pendente'::text,
    ultimo_teste_em timestamp with time zone,
    ultimo_erro text,
    notificar_email boolean DEFAULT true
);


--
-- Name: assinatura_eletronica_config_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.assinatura_eletronica_config_public AS
 SELECT id,
    provider,
    ativo,
    ambiente,
    organizacao_nome,
    email_remetente_padrao,
    webhook_url,
    enviar_email,
    enviar_whatsapp,
    exigir_profissional,
    exigir_paciente,
    exigir_master,
    baixar_assinado_automaticamente,
    salvar_copia_local,
    vincular_paciente,
    permitir_envio_massa,
    unidade_id,
    created_at,
    updated_at
   FROM public.assinatura_eletronica_config;


--
-- Name: atendimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.atendimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agendamento_id text DEFAULT ''::text NOT NULL,
    paciente_id text NOT NULL,
    paciente_nome text NOT NULL,
    profissional_id text NOT NULL,
    profissional_nome text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    sala_id text DEFAULT ''::text NOT NULL,
    setor text DEFAULT ''::text NOT NULL,
    procedimento text DEFAULT ''::text NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    hora_inicio text DEFAULT ''::text NOT NULL,
    hora_fim text DEFAULT ''::text NOT NULL,
    duracao_minutos integer,
    status text DEFAULT 'em_atendimento'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: autentique_fila_envio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autentique_fila_envio (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_local_id uuid,
    documento_assinatura_id uuid,
    paciente_id text,
    unidade_id text,
    status text DEFAULT 'pendente'::text,
    tentativas integer DEFAULT 0,
    proxima_tentativa_em timestamp with time zone DEFAULT now(),
    erro_mensagem text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: autentique_webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autentique_webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payload jsonb NOT NULL,
    event_type text,
    document_id text,
    status_code integer,
    processado boolean DEFAULT false,
    erro text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bloqueios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bloqueios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profissional_id text DEFAULT ''::text,
    unidade_id text DEFAULT ''::text,
    tipo text DEFAULT 'feriado'::text NOT NULL,
    titulo text DEFAULT ''::text NOT NULL,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    hora_inicio text DEFAULT ''::text,
    hora_fim text DEFAULT ''::text,
    dia_inteiro boolean DEFAULT true,
    criado_em timestamp with time zone DEFAULT now(),
    criado_por text DEFAULT ''::text NOT NULL
);


--
-- Name: cbo_codigos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbo_codigos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    descricao text NOT NULL,
    profissoes_relacionadas text[] DEFAULT '{}'::text[] NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cid10_codigos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cid10_codigos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    especialidade text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clinica_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinica_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome_clinica text DEFAULT ''::text NOT NULL,
    logo_url text DEFAULT ''::text NOT NULL,
    telefone text DEFAULT ''::text NOT NULL,
    evolution_base_url text DEFAULT 'https://api.agendamento-saude-sms-oriximina.site'::text NOT NULL,
    evolution_api_key text DEFAULT ''::text NOT NULL,
    evolution_instance_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    identificador_local text DEFAULT ''::text NOT NULL
);


--
-- Name: clinica_config_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.clinica_config_safe WITH (security_invoker='on') AS
 SELECT id,
    nome_clinica,
    logo_url,
    telefone,
    evolution_base_url,
    evolution_instance_name,
    created_at,
    updated_at
   FROM public.clinica_config;


--
-- Name: disponibilidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disponibilidades (
    id text DEFAULT ('d'::text || ((EXTRACT(epoch FROM now()))::bigint)::text) NOT NULL,
    profissional_id text NOT NULL,
    unidade_id text NOT NULL,
    sala_id text DEFAULT ''::text,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    hora_inicio text DEFAULT '08:00'::text NOT NULL,
    hora_fim text DEFAULT '17:00'::text NOT NULL,
    vagas_por_hora integer DEFAULT 3 NOT NULL,
    vagas_por_dia integer DEFAULT 25 NOT NULL,
    dias_semana integer[] DEFAULT ARRAY[1, 2, 3, 4, 5] NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    duracao_consulta integer DEFAULT 30 NOT NULL
);


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text DEFAULT ''::text NOT NULL,
    tipo text DEFAULT 'Atestado Médico'::text NOT NULL,
    conteudo text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    perfis_permitidos text[] DEFAULT ARRAY['master'::text, 'profissional'::text] NOT NULL,
    tipo_modelo text DEFAULT 'UNIDADE'::text NOT NULL,
    unidade_id text DEFAULT ''::text,
    criado_por text DEFAULT ''::text NOT NULL,
    criado_por_nome text DEFAULT ''::text NOT NULL,
    versoes jsonb DEFAULT '[]'::jsonb NOT NULL,
    blocos_clinicos jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documentos_assinatura_autentique; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_assinatura_autentique (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_local_id uuid,
    paciente_id text,
    prontuario_id uuid,
    agendamento_id uuid,
    profissional_id text,
    unidade_id text,
    provider text DEFAULT 'autentique'::text NOT NULL,
    autentique_document_id text,
    titulo_documento text NOT NULL,
    tipo_documento text,
    status text DEFAULT 'rascunho'::text NOT NULL,
    status_detalhado jsonb,
    url_autentique text,
    storage_bucket text DEFAULT 'documentos_assinados'::text,
    storage_path_original text,
    storage_path_assinado text,
    enviado_por uuid,
    enviado_em timestamp with time zone DEFAULT now(),
    finalizado_em timestamp with time zone,
    cancelado_em timestamp with time zone,
    erro_mensagem text,
    payload_resumo jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    origem text DEFAULT 'gerado_sistema'::text,
    paciente_nome text,
    profissional_nome text,
    unidade_nome text
);


--
-- Name: documentos_assinatura_signatarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_assinatura_signatarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_assinatura_id uuid,
    nome text NOT NULL,
    email text NOT NULL,
    cpf text,
    telefone text,
    tipo_signatario text NOT NULL,
    papel text DEFAULT 'assinar'::text,
    ordem_assinatura integer DEFAULT 1,
    status text DEFAULT 'pendente'::text,
    assinado_em timestamp with time zone,
    visualizado_em timestamp with time zone,
    autentique_signer_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: documentos_gerados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_gerados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paciente_id text DEFAULT ''::text NOT NULL,
    paciente_nome text DEFAULT ''::text NOT NULL,
    profissional_id text DEFAULT ''::text NOT NULL,
    profissional_nome text DEFAULT ''::text NOT NULL,
    tipo_documento text DEFAULT ''::text NOT NULL,
    conteudo_original text DEFAULT ''::text NOT NULL,
    conteudo_html text DEFAULT ''::text NOT NULL,
    campos_formulario jsonb DEFAULT '{}'::jsonb NOT NULL,
    hash_assinatura text DEFAULT ''::text NOT NULL,
    ip_assinatura text DEFAULT ''::text NOT NULL,
    assinado_em timestamp with time zone,
    modelo_id text DEFAULT ''::text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    motivo_cancelamento text DEFAULT ''::text NOT NULL,
    cancelado_por text DEFAULT ''::text NOT NULL,
    cancelado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT documentos_gerados_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'assinado'::text, 'cancelado'::text])))
);


--
-- Name: encaminhamentos_anexos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encaminhamentos_anexos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    encaminhamento_id uuid NOT NULL,
    direcao text DEFAULT 'saida'::text NOT NULL,
    nome_arquivo text DEFAULT ''::text NOT NULL,
    mime_type text DEFAULT ''::text NOT NULL,
    tamanho_bytes bigint DEFAULT 0 NOT NULL,
    storage_path text DEFAULT ''::text NOT NULL,
    url_remota text DEFAULT ''::text NOT NULL,
    origem text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: encaminhamentos_externos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encaminhamentos_externos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    direcao text NOT NULL,
    sistema_integrado_id uuid,
    remoto_encaminhamento_id text DEFAULT ''::text NOT NULL,
    origem_identificador_sistema text DEFAULT ''::text NOT NULL,
    origem_unidade text DEFAULT ''::text NOT NULL,
    origem_profissional_id text DEFAULT ''::text NOT NULL,
    origem_profissional_nome text DEFAULT ''::text NOT NULL,
    origem_especialidade text DEFAULT ''::text NOT NULL,
    destino_unidade text DEFAULT ''::text NOT NULL,
    destino_profissional_id text DEFAULT ''::text NOT NULL,
    destino_profissional_nome text DEFAULT ''::text NOT NULL,
    destino_especialidade text DEFAULT ''::text NOT NULL,
    paciente_id_origem text DEFAULT ''::text NOT NULL,
    paciente_id_destino text DEFAULT ''::text NOT NULL,
    paciente_nome text DEFAULT ''::text NOT NULL,
    paciente_cpf text DEFAULT ''::text NOT NULL,
    paciente_cns text DEFAULT ''::text NOT NULL,
    paciente_data_nascimento text DEFAULT ''::text NOT NULL,
    paciente_telefone text DEFAULT ''::text NOT NULL,
    paciente_dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    motivo text DEFAULT ''::text NOT NULL,
    resumo_clinico text DEFAULT ''::text NOT NULL,
    cid text DEFAULT ''::text NOT NULL,
    procedimentos jsonb DEFAULT '[]'::jsonb NOT NULL,
    documento_texto text DEFAULT ''::text NOT NULL,
    documento_url text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pendente_envio'::text NOT NULL,
    justificativa_recusa text DEFAULT ''::text NOT NULL,
    recebido_em timestamp with time zone,
    visualizado_em timestamp with time zone,
    aceito_em timestamp with time zone,
    recusado_em timestamp with time zone,
    agendado_em timestamp with time zone,
    criado_por text DEFAULT ''::text NOT NULL,
    ultima_tentativa_em timestamp with time zone,
    tentativas integer DEFAULT 0 NOT NULL,
    ultimo_erro text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    proxima_tentativa_em timestamp with time zone,
    pdf_url text DEFAULT ''::text NOT NULL,
    pdf_path text DEFAULT ''::text NOT NULL
);

ALTER TABLE ONLY public.encaminhamentos_externos REPLICA IDENTITY FULL;


--
-- Name: episodios_clinicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.episodios_clinicos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paciente_id text NOT NULL,
    profissional_id text NOT NULL,
    profissional_nome text DEFAULT ''::text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    titulo text NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    tipo text DEFAULT 'tratamento'::text NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    data_inicio date DEFAULT CURRENT_DATE NOT NULL,
    data_fim date,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: especialidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.especialidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: especialidades_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.especialidades_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    categoria text,
    descricao text,
    ativo boolean DEFAULT true,
    origem text DEFAULT 'padrao'::text,
    unidade_id uuid,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: exam_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    codigo_sus text DEFAULT ''::text NOT NULL,
    categoria text DEFAULT ''::text NOT NULL,
    is_global boolean DEFAULT true NOT NULL,
    profissional_id text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    subcategoria text DEFAULT ''::text NOT NULL,
    preparo text DEFAULT ''::text NOT NULL,
    necessidade_jejum boolean DEFAULT false NOT NULL,
    tempo_jejum text DEFAULT ''::text NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    origem text DEFAULT 'PERSONALIZADO'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fila_espera; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fila_espera (
    id text NOT NULL,
    paciente_id text DEFAULT ''::text NOT NULL,
    paciente_nome text DEFAULT ''::text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    profissional_id text DEFAULT ''::text,
    setor text DEFAULT ''::text NOT NULL,
    prioridade text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'aguardando'::text NOT NULL,
    posicao integer DEFAULT 0 NOT NULL,
    hora_chegada text DEFAULT ''::text NOT NULL,
    hora_chamada text DEFAULT ''::text,
    observacoes text DEFAULT ''::text,
    criado_por text DEFAULT 'sistema'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    prioridade_perfil text DEFAULT 'normal'::text NOT NULL,
    descricao_clinica text DEFAULT ''::text NOT NULL,
    cid text DEFAULT ''::text NOT NULL,
    data_solicitacao_original text DEFAULT ''::text NOT NULL,
    origem_cadastro text DEFAULT 'normal'::text NOT NULL,
    especialidade_destino text DEFAULT ''::text NOT NULL,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: form_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    profissional_id text DEFAULT ''::text NOT NULL,
    form_slug text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    schema jsonb DEFAULT '{"sections": []}'::jsonb NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    versao integer DEFAULT 1 NOT NULL,
    criado_por text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.form_templates REPLICA IDENTITY FULL;


--
-- Name: funcionarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funcionarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    nome text NOT NULL,
    usuario text NOT NULL,
    email text NOT NULL,
    setor text DEFAULT ''::text,
    unidade_id text DEFAULT ''::text,
    sala_id text DEFAULT ''::text,
    cargo text DEFAULT ''::text,
    role text DEFAULT 'recepcao'::text NOT NULL,
    ativo boolean DEFAULT true,
    criado_em timestamp with time zone DEFAULT now(),
    criado_por text DEFAULT ''::text,
    tempo_atendimento integer DEFAULT 30 NOT NULL,
    profissao text DEFAULT ''::text NOT NULL,
    tipo_conselho text DEFAULT ''::text NOT NULL,
    numero_conselho text DEFAULT ''::text NOT NULL,
    uf_conselho text DEFAULT ''::text NOT NULL,
    pode_agendar_retorno boolean DEFAULT false NOT NULL,
    cpf text DEFAULT ''::text NOT NULL,
    coren character varying(20) DEFAULT ''::character varying,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: google_calendar_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_calendar_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    calendar_id text DEFAULT 'primary'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: horarios_funcionamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.horarios_funcionamento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dia_semana integer NOT NULL,
    ativo boolean DEFAULT false NOT NULL,
    hora_inicio text DEFAULT '07:00'::text NOT NULL,
    hora_fim text DEFAULT '13:00'::text NOT NULL,
    intervalo_slots integer DEFAULT 30 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: logradouros_dne; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logradouros_dne (
    codigo character varying(3) NOT NULL,
    descricao character varying(60) NOT NULL
);


--
-- Name: logs_integracao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs_integracao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_acao text NOT NULL,
    direcao text DEFAULT 'saida'::text NOT NULL,
    sistema_integrado_id uuid,
    identificador_remoto text DEFAULT ''::text NOT NULL,
    usuario_id text DEFAULT ''::text NOT NULL,
    usuario_nome text DEFAULT ''::text NOT NULL,
    paciente_id text DEFAULT ''::text NOT NULL,
    encaminhamento_id uuid,
    status text DEFAULT 'sucesso'::text NOT NULL,
    http_status integer,
    mensagem text DEFAULT ''::text NOT NULL,
    detalhes jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    principio_ativo text DEFAULT ''::text NOT NULL,
    classe_terapeutica text DEFAULT ''::text NOT NULL,
    apresentacao text DEFAULT ''::text NOT NULL,
    dosagem_padrao text DEFAULT ''::text NOT NULL,
    via_padrao text DEFAULT 'oral'::text NOT NULL,
    is_global boolean DEFAULT true NOT NULL,
    profissional_id text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    concentracao text DEFAULT ''::text NOT NULL,
    forma_farmaceutica text DEFAULT ''::text NOT NULL,
    origem text DEFAULT 'PERSONALIZADO'::text NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: multiprofessional_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.multiprofessional_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id text NOT NULL,
    agendamento_id text,
    professional_id text NOT NULL,
    professional_nome text DEFAULT ''::text NOT NULL,
    specialty text DEFAULT ''::text NOT NULL,
    unit_id text DEFAULT ''::text NOT NULL,
    clinical_evaluation text DEFAULT ''::text NOT NULL,
    parecer text DEFAULT 'favoravel'::text NOT NULL,
    observations text DEFAULT ''::text NOT NULL,
    evaluation_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agendamento_id text DEFAULT ''::text,
    evento text NOT NULL,
    canal text DEFAULT 'webhook'::text NOT NULL,
    destinatario_email text DEFAULT ''::text,
    destinatario_telefone text DEFAULT ''::text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'enviado'::text NOT NULL,
    resposta text DEFAULT ''::text,
    erro text DEFAULT ''::text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nursing_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nursing_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id text NOT NULL,
    agendamento_id text,
    professional_id text NOT NULL,
    unit_id text DEFAULT ''::text NOT NULL,
    evaluation_date date DEFAULT CURRENT_DATE NOT NULL,
    anamnese_resumida text DEFAULT ''::text NOT NULL,
    condicao_clinica text DEFAULT ''::text NOT NULL,
    avaliacao_risco text DEFAULT ''::text NOT NULL,
    prioridade text DEFAULT 'media'::text NOT NULL,
    observacoes_clinicas text DEFAULT ''::text NOT NULL,
    resultado text DEFAULT 'apto'::text NOT NULL,
    motivo_inapto text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: paciente_documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paciente_documentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paciente_id text NOT NULL,
    unidade_id text,
    nome_arquivo text NOT NULL,
    nome_original text NOT NULL,
    tipo_documento text,
    mime_type text,
    tamanho_bytes bigint,
    storage_bucket text DEFAULT 'paciente-documentos'::text NOT NULL,
    storage_path text NOT NULL,
    uploaded_by text,
    uploaded_by_nome text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by text,
    agendamento_id text
);


--
-- Name: paciente_encaminhamento_anexos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paciente_encaminhamento_anexos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    encaminhamento_id uuid,
    nome_arquivo text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    tamanho_bytes bigint,
    created_at timestamp with time zone DEFAULT now(),
    uploaded_by uuid
);


--
-- Name: paciente_encaminhamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paciente_encaminhamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paciente_id text,
    unidade_id text,
    profissional_id uuid,
    especialidade_destino text NOT NULL,
    ubs_origem text,
    profissional_solicitante text,
    tipo_encaminhamento text,
    cid text,
    diagnostico_resumido text,
    justificativa text,
    data_encaminhamento date DEFAULT CURRENT_DATE,
    status public.paciente_encaminhamento_status DEFAULT 'pendente'::public.paciente_encaminhamento_status,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: pacientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pacientes (
    id text NOT NULL,
    nome text NOT NULL,
    cpf text DEFAULT ''::text NOT NULL,
    telefone text DEFAULT ''::text NOT NULL,
    data_nascimento text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    endereco text DEFAULT ''::text NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    auth_user_id uuid,
    descricao_clinica text DEFAULT ''::text NOT NULL,
    cid text DEFAULT ''::text NOT NULL,
    cns text DEFAULT ''::text NOT NULL,
    nome_mae text DEFAULT ''::text NOT NULL,
    municipio text DEFAULT ''::text NOT NULL,
    menor_idade boolean DEFAULT false NOT NULL,
    nome_responsavel text DEFAULT ''::text NOT NULL,
    cpf_responsavel text DEFAULT ''::text NOT NULL,
    ubs_origem text DEFAULT ''::text NOT NULL,
    profissional_solicitante text DEFAULT ''::text NOT NULL,
    tipo_encaminhamento text DEFAULT ''::text NOT NULL,
    diagnostico_resumido text DEFAULT ''::text NOT NULL,
    justificativa text DEFAULT ''::text NOT NULL,
    data_encaminhamento text DEFAULT ''::text NOT NULL,
    documento_url text DEFAULT ''::text NOT NULL,
    tipo_condicao text DEFAULT ''::text NOT NULL,
    mobilidade text DEFAULT ''::text NOT NULL,
    usa_dispositivo boolean DEFAULT false NOT NULL,
    tipo_dispositivo text DEFAULT ''::text NOT NULL,
    comunicacao text DEFAULT ''::text NOT NULL,
    comportamento text DEFAULT ''::text NOT NULL,
    usa_equipamentos boolean DEFAULT false NOT NULL,
    equipamentos text[] DEFAULT '{}'::text[] NOT NULL,
    observacao_equipamentos text DEFAULT ''::text NOT NULL,
    outro_servico_sus boolean DEFAULT false NOT NULL,
    transporte text DEFAULT ''::text NOT NULL,
    turno_preferido text DEFAULT ''::text NOT NULL,
    especialidade_destino text DEFAULT ''::text NOT NULL,
    is_gestante boolean DEFAULT false NOT NULL,
    is_pne boolean DEFAULT false NOT NULL,
    is_autista boolean DEFAULT false NOT NULL,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now(),
    sexo text,
    naturalidade text,
    nacionalidade text DEFAULT 'Brasil'::text,
    raca_cor text,
    cep text,
    tipo_logradouro text,
    numero text,
    complemento text,
    bairro text,
    uf text,
    telefone_secundario text,
    situacao_rua boolean DEFAULT false,
    etnia text,
    etnia_outra text,
    pais_nascimento text,
    tipo_logradouro_codigo text
);


--
-- Name: patient_discharges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_discharges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    patient_id text NOT NULL,
    professional_id text NOT NULL,
    discharge_date date DEFAULT CURRENT_DATE NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    final_notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: patient_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id text NOT NULL,
    regulation_id uuid,
    professional_id text NOT NULL,
    unit_id text DEFAULT ''::text NOT NULL,
    evaluation_date date DEFAULT CURRENT_DATE NOT NULL,
    clinical_notes text DEFAULT ''::text NOT NULL,
    defined_procedures text[] DEFAULT '{}'::text[] NOT NULL,
    sessions_planned integer DEFAULT 1 NOT NULL,
    frequency text DEFAULT 'semanal'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_regulation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_regulation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id text NOT NULL,
    cns text DEFAULT ''::text NOT NULL,
    cpf text DEFAULT ''::text NOT NULL,
    name text NOT NULL,
    mother_name text DEFAULT ''::text NOT NULL,
    priority_level text DEFAULT 'baixo'::text NOT NULL,
    referral_source text DEFAULT 'espontaneo'::text NOT NULL,
    cid_code text DEFAULT ''::text NOT NULL,
    requires_specialty text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permissoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    perfil text NOT NULL,
    modulo text NOT NULL,
    can_view boolean DEFAULT false NOT NULL,
    can_create boolean DEFAULT false NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL,
    can_execute boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    can_print boolean DEFAULT false NOT NULL,
    can_export boolean DEFAULT false NOT NULL,
    can_attach boolean DEFAULT false NOT NULL,
    can_sign boolean DEFAULT false NOT NULL,
    can_approve boolean DEFAULT false NOT NULL,
    can_cancel boolean DEFAULT false NOT NULL,
    can_config boolean DEFAULT false NOT NULL,
    acoes_especificas jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE ONLY public.permissoes REPLICA IDENTITY FULL;


--
-- Name: COLUMN permissoes.acoes_especificas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permissoes.acoes_especificas IS 'Armazena permissões granulares específicas de cada módulo em formato JSON (ex: {"confirmar_chegada": true})';


--
-- Name: permissoes_usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissoes_usuario (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    modulo text NOT NULL,
    can_view boolean DEFAULT false NOT NULL,
    can_create boolean DEFAULT false NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL,
    can_execute boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    can_print boolean DEFAULT false NOT NULL,
    can_export boolean DEFAULT false NOT NULL,
    can_attach boolean DEFAULT false NOT NULL,
    can_sign boolean DEFAULT false NOT NULL,
    can_approve boolean DEFAULT false NOT NULL,
    can_cancel boolean DEFAULT false NOT NULL,
    can_config boolean DEFAULT false NOT NULL,
    acoes_especificas jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE ONLY public.permissoes_usuario REPLICA IDENTITY FULL;


--
-- Name: COLUMN permissoes_usuario.acoes_especificas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permissoes_usuario.acoes_especificas IS 'Armazena overrides de permissões granulares específicas de cada módulo em formato JSON';


--
-- Name: procedimento_profissionais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procedimento_profissionais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    procedimento_codigo text NOT NULL,
    profissional_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: procedimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procedimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    profissao text DEFAULT ''::text NOT NULL,
    especialidade text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    profissionais_ids uuid[] DEFAULT '{}'::uuid[],
    codigo_sigtap text DEFAULT ''::text NOT NULL
);


--
-- Name: professional_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professional_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profissional_id text NOT NULL,
    tipo text DEFAULT 'exam'::text NOT NULL,
    item_id uuid NOT NULL,
    desabilitado boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profissionais_carimbo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profissionais_carimbo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profissional_id uuid NOT NULL,
    tipo text DEFAULT 'digital'::text NOT NULL,
    nome text DEFAULT ''::text NOT NULL,
    conselho text DEFAULT ''::text NOT NULL,
    numero_registro text DEFAULT ''::text NOT NULL,
    uf text DEFAULT ''::text NOT NULL,
    especialidade text DEFAULT ''::text NOT NULL,
    cargo text DEFAULT ''::text NOT NULL,
    imagem_url text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profissionais_carimbo_tipo_check CHECK ((tipo = ANY (ARRAY['digital'::text, 'imagem'::text])))
);


--
-- Name: profissionais_externos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profissionais_externos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    nome text NOT NULL,
    email text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prontuario_anexos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prontuario_anexos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prontuario_id uuid NOT NULL,
    paciente_id text NOT NULL,
    agendamento_id text DEFAULT ''::text,
    tipo_registro text DEFAULT 'consulta'::text NOT NULL,
    categoria text DEFAULT 'documento'::text NOT NULL,
    nome_arquivo text NOT NULL,
    storage_path text NOT NULL,
    mime_type text DEFAULT ''::text NOT NULL,
    tamanho_bytes bigint DEFAULT 0 NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    uploaded_by text DEFAULT ''::text NOT NULL,
    uploaded_by_nome text DEFAULT ''::text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prontuario_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prontuario_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profissional_id text NOT NULL,
    tipo_prontuario text DEFAULT 'sessao'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    versao integer DEFAULT 1 NOT NULL,
    template_nome text,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: prontuario_procedimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prontuario_procedimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prontuario_id uuid NOT NULL,
    procedimento_id text NOT NULL,
    observacao text DEFAULT ''::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    paciente_id text,
    agendamento_id text,
    profissional_id text,
    unidade_id text,
    codigo_sigtap text,
    nome_procedimento text,
    especialidade text,
    quantidade integer DEFAULT 1,
    cid text,
    origem text DEFAULT 'SIGTAP'::text,
    criado_por uuid,
    atualizado_por uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: prontuario_resultados_exames; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prontuario_resultados_exames (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prontuario_id uuid,
    paciente_id text NOT NULL,
    agendamento_id text DEFAULT ''::text,
    unidade_id text DEFAULT ''::text,
    nome_exame text NOT NULL,
    tipo_exame text DEFAULT 'laboratorial'::text,
    laboratorio text DEFAULT ''::text,
    data_solicitacao date,
    data_coleta date,
    data_resultado date,
    medico_solicitante text DEFAULT ''::text,
    medico_solicitante_id text DEFAULT ''::text,
    status text DEFAULT 'pendente'::text NOT NULL,
    tipo_atendimento_vinculado text DEFAULT 'rotina'::text,
    valor_encontrado text DEFAULT ''::text,
    valor_referencia text DEFAULT ''::text,
    unidade_medida text DEFAULT ''::text,
    interpretacao text DEFAULT 'normal'::text,
    laudo text DEFAULT ''::text,
    observacoes_medicas text DEFAULT ''::text,
    anexo_storage_path text DEFAULT ''::text,
    anexo_nome_arquivo text DEFAULT ''::text,
    criado_por text DEFAULT ''::text,
    criado_por_nome text DEFAULT ''::text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prontuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prontuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paciente_id text NOT NULL,
    paciente_nome text NOT NULL,
    profissional_id text NOT NULL,
    profissional_nome text NOT NULL,
    unidade_id text NOT NULL,
    sala_id text DEFAULT ''::text,
    setor text DEFAULT ''::text,
    agendamento_id text DEFAULT ''::text,
    data_atendimento date DEFAULT CURRENT_DATE NOT NULL,
    hora_atendimento text DEFAULT ''::text,
    queixa_principal text DEFAULT ''::text,
    anamnese text DEFAULT ''::text,
    sinais_sintomas text DEFAULT ''::text,
    exame_fisico text DEFAULT ''::text,
    hipotese text DEFAULT ''::text,
    conduta text DEFAULT ''::text,
    prescricao text DEFAULT ''::text,
    solicitacao_exames text DEFAULT ''::text,
    evolucao text DEFAULT ''::text,
    observacoes text DEFAULT ''::text,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    indicacao_retorno text DEFAULT ''::text NOT NULL,
    motivo_alteracao text DEFAULT ''::text NOT NULL,
    episodio_id uuid,
    procedimentos_texto text DEFAULT ''::text NOT NULL,
    outro_procedimento text DEFAULT ''::text NOT NULL,
    tipo_registro text DEFAULT 'consulta'::text NOT NULL,
    soap_subjetivo text DEFAULT ''::text,
    soap_objetivo text DEFAULT ''::text,
    soap_avaliacao text DEFAULT ''::text,
    soap_plano text DEFAULT ''::text,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: pts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id text NOT NULL,
    professional_id text NOT NULL,
    unit_id text DEFAULT ''::text NOT NULL,
    diagnostico_funcional text DEFAULT ''::text NOT NULL,
    objetivos_terapeuticos text DEFAULT ''::text NOT NULL,
    metas_curto_prazo text DEFAULT ''::text NOT NULL,
    metas_medio_prazo text DEFAULT ''::text NOT NULL,
    metas_longo_prazo text DEFAULT ''::text NOT NULL,
    especialidades_envolvidas text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: pts_cid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pts_cid (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pts_id uuid NOT NULL,
    cid_codigo text DEFAULT ''::text NOT NULL,
    cid_descricao text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pts_import_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pts_import_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text DEFAULT 'sync_datasus_automatico'::text NOT NULL,
    especialidade text DEFAULT 'todas'::text NOT NULL,
    total_procedimentos integer DEFAULT 0 NOT NULL,
    total_cids integer DEFAULT 0 NOT NULL,
    competencia text DEFAULT ''::text NOT NULL,
    detalhes jsonb DEFAULT '[]'::jsonb NOT NULL,
    importado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pts_sigtap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pts_sigtap (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pts_id uuid NOT NULL,
    procedimento_codigo text DEFAULT ''::text NOT NULL,
    procedimento_nome text DEFAULT ''::text NOT NULL,
    especialidade text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quotas_externas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotas_externas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profissional_externo_id uuid NOT NULL,
    profissional_interno_id uuid NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    vagas_total integer DEFAULT 0 NOT NULL,
    vagas_usadas integer DEFAULT 0 NOT NULL,
    periodo_inicio date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date NOT NULL,
    periodo_fim date DEFAULT ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon -1 days'::interval))::date NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: salas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salas (
    id text NOT NULL,
    nome text NOT NULL,
    unidade_id text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: sigtap_procedimento_cids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sigtap_procedimento_cids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    procedimento_codigo text NOT NULL,
    cid_codigo text NOT NULL,
    cid_descricao text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sigtap_procedimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sigtap_procedimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    especialidade text DEFAULT ''::text NOT NULL,
    total_cids integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origem text DEFAULT 'SIGTAP'::text NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    valor numeric(10,2),
    criado_por text DEFAULT ''::text NOT NULL
);


--
-- Name: sistemas_integrados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sistemas_integrados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    identificador_sistema text NOT NULL,
    url_base text DEFAULT ''::text NOT NULL,
    token_saida text DEFAULT ''::text NOT NULL,
    token_entrada_hash text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    permite_enviar boolean DEFAULT true NOT NULL,
    permite_receber boolean DEFAULT true NOT NULL,
    ultima_sincronizacao timestamp with time zone,
    observacoes text DEFAULT ''::text NOT NULL,
    criado_por text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: soap_custom_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.soap_custom_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profissional_id text NOT NULL,
    campo text NOT NULL,
    opcao text NOT NULL,
    profissao text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    id text DEFAULT 'default'::text NOT NULL,
    configuracoes jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: treatment_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id text NOT NULL,
    professional_id text NOT NULL,
    unit_id text DEFAULT ''::text NOT NULL,
    specialty text DEFAULT ''::text NOT NULL,
    treatment_type text DEFAULT ''::text NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date_predicted date,
    total_sessions integer DEFAULT 1 NOT NULL,
    sessions_done integer DEFAULT 0 NOT NULL,
    frequency text DEFAULT 'semanal'::text NOT NULL,
    status text DEFAULT 'em_andamento'::text NOT NULL,
    clinical_notes text DEFAULT ''::text NOT NULL,
    created_by text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pts_id uuid,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: treatment_extensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_extensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    previous_sessions integer NOT NULL,
    new_sessions integer NOT NULL,
    previous_end_date date,
    new_end_date date,
    reason text DEFAULT ''::text NOT NULL,
    changed_by text DEFAULT ''::text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: treatment_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    patient_id text NOT NULL,
    professional_id text NOT NULL,
    appointment_id text,
    session_number integer DEFAULT 1 NOT NULL,
    total_sessions integer DEFAULT 1 NOT NULL,
    scheduled_date date DEFAULT CURRENT_DATE NOT NULL,
    status text DEFAULT 'agendada'::text NOT NULL,
    absence_type text,
    clinical_notes text DEFAULT ''::text NOT NULL,
    procedure_done text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: triage_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agendamento_id text NOT NULL,
    tecnico_id text NOT NULL,
    peso numeric(5,2),
    altura numeric(5,2),
    imc numeric(5,2),
    pressao_arterial character varying(10),
    temperatura numeric(4,1),
    frequencia_cardiaca integer,
    saturacao_oxigenio integer,
    glicemia numeric(6,2),
    alergias text[] DEFAULT '{}'::text[],
    medicamentos text[] DEFAULT '{}'::text[],
    queixa text,
    iniciado_em timestamp with time zone,
    confirmado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now(),
    classificacao_risco text DEFAULT ''::text NOT NULL,
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL
);


--
-- Name: triage_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unidade_id text,
    profissional_id text,
    enabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: unidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidades (
    id text NOT NULL,
    nome text NOT NULL,
    endereco text DEFAULT ''::text NOT NULL,
    telefone text DEFAULT ''::text NOT NULL,
    whatsapp text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    custom_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    nome_exibicao text DEFAULT ''::text NOT NULL
);


--
-- Name: whatsapp_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unidade_id text NOT NULL,
    whatsapp_ativo boolean DEFAULT true NOT NULL,
    max_msgs_paciente_dia integer DEFAULT 5 NOT NULL,
    max_msgs_paciente_semana integer DEFAULT 10 NOT NULL,
    intervalo_minimo_minutos integer DEFAULT 10 NOT NULL,
    delay_aleatorio_min_seg integer DEFAULT 5 NOT NULL,
    delay_aleatorio_max_seg integer DEFAULT 30 NOT NULL,
    limite_global_por_minuto integer DEFAULT 20 NOT NULL,
    horario_inicio text DEFAULT '08:00'::text NOT NULL,
    horario_fim text DEFAULT '18:00'::text NOT NULL,
    dias_permitidos integer[] DEFAULT ARRAY[1, 2, 3, 4, 5] NOT NULL,
    modo_estrito boolean DEFAULT true NOT NULL,
    respeitar_opt_out boolean DEFAULT true NOT NULL,
    bloquear_sem_interacao_previa boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paciente_id text NOT NULL,
    telefone text NOT NULL,
    tipo text NOT NULL,
    origem text DEFAULT 'cadastro'::text NOT NULL,
    detalhes jsonb DEFAULT '{}'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por text DEFAULT ''::text NOT NULL,
    CONSTRAINT whatsapp_consents_tipo_check CHECK ((tipo = ANY (ARRAY['opt_in'::text, 'opt_out'::text, 'interaction'::text])))
);


--
-- Name: whatsapp_event_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_event_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unidade_id text NOT NULL,
    evento text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    template_mensagem text DEFAULT ''::text NOT NULL,
    delay_envio_min integer DEFAULT 0 NOT NULL,
    horario_personalizado text DEFAULT ''::text NOT NULL,
    limite_por_paciente integer DEFAULT 1 NOT NULL,
    prioridade text DEFAULT 'media'::text NOT NULL,
    exigir_confirmacao boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_event_config_prioridade_check CHECK ((prioridade = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text])))
);


--
-- Name: whatsapp_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paciente_id text DEFAULT ''::text NOT NULL,
    paciente_nome text DEFAULT ''::text NOT NULL,
    telefone text NOT NULL,
    evento text NOT NULL,
    mensagem text NOT NULL,
    prioridade text DEFAULT 'media'::text NOT NULL,
    agendado_para timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    tentativas integer DEFAULT 0 NOT NULL,
    motivo_erro text DEFAULT ''::text NOT NULL,
    motivo_bloqueio text DEFAULT ''::text NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    agendamento_id text DEFAULT ''::text NOT NULL,
    metadados jsonb DEFAULT '{}'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    processado_em timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_queue_prioridade_check CHECK ((prioridade = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text]))),
    CONSTRAINT whatsapp_queue_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviado'::text, 'erro'::text, 'bloqueado'::text, 'cancelado'::text])))
);


--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unidade_id text DEFAULT ''::text NOT NULL,
    tipo text DEFAULT 'confirmacao'::text NOT NULL,
    mensagem text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: action_logs action_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_logs
    ADD CONSTRAINT action_logs_pkey PRIMARY KEY (id);


--
-- Name: agendamentos agendamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_pkey PRIMARY KEY (id);


--
-- Name: assinatura_eletronica_config assinatura_eletronica_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assinatura_eletronica_config
    ADD CONSTRAINT assinatura_eletronica_config_pkey PRIMARY KEY (id);


--
-- Name: atendimentos atendimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_pkey PRIMARY KEY (id);


--
-- Name: autentique_fila_envio autentique_fila_envio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autentique_fila_envio
    ADD CONSTRAINT autentique_fila_envio_pkey PRIMARY KEY (id);


--
-- Name: autentique_webhook_logs autentique_webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autentique_webhook_logs
    ADD CONSTRAINT autentique_webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: bloqueios bloqueios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bloqueios
    ADD CONSTRAINT bloqueios_pkey PRIMARY KEY (id);


--
-- Name: cbo_codigos cbo_codigos_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbo_codigos
    ADD CONSTRAINT cbo_codigos_codigo_key UNIQUE (codigo);


--
-- Name: cbo_codigos cbo_codigos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbo_codigos
    ADD CONSTRAINT cbo_codigos_pkey PRIMARY KEY (id);


--
-- Name: cid10_codigos cid10_codigos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cid10_codigos
    ADD CONSTRAINT cid10_codigos_pkey PRIMARY KEY (id);


--
-- Name: clinica_config clinica_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinica_config
    ADD CONSTRAINT clinica_config_pkey PRIMARY KEY (id);


--
-- Name: disponibilidades disponibilidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disponibilidades
    ADD CONSTRAINT disponibilidades_pkey PRIMARY KEY (id);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: documentos_assinatura_autentique documentos_assinatura_autentique_autentique_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura_autentique
    ADD CONSTRAINT documentos_assinatura_autentique_autentique_document_id_key UNIQUE (autentique_document_id);


--
-- Name: documentos_assinatura_autentique documentos_assinatura_autentique_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura_autentique
    ADD CONSTRAINT documentos_assinatura_autentique_pkey PRIMARY KEY (id);


--
-- Name: documentos_assinatura_signatarios documentos_assinatura_signatarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura_signatarios
    ADD CONSTRAINT documentos_assinatura_signatarios_pkey PRIMARY KEY (id);


--
-- Name: documentos_gerados documentos_gerados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_gerados
    ADD CONSTRAINT documentos_gerados_pkey PRIMARY KEY (id);


--
-- Name: encaminhamentos_anexos encaminhamentos_anexos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encaminhamentos_anexos
    ADD CONSTRAINT encaminhamentos_anexos_pkey PRIMARY KEY (id);


--
-- Name: encaminhamentos_externos encaminhamentos_externos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encaminhamentos_externos
    ADD CONSTRAINT encaminhamentos_externos_pkey PRIMARY KEY (id);


--
-- Name: episodios_clinicos episodios_clinicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episodios_clinicos
    ADD CONSTRAINT episodios_clinicos_pkey PRIMARY KEY (id);


--
-- Name: especialidades_config especialidades_config_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especialidades_config
    ADD CONSTRAINT especialidades_config_nome_key UNIQUE (nome);


--
-- Name: especialidades_config especialidades_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especialidades_config
    ADD CONSTRAINT especialidades_config_pkey PRIMARY KEY (id);


--
-- Name: especialidades especialidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especialidades
    ADD CONSTRAINT especialidades_pkey PRIMARY KEY (id);


--
-- Name: exam_types exam_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_types
    ADD CONSTRAINT exam_types_pkey PRIMARY KEY (id);


--
-- Name: fila_espera fila_espera_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fila_espera
    ADD CONSTRAINT fila_espera_pkey PRIMARY KEY (id);


--
-- Name: form_templates form_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_templates
    ADD CONSTRAINT form_templates_pkey PRIMARY KEY (id);


--
-- Name: funcionarios funcionarios_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcionarios
    ADD CONSTRAINT funcionarios_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: funcionarios funcionarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcionarios
    ADD CONSTRAINT funcionarios_pkey PRIMARY KEY (id);


--
-- Name: funcionarios funcionarios_usuario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcionarios
    ADD CONSTRAINT funcionarios_usuario_key UNIQUE (usuario);


--
-- Name: google_calendar_tokens google_calendar_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_tokens google_calendar_tokens_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_user_id_key UNIQUE (user_id);


--
-- Name: google_calendar_tokens google_calendar_tokens_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_user_id_unique UNIQUE (user_id);


--
-- Name: horarios_funcionamento horarios_funcionamento_dia_semana_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horarios_funcionamento
    ADD CONSTRAINT horarios_funcionamento_dia_semana_key UNIQUE (dia_semana);


--
-- Name: horarios_funcionamento horarios_funcionamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horarios_funcionamento
    ADD CONSTRAINT horarios_funcionamento_pkey PRIMARY KEY (id);


--
-- Name: logradouros_dne logradouros_dne_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logradouros_dne
    ADD CONSTRAINT logradouros_dne_pkey PRIMARY KEY (codigo);


--
-- Name: logs_integracao logs_integracao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_integracao
    ADD CONSTRAINT logs_integracao_pkey PRIMARY KEY (id);


--
-- Name: medications medications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medications
    ADD CONSTRAINT medications_pkey PRIMARY KEY (id);


--
-- Name: multiprofessional_evaluations multiprofessional_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multiprofessional_evaluations
    ADD CONSTRAINT multiprofessional_evaluations_pkey PRIMARY KEY (id);


--
-- Name: notification_logs notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);


--
-- Name: nursing_evaluations nursing_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nursing_evaluations
    ADD CONSTRAINT nursing_evaluations_pkey PRIMARY KEY (id);


--
-- Name: paciente_documentos paciente_documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paciente_documentos
    ADD CONSTRAINT paciente_documentos_pkey PRIMARY KEY (id);


--
-- Name: paciente_encaminhamento_anexos paciente_encaminhamento_anexos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paciente_encaminhamento_anexos
    ADD CONSTRAINT paciente_encaminhamento_anexos_pkey PRIMARY KEY (id);


--
-- Name: paciente_encaminhamentos paciente_encaminhamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paciente_encaminhamentos
    ADD CONSTRAINT paciente_encaminhamentos_pkey PRIMARY KEY (id);


--
-- Name: pacientes pacientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_pkey PRIMARY KEY (id);


--
-- Name: patient_discharges patient_discharges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_discharges
    ADD CONSTRAINT patient_discharges_pkey PRIMARY KEY (id);


--
-- Name: patient_evaluations patient_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_evaluations
    ADD CONSTRAINT patient_evaluations_pkey PRIMARY KEY (id);


--
-- Name: patient_regulation patient_regulation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_regulation
    ADD CONSTRAINT patient_regulation_pkey PRIMARY KEY (id);


--
-- Name: permissoes permissoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissoes
    ADD CONSTRAINT permissoes_pkey PRIMARY KEY (id);


--
-- Name: permissoes_usuario permissoes_usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissoes_usuario
    ADD CONSTRAINT permissoes_usuario_pkey PRIMARY KEY (id);


--
-- Name: procedimento_profissionais procedimento_profissionais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimento_profissionais
    ADD CONSTRAINT procedimento_profissionais_pkey PRIMARY KEY (id);


--
-- Name: procedimento_profissionais procedimento_profissionais_procedimento_codigo_profissional_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimento_profissionais
    ADD CONSTRAINT procedimento_profissionais_procedimento_codigo_profissional_key UNIQUE (procedimento_codigo, profissional_id);


--
-- Name: procedimentos procedimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimentos
    ADD CONSTRAINT procedimentos_pkey PRIMARY KEY (id);


--
-- Name: professional_preferences professional_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_preferences
    ADD CONSTRAINT professional_preferences_pkey PRIMARY KEY (id);


--
-- Name: profissionais_carimbo profissionais_carimbo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profissionais_carimbo
    ADD CONSTRAINT profissionais_carimbo_pkey PRIMARY KEY (id);


--
-- Name: profissionais_carimbo profissionais_carimbo_profissional_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profissionais_carimbo
    ADD CONSTRAINT profissionais_carimbo_profissional_id_key UNIQUE (profissional_id);


--
-- Name: profissionais_externos profissionais_externos_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profissionais_externos
    ADD CONSTRAINT profissionais_externos_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: profissionais_externos profissionais_externos_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profissionais_externos
    ADD CONSTRAINT profissionais_externos_email_key UNIQUE (email);


--
-- Name: profissionais_externos profissionais_externos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profissionais_externos
    ADD CONSTRAINT profissionais_externos_pkey PRIMARY KEY (id);


--
-- Name: prontuario_anexos prontuario_anexos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prontuario_anexos
    ADD CONSTRAINT prontuario_anexos_pkey PRIMARY KEY (id);


--
-- Name: prontuario_config prontuario_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prontuario_config
    ADD CONSTRAINT prontuario_config_pkey PRIMARY KEY (id);


--
-- Name: prontuario_config prontuario_config_profissional_id_tipo_prontuario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prontuario_config
    ADD CONSTRAINT prontuario_config_profissional_id_tipo_prontuario_key UNIQUE (profissional_id, tipo_prontuario);


--
-- Name: prontuario_procedimentos prontuario_procedimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prontuario_procedimentos
    ADD CONSTRAINT prontuario_procedimentos_pkey PRIMARY KEY (id);


--
-- Name: prontuario_resultados_exames prontuario_resultados_exames_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prontuario_resultados_exames
    ADD CONSTRAINT prontuario_resultados_exames_pkey PRIMARY KEY (id);


--
-- Name: prontuarios prontuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prontuarios
    ADD CONSTRAINT prontuarios_pkey PRIMARY KEY (id);


--
-- Name: pts_cid pts_cid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts_cid
    ADD CONSTRAINT pts_cid_pkey PRIMARY KEY (id);


--
-- Name: pts_import_log pts_import_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts_import_log
    ADD CONSTRAINT pts_import_log_pkey PRIMARY KEY (id);


--
-- Name: pts pts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts
    ADD CONSTRAINT pts_pkey PRIMARY KEY (id);


--
-- Name: pts_sigtap pts_sigtap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts_sigtap
    ADD CONSTRAINT pts_sigtap_pkey PRIMARY KEY (id);


--
-- Name: quotas_externas quotas_externas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotas_externas
    ADD CONSTRAINT quotas_externas_pkey PRIMARY KEY (id);


--
-- Name: salas salas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salas
    ADD CONSTRAINT salas_pkey PRIMARY KEY (id);


--
-- Name: sigtap_procedimento_cids sigtap_procedimento_cids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sigtap_procedimento_cids
    ADD CONSTRAINT sigtap_procedimento_cids_pkey PRIMARY KEY (id);


--
-- Name: sigtap_procedimento_cids sigtap_procedimento_cids_proc_cid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sigtap_procedimento_cids
    ADD CONSTRAINT sigtap_procedimento_cids_proc_cid_unique UNIQUE (procedimento_codigo, cid_codigo);


--
-- Name: sigtap_procedimentos sigtap_procedimentos_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sigtap_procedimentos
    ADD CONSTRAINT sigtap_procedimentos_codigo_key UNIQUE (codigo);


--
-- Name: sigtap_procedimentos sigtap_procedimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sigtap_procedimentos
    ADD CONSTRAINT sigtap_procedimentos_pkey PRIMARY KEY (id);


--
-- Name: sistemas_integrados sistemas_integrados_identificador_sistema_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sistemas_integrados
    ADD CONSTRAINT sistemas_integrados_identificador_sistema_key UNIQUE (identificador_sistema);


--
-- Name: sistemas_integrados sistemas_integrados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sistemas_integrados
    ADD CONSTRAINT sistemas_integrados_pkey PRIMARY KEY (id);


--
-- Name: soap_custom_options soap_custom_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soap_custom_options
    ADD CONSTRAINT soap_custom_options_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);


--
-- Name: treatment_cycles treatment_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_cycles
    ADD CONSTRAINT treatment_cycles_pkey PRIMARY KEY (id);


--
-- Name: treatment_extensions treatment_extensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_extensions
    ADD CONSTRAINT treatment_extensions_pkey PRIMARY KEY (id);


--
-- Name: treatment_sessions treatment_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_sessions
    ADD CONSTRAINT treatment_sessions_pkey PRIMARY KEY (id);


--
-- Name: triage_records triage_records_agendamento_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_records
    ADD CONSTRAINT triage_records_agendamento_id_key UNIQUE (agendamento_id);


--
-- Name: triage_records triage_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_records
    ADD CONSTRAINT triage_records_pkey PRIMARY KEY (id);


--
-- Name: triage_settings triage_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_settings
    ADD CONSTRAINT triage_settings_pkey PRIMARY KEY (id);


--
-- Name: unidades unidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades
    ADD CONSTRAINT unidades_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_config whatsapp_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_config whatsapp_config_unidade_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_unidade_id_key UNIQUE (unidade_id);


--
-- Name: whatsapp_consents whatsapp_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_consents
    ADD CONSTRAINT whatsapp_consents_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_event_config whatsapp_event_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_event_config
    ADD CONSTRAINT whatsapp_event_config_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_event_config whatsapp_event_config_unidade_id_evento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_event_config
    ADD CONSTRAINT whatsapp_event_config_unidade_id_evento_key UNIQUE (unidade_id, evento);


--
-- Name: whatsapp_queue whatsapp_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_queue
    ADD CONSTRAINT whatsapp_queue_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_templates whatsapp_templates_unidade_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_unidade_id_tipo_key UNIQUE (unidade_id, tipo);


--
-- Name: form_templates_prof_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX form_templates_prof_idx ON public.form_templates USING btree (profissional_id);


--
-- Name: form_templates_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX form_templates_slug_idx ON public.form_templates USING btree (form_slug);


--
-- Name: form_templates_slug_prof_unid_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX form_templates_slug_prof_unid_uidx ON public.form_templates USING btree (form_slug, profissional_id, unidade_id);


--
-- Name: form_templates_unid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX form_templates_unid_idx ON public.form_templates USING btree (unidade_id);


--
-- Name: idx_action_logs_acao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_action_logs_acao ON public.action_logs USING btree (acao);


--
-- Name: idx_action_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_action_logs_created ON public.action_logs USING btree (created_at DESC);


--
-- Name: idx_action_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_action_logs_created_at ON public.action_logs USING btree (created_at DESC);


--
-- Name: idx_action_logs_entidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_action_logs_entidade ON public.action_logs USING btree (entidade);


--
-- Name: idx_action_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_action_logs_user ON public.action_logs USING btree (user_id);


--
-- Name: idx_action_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_action_logs_user_id ON public.action_logs USING btree (user_id);


--
-- Name: idx_agendamentos_criado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_criado_em ON public.agendamentos USING btree (criado_em DESC);


--
-- Name: idx_agendamentos_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_data ON public.agendamentos USING btree (data);


--
-- Name: idx_agendamentos_data_prof_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_data_prof_status ON public.agendamentos USING btree (data, profissional_id, status);


--
-- Name: idx_agendamentos_data_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_data_status ON public.agendamentos USING btree (data, status);


--
-- Name: idx_agendamentos_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_paciente ON public.agendamentos USING btree (paciente_id);


--
-- Name: idx_agendamentos_paciente_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_paciente_data ON public.agendamentos USING btree (paciente_id, data);


--
-- Name: idx_agendamentos_paciente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_paciente_id ON public.agendamentos USING btree (paciente_id);


--
-- Name: idx_agendamentos_prof_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_prof_data ON public.agendamentos USING btree (profissional_id, data);


--
-- Name: idx_agendamentos_profissional_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_profissional_data ON public.agendamentos USING btree (profissional_id, data);


--
-- Name: idx_agendamentos_profissional_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_profissional_id ON public.agendamentos USING btree (profissional_id);


--
-- Name: idx_agendamentos_profissional_unidade_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_profissional_unidade_data ON public.agendamentos USING btree (profissional_id, unidade_id, data, status);


--
-- Name: idx_agendamentos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_status ON public.agendamentos USING btree (status);


--
-- Name: idx_agendamentos_unidade_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_unidade_data ON public.agendamentos USING btree (unidade_id, data);


--
-- Name: idx_agendamentos_unidade_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_unidade_id ON public.agendamentos USING btree (unidade_id);


--
-- Name: idx_agendamentos_unique_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agendamentos_unique_slot ON public.agendamentos USING btree (paciente_id, profissional_id, data, hora) WHERE (status <> ALL (ARRAY['cancelado'::text, 'falta'::text]));


--
-- Name: idx_assinatura_config_provider_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_assinatura_config_provider_unidade ON public.assinatura_eletronica_config USING btree (provider, COALESCE(unidade_id, 'global'::text));


--
-- Name: idx_atendimentos_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimentos_data ON public.atendimentos USING btree (data);


--
-- Name: idx_atendimentos_data_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimentos_data_status ON public.atendimentos USING btree (data, status);


--
-- Name: idx_atendimentos_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimentos_paciente ON public.atendimentos USING btree (paciente_id);


--
-- Name: idx_atendimentos_profissional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimentos_profissional ON public.atendimentos USING btree (profissional_id);


--
-- Name: idx_atendimentos_profissional_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimentos_profissional_id ON public.atendimentos USING btree (profissional_id);


--
-- Name: idx_bloqueios_datas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bloqueios_datas ON public.bloqueios USING btree (data_inicio, data_fim);


--
-- Name: idx_bloqueios_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bloqueios_dates ON public.bloqueios USING btree (data_inicio, data_fim);


--
-- Name: idx_bloqueios_profissional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bloqueios_profissional ON public.bloqueios USING btree (profissional_id, data_inicio, data_fim) WHERE ((profissional_id IS NOT NULL) AND (profissional_id <> ''::text));


--
-- Name: idx_cbo_codigos_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cbo_codigos_codigo ON public.cbo_codigos USING btree (codigo);


--
-- Name: idx_cbo_codigos_descricao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cbo_codigos_descricao ON public.cbo_codigos USING gin (to_tsvector('portuguese'::regconfig, descricao));


--
-- Name: idx_cid10_codigo_esp; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cid10_codigo_esp ON public.cid10_codigos USING btree (codigo, especialidade);


--
-- Name: idx_cid10_especialidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cid10_especialidade ON public.cid10_codigos USING btree (especialidade);


--
-- Name: idx_disponibilidades_prof_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disponibilidades_prof_unidade ON public.disponibilidades USING btree (profissional_id, unidade_id, data_inicio, data_fim);


--
-- Name: idx_disponibilidades_profissional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disponibilidades_profissional ON public.disponibilidades USING btree (profissional_id, unidade_id);


--
-- Name: idx_disponibilidades_profissional_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disponibilidades_profissional_id ON public.disponibilidades USING btree (profissional_id);


--
-- Name: idx_disponibilidades_profissional_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disponibilidades_profissional_unidade ON public.disponibilidades USING btree (profissional_id, unidade_id);


--
-- Name: idx_document_templates_criado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_templates_criado_por ON public.document_templates USING btree (criado_por);


--
-- Name: idx_document_templates_tipo_modelo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_templates_tipo_modelo ON public.document_templates USING btree (tipo_modelo);


--
-- Name: idx_document_templates_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_templates_unidade ON public.document_templates USING btree (unidade_id);


--
-- Name: idx_enc_anexos_enc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enc_anexos_enc ON public.encaminhamentos_anexos USING btree (encaminhamento_id);


--
-- Name: idx_enc_ext_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enc_ext_retry ON public.encaminhamentos_externos USING btree (status, proxima_tentativa_em) WHERE (status = 'falha_envio'::text);


--
-- Name: idx_encaminhamentos_externos_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encaminhamentos_externos_created_at ON public.encaminhamentos_externos USING btree (created_at DESC);


--
-- Name: idx_encaminhamentos_externos_destino_prof; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encaminhamentos_externos_destino_prof ON public.encaminhamentos_externos USING btree (destino_profissional_id);


--
-- Name: idx_encaminhamentos_externos_direcao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encaminhamentos_externos_direcao ON public.encaminhamentos_externos USING btree (direcao);


--
-- Name: idx_encaminhamentos_externos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encaminhamentos_externos_status ON public.encaminhamentos_externos USING btree (status);


--
-- Name: idx_exam_types_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_types_categoria ON public.exam_types USING btree (categoria);


--
-- Name: idx_exam_types_global; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_types_global ON public.exam_types USING btree (is_global, ativo);


--
-- Name: idx_fila_espera_criado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fila_espera_criado_em ON public.fila_espera USING btree (criado_em DESC);


--
-- Name: idx_fila_espera_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fila_espera_paciente ON public.fila_espera USING btree (paciente_id);


--
-- Name: idx_fila_espera_paciente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fila_espera_paciente_id ON public.fila_espera USING btree (paciente_id);


--
-- Name: idx_fila_espera_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fila_espera_status ON public.fila_espera USING btree (status);


--
-- Name: idx_fila_espera_status_unidade_prof; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fila_espera_status_unidade_prof ON public.fila_espera USING btree (status, unidade_id, profissional_id);


--
-- Name: idx_fila_espera_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fila_espera_unidade ON public.fila_espera USING btree (unidade_id);


--
-- Name: idx_fila_espera_unidade_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fila_espera_unidade_id ON public.fila_espera USING btree (unidade_id);


--
-- Name: idx_fila_espera_unidade_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fila_espera_unidade_status ON public.fila_espera USING btree (unidade_id, status);


--
-- Name: idx_funcionarios_auth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funcionarios_auth_user ON public.funcionarios USING btree (auth_user_id);


--
-- Name: idx_funcionarios_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funcionarios_unidade ON public.funcionarios USING btree (unidade_id);


--
-- Name: idx_logradouros_dne_descricao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logradouros_dne_descricao ON public.logradouros_dne USING btree (descricao);


--
-- Name: idx_logs_integracao_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_integracao_created_at ON public.logs_integracao USING btree (created_at DESC);


--
-- Name: idx_logs_integracao_sistema; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_integracao_sistema ON public.logs_integracao USING btree (sistema_integrado_id);


--
-- Name: idx_multi_evaluations_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_multi_evaluations_patient_id ON public.multiprofessional_evaluations USING btree (patient_id);


--
-- Name: idx_notification_logs_agendamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_agendamento ON public.notification_logs USING btree (agendamento_id);


--
-- Name: idx_notification_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_created ON public.notification_logs USING btree (criado_em DESC);


--
-- Name: idx_notification_logs_telefone_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_telefone_criado ON public.notification_logs USING btree (destinatario_telefone, criado_em DESC) WHERE ((destinatario_telefone IS NOT NULL) AND (destinatario_telefone <> ''::text));


--
-- Name: idx_nursing_evaluations_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nursing_evaluations_patient_id ON public.nursing_evaluations USING btree (patient_id);


--
-- Name: idx_paciente_docs_agendamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paciente_docs_agendamento ON public.paciente_documentos USING btree (agendamento_id);


--
-- Name: idx_paciente_docs_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paciente_docs_ativo ON public.paciente_documentos USING btree (ativo);


--
-- Name: idx_paciente_docs_paciente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paciente_docs_paciente_id ON public.paciente_documentos USING btree (paciente_id);


--
-- Name: idx_paciente_docs_unidade_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paciente_docs_unidade_id ON public.paciente_documentos USING btree (unidade_id);


--
-- Name: idx_pacientes_auth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_auth_user ON public.pacientes USING btree (auth_user_id);


--
-- Name: idx_pacientes_cns; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_cns ON public.pacientes USING btree (cns);


--
-- Name: idx_pacientes_cpf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_cpf ON public.pacientes USING btree (cpf);


--
-- Name: idx_pacientes_cpf_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pacientes_cpf_unique ON public.pacientes USING btree (cpf) WHERE ((cpf IS NOT NULL) AND (cpf <> ''::text));


--
-- Name: idx_pacientes_criado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_criado_em ON public.pacientes USING btree (criado_em DESC);


--
-- Name: idx_pacientes_email_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_email_lookup ON public.pacientes USING btree (email) WHERE ((email IS NOT NULL) AND (email <> ''::text));


--
-- Name: idx_pacientes_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_nome ON public.pacientes USING btree (nome);


--
-- Name: idx_pacientes_nome_mae; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_nome_mae ON public.pacientes USING btree (nome_mae);


--
-- Name: idx_pacientes_nome_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_nome_trgm ON public.pacientes USING btree (nome);


--
-- Name: idx_pacientes_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_telefone ON public.pacientes USING btree (telefone);


--
-- Name: idx_pacientes_telefone_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_telefone_lookup ON public.pacientes USING btree (telefone) WHERE ((telefone IS NOT NULL) AND (telefone <> ''::text));


--
-- Name: idx_pacientes_unidade_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_unidade_id ON public.pacientes USING btree (unidade_id);


--
-- Name: idx_patient_evaluations_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_evaluations_patient_id ON public.patient_evaluations USING btree (patient_id);


--
-- Name: idx_patient_evaluations_regulation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_evaluations_regulation_id ON public.patient_evaluations USING btree (regulation_id);


--
-- Name: idx_patient_regulation_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_regulation_patient_id ON public.patient_regulation USING btree (patient_id);


--
-- Name: idx_patient_regulation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_regulation_status ON public.patient_regulation USING btree (status);


--
-- Name: idx_procedimentos_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procedimentos_ativo ON public.procedimentos USING btree (ativo);


--
-- Name: idx_procedimentos_codigo_sigtap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procedimentos_codigo_sigtap ON public.procedimentos USING btree (codigo_sigtap) WHERE (codigo_sigtap <> ''::text);


--
-- Name: idx_procedimentos_profissao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procedimentos_profissao ON public.procedimentos USING btree (profissao);


--
-- Name: idx_procprof_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procprof_codigo ON public.procedimento_profissionais USING btree (procedimento_codigo);


--
-- Name: idx_procprof_profissional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procprof_profissional ON public.procedimento_profissionais USING btree (profissional_id);


--
-- Name: idx_prof_prefs_prof; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prof_prefs_prof ON public.professional_preferences USING btree (profissional_id, tipo);


--
-- Name: idx_prof_prefs_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_prof_prefs_unique ON public.professional_preferences USING btree (profissional_id, tipo, item_id);


--
-- Name: idx_prontuario_anexos_agendamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuario_anexos_agendamento ON public.prontuario_anexos USING btree (agendamento_id);


--
-- Name: idx_prontuario_anexos_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuario_anexos_paciente ON public.prontuario_anexos USING btree (paciente_id);


--
-- Name: idx_prontuario_anexos_prontuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuario_anexos_prontuario ON public.prontuario_anexos USING btree (prontuario_id);


--
-- Name: idx_prontuario_config_prof_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuario_config_prof_tipo ON public.prontuario_config USING btree (profissional_id, tipo_prontuario);


--
-- Name: idx_prontuario_procs_prontuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuario_procs_prontuario_id ON public.prontuario_procedimentos USING btree (prontuario_id);


--
-- Name: idx_prontuarios_agendamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuarios_agendamento ON public.prontuarios USING btree (agendamento_id);


--
-- Name: idx_prontuarios_criado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuarios_criado_em ON public.prontuarios USING btree (criado_em DESC);


--
-- Name: idx_prontuarios_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuarios_data ON public.prontuarios USING btree (data_atendimento);


--
-- Name: idx_prontuarios_data_atendimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuarios_data_atendimento ON public.prontuarios USING btree (data_atendimento);


--
-- Name: idx_prontuarios_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuarios_paciente ON public.prontuarios USING btree (paciente_id);


--
-- Name: idx_prontuarios_paciente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuarios_paciente_id ON public.prontuarios USING btree (paciente_id);


--
-- Name: idx_prontuarios_profissional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuarios_profissional ON public.prontuarios USING btree (profissional_id);


--
-- Name: idx_prontuarios_profissional_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuarios_profissional_id ON public.prontuarios USING btree (profissional_id);


--
-- Name: idx_prontuarios_unidade_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prontuarios_unidade_id ON public.prontuarios USING btree (unidade_id);


--
-- Name: idx_pts_cid_pts_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_cid_pts_id ON public.pts_cid USING btree (pts_id);


--
-- Name: idx_pts_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_patient_id ON public.pts USING btree (patient_id);


--
-- Name: idx_pts_sigtap_pts_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_sigtap_pts_id ON public.pts_sigtap USING btree (pts_id);


--
-- Name: idx_pts_unit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pts_unit_id ON public.pts USING btree (unit_id);


--
-- Name: idx_resultados_exames_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resultados_exames_data ON public.prontuario_resultados_exames USING btree (data_resultado DESC);


--
-- Name: idx_resultados_exames_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resultados_exames_paciente ON public.prontuario_resultados_exames USING btree (paciente_id);


--
-- Name: idx_resultados_exames_prontuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resultados_exames_prontuario ON public.prontuario_resultados_exames USING btree (prontuario_id);


--
-- Name: idx_resultados_exames_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resultados_exames_status ON public.prontuario_resultados_exames USING btree (status);


--
-- Name: idx_sigtap_proc_cid_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sigtap_proc_cid_unique ON public.sigtap_procedimento_cids USING btree (procedimento_codigo, cid_codigo);


--
-- Name: idx_sigtap_proc_cids_cid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sigtap_proc_cids_cid ON public.sigtap_procedimento_cids USING btree (cid_codigo);


--
-- Name: idx_sigtap_proc_cids_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sigtap_proc_cids_codigo ON public.sigtap_procedimento_cids USING btree (procedimento_codigo);


--
-- Name: idx_sigtap_proc_especialidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sigtap_proc_especialidade ON public.sigtap_procedimentos USING btree (especialidade);


--
-- Name: idx_sigtap_proc_origem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sigtap_proc_origem ON public.sigtap_procedimentos USING btree (origem);


--
-- Name: idx_soap_custom_options_prof; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_soap_custom_options_prof ON public.soap_custom_options USING btree (profissional_id, campo);


--
-- Name: idx_treatment_cycles_created_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_cycles_created_at_desc ON public.treatment_cycles USING btree (created_at DESC);


--
-- Name: idx_treatment_cycles_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_cycles_patient_id ON public.treatment_cycles USING btree (patient_id);


--
-- Name: idx_treatment_cycles_professional_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_cycles_professional_id ON public.treatment_cycles USING btree (professional_id);


--
-- Name: idx_treatment_cycles_pts_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_cycles_pts_id ON public.treatment_cycles USING btree (pts_id);


--
-- Name: idx_treatment_cycles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_cycles_status ON public.treatment_cycles USING btree (status);


--
-- Name: idx_treatment_cycles_unit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_cycles_unit_id ON public.treatment_cycles USING btree (unit_id);


--
-- Name: idx_treatment_extensions_cycle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_extensions_cycle_id ON public.treatment_extensions USING btree (cycle_id);


--
-- Name: idx_treatment_sessions_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_sessions_cycle ON public.treatment_sessions USING btree (cycle_id);


--
-- Name: idx_treatment_sessions_cycle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_sessions_cycle_id ON public.treatment_sessions USING btree (cycle_id);


--
-- Name: idx_treatment_sessions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_sessions_date ON public.treatment_sessions USING btree (scheduled_date);


--
-- Name: idx_treatment_sessions_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_sessions_patient ON public.treatment_sessions USING btree (patient_id);


--
-- Name: idx_treatment_sessions_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_sessions_patient_id ON public.treatment_sessions USING btree (patient_id);


--
-- Name: idx_treatment_sessions_professional_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_sessions_professional_id ON public.treatment_sessions USING btree (professional_id);


--
-- Name: idx_treatment_sessions_scheduled_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_sessions_scheduled_date ON public.treatment_sessions USING btree (scheduled_date);


--
-- Name: idx_treatment_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_sessions_status ON public.treatment_sessions USING btree (status);


--
-- Name: idx_triage_records_agendamento_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_triage_records_agendamento_unique ON public.triage_records USING btree (agendamento_id);


--
-- Name: idx_whatsapp_consents_paciente_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_consents_paciente_tipo ON public.whatsapp_consents USING btree (paciente_id, tipo, criado_em DESC);


--
-- Name: idx_whatsapp_consents_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_consents_telefone ON public.whatsapp_consents USING btree (telefone, tipo, criado_em DESC);


--
-- Name: idx_whatsapp_queue_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_queue_paciente ON public.whatsapp_queue USING btree (paciente_id, criado_em DESC);


--
-- Name: idx_whatsapp_queue_status_agendado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_queue_status_agendado ON public.whatsapp_queue USING btree (status, agendado_para) WHERE (status = ANY (ARRAY['pendente'::text, 'processando'::text]));


--
-- Name: idx_whatsapp_queue_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_queue_telefone ON public.whatsapp_queue USING btree (telefone, criado_em DESC);


--
-- Name: permissoes_perfil_modulo_unidade_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissoes_perfil_modulo_unidade_uidx ON public.permissoes USING btree (perfil, modulo, unidade_id);


--
-- Name: permissoes_usuario_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permissoes_usuario_user_idx ON public.permissoes_usuario USING btree (user_id);


--
-- Name: permissoes_usuario_user_modulo_unidade_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissoes_usuario_user_modulo_unidade_uidx ON public.permissoes_usuario USING btree (user_id, modulo, unidade_id);


--
-- Name: uq_exam_types_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_exam_types_dedup ON public.exam_types USING btree (lower(nome), lower(categoria), lower(subcategoria)) WHERE (is_global = true);


--
-- Name: uq_medications_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_medications_dedup ON public.medications USING btree (lower(principio_ativo), lower(concentracao), lower(forma_farmaceutica), lower(via_padrao)) WHERE (is_global = true);


--
-- Name: encaminhamentos_externos encaminhamentos_externos_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER encaminhamentos_externos_set_updated_at BEFORE UPDATE ON public.encaminhamentos_externos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: procedimentos handle_updated_at_procedimentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_updated_at_procedimentos BEFORE UPDATE ON public.procedimentos FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('atualizado_em');


--
-- Name: prontuarios prontuarios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prontuarios_updated_at BEFORE UPDATE ON public.prontuarios FOR EACH ROW EXECUTE FUNCTION public.update_prontuarios_updated_at();


--
-- Name: prontuario_resultados_exames set_resultados_exames_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_resultados_exames_updated_at BEFORE UPDATE ON public.prontuario_resultados_exames FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: paciente_encaminhamentos set_updated_at_encaminhamentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_encaminhamentos BEFORE UPDATE ON public.paciente_encaminhamentos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: sistemas_integrados sistemas_integrados_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sistemas_integrados_set_updated_at BEFORE UPDATE ON public.sistemas_integrados FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: paciente_documentos tr_paciente_documentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_paciente_documentos_updated_at BEFORE UPDATE ON public.paciente_documentos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: agendamentos trg_agendamentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agendamentos_updated_at BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.set_agendamento_updated_at_now();


--
-- Name: cbo_codigos trg_cbo_codigos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cbo_codigos_updated_at BEFORE UPDATE ON public.cbo_codigos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: exam_types trg_exam_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exam_types_updated_at BEFORE UPDATE ON public.exam_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: form_templates trg_form_templates_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_form_templates_updated BEFORE UPDATE ON public.form_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: google_calendar_tokens trg_google_calendar_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_google_calendar_tokens_updated_at BEFORE UPDATE ON public.google_calendar_tokens FOR EACH ROW EXECUTE FUNCTION public.update_google_calendar_tokens_updated_at();


--
-- Name: medications trg_medications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_medications_updated_at BEFORE UPDATE ON public.medications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: permissoes trg_notify_permissoes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_permissoes AFTER INSERT OR DELETE OR UPDATE ON public.permissoes FOR EACH ROW EXECUTE FUNCTION public.notify_permissao_alterada();


--
-- Name: permissoes_usuario trg_notify_permissoes_usuario; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_permissoes_usuario AFTER INSERT OR DELETE OR UPDATE ON public.permissoes_usuario FOR EACH ROW EXECUTE FUNCTION public.notify_permissao_alterada();


--
-- Name: pacientes trg_pacientes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pacientes_updated_at BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.set_pacientes_updated_at_now();


--
-- Name: permissoes trg_permissoes_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_permissoes_updated BEFORE UPDATE ON public.permissoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: permissoes_usuario trg_permissoes_usuario_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_permissoes_usuario_updated BEFORE UPDATE ON public.permissoes_usuario FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: system_config trg_system_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_system_config_updated_at BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: whatsapp_config trg_whatsapp_config_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_whatsapp_config_updated BEFORE UPDATE ON public.whatsapp_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: whatsapp_event_config trg_whatsapp_event_config_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_whatsapp_event_config_updated BEFORE UPDATE ON public.whatsapp_event_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: whatsapp_queue trg_whatsapp_queue_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_whatsapp_queue_updated BEFORE UPDATE ON public.whatsapp_queue FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: assinatura_eletronica_config update_assinatura_eletronica_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_assinatura_eletronica_config_updated_at BEFORE UPDATE ON public.assinatura_eletronica_config FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: autentique_fila_envio update_autentique_fila_envio_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_autentique_fila_envio_updated_at BEFORE UPDATE ON public.autentique_fila_envio FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: document_templates update_document_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_document_templates_updated_at BEFORE UPDATE ON public.document_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: documentos_assinatura_autentique update_documentos_assinatura_autentique_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documentos_assinatura_autentique_updated_at BEFORE UPDATE ON public.documentos_assinatura_autentique FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: documentos_assinatura_signatarios update_documentos_assinatura_signatarios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documentos_assinatura_signatarios_updated_at BEFORE UPDATE ON public.documentos_assinatura_signatarios FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: documentos_gerados update_documentos_gerados_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documentos_gerados_updated_at BEFORE UPDATE ON public.documentos_gerados FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: profissionais_carimbo update_profissionais_carimbo_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profissionais_carimbo_updated_at BEFORE UPDATE ON public.profissionais_carimbo FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: profissionais_externos update_profissionais_externos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profissionais_externos_updated_at BEFORE UPDATE ON public.profissionais_externos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: prontuario_config update_prontuario_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_prontuario_config_updated_at BEFORE UPDATE ON public.prontuario_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: quotas_externas update_quotas_externas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_quotas_externas_updated_at BEFORE UPDATE ON public.quotas_externas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: whatsapp_templates update_whatsapp_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


--
-- Name: assinatura_eletronica_config assinatura_eletronica_config_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assinatura_eletronica_config
    ADD CONSTRAINT assinatura_eletronica_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: assinatura_eletronica_config assinatura_eletronica_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assinatura_eletronica_config
    ADD CONSTRAINT assinatura_eletronica_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: autentique_fila_envio autentique_fila_envio_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autentique_fila_envio
    ADD CONSTRAINT autentique_fila_envio_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: autentique_fila_envio autentique_fila_envio_documento_assinatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autentique_fila_envio
    ADD CONSTRAINT autentique_fila_envio_documento_assinatura_id_fkey FOREIGN KEY (documento_assinatura_id) REFERENCES public.documentos_assinatura_autentique(id) ON DELETE SET NULL;


--
-- Name: autentique_fila_envio autentique_fila_envio_documento_local_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autentique_fila_envio
    ADD CONSTRAINT autentique_fila_envio_documento_local_id_fkey FOREIGN KEY (documento_local_id) REFERENCES public.documentos_gerados(id) ON DELETE CASCADE;


--
-- Name: documentos_assinatura_autentique documentos_assinatura_autentique_documento_local_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura_autentique
    ADD CONSTRAINT documentos_assinatura_autentique_documento_local_id_fkey FOREIGN KEY (documento_local_id) REFERENCES public.documentos_gerados(id) ON DELETE SET NULL;


--
-- Name: documentos_assinatura_autentique documentos_assinatura_autentique_enviado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura_autentique
    ADD CONSTRAINT documentos_assinatura_autentique_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES auth.users(id);


--
-- Name: documentos_assinatura_signatarios documentos_assinatura_signatarios_documento_assinatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura_signatarios
    ADD CONSTRAINT documentos_assinatura_signatarios_documento_assinatura_id_fkey FOREIGN KEY (documento_assinatura_id) REFERENCES public.documentos_assinatura_autentique(id) ON DELETE CASCADE;


--
-- Name: encaminhamentos_externos encaminhamentos_externos_sistema_integrado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encaminhamentos_externos
    ADD CONSTRAINT encaminhamentos_externos_sistema_integrado_id_fkey FOREIGN KEY (sistema_integrado_id) REFERENCES public.sistemas_integrados(id) ON DELETE SET NULL;


--
-- Name: google_calendar_tokens google_calendar_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: logs_integracao logs_integracao_sistema_integrado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_integracao
    ADD CONSTRAINT logs_integracao_sistema_integrado_id_fkey FOREIGN KEY (sistema_integrado_id) REFERENCES public.sistemas_integrados(id) ON DELETE SET NULL;


--
-- Name: paciente_documentos paciente_documentos_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paciente_documentos
    ADD CONSTRAINT paciente_documentos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: paciente_encaminhamento_anexos paciente_encaminhamento_anexos_encaminhamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paciente_encaminhamento_anexos
    ADD CONSTRAINT paciente_encaminhamento_anexos_encaminhamento_id_fkey FOREIGN KEY (encaminhamento_id) REFERENCES public.paciente_encaminhamentos(id) ON DELETE CASCADE;


--
-- Name: paciente_encaminhamentos paciente_encaminhamentos_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paciente_encaminhamentos
    ADD CONSTRAINT paciente_encaminhamentos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: pacientes pacientes_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: patient_discharges patient_discharges_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_discharges
    ADD CONSTRAINT patient_discharges_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.treatment_cycles(id) ON DELETE CASCADE;


--
-- Name: patient_evaluations patient_evaluations_regulation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_evaluations
    ADD CONSTRAINT patient_evaluations_regulation_id_fkey FOREIGN KEY (regulation_id) REFERENCES public.patient_regulation(id);


--
-- Name: procedimento_profissionais procedimento_profissionais_procedimento_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimento_profissionais
    ADD CONSTRAINT procedimento_profissionais_procedimento_codigo_fkey FOREIGN KEY (procedimento_codigo) REFERENCES public.sigtap_procedimentos(codigo) ON DELETE CASCADE;


--
-- Name: prontuario_procedimentos prontuario_procedimentos_prontuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prontuario_procedimentos
    ADD CONSTRAINT prontuario_procedimentos_prontuario_id_fkey FOREIGN KEY (prontuario_id) REFERENCES public.prontuarios(id) ON DELETE CASCADE;


--
-- Name: pts_cid pts_cid_pts_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts_cid
    ADD CONSTRAINT pts_cid_pts_id_fkey FOREIGN KEY (pts_id) REFERENCES public.pts(id) ON DELETE CASCADE;


--
-- Name: pts_sigtap pts_sigtap_pts_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pts_sigtap
    ADD CONSTRAINT pts_sigtap_pts_id_fkey FOREIGN KEY (pts_id) REFERENCES public.pts(id) ON DELETE CASCADE;


--
-- Name: quotas_externas quotas_externas_profissional_externo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotas_externas
    ADD CONSTRAINT quotas_externas_profissional_externo_id_fkey FOREIGN KEY (profissional_externo_id) REFERENCES public.profissionais_externos(id) ON DELETE CASCADE;


--
-- Name: salas salas_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salas
    ADD CONSTRAINT salas_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id) ON DELETE CASCADE;


--
-- Name: sigtap_procedimento_cids sigtap_procedimento_cids_procedimento_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sigtap_procedimento_cids
    ADD CONSTRAINT sigtap_procedimento_cids_procedimento_codigo_fkey FOREIGN KEY (procedimento_codigo) REFERENCES public.sigtap_procedimentos(codigo) ON DELETE CASCADE;


--
-- Name: treatment_cycles treatment_cycles_pts_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_cycles
    ADD CONSTRAINT treatment_cycles_pts_id_fkey FOREIGN KEY (pts_id) REFERENCES public.pts(id) ON DELETE SET NULL;


--
-- Name: treatment_extensions treatment_extensions_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_extensions
    ADD CONSTRAINT treatment_extensions_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.treatment_cycles(id) ON DELETE CASCADE;


--
-- Name: treatment_sessions treatment_sessions_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_sessions
    ADD CONSTRAINT treatment_sessions_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.treatment_cycles(id) ON DELETE CASCADE;


--
-- Name: documentos_assinatura_signatarios Acesso aos signatários baseado no documento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Acesso aos signatários baseado no documento" ON public.documentos_assinatura_signatarios USING ((EXISTS ( SELECT 1
   FROM public.documentos_assinatura_autentique doc
  WHERE ((doc.id = documentos_assinatura_signatarios.documento_assinatura_id) AND ((doc.enviado_por = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.funcionarios
          WHERE (((funcionarios.id)::text = (auth.uid())::text) AND ((funcionarios.role = 'master'::text) OR (funcionarios.unidade_id = doc.unidade_id))))))))));


--
-- Name: notification_logs Admin read notification_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin read notification_logs" ON public.notification_logs FOR SELECT TO authenticated USING ((public.has_staff_role('master'::text) OR public.has_staff_role('coordenador'::text) OR public.has_staff_role('gestao'::text)));


--
-- Name: logradouros_dne Anyone can read logradouros_dne; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read logradouros_dne" ON public.logradouros_dne FOR SELECT TO authenticated, anon USING (true);


--
-- Name: procedimentos Anyone can read procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read procedimentos" ON public.procedimentos FOR SELECT TO authenticated, anon USING (true);


--
-- Name: salas Anyone can read salas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read salas" ON public.salas FOR SELECT TO authenticated, anon USING (true);


--
-- Name: unidades Anyone can read unidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read unidades" ON public.unidades FOR SELECT TO authenticated, anon USING (true);


--
-- Name: bloqueios Auth users read bloqueios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users read bloqueios" ON public.bloqueios FOR SELECT TO authenticated USING (true);


--
-- Name: permissoes Auth users read permissoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users read permissoes" ON public.permissoes FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: disponibilidades Authenticated read disponibilidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read disponibilidades" ON public.disponibilidades FOR SELECT TO authenticated USING (true);


--
-- Name: paciente_encaminhamento_anexos Enable delete for authenticated users on encaminhamento_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for authenticated users on encaminhamento_anexos" ON public.paciente_encaminhamento_anexos FOR DELETE TO authenticated USING (true);


--
-- Name: paciente_encaminhamento_anexos Enable insert for authenticated users on encaminhamento_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users on encaminhamento_anexos" ON public.paciente_encaminhamento_anexos FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: paciente_encaminhamentos Enable insert for authenticated users on encaminhamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users on encaminhamentos" ON public.paciente_encaminhamentos FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: paciente_encaminhamento_anexos Enable read for authenticated users on encaminhamento_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read for authenticated users on encaminhamento_anexos" ON public.paciente_encaminhamento_anexos FOR SELECT TO authenticated USING (true);


--
-- Name: paciente_encaminhamentos Enable read for authenticated users on encaminhamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read for authenticated users on encaminhamentos" ON public.paciente_encaminhamentos FOR SELECT TO authenticated USING (true);


--
-- Name: paciente_encaminhamentos Enable update for authenticated users on encaminhamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update for authenticated users on encaminhamentos" ON public.paciente_encaminhamentos FOR UPDATE TO authenticated USING (true);


--
-- Name: especialidades_config Especialidades visíveis por todos autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Especialidades visíveis por todos autenticados" ON public.especialidades_config FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: agendamentos External cancel own agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External cancel own agendamentos" ON public.agendamentos FOR UPDATE TO authenticated USING ((public.is_external_professional() AND (criado_por IN ( SELECT (profissionais_externos.id)::text AS id
   FROM public.profissionais_externos
  WHERE (profissionais_externos.auth_user_id = auth.uid()))))) WITH CHECK ((public.is_external_professional() AND (criado_por IN ( SELECT (profissionais_externos.id)::text AS id
   FROM public.profissionais_externos
  WHERE (profissionais_externos.auth_user_id = auth.uid())))));


--
-- Name: agendamentos External insert agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External insert agendamentos" ON public.agendamentos FOR INSERT TO authenticated WITH CHECK ((public.is_external_professional() AND (criado_por IN ( SELECT (profissionais_externos.id)::text AS id
   FROM public.profissionais_externos
  WHERE (profissionais_externos.auth_user_id = auth.uid())))));


--
-- Name: pacientes External insert pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External insert pacientes" ON public.pacientes FOR INSERT TO authenticated WITH CHECK (public.is_external_professional());


--
-- Name: bloqueios External read bloqueios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External read bloqueios" ON public.bloqueios FOR SELECT TO authenticated USING (public.is_external_professional());


--
-- Name: disponibilidades External read disponibilidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External read disponibilidades" ON public.disponibilidades FOR SELECT TO authenticated USING (public.is_external_professional());


--
-- Name: funcionarios External read funcionarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External read funcionarios" ON public.funcionarios FOR SELECT TO authenticated USING (public.is_external_professional());


--
-- Name: agendamentos External read own agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External read own agendamentos" ON public.agendamentos FOR SELECT TO authenticated USING ((public.is_external_professional() AND (criado_por IN ( SELECT (profissionais_externos.id)::text AS id
   FROM public.profissionais_externos
  WHERE (profissionais_externos.auth_user_id = auth.uid())))));


--
-- Name: quotas_externas External read own quotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External read own quotas" ON public.quotas_externas FOR SELECT TO authenticated USING ((profissional_externo_id IN ( SELECT profissionais_externos.id
   FROM public.profissionais_externos
  WHERE (profissionais_externos.auth_user_id = auth.uid()))));


--
-- Name: profissionais_externos External read own record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External read own record" ON public.profissionais_externos FOR SELECT TO authenticated USING ((auth_user_id = auth.uid()));


--
-- Name: pacientes External read pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External read pacientes" ON public.pacientes FOR SELECT TO authenticated USING (public.is_external_professional());


--
-- Name: pacientes External update pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "External update pacientes" ON public.pacientes FOR UPDATE TO authenticated USING (public.is_external_professional()) WITH CHECK (public.is_external_professional());


--
-- Name: assinatura_eletronica_config Gerenciamento de configuração de assinatura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gerenciamento de configuração de assinatura" ON public.assinatura_eletronica_config USING ((EXISTS ( SELECT 1
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND ((funcionarios.role = 'master'::text) OR (funcionarios.cargo ~~* '%administrador%'::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND ((funcionarios.role = 'master'::text) OR (funcionarios.cargo ~~* '%administrador%'::text))))));


--
-- Name: assinatura_eletronica_config Leitura de configuração de assinatura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura de configuração de assinatura" ON public.assinatura_eletronica_config FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND ((funcionarios.role = 'master'::text) OR (funcionarios.cargo ~~* '%administrador%'::text))))) OR (ativo = true)));


--
-- Name: sigtap_procedimentos Master delete custom procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master delete custom procedimentos" ON public.sigtap_procedimentos FOR DELETE TO authenticated USING ((public.has_staff_role('master'::text) AND (origem = 'PERSONALIZADO'::text)));


--
-- Name: medications Master delete medications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master delete medications" ON public.medications FOR DELETE TO authenticated USING (public.has_staff_role('master'::text));


--
-- Name: whatsapp_queue Master delete whatsapp_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master delete whatsapp_queue" ON public.whatsapp_queue FOR DELETE TO authenticated USING (public.has_staff_role('master'::text));


--
-- Name: documentos_assinatura_autentique Master e Profissional editam seus envios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master e Profissional editam seus envios" ON public.documentos_assinatura_autentique FOR UPDATE USING (((enviado_por = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.funcionarios
  WHERE (((funcionarios.id)::text = (auth.uid())::text) AND (funcionarios.role = 'master'::text))))));


--
-- Name: cbo_codigos Master manage cbo_codigos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage cbo_codigos" ON public.cbo_codigos TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: cid10_codigos Master manage cid10_codigos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage cid10_codigos" ON public.cid10_codigos TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: clinica_config Master manage clinica_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage clinica_config" ON public.clinica_config TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: document_templates Master manage document_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage document_templates" ON public.document_templates TO authenticated USING ((public.has_staff_role('master'::text) AND ((unidade_id = ''::text) OR (unidade_id IN ( SELECT COALESCE(f.unidade_id, ''::text) AS "coalesce"
   FROM public.funcionarios f
  WHERE ((f.auth_user_id = auth.uid()) AND (f.ativo = true))))))) WITH CHECK ((public.has_staff_role('master'::text) AND ((unidade_id = ''::text) OR (unidade_id IN ( SELECT COALESCE(f.unidade_id, ''::text) AS "coalesce"
   FROM public.funcionarios f
  WHERE ((f.auth_user_id = auth.uid()) AND (f.ativo = true)))))));


--
-- Name: especialidades Master manage especialidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage especialidades" ON public.especialidades TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: exam_types Master manage exam_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage exam_types" ON public.exam_types TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: form_templates Master manage form_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage form_templates" ON public.form_templates TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: horarios_funcionamento Master manage horarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage horarios" ON public.horarios_funcionamento TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: logradouros_dne Master manage logradouros_dne; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage logradouros_dne" ON public.logradouros_dne TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: medications Master manage medications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage medications" ON public.medications TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: permissoes_usuario Master manage permissoes_usuario; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage permissoes_usuario" ON public.permissoes_usuario TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: sigtap_procedimento_cids Master manage sigtap_procedimento_cids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage sigtap_procedimento_cids" ON public.sigtap_procedimento_cids TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: sistemas_integrados Master manage sistemas_integrados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage sistemas_integrados" ON public.sistemas_integrados TO authenticated USING ((public.has_staff_role('master'::text) OR public.has_staff_role('gestao'::text))) WITH CHECK ((public.has_staff_role('master'::text) OR public.has_staff_role('gestao'::text)));


--
-- Name: whatsapp_config Master manage whatsapp_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage whatsapp_config" ON public.whatsapp_config TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: whatsapp_event_config Master manage whatsapp_event_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage whatsapp_event_config" ON public.whatsapp_event_config TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: whatsapp_templates Master manage whatsapp_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manage whatsapp_templates" ON public.whatsapp_templates TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: permissoes Master manages permissoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manages permissoes" ON public.permissoes TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: system_config Master manages system config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master manages system config" ON public.system_config TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: sigtap_procedimentos Master or sync insert procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master or sync insert procedimentos" ON public.sigtap_procedimentos FOR INSERT TO authenticated WITH CHECK ((public.has_staff_role('master'::text) OR ((origem = 'SIGTAP'::text) AND public.is_staff_member())));


--
-- Name: sigtap_procedimentos Master or sync update procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master or sync update procedimentos" ON public.sigtap_procedimentos FOR UPDATE TO authenticated USING ((public.has_staff_role('master'::text) OR ((origem = 'SIGTAP'::text) AND public.is_staff_member()))) WITH CHECK ((public.has_staff_role('master'::text) OR ((origem = 'SIGTAP'::text) AND public.is_staff_member())));


--
-- Name: action_logs Master read action logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master read action logs" ON public.action_logs FOR SELECT TO authenticated USING ((public.has_staff_role('master'::text) OR public.has_staff_role('coordenador'::text) OR public.has_staff_role('gestao'::text)));


--
-- Name: logs_integracao Master read logs_integracao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Master read logs_integracao" ON public.logs_integracao FOR SELECT TO authenticated USING ((public.has_staff_role('master'::text) OR public.has_staff_role('gestao'::text) OR public.has_staff_role('coordenador'::text)));


--
-- Name: autentique_webhook_logs Masters podem ver logs de webhook; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Masters podem ver logs de webhook" ON public.autentique_webhook_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND (funcionarios.role = 'master'::text)))));


--
-- Name: documentos_assinatura_autentique Masters vêm todos os documentos da unidade; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Masters vêm todos os documentos da unidade" ON public.documentos_assinatura_autentique FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND (funcionarios.role = 'master'::text)))));


--
-- Name: clinica_config Only master read clinica_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only master read clinica_config" ON public.clinica_config FOR SELECT TO authenticated USING (public.has_staff_role('master'::text));


--
-- Name: agendamentos Pacientes cancel own agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pacientes cancel own agendamentos" ON public.agendamentos FOR UPDATE TO authenticated USING ((paciente_id IN ( SELECT pacientes.id
   FROM public.pacientes
  WHERE (pacientes.auth_user_id = auth.uid())))) WITH CHECK (((paciente_id IN ( SELECT pacientes.id
   FROM public.pacientes
  WHERE (pacientes.auth_user_id = auth.uid()))) AND (status = 'cancelado'::text)));


--
-- Name: agendamentos Pacientes read own agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pacientes read own agendamentos" ON public.agendamentos FOR SELECT TO authenticated USING ((paciente_id IN ( SELECT pacientes.id
   FROM public.pacientes
  WHERE (pacientes.auth_user_id = auth.uid()))));


--
-- Name: pacientes Pacientes read own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pacientes read own data" ON public.pacientes FOR SELECT TO authenticated USING ((auth_user_id = auth.uid()));


--
-- Name: fila_espera Pacientes read own fila; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pacientes read own fila" ON public.fila_espera FOR SELECT TO authenticated USING ((paciente_id IN ( SELECT pacientes.id
   FROM public.pacientes
  WHERE (pacientes.auth_user_id = auth.uid()))));


--
-- Name: prontuarios Pacientes read own prontuarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pacientes read own prontuarios" ON public.prontuarios FOR SELECT TO authenticated USING ((paciente_id IN ( SELECT pacientes.id
   FROM public.pacientes
  WHERE (pacientes.auth_user_id = auth.uid()))));


--
-- Name: prontuario_procedimentos Permitir acesso total para autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir acesso total para autenticados" ON public.prontuario_procedimentos USING ((auth.role() = 'authenticated'::text));


--
-- Name: document_templates Professional manage own document_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Professional manage own document_templates" ON public.document_templates TO authenticated USING ((public.is_staff_member() AND (criado_por IN ( SELECT (f.id)::text AS id
   FROM public.funcionarios f
  WHERE ((f.auth_user_id = auth.uid()) AND (f.ativo = true)))))) WITH CHECK ((public.is_staff_member() AND (criado_por IN ( SELECT (f.id)::text AS id
   FROM public.funcionarios f
  WHERE ((f.auth_user_id = auth.uid()) AND (f.ativo = true))))));


--
-- Name: form_templates Professional manage own form_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Professional manage own form_templates" ON public.form_templates TO authenticated USING ((public.is_staff_member() AND (profissional_id <> ''::text) AND (profissional_id IN ( SELECT (f.id)::text AS id
   FROM public.funcionarios f
  WHERE ((f.auth_user_id = auth.uid()) AND (f.ativo = true)))))) WITH CHECK ((public.is_staff_member() AND (profissional_id <> ''::text) AND (profissional_id IN ( SELECT (f.id)::text AS id
   FROM public.funcionarios f
  WHERE ((f.auth_user_id = auth.uid()) AND (f.ativo = true))))));


--
-- Name: prontuario_procedimentos Profissionais podem gerenciar procedimentos de seus prontuário; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profissionais podem gerenciar procedimentos de seus prontuário" ON public.prontuario_procedimentos TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.prontuarios p
  WHERE ((p.id = prontuario_procedimentos.prontuario_id) AND (p.profissional_id = (auth.uid())::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.prontuarios p
  WHERE ((p.id = prontuario_procedimentos.prontuario_id) AND (p.profissional_id = (auth.uid())::text)))));


--
-- Name: documentos_assinatura_autentique Profissionais vêm seus próprios documentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profissionais vêm seus próprios documentos" ON public.documentos_assinatura_autentique FOR SELECT USING ((profissional_id = ( SELECT (funcionarios.id)::text AS id
   FROM public.funcionarios
  WHERE (funcionarios.auth_user_id = auth.uid()))));


--
-- Name: paciente_documentos Staff can delete patient documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can delete patient documents" ON public.paciente_documentos FOR DELETE USING ((public.is_staff_member() OR public.is_external_professional()));


--
-- Name: paciente_documentos Staff can insert patient documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can insert patient documents" ON public.paciente_documentos FOR INSERT WITH CHECK ((public.is_staff_member() OR public.is_external_professional()));


--
-- Name: paciente_documentos Staff can update their unit documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update their unit documents" ON public.paciente_documentos FOR UPDATE USING ((public.is_staff_member() OR public.is_external_professional()));


--
-- Name: paciente_documentos Staff can view patient documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view patient documents" ON public.paciente_documentos FOR SELECT USING ((public.is_staff_member() OR public.is_external_professional()));


--
-- Name: agendamentos Staff delete agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete agendamentos" ON public.agendamentos FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: atendimentos Staff delete atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete atendimentos" ON public.atendimentos FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: disponibilidades Staff delete disponibilidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete disponibilidades" ON public.disponibilidades FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: encaminhamentos_anexos Staff delete encaminhamentos_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete encaminhamentos_anexos" ON public.encaminhamentos_anexos FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: fila_espera Staff delete fila; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete fila" ON public.fila_espera FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: soap_custom_options Staff delete own soap options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete own soap options" ON public.soap_custom_options FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: pacientes Staff delete pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete pacientes" ON public.pacientes FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: prontuario_anexos Staff delete prontuario_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete prontuario_anexos" ON public.prontuario_anexos FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: prontuarios Staff delete prontuarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete prontuarios" ON public.prontuarios FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: prontuario_resultados_exames Staff delete resultados_exames; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete resultados_exames" ON public.prontuario_resultados_exames FOR DELETE TO authenticated USING (public.is_staff_member());


--
-- Name: action_logs Staff insert action logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert action logs" ON public.action_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: agendamentos Staff insert agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert agendamentos" ON public.agendamentos FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: atendimentos Staff insert atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert atendimentos" ON public.atendimentos FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: disponibilidades Staff insert disponibilidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert disponibilidades" ON public.disponibilidades FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: documentos_gerados Staff insert documentos_gerados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert documentos_gerados" ON public.documentos_gerados FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: encaminhamentos_anexos Staff insert encaminhamentos_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert encaminhamentos_anexos" ON public.encaminhamentos_anexos FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: encaminhamentos_externos Staff insert encaminhamentos_externos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert encaminhamentos_externos" ON public.encaminhamentos_externos FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: exam_types Staff insert exam_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert exam_types" ON public.exam_types FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: fila_espera Staff insert fila; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert fila" ON public.fila_espera FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: logs_integracao Staff insert logs_integracao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert logs_integracao" ON public.logs_integracao FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: medications Staff insert medications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert medications" ON public.medications FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: notification_logs Staff insert notification_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert notification_logs" ON public.notification_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: soap_custom_options Staff insert own soap options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert own soap options" ON public.soap_custom_options FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: pacientes Staff insert pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert pacientes" ON public.pacientes FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: prontuario_anexos Staff insert prontuario_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert prontuario_anexos" ON public.prontuario_anexos FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: prontuarios Staff insert prontuarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert prontuarios" ON public.prontuarios FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: pts_import_log Staff insert pts_import_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert pts_import_log" ON public.pts_import_log FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: prontuario_resultados_exames Staff insert resultados_exames; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert resultados_exames" ON public.prontuario_resultados_exames FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: triage_records Staff insert triage_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert triage_records" ON public.triage_records FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: whatsapp_consents Staff insert whatsapp_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert whatsapp_consents" ON public.whatsapp_consents FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: whatsapp_queue Staff insert whatsapp_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff insert whatsapp_queue" ON public.whatsapp_queue FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());


--
-- Name: bloqueios Staff manage bloqueios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage bloqueios" ON public.bloqueios TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: episodios_clinicos Staff manage episodios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage episodios" ON public.episodios_clinicos TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: multiprofessional_evaluations Staff manage multiprofessional_evaluations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage multiprofessional_evaluations" ON public.multiprofessional_evaluations TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: nursing_evaluations Staff manage nursing_evaluations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage nursing_evaluations" ON public.nursing_evaluations TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: profissionais_carimbo Staff manage own carimbo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage own carimbo" ON public.profissionais_carimbo TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: professional_preferences Staff manage own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage own preferences" ON public.professional_preferences TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: patient_discharges Staff manage patient_discharges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage patient_discharges" ON public.patient_discharges TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: patient_evaluations Staff manage patient_evaluations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage patient_evaluations" ON public.patient_evaluations TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: patient_regulation Staff manage patient_regulation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage patient_regulation" ON public.patient_regulation TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: procedimento_profissionais Staff manage procedimento_profissionais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage procedimento_profissionais" ON public.procedimento_profissionais TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: procedimentos Staff manage procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage procedimentos" ON public.procedimentos TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: profissionais_externos Staff manage profissionais_externos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage profissionais_externos" ON public.profissionais_externos TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: prontuario_procedimentos Staff manage prontuario_procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage prontuario_procedimentos" ON public.prontuario_procedimentos TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: pts Staff manage pts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage pts" ON public.pts TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: pts_cid Staff manage pts_cid; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage pts_cid" ON public.pts_cid TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: pts_sigtap Staff manage pts_sigtap; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage pts_sigtap" ON public.pts_sigtap TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: quotas_externas Staff manage quotas_externas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage quotas_externas" ON public.quotas_externas TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: salas Staff manage salas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage salas" ON public.salas TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: treatment_cycles Staff manage treatment_cycles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage treatment_cycles" ON public.treatment_cycles TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: treatment_extensions Staff manage treatment_extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage treatment_extensions" ON public.treatment_extensions TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: treatment_sessions Staff manage treatment_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage treatment_sessions" ON public.treatment_sessions TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: triage_settings Staff manage triage_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage triage_settings" ON public.triage_settings TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: unidades Staff manage unidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage unidades" ON public.unidades TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: agendamentos Staff read agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read agendamentos" ON public.agendamentos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: atendimentos Staff read atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read atendimentos" ON public.atendimentos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: profissionais_carimbo Staff read carimbos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read carimbos" ON public.profissionais_carimbo FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: cbo_codigos Staff read cbo_codigos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read cbo_codigos" ON public.cbo_codigos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: cid10_codigos Staff read cid10_codigos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read cid10_codigos" ON public.cid10_codigos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: document_templates Staff read document_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read document_templates" ON public.document_templates FOR SELECT TO authenticated USING ((public.is_staff_member() AND ((tipo_modelo = 'GLOBAL'::text) OR (unidade_id = ''::text) OR (unidade_id IN ( SELECT COALESCE(f.unidade_id, ''::text) AS "coalesce"
   FROM public.funcionarios f
  WHERE ((f.auth_user_id = auth.uid()) AND (f.ativo = true)))) OR (criado_por IN ( SELECT (f.id)::text AS id
   FROM public.funcionarios f
  WHERE ((f.auth_user_id = auth.uid()) AND (f.ativo = true)))))));


--
-- Name: documentos_gerados Staff read documentos_gerados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read documentos_gerados" ON public.documentos_gerados FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: encaminhamentos_anexos Staff read encaminhamentos_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read encaminhamentos_anexos" ON public.encaminhamentos_anexos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: encaminhamentos_externos Staff read encaminhamentos_externos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read encaminhamentos_externos" ON public.encaminhamentos_externos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: episodios_clinicos Staff read episodios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read episodios" ON public.episodios_clinicos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: especialidades Staff read especialidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read especialidades" ON public.especialidades FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: exam_types Staff read exam_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read exam_types" ON public.exam_types FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: fila_espera Staff read fila; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read fila" ON public.fila_espera FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: form_templates Staff read form_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read form_templates" ON public.form_templates FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: funcionarios Staff read funcionarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read funcionarios" ON public.funcionarios FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: horarios_funcionamento Staff read horarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read horarios" ON public.horarios_funcionamento FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: medications Staff read medications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read medications" ON public.medications FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: multiprofessional_evaluations Staff read multiprofessional_evaluations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read multiprofessional_evaluations" ON public.multiprofessional_evaluations FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: nursing_evaluations Staff read nursing_evaluations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read nursing_evaluations" ON public.nursing_evaluations FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: professional_preferences Staff read own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read own preferences" ON public.professional_preferences FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: soap_custom_options Staff read own soap options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read own soap options" ON public.soap_custom_options FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: pacientes Staff read pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read pacientes" ON public.pacientes FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: patient_discharges Staff read patient_discharges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read patient_discharges" ON public.patient_discharges FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: patient_evaluations Staff read patient_evaluations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read patient_evaluations" ON public.patient_evaluations FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: patient_regulation Staff read patient_regulation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read patient_regulation" ON public.patient_regulation FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: permissoes_usuario Staff read permissoes_usuario; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read permissoes_usuario" ON public.permissoes_usuario FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: procedimento_profissionais Staff read procedimento_profissionais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read procedimento_profissionais" ON public.procedimento_profissionais FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: prontuario_anexos Staff read prontuario_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read prontuario_anexos" ON public.prontuario_anexos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: prontuario_procedimentos Staff read prontuario_procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read prontuario_procedimentos" ON public.prontuario_procedimentos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: prontuarios Staff read prontuarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read prontuarios" ON public.prontuarios FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: pts Staff read pts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read pts" ON public.pts FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: pts_cid Staff read pts_cid; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read pts_cid" ON public.pts_cid FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: pts_import_log Staff read pts_import_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read pts_import_log" ON public.pts_import_log FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: pts_sigtap Staff read pts_sigtap; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read pts_sigtap" ON public.pts_sigtap FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: prontuario_resultados_exames Staff read resultados_exames; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read resultados_exames" ON public.prontuario_resultados_exames FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: sigtap_procedimento_cids Staff read sigtap_procedimento_cids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read sigtap_procedimento_cids" ON public.sigtap_procedimento_cids FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: sigtap_procedimentos Staff read sigtap_procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read sigtap_procedimentos" ON public.sigtap_procedimentos FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: sistemas_integrados Staff read sistemas_integrados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read sistemas_integrados" ON public.sistemas_integrados FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: system_config Staff read system config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read system config" ON public.system_config FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: treatment_cycles Staff read treatment_cycles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read treatment_cycles" ON public.treatment_cycles FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: treatment_extensions Staff read treatment_extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read treatment_extensions" ON public.treatment_extensions FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: treatment_sessions Staff read treatment_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read treatment_sessions" ON public.treatment_sessions FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: triage_records Staff read triage_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read triage_records" ON public.triage_records FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: triage_settings Staff read triage_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read triage_settings" ON public.triage_settings FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: whatsapp_config Staff read whatsapp_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read whatsapp_config" ON public.whatsapp_config FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: whatsapp_consents Staff read whatsapp_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read whatsapp_consents" ON public.whatsapp_consents FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: whatsapp_event_config Staff read whatsapp_event_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read whatsapp_event_config" ON public.whatsapp_event_config FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: whatsapp_queue Staff read whatsapp_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read whatsapp_queue" ON public.whatsapp_queue FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: whatsapp_templates Staff read whatsapp_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read whatsapp_templates" ON public.whatsapp_templates FOR SELECT TO authenticated USING (public.is_staff_member());


--
-- Name: agendamentos Staff update agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update agendamentos" ON public.agendamentos FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: atendimentos Staff update atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update atendimentos" ON public.atendimentos FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: disponibilidades Staff update disponibilidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update disponibilidades" ON public.disponibilidades FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: documentos_gerados Staff update documentos_gerados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update documentos_gerados" ON public.documentos_gerados FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: encaminhamentos_anexos Staff update encaminhamentos_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update encaminhamentos_anexos" ON public.encaminhamentos_anexos FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: encaminhamentos_externos Staff update encaminhamentos_externos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update encaminhamentos_externos" ON public.encaminhamentos_externos FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: exam_types Staff update exam_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update exam_types" ON public.exam_types FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: fila_espera Staff update fila; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update fila" ON public.fila_espera FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: soap_custom_options Staff update own soap options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update own soap options" ON public.soap_custom_options FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: pacientes Staff update pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update pacientes" ON public.pacientes FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: prontuario_anexos Staff update prontuario_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update prontuario_anexos" ON public.prontuario_anexos FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: prontuarios Staff update prontuarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update prontuarios" ON public.prontuarios FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: prontuario_resultados_exames Staff update resultados_exames; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update resultados_exames" ON public.prontuario_resultados_exames FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: triage_records Staff update triage_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update triage_records" ON public.triage_records FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: whatsapp_queue Staff update whatsapp_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update whatsapp_queue" ON public.whatsapp_queue FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());


--
-- Name: google_calendar_tokens Users manage own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own tokens" ON public.google_calendar_tokens TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: google_calendar_tokens Users read own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own tokens" ON public.google_calendar_tokens FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: especialidades_config Usuários autenticados podem inserir especialidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuários autenticados podem inserir especialidades" ON public.especialidades_config FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: action_logs Usuários autenticados podem inserir logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuários autenticados podem inserir logs" ON public.action_logs FOR INSERT TO authenticated WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: documentos_assinatura_autentique Usuários criam seus envios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuários criam seus envios" ON public.documentos_assinatura_autentique FOR INSERT WITH CHECK ((enviado_por = auth.uid()));


--
-- Name: documentos_assinatura_autentique Usuários veem seus próprios envios ou de sua unidade; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuários veem seus próprios envios ou de sua unidade" ON public.documentos_assinatura_autentique FOR SELECT USING (((enviado_por = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.funcionarios
  WHERE (((funcionarios.id)::text = (auth.uid())::text) AND ((funcionarios.role = 'master'::text) OR (funcionarios.unidade_id = documentos_assinatura_autentique.unidade_id)))))));


--
-- Name: action_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: agendamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: assinatura_eletronica_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assinatura_eletronica_config ENABLE ROW LEVEL SECURITY;

--
-- Name: atendimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: autentique_fila_envio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.autentique_fila_envio ENABLE ROW LEVEL SECURITY;

--
-- Name: autentique_webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.autentique_webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: bloqueios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;

--
-- Name: cbo_codigos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbo_codigos ENABLE ROW LEVEL SECURITY;

--
-- Name: cid10_codigos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cid10_codigos ENABLE ROW LEVEL SECURITY;

--
-- Name: clinica_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinica_config ENABLE ROW LEVEL SECURITY;

--
-- Name: disponibilidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disponibilidades ENABLE ROW LEVEL SECURITY;

--
-- Name: document_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: documentos_assinatura_autentique; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documentos_assinatura_autentique ENABLE ROW LEVEL SECURITY;

--
-- Name: documentos_assinatura_signatarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documentos_assinatura_signatarios ENABLE ROW LEVEL SECURITY;

--
-- Name: documentos_gerados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documentos_gerados ENABLE ROW LEVEL SECURITY;

--
-- Name: encaminhamentos_anexos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.encaminhamentos_anexos ENABLE ROW LEVEL SECURITY;

--
-- Name: encaminhamentos_externos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.encaminhamentos_externos ENABLE ROW LEVEL SECURITY;

--
-- Name: episodios_clinicos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.episodios_clinicos ENABLE ROW LEVEL SECURITY;

--
-- Name: especialidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;

--
-- Name: especialidades_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.especialidades_config ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_types ENABLE ROW LEVEL SECURITY;

--
-- Name: fila_espera; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fila_espera ENABLE ROW LEVEL SECURITY;

--
-- Name: form_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: funcionarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

--
-- Name: google_calendar_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: horarios_funcionamento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.horarios_funcionamento ENABLE ROW LEVEL SECURITY;

--
-- Name: logradouros_dne; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logradouros_dne ENABLE ROW LEVEL SECURITY;

--
-- Name: logs_integracao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logs_integracao ENABLE ROW LEVEL SECURITY;

--
-- Name: system_config master_upsert_system_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY master_upsert_system_config ON public.system_config TO authenticated USING (public.has_staff_role('master'::text)) WITH CHECK (public.has_staff_role('master'::text));


--
-- Name: medications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

--
-- Name: multiprofessional_evaluations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.multiprofessional_evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: nursing_evaluations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nursing_evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: paciente_documentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paciente_documentos ENABLE ROW LEVEL SECURITY;

--
-- Name: paciente_encaminhamento_anexos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paciente_encaminhamento_anexos ENABLE ROW LEVEL SECURITY;

--
-- Name: paciente_encaminhamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paciente_encaminhamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: pacientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_discharges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_discharges ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_evaluations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_regulation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_regulation ENABLE ROW LEVEL SECURITY;

--
-- Name: permissoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;

--
-- Name: permissoes_usuario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permissoes_usuario ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimento_profissionais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.procedimento_profissionais ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professional_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: profissionais_carimbo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profissionais_carimbo ENABLE ROW LEVEL SECURITY;

--
-- Name: profissionais_externos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profissionais_externos ENABLE ROW LEVEL SECURITY;

--
-- Name: prontuario_config profissional_delete_own_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profissional_delete_own_config ON public.prontuario_config FOR DELETE TO authenticated USING ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND (funcionarios.ativo = true)))));


--
-- Name: prontuario_config profissional_insert_own_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profissional_insert_own_config ON public.prontuario_config FOR INSERT TO authenticated WITH CHECK ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND (funcionarios.ativo = true)))));


--
-- Name: prontuario_config profissional_read_own_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profissional_read_own_config ON public.prontuario_config FOR SELECT TO authenticated USING (((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND (funcionarios.ativo = true)))) OR public.has_staff_role('master'::text)));


--
-- Name: prontuario_config profissional_update_own_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profissional_update_own_config ON public.prontuario_config FOR UPDATE TO authenticated USING ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND (funcionarios.ativo = true))))) WITH CHECK ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM public.funcionarios
  WHERE ((funcionarios.auth_user_id = auth.uid()) AND (funcionarios.ativo = true)))));


--
-- Name: prontuario_anexos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prontuario_anexos ENABLE ROW LEVEL SECURITY;

--
-- Name: prontuario_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prontuario_config ENABLE ROW LEVEL SECURITY;

--
-- Name: prontuario_procedimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prontuario_procedimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: prontuario_resultados_exames; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prontuario_resultados_exames ENABLE ROW LEVEL SECURITY;

--
-- Name: prontuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prontuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: pts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pts ENABLE ROW LEVEL SECURITY;

--
-- Name: pts_cid; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pts_cid ENABLE ROW LEVEL SECURITY;

--
-- Name: pts_import_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pts_import_log ENABLE ROW LEVEL SECURITY;

--
-- Name: pts_sigtap; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pts_sigtap ENABLE ROW LEVEL SECURITY;

--
-- Name: quotas_externas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotas_externas ENABLE ROW LEVEL SECURITY;

--
-- Name: salas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.salas ENABLE ROW LEVEL SECURITY;

--
-- Name: sigtap_procedimento_cids; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sigtap_procedimento_cids ENABLE ROW LEVEL SECURITY;

--
-- Name: sigtap_procedimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sigtap_procedimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: sistemas_integrados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sistemas_integrados ENABLE ROW LEVEL SECURITY;

--
-- Name: soap_custom_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.soap_custom_options ENABLE ROW LEVEL SECURITY;

--
-- Name: system_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_cycles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_cycles ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_extensions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_extensions ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: triage_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.triage_records ENABLE ROW LEVEL SECURITY;

--
-- Name: triage_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.triage_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: unidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_event_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_event_config ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 3XibX7E60brHk6eQpsxTVGVpIWLJ07j0ehj5VaJBvxkt57Z79ilbKP6mWE4R3VD

