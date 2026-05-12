-- PARTE 1 — EXTENSIONS E TIPOS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "moddatetime";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'paciente_encaminhamento_status' AND n.nspname = 'public') THEN CREATE TYPE paciente_encaminhamento_status AS ENUM ('pendente', 'realizado', 'cancelado'); END IF; END $$;



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




--
-- PostgreSQL database dump
--

\restrict lzRIwoHM5QbmOwjTJUc9n4o1YTKE4eTNu6c1e4vQb8RON8i9QPtgOCsJqtFGis2

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
-- Data for Name: action_logs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.action_logs VALUES ('9c838455-c3d2-4a94-a517-6d921623ee42', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-04-23 14:34:08.070758+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('5e2e4898-18ce-4e2c-a8b0-f422ae3bd481', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-04-23 15:16:49.360214+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('a4c237c0-060c-4f12-bdd4-59f6c68205e0', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-04-23 17:46:48.494963+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('900c7d44-82d2-4a04-857c-2aeead93f19f', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_SISTEMA', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_sistema": {"backup": {"autoBackup": false, "agendamento": "semanal", "ultimoBackup": null}, "aparencia": {"tema": "sistema", "fonte": "Inter", "corPrimaria": "#1B3A5C", "tamanhoFonte": "medio"}, "instituicao": {"cer": "CAPS II", "cnpj": "", "nome": "Secretaria Municipal de Saúde de Oriximiná", "email": "", "logoUrl": "", "endereco": "", "telefone": ""}, "conformidade": {"lgpdTexto": "Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.", "retencaoDados": 20, "anonimizarApos": 25, "exibirAvisoLgpd": true}, "notificacoes": {"canal": "ambos", "resumoDiario": false, "alertarFimCiclo": true, "alertarPtsVencer": true, "notificarChegada": true, "relatorioSemanal": false, "notificarTriagemPendente": true}}}}', '2026-04-23 20:26:28.196646+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('71303734-5868-49e4-8a09-e1d8dc90ae1d', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_SISTEMA', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_sistema": {"backup": {"autoBackup": false, "agendamento": "semanal", "ultimoBackup": null}, "aparencia": {"tema": "escuro", "fonte": "Inter", "corPrimaria": "#1B3A5C", "tamanhoFonte": "medio"}, "instituicao": {"cer": "CAPS II", "cnpj": "", "nome": "Secretaria Municipal de Saúde de Oriximiná", "email": "", "logoUrl": "", "endereco": "", "telefone": ""}, "conformidade": {"lgpdTexto": "Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.", "retencaoDados": 20, "anonimizarApos": 25, "exibirAvisoLgpd": true}, "notificacoes": {"canal": "ambos", "resumoDiario": false, "alertarFimCiclo": true, "alertarPtsVencer": true, "notificarChegada": true, "relatorioSemanal": false, "notificarTriagemPendente": true}}}, "old_value": {"config_sistema": {"backup": {"autoBackup": false, "agendamento": "semanal", "ultimoBackup": null}, "aparencia": {"tema": "sistema", "fonte": "Inter", "corPrimaria": "#1B3A5C", "tamanhoFonte": "medio"}, "instituicao": {"cer": "CAPS II", "cnpj": "", "nome": "Secretaria Municipal de Saúde de Oriximiná", "email": "", "logoUrl": "", "endereco": "", "telefone": ""}, "conformidade": {"lgpdTexto": "Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.", "retencaoDados": 20, "anonimizarApos": 25, "exibirAvisoLgpd": true}, "notificacoes": {"canal": "ambos", "resumoDiario": false, "alertarFimCiclo": true, "alertarPtsVencer": true, "notificarChegada": true, "relatorioSemanal": false, "notificarTriagemPendente": true}}}}', '2026-04-23 20:26:42.594669+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('0f846227-db4e-4244-bb52-af7437db853d', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_SISTEMA', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_sistema": {"backup": {"autoBackup": false, "agendamento": "semanal", "ultimoBackup": null}, "aparencia": {"tema": "escuro", "fonte": "Inter", "corPrimaria": "#2A6F97", "tamanhoFonte": "medio"}, "instituicao": {"cer": "CAPS II", "cnpj": "", "nome": "Secretaria Municipal de Saúde de Oriximiná", "email": "", "logoUrl": "", "endereco": "", "telefone": ""}, "conformidade": {"lgpdTexto": "Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.", "retencaoDados": 20, "anonimizarApos": 25, "exibirAvisoLgpd": true}, "notificacoes": {"canal": "ambos", "resumoDiario": false, "alertarFimCiclo": true, "alertarPtsVencer": true, "notificarChegada": true, "relatorioSemanal": false, "notificarTriagemPendente": true}}}, "old_value": {"config_sistema": {"backup": {"autoBackup": false, "agendamento": "semanal", "ultimoBackup": null}, "aparencia": {"tema": "escuro", "fonte": "Inter", "corPrimaria": "#1B3A5C", "tamanhoFonte": "medio"}, "instituicao": {"cer": "CAPS II", "cnpj": "", "nome": "Secretaria Municipal de Saúde de Oriximiná", "email": "", "logoUrl": "", "endereco": "", "telefone": ""}, "conformidade": {"lgpdTexto": "Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.", "retencaoDados": 20, "anonimizarApos": 25, "exibirAvisoLgpd": true}, "notificacoes": {"canal": "ambos", "resumoDiario": false, "alertarFimCiclo": true, "alertarPtsVencer": true, "notificarChegada": true, "relatorioSemanal": false, "notificarTriagemPendente": true}}}}', '2026-04-23 20:26:51.861656+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('2ac6f72e-adcf-4620-9d20-8d4aa5ac01a1', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Linux", "usuario_cpf": ""}', '2026-04-26 21:40:48.232603+00', 'auth', 'sucesso', '', '179.60.168.17');
INSERT INTO public.action_logs VALUES ('1b55aecb-4341-45e7-8ef5-0c737f51e327', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Linux", "usuario_cpf": ""}', '2026-04-27 23:31:27.350019+00', 'auth', 'sucesso', '', '148.227.79.203');
INSERT INTO public.action_logs VALUES ('cc8c6323-e24b-40b5-9ec2-aa2acb417213', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'IMPORTAR_BASE_RENAME', 'medications', '', '{"device": "Chrome / Linux", "inseridos": 84, "total_base": 84, "ignorados_duplicados": 0}', '2026-04-29 03:02:04.90107+00', 'configuracoes', 'sucesso', '', '148.227.79.188');
INSERT INTO public.action_logs VALUES ('bc81011b-ff67-40a3-838a-4b46a3b6f24b', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'IMPORTAR_BASE_EXAMES', 'exam_types', '', '{"device": "Chrome / Linux", "inseridos": 94, "total_base": 94, "ignorados_duplicados": 0}', '2026-04-29 03:02:33.716311+00', 'configuracoes', 'sucesso', '', '148.227.79.188');
INSERT INTO public.action_logs VALUES ('c900f4b8-c812-4bfc-81c4-dee694b53d0d', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-04-29 14:35:44.855472+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('a6fe6084-172a-4c36-bf48-c5766d58a57d', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-04-29 14:37:07.983432+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('85fd8647-ec15-4d68-9eab-a4011fb915fc', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-05-03 23:37:56.263432+00', 'auth', 'sucesso', '', '170.203.197.143');
INSERT INTO public.action_logs VALUES ('94608351-0777-4a75-a27e-75ca4eb18f7f', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-05-04 19:09:33.036966+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('71a7371e-da50-46dd-a254-761def74e758', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-05-04 19:21:25.860899+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('b9083e16-9f23-4ad3-be10-09528055aaa9', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_SISTEMA', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_sistema": {"backup": {"autoBackup": false, "agendamento": "semanal", "ultimoBackup": null}, "aparencia": {"tema": "escuro", "fonte": "Inter", "corPrimaria": "#2A6F97", "tamanhoFonte": "medio"}, "instituicao": {"cer": "CAPS II", "cnpj": "", "nome": "Secretaria Municipal de Saúde de Oriximiná", "email": "", "logoUrl": "", "endereco": "", "telefone": ""}, "conformidade": {"lgpdTexto": "Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.", "retencaoDados": 20, "anonimizarApos": 25, "exibirAvisoLgpd": true}, "notificacoes": {"canal": "ambos", "resumoDiario": false, "alertarFimCiclo": true, "alertarPtsVencer": true, "notificarChegada": true, "relatorioSemanal": true, "notificarTriagemPendente": true}}}, "old_value": {"config_sistema": {"backup": {"autoBackup": false, "agendamento": "semanal", "ultimoBackup": null}, "aparencia": {"tema": "escuro", "fonte": "Inter", "corPrimaria": "#2A6F97", "tamanhoFonte": "medio"}, "instituicao": {"cer": "CAPS II", "cnpj": "", "nome": "Secretaria Municipal de Saúde de Oriximiná", "email": "", "logoUrl": "", "endereco": "", "telefone": ""}, "conformidade": {"lgpdTexto": "Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.", "retencaoDados": 20, "anonimizarApos": 25, "exibirAvisoLgpd": true}, "notificacoes": {"canal": "ambos", "resumoDiario": false, "alertarFimCiclo": true, "alertarPtsVencer": true, "notificarChegada": true, "relatorioSemanal": false, "notificarTriagemPendente": true}}}}', '2026-05-04 19:23:14.770871+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('bdc9b455-76ca-4059-8f75-9a59cff17244', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_PRESCRICAO', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_prescricao_perfil": {"medicina": true, "psicologia": true, "odontologia": true, "fisioterapia": true, "fonoaudiologia": true}}, "old_value": {"config_prescricao_perfil": {"medicina": true, "psicologia": true, "odontologia": true, "fisioterapia": true}}}', '2026-05-05 13:29:54.715345+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('4613a388-73a2-4a2e-b7b4-67ee486f2807', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_PRESCRICAO', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_prescricao_perfil": {"medicina": true, "nutricao": true, "psicologia": true, "odontologia": true, "fisioterapia": true, "fonoaudiologia": true}}, "old_value": {"config_prescricao_perfil": {"medicina": true, "psicologia": true, "odontologia": true, "fisioterapia": true, "fonoaudiologia": true}}}', '2026-05-05 13:29:58.792199+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('458d7559-afbf-44be-b79d-bd4c5a0aac0a', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_PRESCRICAO', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_prescricao_perfil": {"medicina": true, "nutricao": true, "enfermagem": true, "psicologia": true, "odontologia": true, "fisioterapia": true, "fonoaudiologia": true}}, "old_value": {"config_prescricao_perfil": {"medicina": true, "nutricao": true, "psicologia": true, "odontologia": true, "fisioterapia": true, "fonoaudiologia": true}}}', '2026-05-05 13:30:02.790901+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('1b6f2e7d-f4a6-47bf-bd2c-25ff0c266c36', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-05-05 14:40:35.126351+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('65800f59-2e1c-4a55-a490-1d5477fa4dd5', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'logout', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-05-05 19:51:14.022862+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('de709297-1df9-4872-b259-5afd4882cc7a', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Linux", "usuario_cpf": ""}', '2026-05-06 02:23:29.612459+00', 'auth', 'sucesso', '', '148.227.79.159');
INSERT INTO public.action_logs VALUES ('5dbeefc9-c4da-4912-a95f-5c43a4103806', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'login_sucesso', 'auth', '', '{"dispositivo": "Chrome / Windows", "usuario_cpf": ""}', '2026-05-06 13:12:53.2415+00', 'auth', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('50dfa3f9-6b85-4cb0-966c-5384bcd6c6e5', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_FLUXO', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_fluxo_atendimento": {"turnos": [{"id": "turno_manha", "nome": "Manhã", "ativo": false, "horaFim": "12:00", "horaInicio": "07:00"}, {"id": "turno_tarde", "nome": "Tarde", "ativo": true, "horaFim": "18:00", "horaInicio": "13:00"}, {"id": "turno_noite", "nome": "Noite", "ativo": false, "horaFim": "22:00", "horaInicio": "18:00"}], "triagem": {"camposOpcionais": [{"key": "peso", "label": "Peso", "habilitado": false}, {"key": "glicemia", "label": "Glicemia Capilar", "habilitado": false}], "camposObrigatorios": [{"key": "pressao_arterial", "label": "Pressão Arterial", "obrigatorio": true}, {"key": "temperatura", "label": "Temperatura", "obrigatorio": true}, {"key": "saturacao_oxigenio", "label": "Saturação", "obrigatorio": true}, {"key": "frequencia_cardiaca", "label": "Frequência Cardíaca", "obrigatorio": true}, {"key": "classificacao_risco", "label": "Classificação de Risco", "obrigatorio": true}]}, "ptsCiclo": {"exigirPts": false, "exigirCiclo": false, "sessoesPadrao": 10, "prazoAlertaPts": 6, "frequenciaPadrao": "semanal", "alertarPtsVencido": true, "alertarUltimaSessao": true}, "tiposAtendimento": [{"key": "avaliacao_inicial", "label": "1ª Consulta", "isBuiltin": true, "habilitado": true}, {"key": "retorno", "label": "Retorno", "isBuiltin": true, "habilitado": true}, {"key": "sessao", "label": "Sessão", "isBuiltin": true, "habilitado": true}, {"key": "urgencia", "label": "Urgência", "isBuiltin": true, "habilitado": true}, {"key": "procedimento", "label": "Procedimento", "isBuiltin": true, "habilitado": true}], "regrasAgendamento": {"intervalo": 15, "tempoSessao": 45, "tempoConsulta": 30, "maxPacientesDia": 20, "permitirEncaixe": true, "antecedenciaMaxima": 60, "antecedenciaMinima": 2}, "classificacaoRisco": [{"cor": "#22c55e", "key": "nao_urgente", "label": "Não urgente"}, {"cor": "#eab308", "key": "pouco_urgente", "label": "Pouco urgente"}, {"cor": "#f97316", "key": "urgente", "label": "Urgente"}, {"cor": "#ef4444", "key": "muito_urgente", "label": "Muito urgente"}, {"cor": "#dc2626", "key": "emergencia", "label": "Emergência"}]}}}', '2026-05-08 19:52:50.993952+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('c3871ae0-968b-4ced-acdb-6eee1db9c9f4', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_FLUXO', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_fluxo_atendimento": {"turnos": [{"id": "turno_manha", "nome": "Manhã", "ativo": false, "horaFim": "12:00", "horaInicio": "07:00"}, {"id": "turno_tarde", "nome": "Tarde", "ativo": false, "horaFim": "18:00", "horaInicio": "13:00"}, {"id": "turno_noite", "nome": "Noite", "ativo": false, "horaFim": "22:00", "horaInicio": "18:00"}], "triagem": {"camposOpcionais": [{"key": "peso", "label": "Peso", "habilitado": false}, {"key": "glicemia", "label": "Glicemia Capilar", "habilitado": false}], "camposObrigatorios": [{"key": "pressao_arterial", "label": "Pressão Arterial", "obrigatorio": true}, {"key": "temperatura", "label": "Temperatura", "obrigatorio": true}, {"key": "saturacao_oxigenio", "label": "Saturação", "obrigatorio": true}, {"key": "frequencia_cardiaca", "label": "Frequência Cardíaca", "obrigatorio": true}, {"key": "classificacao_risco", "label": "Classificação de Risco", "obrigatorio": true}]}, "ptsCiclo": {"exigirPts": false, "exigirCiclo": false, "sessoesPadrao": 10, "prazoAlertaPts": 6, "frequenciaPadrao": "semanal", "alertarPtsVencido": true, "alertarUltimaSessao": true}, "tiposAtendimento": [{"key": "avaliacao_inicial", "label": "1ª Consulta", "isBuiltin": true, "habilitado": true}, {"key": "retorno", "label": "Retorno", "isBuiltin": true, "habilitado": true}, {"key": "sessao", "label": "Sessão", "isBuiltin": true, "habilitado": true}, {"key": "urgencia", "label": "Urgência", "isBuiltin": true, "habilitado": true}, {"key": "procedimento", "label": "Procedimento", "isBuiltin": true, "habilitado": true}], "regrasAgendamento": {"intervalo": 15, "tempoSessao": 45, "tempoConsulta": 30, "maxPacientesDia": 20, "permitirEncaixe": true, "antecedenciaMaxima": 60, "antecedenciaMinima": 2}, "classificacaoRisco": [{"cor": "#22c55e", "key": "nao_urgente", "label": "Não urgente"}, {"cor": "#eab308", "key": "pouco_urgente", "label": "Pouco urgente"}, {"cor": "#f97316", "key": "urgente", "label": "Urgente"}, {"cor": "#ef4444", "key": "muito_urgente", "label": "Muito urgente"}, {"cor": "#dc2626", "key": "emergencia", "label": "Emergência"}]}}, "old_value": {"config_fluxo_atendimento": {"turnos": [{"id": "turno_manha", "nome": "Manhã", "ativo": false, "horaFim": "12:00", "horaInicio": "07:00"}, {"id": "turno_tarde", "nome": "Tarde", "ativo": true, "horaFim": "18:00", "horaInicio": "13:00"}, {"id": "turno_noite", "nome": "Noite", "ativo": false, "horaFim": "22:00", "horaInicio": "18:00"}], "triagem": {"camposOpcionais": [{"key": "peso", "label": "Peso", "habilitado": false}, {"key": "glicemia", "label": "Glicemia Capilar", "habilitado": false}], "camposObrigatorios": [{"key": "pressao_arterial", "label": "Pressão Arterial", "obrigatorio": true}, {"key": "temperatura", "label": "Temperatura", "obrigatorio": true}, {"key": "saturacao_oxigenio", "label": "Saturação", "obrigatorio": true}, {"key": "frequencia_cardiaca", "label": "Frequência Cardíaca", "obrigatorio": true}, {"key": "classificacao_risco", "label": "Classificação de Risco", "obrigatorio": true}]}, "ptsCiclo": {"exigirPts": false, "exigirCiclo": false, "sessoesPadrao": 10, "prazoAlertaPts": 6, "frequenciaPadrao": "semanal", "alertarPtsVencido": true, "alertarUltimaSessao": true}, "tiposAtendimento": [{"key": "avaliacao_inicial", "label": "1ª Consulta", "isBuiltin": true, "habilitado": true}, {"key": "retorno", "label": "Retorno", "isBuiltin": true, "habilitado": true}, {"key": "sessao", "label": "Sessão", "isBuiltin": true, "habilitado": true}, {"key": "urgencia", "label": "Urgência", "isBuiltin": true, "habilitado": true}, {"key": "procedimento", "label": "Procedimento", "isBuiltin": true, "habilitado": true}], "regrasAgendamento": {"intervalo": 15, "tempoSessao": 45, "tempoConsulta": 30, "maxPacientesDia": 20, "permitirEncaixe": true, "antecedenciaMaxima": 60, "antecedenciaMinima": 2}, "classificacaoRisco": [{"cor": "#22c55e", "key": "nao_urgente", "label": "Não urgente"}, {"cor": "#eab308", "key": "pouco_urgente", "label": "Pouco urgente"}, {"cor": "#f97316", "key": "urgente", "label": "Urgente"}, {"cor": "#ef4444", "key": "muito_urgente", "label": "Muito urgente"}, {"cor": "#dc2626", "key": "emergencia", "label": "Emergência"}]}}}', '2026-05-08 19:52:51.732059+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('581dbbec-fa52-45b2-a8e1-6a42af8e19d9', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_FLUXO', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_fluxo_atendimento": {"turnos": [{"id": "turno_manha", "nome": "Manhã", "ativo": true, "horaFim": "12:00", "horaInicio": "07:00"}, {"id": "turno_tarde", "nome": "Tarde", "ativo": false, "horaFim": "18:00", "horaInicio": "13:00"}, {"id": "turno_noite", "nome": "Noite", "ativo": false, "horaFim": "22:00", "horaInicio": "18:00"}], "triagem": {"camposOpcionais": [{"key": "peso", "label": "Peso", "habilitado": false}, {"key": "glicemia", "label": "Glicemia Capilar", "habilitado": false}], "camposObrigatorios": [{"key": "pressao_arterial", "label": "Pressão Arterial", "obrigatorio": true}, {"key": "temperatura", "label": "Temperatura", "obrigatorio": true}, {"key": "saturacao_oxigenio", "label": "Saturação", "obrigatorio": true}, {"key": "frequencia_cardiaca", "label": "Frequência Cardíaca", "obrigatorio": true}, {"key": "classificacao_risco", "label": "Classificação de Risco", "obrigatorio": true}]}, "ptsCiclo": {"exigirPts": false, "exigirCiclo": false, "sessoesPadrao": 10, "prazoAlertaPts": 6, "frequenciaPadrao": "semanal", "alertarPtsVencido": true, "alertarUltimaSessao": true}, "tiposAtendimento": [{"key": "avaliacao_inicial", "label": "1ª Consulta", "isBuiltin": true, "habilitado": true}, {"key": "retorno", "label": "Retorno", "isBuiltin": true, "habilitado": true}, {"key": "sessao", "label": "Sessão", "isBuiltin": true, "habilitado": true}, {"key": "urgencia", "label": "Urgência", "isBuiltin": true, "habilitado": true}, {"key": "procedimento", "label": "Procedimento", "isBuiltin": true, "habilitado": true}], "regrasAgendamento": {"intervalo": 15, "tempoSessao": 45, "tempoConsulta": 30, "maxPacientesDia": 20, "permitirEncaixe": true, "antecedenciaMaxima": 60, "antecedenciaMinima": 2}, "classificacaoRisco": [{"cor": "#22c55e", "key": "nao_urgente", "label": "Não urgente"}, {"cor": "#eab308", "key": "pouco_urgente", "label": "Pouco urgente"}, {"cor": "#f97316", "key": "urgente", "label": "Urgente"}, {"cor": "#ef4444", "key": "muito_urgente", "label": "Muito urgente"}, {"cor": "#dc2626", "key": "emergencia", "label": "Emergência"}]}}, "old_value": {"config_fluxo_atendimento": {"turnos": [{"id": "turno_manha", "nome": "Manhã", "ativo": false, "horaFim": "12:00", "horaInicio": "07:00"}, {"id": "turno_tarde", "nome": "Tarde", "ativo": false, "horaFim": "18:00", "horaInicio": "13:00"}, {"id": "turno_noite", "nome": "Noite", "ativo": false, "horaFim": "22:00", "horaInicio": "18:00"}], "triagem": {"camposOpcionais": [{"key": "peso", "label": "Peso", "habilitado": false}, {"key": "glicemia", "label": "Glicemia Capilar", "habilitado": false}], "camposObrigatorios": [{"key": "pressao_arterial", "label": "Pressão Arterial", "obrigatorio": true}, {"key": "temperatura", "label": "Temperatura", "obrigatorio": true}, {"key": "saturacao_oxigenio", "label": "Saturação", "obrigatorio": true}, {"key": "frequencia_cardiaca", "label": "Frequência Cardíaca", "obrigatorio": true}, {"key": "classificacao_risco", "label": "Classificação de Risco", "obrigatorio": true}]}, "ptsCiclo": {"exigirPts": false, "exigirCiclo": false, "sessoesPadrao": 10, "prazoAlertaPts": 6, "frequenciaPadrao": "semanal", "alertarPtsVencido": true, "alertarUltimaSessao": true}, "tiposAtendimento": [{"key": "avaliacao_inicial", "label": "1ª Consulta", "isBuiltin": true, "habilitado": true}, {"key": "retorno", "label": "Retorno", "isBuiltin": true, "habilitado": true}, {"key": "sessao", "label": "Sessão", "isBuiltin": true, "habilitado": true}, {"key": "urgencia", "label": "Urgência", "isBuiltin": true, "habilitado": true}, {"key": "procedimento", "label": "Procedimento", "isBuiltin": true, "habilitado": true}], "regrasAgendamento": {"intervalo": 15, "tempoSessao": 45, "tempoConsulta": 30, "maxPacientesDia": 20, "permitirEncaixe": true, "antecedenciaMaxima": 60, "antecedenciaMinima": 2}, "classificacaoRisco": [{"cor": "#22c55e", "key": "nao_urgente", "label": "Não urgente"}, {"cor": "#eab308", "key": "pouco_urgente", "label": "Pouco urgente"}, {"cor": "#f97316", "key": "urgente", "label": "Urgente"}, {"cor": "#ef4444", "key": "muito_urgente", "label": "Muito urgente"}, {"cor": "#dc2626", "key": "emergencia", "label": "Emergência"}]}}}', '2026-05-08 19:52:52.840994+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('e1aa765b-a20a-4fdd-9a8b-866ed506c427', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_FLUXO', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_fluxo_atendimento": {"turnos": [{"id": "turno_manha", "nome": "Manhã", "ativo": true, "horaFim": "12:00", "horaInicio": "07:00"}, {"id": "turno_tarde", "nome": "Tarde", "ativo": true, "horaFim": "18:00", "horaInicio": "13:00"}, {"id": "turno_noite", "nome": "Noite", "ativo": false, "horaFim": "22:00", "horaInicio": "18:00"}], "triagem": {"camposOpcionais": [{"key": "peso", "label": "Peso", "habilitado": false}, {"key": "glicemia", "label": "Glicemia Capilar", "habilitado": false}], "camposObrigatorios": [{"key": "pressao_arterial", "label": "Pressão Arterial", "obrigatorio": true}, {"key": "temperatura", "label": "Temperatura", "obrigatorio": true}, {"key": "saturacao_oxigenio", "label": "Saturação", "obrigatorio": true}, {"key": "frequencia_cardiaca", "label": "Frequência Cardíaca", "obrigatorio": true}, {"key": "classificacao_risco", "label": "Classificação de Risco", "obrigatorio": true}]}, "ptsCiclo": {"exigirPts": false, "exigirCiclo": false, "sessoesPadrao": 10, "prazoAlertaPts": 6, "frequenciaPadrao": "semanal", "alertarPtsVencido": true, "alertarUltimaSessao": true}, "tiposAtendimento": [{"key": "avaliacao_inicial", "label": "1ª Consulta", "isBuiltin": true, "habilitado": true}, {"key": "retorno", "label": "Retorno", "isBuiltin": true, "habilitado": true}, {"key": "sessao", "label": "Sessão", "isBuiltin": true, "habilitado": true}, {"key": "urgencia", "label": "Urgência", "isBuiltin": true, "habilitado": true}, {"key": "procedimento", "label": "Procedimento", "isBuiltin": true, "habilitado": true}], "regrasAgendamento": {"intervalo": 15, "tempoSessao": 45, "tempoConsulta": 30, "maxPacientesDia": 20, "permitirEncaixe": true, "antecedenciaMaxima": 60, "antecedenciaMinima": 2}, "classificacaoRisco": [{"cor": "#22c55e", "key": "nao_urgente", "label": "Não urgente"}, {"cor": "#eab308", "key": "pouco_urgente", "label": "Pouco urgente"}, {"cor": "#f97316", "key": "urgente", "label": "Urgente"}, {"cor": "#ef4444", "key": "muito_urgente", "label": "Muito urgente"}, {"cor": "#dc2626", "key": "emergencia", "label": "Emergência"}]}}, "old_value": {"config_fluxo_atendimento": {"turnos": [{"id": "turno_manha", "nome": "Manhã", "ativo": true, "horaFim": "12:00", "horaInicio": "07:00"}, {"id": "turno_tarde", "nome": "Tarde", "ativo": false, "horaFim": "18:00", "horaInicio": "13:00"}, {"id": "turno_noite", "nome": "Noite", "ativo": false, "horaFim": "22:00", "horaInicio": "18:00"}], "triagem": {"camposOpcionais": [{"key": "peso", "label": "Peso", "habilitado": false}, {"key": "glicemia", "label": "Glicemia Capilar", "habilitado": false}], "camposObrigatorios": [{"key": "pressao_arterial", "label": "Pressão Arterial", "obrigatorio": true}, {"key": "temperatura", "label": "Temperatura", "obrigatorio": true}, {"key": "saturacao_oxigenio", "label": "Saturação", "obrigatorio": true}, {"key": "frequencia_cardiaca", "label": "Frequência Cardíaca", "obrigatorio": true}, {"key": "classificacao_risco", "label": "Classificação de Risco", "obrigatorio": true}]}, "ptsCiclo": {"exigirPts": false, "exigirCiclo": false, "sessoesPadrao": 10, "prazoAlertaPts": 6, "frequenciaPadrao": "semanal", "alertarPtsVencido": true, "alertarUltimaSessao": true}, "tiposAtendimento": [{"key": "avaliacao_inicial", "label": "1ª Consulta", "isBuiltin": true, "habilitado": true}, {"key": "retorno", "label": "Retorno", "isBuiltin": true, "habilitado": true}, {"key": "sessao", "label": "Sessão", "isBuiltin": true, "habilitado": true}, {"key": "urgencia", "label": "Urgência", "isBuiltin": true, "habilitado": true}, {"key": "procedimento", "label": "Procedimento", "isBuiltin": true, "habilitado": true}], "regrasAgendamento": {"intervalo": 15, "tempoSessao": 45, "tempoConsulta": 30, "maxPacientesDia": 20, "permitirEncaixe": true, "antecedenciaMaxima": 60, "antecedenciaMinima": 2}, "classificacaoRisco": [{"cor": "#22c55e", "key": "nao_urgente", "label": "Não urgente"}, {"cor": "#eab308", "key": "pouco_urgente", "label": "Pouco urgente"}, {"cor": "#f97316", "key": "urgente", "label": "Urgente"}, {"cor": "#ef4444", "key": "muito_urgente", "label": "Muito urgente"}, {"cor": "#dc2626", "key": "emergencia", "label": "Emergência"}]}}}', '2026-05-08 19:52:53.389833+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('9d4f0e10-0a5c-446a-b3fa-388b9477afee', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'ALTERAR_CONFIG_PRONTUARIO', 'system_config', 'default', '{"device": "Chrome / Windows", "new_value": {"config_prontuario_tipos": {"campos": [{"id": "c1", "key": "queixa_principal", "tipo": "textarea", "label": "Queixa Principal", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": true, "tiposProntuario": ["primeira_consulta", "urgencia"]}, {"id": "c2", "key": "historia_doenca", "tipo": "textarea", "label": "História da Doença Atual (HDA)", "order": 2, "isBuiltin": false, "habilitado": true, "obrigatorio": true, "tiposProntuario": ["primeira_consulta"]}, {"id": "c3", "key": "historico_saude", "tipo": "textarea", "label": "Histórico de Saúde", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta"]}, {"id": "c4", "key": "medicacoes_uso", "tipo": "textarea", "label": "Medicações em Uso", "order": 4, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta"]}, {"id": "c5", "key": "alergias", "tipo": "textarea", "label": "Alergias", "order": 5, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta"]}, {"id": "c6", "key": "diagnostico_funcional", "tipo": "textarea", "label": "Diagnóstico Funcional", "order": 6, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta"]}, {"id": "c7", "key": "conduta", "tipo": "textarea", "label": "Conduta", "order": 7, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta", "urgencia"]}, {"id": "c8", "key": "reavaliacao", "tipo": "textarea", "label": "Reavaliação", "order": 1, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["retorno"]}, {"id": "c9", "key": "evolucao_clinica", "tipo": "textarea", "label": "Evolução Clínica", "order": 2, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["retorno"]}, {"id": "c10", "key": "ajuste_conduta", "tipo": "textarea", "label": "Ajuste de Conduta", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["retorno"]}, {"id": "c11", "key": "contador_sessao", "tipo": "text", "label": "Contador de Sessão", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": true, "tiposProntuario": ["sessao"]}, {"id": "c12", "key": "procedimentos_realizados", "tipo": "textarea", "label": "Procedimentos Realizados", "order": 2, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["sessao"]}, {"id": "c13", "key": "resposta_paciente", "tipo": "textarea", "label": "Resposta do Paciente", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["sessao"]}, {"id": "c14", "key": "intercorrencias", "tipo": "textarea", "label": "Intercorrências", "order": 4, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["sessao"]}, {"id": "c15", "key": "sinais_vitais_urgencia", "tipo": "text", "label": "Sinais Vitais Ampliados", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": true, "tiposProntuario": ["urgencia"]}, {"id": "c16", "key": "conduta_rapida", "tipo": "textarea", "label": "Conduta Rápida", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["urgencia"]}, {"id": "c17", "key": "encaminhamentos", "tipo": "textarea", "label": "Encaminhamento", "order": 4, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["urgencia"]}, {"id": "c18", "key": "tipo_procedimento", "tipo": "text", "label": "Tipo de Exame/Procedimento", "order": 1, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["procedimento"]}, {"id": "c19", "key": "resultado", "tipo": "textarea", "label": "Resultado", "order": 2, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["procedimento"]}, {"id": "c20", "key": "conduta_pos", "tipo": "textarea", "label": "Conduta Pós-Procedimento", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["procedimento"]}], "alertas": [{"id": "a1", "condicao": "risco_alto", "mensagem": "⚠️ Acionar protocolo de segurança", "isBuiltin": true, "habilitado": true}, {"id": "a2", "campo": "eva", "valor": "8", "condicao": "dor_eva_alta", "mensagem": "⚠️ Dor severa — avaliar conduta imediata", "operador": ">=", "isBuiltin": true, "habilitado": true}, {"id": "a3", "campo": "imc", "valor": "18.5-30", "condicao": "imc_fora", "mensagem": "⚠️ IMC fora da faixa ideal", "operador": "fora", "isBuiltin": true, "habilitado": true}, {"id": "a4", "condicao": "emergencia", "mensagem": "🚨 Classificação de risco: Emergência", "isBuiltin": true, "habilitado": true}], "soapLabels": {"plano": "Plano", "objetivo": "Objetivo", "avaliacao": "Avaliação", "subjetivo": "Subjetivo"}, "tempoLimiteEdicao": 24, "exigirSenhaAoSalvar": false}}}', '2026-05-08 21:23:09.103889+00', 'configuracoes', 'sucesso', '', '131.72.96.58');
INSERT INTO public.action_logs VALUES ('cad9210f-8da6-4d72-be02-6d08f03fa878', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', 'master', '', 'prontuario_visualizado', 'prontuario', 'e4cdff72-5265-41ba-abd0-4d21bc604d4f', '{"dispositivo": "Chrome / Windows", "usuario_cpf": "", "paciente_cpf": "04778279263", "paciente_nome": "TESTE"}', '2026-05-11 21:36:00.435894+00', 'prontuario', 'sucesso', '', '131.72.96.58');


--
-- Data for Name: agendamentos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: assinatura_eletronica_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.assinatura_eletronica_config VALUES ('5c3d1b1f-9e99-4a67-abcc-72dedc4b52df', 'autentique', true, 'sandbox', '4ddcea70874cab2bdb7eaf21e608201296dcc5aa656bc35b9f4252fe51b083aa', 'SMS/SMAS', NULL, NULL, NULL, true, false, true, false, false, true, true, true, false, NULL, NULL, 'dd7a50e6-1ffc-47c1-8e26-606eed53532c', '2026-05-05 13:43:43.31726+00', '2026-05-05 18:58:19.503973+00', 'sucesso', '2026-05-05 18:58:19.408+00', NULL, true);


--
-- Data for Name: atendimentos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: documentos_gerados; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: documentos_assinatura_autentique; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: autentique_fila_envio; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: autentique_webhook_logs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: bloqueios; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: cbo_codigos; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.cbo_codigos VALUES ('eeefbb98-38be-453b-be3b-55f0e40ea3cf', '515105', 'AGENTE COMUNITÁRIO DE SAÚDE', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('4e878dff-6c34-4878-a8db-2fd3bb6a6957', '515310', 'AGENTE DE AÇÃO SOCIAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('6ebade38-0ce9-42a8-88cc-7bf991def42c', '515140', 'AGENTE DE COMBATE ÀS ENDEMIAS', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('befc7e27-21d6-4ec0-927b-735e8decf386', '352210', 'AGENTE DE SAÚDE PÚBLICA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f12dbf87-602c-4614-bed7-955462383b12', '515130', 'AGENTE INDÍGENA DE SANEAMENTO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('81ada3d1-3897-4a82-ba11-fe11bf6939ad', '515124', 'AGENTE INDÍGENA DE SAÚDE', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ffbbfd03-8aed-4e11-b531-b31d3edf4c8c', '226310', 'ARTETERAPEUTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('e6f7a783-5120-47c3-80c6-c77ac515a678', '411010', 'ASSISTENTE ADMINISTRATIVO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ef28a108-fe2c-4cff-a17f-a31b6382fd5f', '251605', 'ASSISTENTE SOCIAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('7ec437dc-f154-4bc3-9494-6c694beb73ec', '322230', 'AUXILIAR DE ENFERMAGEM', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('98ab5aab-5424-4081-aceb-44ede1b21c4e', '322250', 'AUXILIAR DE ENFERMAGEM DA ESTRATEGIA DE SAUDE DA FAMILIA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('604567c5-9cc4-48d7-af72-0ba8915b6c3c', '322415', 'AUXILIAR EM SAÚDE BUCAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('e00f1531-2056-42e0-bbac-a6467a7e0057', '322430', 'AUXILIAR EM SAÚDE BUCAL DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('00951393-ee03-44f0-9546-fca076619d73', '223204', 'CIRURGIÃO DENTISTA - AUDITOR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('7db16720-563f-4c48-9b84-c19ffe561a35', '223208', 'CIRURGIÃO DENTISTA - CLÍNICO GERAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('422a57ff-d83e-453a-becd-fe59b8c43a1d', '223280', 'CIRURGIÃO DENTISTA - DENTÍSTICA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('1249660d-e724-4db0-938d-6d405d89eb2a', '223284', 'CIRURGIÃO DENTISTA - DISFUNÇÃO TEMPOROMANDIBULAR E DOR OROFACIAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('71a3eb72-847f-473a-bd2c-65c3b28a3e52', '223212', 'CIRURGIÃO DENTISTA - ENDODONTISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('4b5bc9b3-e420-458a-8a66-a04abe0a01eb', '223216', 'CIRURGIÃO DENTISTA - EPIDEMIOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ecd56bec-027c-4480-897b-3cabd37b2c0b', '223220', 'CIRURGIÃO DENTISTA - ESTOMATOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('7e14c4cb-4920-4d69-a3ce-663cbfb568a1', '223224', 'CIRURGIÃO DENTISTA - IMPLANTODONTISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('e1e98a22-171e-45eb-b2c5-b2890a710257', '223228', 'CIRURGIÃO DENTISTA - ODONTOGERIATRA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('33a6228d-1224-43f6-8eac-852b9eb102ed', '223276', 'CIRURGIÃO DENTISTA - ODONTOLOGIA DO TRABALHO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('5a196e71-6a54-4c11-989a-6ed8b9416cfb', '223288', 'CIRURGIÃO DENTISTA - ODONTOLOGIA PARA PACIENTES COM NECESSIDADES ESPECIAIS', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f89a0e52-abb5-400d-a40e-6a1dd5b85c9c', '223232', 'CIRURGIÃO DENTISTA - ODONTOLOGISTA LEGAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f60503b1-ba49-4200-b527-776883082216', '223236', 'CIRURGIÃO DENTISTA - ODONTOPEDIATRA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('72ede539-2df7-447c-809c-0452f4127abd', '223240', 'CIRURGIÃO DENTISTA - ORTOPEDISTA E ORTODONTISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('c94a6641-b6a1-4c67-926e-e4e0dbdc6f83', '223244', 'CIRURGIÃO DENTISTA - PATOLOGISTA BUCAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('7debad90-4641-4a9e-9223-0fc3aed41d96', '223248', 'CIRURGIÃO DENTISTA - PERIODONTISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('e4b0cf6e-ba9b-4a64-a371-e712306415c2', '223252', 'CIRURGIÃO DENTISTA - PROTESIÓLOGO BUCOMAXILOFACIAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('b806af0f-8821-4725-9cd8-063fc128b463', '223256', 'CIRURGIÃO DENTISTA - PROTESISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('cb6eb1f7-977e-4095-951d-bab5f613f719', '223260', 'CIRURGIÃO DENTISTA - RADIOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ce8a8dbf-5081-413a-b934-87e39d85183c', '223264', 'CIRURGIÃO DENTISTA - REABILITADOR ORAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('33757390-17cc-450a-9595-a86679960943', '223268', 'CIRURGIÃO DENTISTA - TRAUMATOLOGISTA BUCOMAXILOFACIAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('a92d7e3f-974b-45d1-b279-50e817ea831b', '223272', 'CIRURGIÃO DENTISTA DE SAÚDE COLETIVA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('1ee42d29-6be1-4d87-a067-9e7d8c0a8b7c', '223293', 'CIRURGIÃO-DENTISTA DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('661cff9f-d22f-4ea7-ada1-0e3d651c27ca', '412110', 'DIGITADOR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('099c7ba7-0f4c-4fc6-bc52-fed20892daba', '131205', 'DIRETOR DE SERVICOS DE SAUDE', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('52f13c73-a0fa-4b85-a36c-bb41075a0c38', '515305', 'EDUCADOR SOCIAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('0aec2297-bdaf-4447-a307-8b7702ec7a26', '223505', 'ENFERMEIRO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('90428fee-da2c-4968-bee4-c22d26c6f402', '223565', 'ENFERMEIRO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f7ee5920-e2fb-4191-a7ce-4f768ef290fa', '223530', 'ENFERMEIRO DO TRABALHO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('c9af9da3-5cc5-4f0b-87e3-21c2b61c51c8', '223545', 'ENFERMEIRO OBSTÉTRICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('27f0e50f-0b6a-4737-bf01-c1cfd099b4f6', '223550', 'ENFERMEIRO PSIQUIÁTRICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('9a42150f-a5fe-4ebd-85f2-623c4e388d31', '223555', 'ENFERMEIRO PUERICULTOR E PEDIÁTRICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('567e4890-7af0-4d62-bc5b-6626247638ef', '223560', 'ENFERMEIRO SANITARISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('36280cc7-722c-4e2e-b26f-ca87cb3f42ed', '226315', 'EQUOTERAPEUTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('8e9ca7d1-60c0-4082-a8b1-2736a3d540a1', '223405', 'FARMACÊUTICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('0bc2024f-d2fb-4108-9f20-0478834306e7', '223415', 'FARMACÊUTICO ANALISTA CLÍNICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('0d4eeaf4-5f5b-4264-bed0-450d3da08fc2', '223430', 'FARMACÊUTICO EM SAÚDE PÚBLICA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('cc9ae559-4642-47b8-805c-a1a12cb15e49', '223445', 'FARMACÊUTICO HOSPITALAR E CLÍNICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('6c42c2b2-aabb-408e-94b7-ad7c4205a985', '223425', 'FARMACÊUTICO PRÁTICAS INTEGRATIVAS E COMPLEMENTARES', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f533a18c-e386-479d-ae24-69fc50f4d717', '223650', 'FISIOTERAPEUTA ACUPUNTURISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f54a6b56-d996-4456-997f-474650b09458', '223605', 'FISIOTERAPEUTA GERAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('bb01dfd7-da06-402a-81e9-fba92d1823a9', '223810', 'FONOAUDIÓLOGO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('fa89614f-0dbf-46b8-a6d2-fad83f6a315f', '131210', 'GERENTE DE SERVICOS DE SAUDE', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('46340224-c6f9-4e22-be24-d9764722544a', '225105', 'MÉDICO ACUPUNTURISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('d30ea888-20d7-498f-85bf-171b682b1d6d', '225110', 'MÉDICO ALERGISTA E IMUNOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('5381775d-29da-40b6-b381-c62f7b4652f3', '225154', 'MÉDICO ANTROPOSÓFICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('8837d331-06b3-4e7d-84f1-58e7d9c80a63', '225120', 'MÉDICO CARDIOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('32095527-830a-43cc-a045-71362aadadeb', '225125', 'MÉDICO CLÍNICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('1485d443-3d50-4431-b303-66f337b1d67b', '225142', 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ade83681-bbc8-4882-96e5-2c11e5b96e74', '225130', 'MÉDICO DE FAMÍLIA E COMUNIDADE', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('33a30456-a39c-4763-a3d7-a739d8273afe', '225135', 'MÉDICO DERMATOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('0eca4c1f-1ff7-460a-851d-c4e1dd432d8b', '225140', 'MÉDICO DO TRABALHO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f9377433-97aa-45ff-9ad7-a1704b535d6f', '225155', 'MÉDICO ENDOCRINOLOGISTA E METABOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('d4b90fb0-8499-420d-8912-b18508f61f9e', '225160', 'MÉDICO FISIATRA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('808bcd0c-c248-497a-b090-229030d0dee8', '225165', 'MÉDICO GASTROENTEROLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('4c9400bf-4592-419e-ba12-8fbd96ffcef9', '225170', 'MÉDICO GENERALISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('e9a8555c-f91d-4657-a2a5-f234296a0bae', '225180', 'MÉDICO GERIATRA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('4a9d05d0-a812-4ab5-a671-5e5608294e71', '225250', 'MÉDICO GINECOLOGISTA E OBSTETRA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('6293f366-1400-484f-a73b-00501d2886a4', '225185', 'MÉDICO HEMATOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('d0780527-80ef-4dca-b341-7bdfdf2e2bdc', '225195', 'MÉDICO HOMEOPATA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('431f8beb-95df-4fc0-8c8e-935545ef4c07', '225103', 'MÉDICO INFECTOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f4c3a38f-d70c-4f3c-8df2-cebcab23e2f2', '225255', 'MÉDICO MASTOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('c67bca4f-4ee9-42d4-a4a1-9ab0172c4591', '225109', 'MÉDICO NEFROLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('0b4e4ea4-fdc6-4605-b314-eb38ab83a7eb', '225350', 'MÉDICO NEUROFISIOLOGISTA CLÍNICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ab48aede-018c-480c-8709-0d5e7897771a', '225112', 'MÉDICO NEUROLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('c376e810-2e06-4d56-bb8b-da57408de741', '225118', 'MÉDICO NUTROLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f358a2b8-4ba6-4f8c-aae5-9dbe947bee1a', '225265', 'MÉDICO OFTALMOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('41af0610-5954-4558-8e7a-110f87139e6a', '225121', 'MÉDICO ONCOLOGISTA CLÍNICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('859c357d-65cf-4740-a248-429ad699d1b6', '225270', 'MÉDICO ORTOPEDISTA E TRAUMATOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('a8dcecfc-91eb-45ca-8432-c13df61b57db', '225275', 'MÉDICO OTORRINOLARINGOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('2cdef53d-dcc9-45fe-82b8-9fe8c7f61476', '225124', 'MÉDICO PEDIATRA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('6b1448f2-d10d-43ac-923d-1631075ce770', '225127', 'MÉDICO PNEUMOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('72f27d56-b864-4e6f-aadb-2e2eeb98a796', '225133', 'MÉDICO PSIQUIATRA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f11b68e1-f788-4b91-ab49-3fb7cc3cb3b1', '2231F9', 'MÉDICO RESIDENTE', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('8aa2b59f-5e47-4e95-8a38-39b95c0a01b0', '225136', 'MÉDICO REUMATOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('9b55bdfb-cc1a-49d4-9966-fac356c7394d', '225139', 'MÉDICO SANITARISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('e0235eed-df70-4c54-91a1-5bfae9afb59e', '225285', 'MÉDICO UROLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('3ebdc6df-7a16-482a-8d77-637244847a30', '422215', 'MONITOR DE TELEATENDIMENTO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('a13fc912-3196-42ce-ab4c-ed6d01ee38ad', '226305', 'MUSICOTERAPEUTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('aae382a3-9bff-4cd2-814e-40b55961b7e8', '226320', 'NATURÓLOGO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('cf15af3a-4810-40b2-9e10-0098bddf772c', '251545', 'NEUROPSICÓLOGO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('32bfa1ac-0539-4b2e-8314-d2bc7e7d6f85', '223710', 'NUTRICIONISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('79149432-1ed0-42a6-b611-33b9f9e167e9', '422220', 'OPERADOR DE RADIO CHAMADA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('34feade5-9c76-4fd6-8d20-fbe79acb446f', '226110', 'OSTEOPATA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f4a8f0e9-8aec-40d0-b056-629b3f1f257e', '142340', 'OUVIDOR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('e215d80c-62cb-4438-9618-03352028fd13', '239415', 'PEDAGOGO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('c9c547ca-f060-44d4-88d4-24c0db83e40b', '234410', 'PROFESSOR DE EDUCAÇÃO FÍSICA NO ENSINO SUPERIOR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ad6edbdd-a4e1-47e2-b92e-decb0d7beda7', '224140', 'PROFISSIONAL DE EDUCAÇÃO FÍSICA NA SAÚDE', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('fdd7574e-52c8-44ef-996b-bab21ead00aa', '251550', 'PSICANALISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('a89f0432-fbae-44b4-847a-4c58f1d355a2', '251555', 'PSICÓLOGO ACUPUNTURISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('807c7cd2-e191-4d18-ac8b-239d698615d7', '251510', 'PSICÓLOGO CLÍNICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('70d0ec56-883b-406e-bcbe-ea0243c75489', '251540', 'PSICÓLOGO DO TRABALHO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ef01e88b-f46a-4363-9a63-c47994bc8324', '251505', 'PSICÓLOGO EDUCACIONAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('5377b7b6-6f12-4dac-94ae-fb9710675f63', '251530', 'PSICÓLOGO SOCIAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('025d13b5-546f-4b32-a35f-0792e8b67c7f', '239425', 'PSICOPEDAGOGO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('50a32ff8-535b-4195-b9da-4abdec202d3e', '226105', 'QUIROPRAXISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('7c4f1e2c-07f6-40e1-a6d7-11b8d6506244', '422110', 'RECEPCIONISTA DE CONSULTÓRIO MÉDICO OU DENTÁRIO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('7ead2490-bfdc-4811-8fd1-7d858294c30c', '422105', 'RECEPCIONISTA, EM GERAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f6bf73a7-b3d2-4d88-92fc-314854fcdc14', '1312C1', 'SANITARISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('44d5a62f-595c-4de1-ae3f-2aa176b8d9c8', '131225', 'SANITARISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('0a214b58-9d17-4129-baff-649e3d1b3686', '322205', 'TECNICO DE ENFERMAGEM', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('3381c112-253a-4284-9150-822276c01363', '322245', 'TECNICO DE ENFERMAGEM DA ESTRATEGIA DE SAUDE DA FAMILIA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('e68c7b2b-7e32-4b9f-afd8-5d9fedc4fc3c', '322210', 'TECNICO DE ENFERMAGEM DE TERAPIA INTENSIVA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('bf983db0-b9b8-4d94-b4c1-a2b9575956e7', '322255', 'TÉCNICO EM AGENTE COMUNITÁRIO DE SAÚDE', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('1afb98d0-914e-42a5-af1e-c4003e906133', '322405', 'TECNICO EM SAUDE BUCAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('25482e72-a3c6-4f84-8923-f43d84d7ad64', '322425', 'TÉCNICO EM SAÚDE BUCAL DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('02e4cd15-445b-48ee-877c-447c6d0f35a7', '422205', 'TELEFONISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('cfac5ab6-08c3-4452-81e1-7f6832e4b151', '422210', 'TELEOPERADOR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('c29ade35-8808-46ec-9522-b0d630d3f219', '223905', 'TERAPEUTA OCUPACIONAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('7cf8db92-6d1c-436e-8ed6-52cfa9200a99', '515120', 'VISITADOR SANITÁRIO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('423b3248-628b-4430-978b-218aee9abb32', '223305', 'MEDICO VETERINÁRIO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('a1f04b24-274c-449c-b416-4f0af1829a96', '322125', 'TERAPEUTA HOLÍSTICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('be36852d-d304-459b-911c-44606f6eedff', '324205', 'TÉCNICO EM PATOLOGIA CLÍNICA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('31dc7792-bbdd-47f0-a30f-1b0755e5c555', '322215', 'TÉCNICO DE ENFERMAGEM DO TRABALHO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('7d3c83e9-79d9-4dbb-8bbf-1b7496484564', '322220', 'TÉCNICO DE ENFERMAGEM PSIQUIÁTRICA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('495544bb-5a8c-42a8-88a9-beeb3eaf7bd8', '223510', 'ENFERMEIRO AUDITOR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('5bf5417c-b038-440a-8944-4c125acc81a2', '223660', 'FISIOTERAPEUTA DO TRABALHO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('b22b1ac6-1a76-465b-bfd4-674eda0cb531', '223655', 'FISIOTERAPEUTA ESPORTIVO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('de4fb008-069a-4571-9f28-0ee43c018f9b', '223630', 'FISIOTERAPEUTA NEUROFUNCIONAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('92b23a57-718a-4d6d-902c-15755f8c78f3', '223635', 'FISIOTERAPEUTA TRAUMATOORTOPEDICA FUNCIONAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('563a1963-e0e0-4015-931f-3c2a596a765c', '225115', 'MEDICO ANGIOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('5042f4a9-f375-494b-8763-8319e4d7b1a4', '225210', 'MEDICO CIRURGIAO CARDIOVASCULAR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('d383b80a-d675-4651-8e80-f75b5c38fb98', '225225', 'MEDICO CIRURGIAO GERAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ed827ad6-d9ba-464e-9529-8dea49b29365', '225230', 'MEDICO CIRURGIAO PEDIATRICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('4f78526a-f333-4955-866f-1e71e2bf5ba8', '225203', 'MEDICO EM CIRURGIA VASCULAR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ef73e495-002f-4b17-a202-52eb1391d037', '225150', 'MEDICO EM MEDICINA INTENSIVA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('2f650d1b-f820-4b6a-ad7a-6762fbabdd28', '2231F8', 'MEDICO EM MEDICINA PREVENTIVA E SOCIAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('3a6c6d20-179c-4dee-8930-0ec4993774d8', '225320', 'MEDICO EM RADIOLOGIA E DIAGNOSTICO POR IMAGEM', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('27cdeb57-6327-4554-bb9d-b9fa8ff22978', '2231A2', 'MEDICO HANSENOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('4e52f0cc-df72-44dc-9607-e5ee028cac8c', '225260', 'MEDICO NEUROCIRURGIAO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('08c21149-1568-4158-8e5d-a05250761f55', '223815', 'FONOAUDIOLOGO EDUCACIONAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('a2216f61-d9cb-4c3e-836f-ead44a1b451f', '223830', 'FONOAUDIOLOGO EM LINGUAGEM', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('c3f74825-72e9-495a-afe9-724231067951', '223840', 'FONOAUDIOLOGO EM SAUDE COLETIVA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('60165052-2dad-40fe-b7fe-bda87d4d9cf8', '251520', 'PSICOLOGO HOSPITALAR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('63c5e334-6a38-411b-ba9c-4663e69d8867', '251525', 'PSICOLOGO JURIDICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('236b65cf-aa1f-4297-a720-2d033d660770', '515110', 'ATENDENTE DE ENFERMAGEM', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('35a40cbb-1fc1-4c47-b18c-0b4092d29614', '322235', 'AUXILIAR DE ENFERMAGEM DO TRABALHO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('a29b4f1e-a0d4-4de1-a948-e99176bd5d47', '223520', 'ENFERMEIRO DE CENTRO CIRÚRGICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('ddd1fff0-7502-4b66-9012-1195163432e4', '223525', 'ENFERMEIRO DE TERAPIA INTENSIVA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('0dff4177-7231-41e1-ba30-01a3b0374f21', '223535', 'ENFERMEIRO NEFROLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('8cc8abcb-925c-4059-aa4a-a6e019b831a0', '223540', 'ENFERMEIRO NEONATOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('66027528-faa5-4e95-b636-afa2805b490d', '225148', 'MÉDICO ANATOMOPATOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('94b4aa8a-1f55-4de3-aeb5-6b4a08770ed4', '225151', 'MÉDICO ANESTESIOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('b9946934-22b3-4486-a0ec-a41e4a95d54b', '225290', 'MÉDICO CANCEROLOGISTA CIRURGICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('c2eb6a0d-d8da-4b7f-bfb4-25a23e0c8502', '225122', 'MÉDICO CANCEROLOGISTA PEDIÁTRICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('3fb04b20-fcd3-4285-a9db-57bf38d62506', '225295', 'MÉDICO CIRURGIÃO DA MÃO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('8795728a-b084-420d-b4e5-26c9e9f15689', '225215', 'MÉDICO CIRURGIÃO DE CABEÇA E PESCOÇO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('06d5c0b9-18f0-401a-96dc-2936587482e3', '225220', 'MÉDICO CIRURGIÃO DO APARELHO DIGESTIVO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('1734f3b5-638f-4242-8ed9-6102bd0a4296', '225235', 'MÉDICO CIRURGIÃO PLÁSTICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('64da69fc-cf39-46bb-b34f-9f1d8fa344b9', '225240', 'MÉDICO CIRURGIÃO TORÁCICO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('56bb8f9f-cd1c-4913-af72-86c207f6e4f4', '225305', 'MÉDICO CITOPATOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('f356a286-865f-4106-a9ce-7638a5ad1778', '225280', 'MÉDICO COLOPROCTOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('a47757f0-1993-4a7a-9250-9841bb5f67cb', '225310', 'MÉDICO EM ENDOSCOPIA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('cd28062c-9741-4255-a569-3fff1a456200', '225145', 'MÉDICO EM MEDICINA DE TRÁFEGO', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('57a97e0d-b2a4-49ef-85c8-569f94c18288', '225315', 'MÉDICO EM MEDICINA NUCLEAR', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('e05c30a7-0ebd-434c-afb3-597193a343a9', '225175', 'MÉDICO GENETICISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('2bbc3be0-62dc-4d10-8d19-34432e6ce447', '225340', 'MÉDICO HEMOTERAPEUTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('4e6fd1ce-cdaa-4ba2-9a23-b5b2617a70db', '225345', 'MÉDICO HIPERBARISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('cc9fcf9c-8f8f-45d5-9b8f-3ad545b18c8d', '225106', 'MÉDICO LEGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('7c2b9b9f-4c8c-4e9c-bd7d-5a5dbc4c9b98', '225325', 'MÉDICO PATOLOGISTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('da058e9f-9eec-423a-a8fd-8b773e19b411', '225335', 'MÉDICO PATOLOGISTA CLÍNICO / MEDICINA LABORATORIAL', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');
INSERT INTO public.cbo_codigos VALUES ('c7695eed-1252-4f94-9e02-d9c77a6574d3', '225330', 'MÉDICO RADIOTERAPEUTA', '{}', true, '2026-05-04 19:30:12.326062+00', '2026-05-04 19:30:12.326062+00');


--
-- Data for Name: cid10_codigos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: clinica_config; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: disponibilidades; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.disponibilidades VALUES ('d1778271565737_5_t4rm', 'cce7c26f-507c-4eef-aa2c-021b5cac249a', 'un1776974690707', 'Novo Turno', '2026-05-11', '2026-05-11', '08:00', '12:00', 0, 20, '{5}', '2026-05-08 20:19:25.532103+00', 0);


--
-- Data for Name: document_templates; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: documentos_assinatura_signatarios; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: encaminhamentos_anexos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sistemas_integrados; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: encaminhamentos_externos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: episodios_clinicos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: especialidades; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: especialidades_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.especialidades_config VALUES ('afdbbe31-260f-4327-8134-32b9fd673dd5', 'Fisioterapia', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('0c1172a5-dd3f-4129-a6b9-e4076594e2ab', 'Fisioterapia Motora', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('76e21490-e0bc-46e6-ad5f-6054a51148ff', 'Fisioterapia Neurológica', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('55e5bbac-f29d-430a-b7e9-3fc7e66d6b10', 'Fisioterapia Respiratória', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('ac916eb3-26fd-4f1a-9470-42c3b35ab6b2', 'Terapia Ocupacional', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('59ab72db-31f9-49d0-9364-52909cded548', 'Fonoaudiologia', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('e78b4204-e303-46fc-8710-df75c1a770ba', 'Psicologia', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('83abb71e-466c-4e7b-a76b-ca5fac929887', 'Neuropsicologia', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('281c8a5b-87a2-4187-a4bb-da430d60bef1', 'Serviço Social', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('94ee1b63-05bf-4e57-b5d4-8485e74fef4b', 'Enfermagem', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('32de4fa2-eec9-4036-b663-375575f3e2e3', 'Avaliação Multiprofissional', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('a08dcfe0-87b0-4b92-a22a-4f1c851690d8', 'Estimulação Precoce', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('52ce041b-690f-49c6-b239-a0fc40187a33', 'Reabilitação Física', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('2648c9b3-134e-4f20-9501-4bb779f72f56', 'Reabilitação Intelectual', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('923604df-b5e5-4a6b-a2f7-54e8ccb2e224', 'Reabilitação Auditiva', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('419f6ced-4b7d-4d6d-9c83-0940f0f0adc4', 'Reabilitação Visual', 'Reabilitação', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('643dee07-c464-42b1-8451-887c4a5861a4', 'Clínica Geral', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('fc3afa0c-7a47-4510-b423-3cfa49d628cf', 'Medicina de Família e Comunidade', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('8519a523-be20-4f03-9271-5ae361cffce1', 'Pediatria', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('63c847e2-945a-40d9-a304-058c13f6de9f', 'Neurologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('1a7d90ac-6e12-48d7-8e69-97d8e2976070', 'Neuropediatria', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('7df6ee34-4e84-47b4-9627-d1f87aaba669', 'Ortopedia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('4bcc820e-c84b-4071-b7ab-f939145240d0', 'Traumatologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('fd6a5e9c-9ba2-4a2f-8a1f-a476b61ff6fa', 'Psiquiatria', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('548d0db2-d5dc-4aa0-8372-8436ebc8b77e', 'Geriatria', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('76322fc4-ebac-4f80-8cac-d7122402d300', 'Ginecologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('212ac8bc-8831-4a2d-92b8-d4ac86d47633', 'Obstetrícia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('c22316db-04fe-4dfc-b225-4b496f763529', 'Cardiologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('3d895f48-d4af-4cc3-9c3b-434bec94580a', 'Endocrinologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('acb2ef5d-0f9f-4490-958e-02ae82fb516f', 'Pneumologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('11052c28-cc90-4048-a3a2-4e0577896848', 'Gastroenterologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('8de575db-85e7-45bf-a400-c8418c54fc7d', 'Dermatologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('569f5607-c636-4abb-a8ee-5c1210b1e3fe', 'Oftalmologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('087acbd6-75a5-4c91-a555-c707d573d314', 'Otorrinolaringologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('97c72672-834b-48de-abf3-7661d3abdfba', 'Urologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('7948ed45-c53b-4a07-a79a-1778c26826f2', 'Nefrologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('a07c029f-83cf-4a85-8672-0a3f69b00503', 'Reumatologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('fc05d971-4a4c-4944-ba90-3bea8b749401', 'Infectologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('bffa9eb4-6c4a-4802-9de7-a81355c8c922', 'Hematologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('7e48e5f8-866d-4254-a126-086080c0573c', 'Oncologia', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('3d34ac0b-e53d-420c-8011-ffddfeb0aede', 'Cirurgia Geral', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('b087c50f-8e13-4df6-b11b-11af631fbbb7', 'Cirurgia Vascular', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('ecfb872b-72bd-46b2-a404-10d190d6bfc0', 'Cirurgia Pediátrica', 'Médico', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('cd88ba7d-47d5-483f-a5d0-f15a5b5d9a18', 'Odontologia', 'Saúde Bucal', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('5f60a061-3a8a-4ede-93cc-244b98c98263', 'Odontopediatria', 'Saúde Bucal', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('98cd689d-95e0-4666-ad77-846fa864f6c4', 'Cirurgia Bucomaxilofacial', 'Saúde Bucal', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('f526176b-ff4d-48d5-925c-5b4d7b4586a4', 'Periodontia', 'Saúde Bucal', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('b34af558-1181-46b4-85e5-e5280a39854b', 'Endodontia', 'Saúde Bucal', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('05cf0ec8-2ed7-4f15-89a8-81305a1322ce', 'Prótese Dentária', 'Saúde Bucal', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('2de1e35a-07fd-46b8-9d1e-86ad88984446', 'Audiometria', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('e3c981fc-5f1c-425a-9357-45806b3d3db5', 'Imtanciometria', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('565123fe-df8f-4798-b1a8-cb253fd1486f', 'BERA / PEATE', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('01e4dcf6-04c5-4db4-9197-33833fc239b1', 'Exame Oftalmológico', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('86bab23d-a328-4586-91b5-962f2d6478fc', 'Avaliação Funcional', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('917cd563-1372-4596-8518-c317dde2fd93', 'Avaliação Postural', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('a8a47c57-651a-4f74-a26c-86da49fb41de', 'Avaliação de Marcha', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('86f8da5f-be55-424d-9055-568e879b6cbe', 'Avaliação de Linguagem', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('1355f007-260f-4f21-a7c9-2a0ade528733', 'Avaliação Psicológica', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('740cafd7-2f48-41a5-9024-2e5cc8e0488b', 'Avaliação Cognitiva', 'Exames', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('0f0c4367-2bd2-4e53-a29a-3c7f9588325a', 'Nutrição', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('93d82bb2-ea1d-41c9-a6ff-3675e038de17', 'Farmácia', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('e2ff0a35-bf1d-4668-b388-badc6daf97d9', 'Educação Física', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('8aa5474e-1047-43c2-919b-20e065a0caf9', 'Assistência Social', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('b90f2d3e-167f-4a9e-ba27-7ee35ecc9b15', 'Saúde Mental', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('18e2d285-f464-4a98-ac67-51bfe485819d', 'CAPS', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('105c0c97-7d7f-418a-987a-114824565041', 'Regulação', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('1d234e13-478a-4b02-9766-28050d889fa6', 'UBS', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('b2dd8d18-380e-4146-904a-36eb4d7cdc97', 'Especialidade Externa', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');
INSERT INTO public.especialidades_config VALUES ('7faa09b7-ab29-47c7-b248-b0c04f4f0372', 'Outro', 'Outros', NULL, true, 'padrao', NULL, NULL, NULL, '2026-05-05 11:59:27.44277+00', '2026-05-05 11:59:27.44277+00');


--
-- Data for Name: exam_types; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.exam_types VALUES ('54d556af-b031-4c79-a1af-2b652234921c', 'Hemograma completo', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Hematologia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('2601168d-1d5c-49cc-b8d1-41fe4391937b', 'Glicemia de jejum', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', true, '8 horas', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('cc30dbe4-da0a-4d5f-93f7-b393e3bf7def', 'Hemoglobina glicada', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('097f8ac6-45ae-45a7-866b-d506e33f763c', 'Colesterol total', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', true, '12 horas', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('ca137baf-01ef-444e-bdfa-1ae3fdc2058f', 'HDL', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', true, '12 horas', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('1ced3f85-659a-4d3d-abeb-db625be92c21', 'LDL', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', true, '12 horas', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('4b1a5924-6bad-466d-92ec-28fa96206bda', 'Triglicerídeos', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', true, '12 horas', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('40b2f1ca-2840-4f66-b913-23da78a9e742', 'Ureia', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('186a69db-dbf8-4158-abf8-f700762832d0', 'Creatinina', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('7a9c5414-2765-401f-8121-b1add2e251f2', 'TGO/AST', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('acb19a39-8735-4b4a-b813-b8d25c342cc3', 'TGP/ALT', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('a5a58366-3571-491a-8e60-930df9202f9a', 'Gama GT', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('a797943e-1e32-43bd-8ffe-abb6deea4e5d', 'Fosfatase alcalina', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('83366b73-a10d-4fec-906d-82767c430526', 'Bilirrubina total e frações', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('c1b15c63-a10e-45b9-aacb-3bf930f81611', 'Sódio', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('b1947e95-6dd4-417d-bd65-fd7b9be462c7', 'Potássio', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('8eeec0e9-4fb0-4477-86ad-13594b59ed71', 'Cálcio', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('9e0c0fde-e0de-450a-a2dd-7bcc579974cf', 'Magnésio', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('e85e25aa-514e-4a77-9ece-ee5536bc3d24', 'TSH', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Hormonal', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('756c4e2b-a3e8-4666-ac8a-f90605c083e1', 'T4 livre', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Hormonal', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('c41fc730-aa1a-4aed-8e84-0ba70547d707', 'EAS / Urina tipo 1', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Urinálise', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('936d485e-c809-41e6-9512-f5778ca91379', 'Urocultura', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Microbiologia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('4a170f12-f217-4f81-9d28-de159d4a8b53', 'Parasitológico de fezes', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Parasitologia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('3856e795-4302-4d4c-9006-32c2818f50f2', 'Coprocultura', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Microbiologia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('ddc8719b-2d17-4a51-a640-f25a24112afa', 'PCR (Proteína C reativa)', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Imunologia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('a6ab9061-c12a-4a19-8990-0b823ef0c3ea', 'VHS', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Hematologia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('99f3812f-f4b1-4de8-9605-6ee717f9be2d', 'Coagulograma', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Hematologia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('a05e247a-7dfb-4f7b-870a-5cef5be2c9c1', 'TAP/INR', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Hematologia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('f6d65bea-8157-46fe-971f-2e902dcd8326', 'TTPA', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Hematologia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('0d380770-feaa-498b-b538-d8387ddcd82e', 'Beta HCG', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Hormonal', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('891b56f6-031a-48e1-a42f-7ff0932f0c8e', 'PSA', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Hormonal', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('ff1c8fcf-e44a-434f-86f9-db5f66a60b2c', 'Ferritina', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('e823d59e-289c-46e5-8f7a-e55e626e0765', 'Vitamina B12', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Vitaminas', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('6da195b8-8273-4c1e-971a-3a3dbab9479e', 'Vitamina D', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Vitaminas', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('80f8dc09-6f3a-47b4-a43a-c47de978054c', 'Ácido úrico', '', 'Laboratoriais', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Bioquímica', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('22f614d1-3c76-4420-b37e-05d985278944', 'HIV', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('0e356a3f-d1c1-428f-810d-c44351f2bf60', 'HBsAg', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('3c0e1420-cff9-4459-823e-b4e850a8cc34', 'Anti-HBs', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('2dde515f-1350-48fd-90f7-692b77f0ef93', 'Anti-HCV', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('0bda043f-0f8b-456c-809c-2485d335d91b', 'VDRL', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('cd6bf470-5193-4f09-9d9e-f09373fba7c6', 'Dengue NS1', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('fd140350-8457-45c8-8c82-4d1ca9dc5cac', 'Dengue IgM/IgG', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('b3ee6131-d063-4179-8aff-34c1451d0ece', 'Chikungunya IgM/IgG', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('47af2ba9-3466-49d6-91d6-a88f36788796', 'Zika IgM/IgG', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('51ab4c62-679a-4e03-b782-b0352751b272', 'COVID-19 teste rápido', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('b655f59c-d205-49eb-aa22-e4bce2e9d310', 'COVID-19 RT-PCR', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('82b7a61b-c97e-499a-92ae-eb35d4adf87a', 'Teste rápido de gravidez', '', 'Sorologias e Testes Rápidos', true, NULL, true, '2026-04-29 03:02:32.933529+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('ea9a66b8-6d6d-42c7-8888-5a425c640728', 'Radiografia', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Raio X', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('53f130ef-b804-44de-af77-40df71f14954', 'Ultrassonografia', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Ultrassom', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('437361ce-965f-4c33-bf09-2416ed23ddd8', 'Tomografia computadorizada', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:32.933529+00', 'Tomografia', '', false, '', '', 'PADRAO', '2026-04-29 03:02:32.933529+00');
INSERT INTO public.exam_types VALUES ('5c9d1c09-9957-4d61-8e42-1079e870499d', 'Ressonância magnética', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('138c1104-7407-440b-9d7d-c3097fe6c626', 'Mamografia', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Raio X', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('46648a8d-37c6-492a-b9fe-2219f8f44047', 'Densitometria óssea', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('8a53a869-dd62-4254-9e87-fc1693fb77cb', 'Ressonância Magnética de Crânio', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('c9b5e836-2674-410c-91e7-8a0aa257d23a', 'Ressonância Magnética de Coluna Cervical', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('440397b7-e335-45ba-8126-83b626df60fc', 'Ressonância Magnética de Coluna Torácica', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('2f4b85c5-6fbc-4b51-b5db-5ea2303ed38b', 'Ressonância Magnética de Coluna Lombar', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('80eadd69-2d76-4203-9896-17776b42d11b', 'Ressonância Magnética de Ombro', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('aa99a6a5-4089-4914-bc53-32bed2b93443', 'Ressonância Magnética de Cotovelo', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('0054625e-19e4-4306-bb3c-a88d5a0fd628', 'Ressonância Magnética de Punho', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('35795d56-1f0a-43bc-8400-3b949460d267', 'Ressonância Magnética de Quadril', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('ac780cdb-c2df-4c25-ba5c-8edcd9d3f7c0', 'Ressonância Magnética de Joelho', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('58cc3f6f-0fa1-4c3a-af43-d60a6fdf2558', 'Ressonância Magnética de Tornozelo', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('cfe46843-e432-4bc3-af32-8e11eb3cff30', 'Ressonância Magnética de Abdome', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', true, '6 horas', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('1aae8884-6429-47d6-8f95-6d96c3cf4a02', 'Ressonância Magnética de Pelve', '', 'Imagem', true, NULL, true, '2026-04-29 03:02:33.353573+00', 'Ressonância Magnética', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('8a33e2fc-9aea-431f-ad3b-8782c47ba133', 'Eletrocardiograma', '', 'Cardiológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('f436a802-bf1a-4cf3-bcb5-9cd6a40d3f6c', 'Ecocardiograma', '', 'Cardiológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('e59ea1f8-d0fa-4a12-9744-4eeb76017c81', 'Holter 24 horas', '', 'Cardiológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('ed619b65-97e1-4c96-87d2-3112ac4efc77', 'MAPA 24 horas', '', 'Cardiológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('844b5abe-eb7d-4483-8726-fe398832b61b', 'Teste ergométrico', '', 'Cardiológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('2dc34aaf-78b0-4ef1-9d37-f3576917230c', 'Doppler vascular', '', 'Cardiológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('4cb66133-6848-4af0-aa71-3e1f2b54fcb5', 'Eletroencefalograma', '', 'Neurológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('77d9facd-b5ad-4c1c-9c29-b9731456dc3d', 'Eletroneuromiografia', '', 'Neurológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('8c36590e-2297-4a81-8bf9-9544b941d46b', 'Espirometria', '', 'Respiratórios', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('657c0226-467e-4185-845e-e111b947b86f', 'Oximetria', '', 'Respiratórios', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('652e5cd8-9f9e-4392-b5a7-6e3cbc2142d9', 'Gasometria arterial', '', 'Respiratórios', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('d73a7eab-4582-4410-9fb8-f168a551ebbf', 'Audiometria tonal', '', 'Fonoaudiologia / Audiologia', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('a5bc7e46-89cf-41fa-b5b1-363d859398dc', 'Audiometria vocal', '', 'Fonoaudiologia / Audiologia', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('4aeae6c8-4d53-4d5d-9a2d-0f98b9fdff5d', 'Imitanciometria', '', 'Fonoaudiologia / Audiologia', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('68a91c61-ce30-4b09-9990-164771cfef04', 'Emissões otoacústicas', '', 'Fonoaudiologia / Audiologia', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('1ec2c7f4-485e-47fe-a7a2-6f72e77be958', 'BERA / PEATE', '', 'Fonoaudiologia / Audiologia', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('b1f20770-a7c8-48d3-a7e5-82a68c7e2d88', 'Fundoscopia', '', 'Oftalmológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('c7e8ca63-d439-463a-b2c1-3f910654fbf1', 'Tonometria', '', 'Oftalmológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('b0d565cc-304c-4474-8470-63f12630e2ea', 'Acuidade visual', '', 'Oftalmológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('3d992340-43ca-4010-a1be-cf6fc28c5354', 'Mapeamento de retina', '', 'Oftalmológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('52e93963-4009-467b-a8d1-763c88508e4e', 'Refração', '', 'Oftalmológicos', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('c0d91df1-5a24-4b4a-bec0-5b74545cb3c5', 'Avaliação funcional', '', 'Reabilitação / Funcionais', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('7eb119b9-5ea5-4be1-bd60-cca3b86ab057', 'Avaliação postural', '', 'Reabilitação / Funcionais', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('59ae9ac4-563a-41ac-b238-155e604e80f7', 'Avaliação de marcha', '', 'Reabilitação / Funcionais', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('3a5dee21-2246-409c-8f2b-2bb2c8e230c9', 'Avaliação de força muscular', '', 'Reabilitação / Funcionais', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('8ce9760c-3838-43c4-b65f-5105bd7700cf', 'Avaliação de amplitude de movimento', '', 'Reabilitação / Funcionais', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('db1ce097-4f58-4d61-940b-1070c52b3268', 'Avaliação neurológica funcional', '', 'Reabilitação / Funcionais', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('0a9c8645-4240-48ab-bf8c-2a07985a341d', 'Avaliação de equilíbrio', '', 'Reabilitação / Funcionais', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');
INSERT INTO public.exam_types VALUES ('9d2c3743-a11f-4c5b-81e5-9aebd734bd72', 'Avaliação de coordenação motora', '', 'Reabilitação / Funcionais', true, NULL, true, '2026-04-29 03:02:33.353573+00', '', '', false, '', '', 'PADRAO', '2026-04-29 03:02:33.353573+00');


--
-- Data for Name: fila_espera; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: form_templates; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: funcionarios; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.funcionarios VALUES ('e9407009-6760-40cb-bed2-53a003066079', 'dd7a50e6-1ffc-47c1-8e26-606eed53532c', 'Administrador SMS', 'admin.sms', 'admin@sms.oriximina.pa.gov.br', 'Administração', '', '', 'Administrador', 'master', true, '2026-04-23 14:34:05.844673+00', 'sistema', 30, '', '', '', '', false, '', '', '{}');
INSERT INTO public.funcionarios VALUES ('cce7c26f-507c-4eef-aa2c-021b5cac249a', '01264a60-9984-49c1-8558-290800f36c56', 'BRUNO', 'brunosestm@gmail.com', 'brunosestm@gmail.com', '', 'un1776974690707', '', '', 'profissional', true, '2026-05-08 19:52:04.399964+00', 'e9407009-6760-40cb-bed2-53a003066079', 45, 'Médico', 'CRM', '1225556', 'PA', false, '02580765263', '', '{"cbo_codigo": "225125", "cbo_descricao": "MÉDICO CLÍNICO", "aceita_encaminhamento_externo": false}');


--
-- Data for Name: google_calendar_tokens; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: horarios_funcionamento; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: logradouros_dne; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: logs_integracao; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: medications; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.medications VALUES ('6c665d02-c6e0-4266-bb54-fa7ba266b7f1', 'Dipirona sódica 500 mg comprimido', 'Dipirona sódica', 'Analgésico/Antitérmico', '500 mg comprimido', '500 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('d7e242cc-9614-434e-8e6d-b0a10c3eadda', 'Dipirona sódica 500 mg/mL solução oral gotas', 'Dipirona sódica', 'Analgésico/Antitérmico', '500 mg/mL gotas', '500 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg/mL', 'solução oral gotas', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('fe324b09-d295-4f5e-8844-2b226c7e2dd8', 'Paracetamol 500 mg comprimido', 'Paracetamol', 'Analgésico/Antitérmico', '500 mg comprimido', '500 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('d11581ce-e4c6-40ff-9f05-7851e6e52ec5', 'Paracetamol 200 mg/mL solução oral gotas', 'Paracetamol', 'Analgésico/Antitérmico', '200 mg/mL gotas', '200 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '200 mg/mL', 'solução oral gotas', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('e1fcc0f8-d7b7-4e06-bb2d-48df4728f85c', 'Ibuprofeno 300 mg comprimido', 'Ibuprofeno', 'Analgésico/Antitérmico', '300 mg comprimido', '300 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '300 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('d9e7ca19-6486-4c36-9ea5-5e0af4ad47d7', 'Ibuprofeno 50 mg/mL suspensão oral', 'Ibuprofeno', 'Analgésico/Antitérmico', '50 mg/mL suspensão', '50 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '50 mg/mL', 'suspensão oral', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('d7f66460-25b0-41f2-90c6-1840e681b493', 'Diclofenaco sódico 50 mg comprimido', 'Diclofenaco sódico', 'Anti-inflamatório', '50 mg comprimido', '50 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '50 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('afaf4fdd-64cd-4f0f-8fc1-151f109b24b5', 'Nimesulida 100 mg comprimido', 'Nimesulida', 'Anti-inflamatório', '100 mg comprimido', '100 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '100 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('f8579394-5f4f-4ec9-877c-fb9e1cab1532', 'Naproxeno 500 mg comprimido', 'Naproxeno', 'Anti-inflamatório', '500 mg comprimido', '500 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('b8f72d0e-7076-4ebf-8c2b-0e3f9d50ee8d', 'Cetoprofeno 100 mg comprimido', 'Cetoprofeno', 'Anti-inflamatório', '100 mg comprimido', '100 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '100 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('42f117c7-33a8-44cc-bedd-a4554904c658', 'Amoxicilina 500 mg cápsula', 'Amoxicilina', 'Antibiótico', '500 mg cápsula', '500 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg', 'cápsula', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('5336e5aa-749d-404e-bf02-71216f3813b4', 'Amoxicilina 50 mg/mL pó para suspensão oral', 'Amoxicilina', 'Antibiótico', '50 mg/mL suspensão', '50 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '50 mg/mL', 'pó para suspensão oral', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('87c9ea10-710d-46de-8a10-20039d46ca76', 'Amoxicilina + Clavulanato 500 mg + 125 mg comprimido', 'Amoxicilina + Clavulanato', 'Antibiótico', '500/125 mg comprimido', '500 mg + 125 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg + 125 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('7b801a79-5761-4a5a-a6df-cdb4ec68b007', 'Azitromicina 500 mg comprimido', 'Azitromicina', 'Antibiótico', '500 mg comprimido', '500 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('2c95386e-59d0-4454-a0cf-e6e277300fe3', 'Azitromicina 40 mg/mL suspensão oral', 'Azitromicina', 'Antibiótico', '40 mg/mL suspensão', '40 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '40 mg/mL', 'suspensão oral', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('01a3434c-41e9-4fc5-8661-95b711986093', 'Cefalexina 500 mg cápsula', 'Cefalexina', 'Antibiótico', '500 mg cápsula', '500 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg', 'cápsula', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('340faccc-ba57-4aab-af0b-156085bede13', 'Cefalexina 50 mg/mL suspensão oral', 'Cefalexina', 'Antibiótico', '50 mg/mL suspensão', '50 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '50 mg/mL', 'suspensão oral', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('f9fafc1f-ba24-4c5f-9361-e72d15c08300', 'Ciprofloxacino 500 mg comprimido', 'Ciprofloxacino', 'Antibiótico', '500 mg comprimido', '500 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('85fd650b-3b90-4e9e-98af-c0d94c48bbe9', 'Metronidazol 250 mg comprimido', 'Metronidazol', 'Antibiótico', '250 mg comprimido', '250 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '250 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('c2ca2a8e-921b-48ff-8603-d7adbc95b5e3', 'Metronidazol 40 mg/mL suspensão oral', 'Metronidazol', 'Antibiótico', '40 mg/mL suspensão', '40 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '40 mg/mL', 'suspensão oral', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('b722552c-f2d0-4c3d-b8f3-29ad31cb3bc5', 'Sulfametoxazol + Trimetoprima 400 mg + 80 mg comprimido', 'Sulfametoxazol + Trimetoprima', 'Antibiótico', '400/80 mg comprimido', '400 mg + 80 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '400 mg + 80 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('bbdfbd1b-a928-4a40-b79e-e09fec1f3471', 'Losartana potássica 50 mg comprimido', 'Losartana potássica', 'Anti-hipertensivo', '50 mg comprimido', '50 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '50 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('1f6c4f12-f1ed-44dc-97b4-e2929acb6007', 'Captopril 25 mg comprimido', 'Captopril', 'Anti-hipertensivo', '25 mg comprimido', '25 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '25 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('2bdf7392-a713-4542-879a-08b7c3320be5', 'Enalapril 10 mg comprimido', 'Enalapril', 'Anti-hipertensivo', '10 mg comprimido', '10 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '10 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('08f310e3-fd41-4491-b290-bb246a71b81f', 'Hidroclorotiazida 25 mg comprimido', 'Hidroclorotiazida', 'Anti-hipertensivo', '25 mg comprimido', '25 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '25 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('1a16bf52-b16b-4d17-accb-e27ae690a164', 'Furosemida 40 mg comprimido', 'Furosemida', 'Diurético', '40 mg comprimido', '40 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '40 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('d9a5f08f-e178-4187-abbd-182745a5fc62', 'Anlodipino 5 mg comprimido', 'Anlodipino', 'Anti-hipertensivo', '5 mg comprimido', '5 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '5 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('e53bfbc8-77c6-4ad3-b803-0e6eb21b7b95', 'Atenolol 50 mg comprimido', 'Atenolol', 'Anti-hipertensivo', '50 mg comprimido', '50 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '50 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('e34eb5d5-b4f4-4a8e-bb5a-9580013e353d', 'Propranolol 40 mg comprimido', 'Propranolol', 'Anti-hipertensivo', '40 mg comprimido', '40 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '40 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('fc0ade64-ac7d-40b1-a071-a65dc358688a', 'Metformina 500 mg comprimido', 'Metformina', 'Antidiabético', '500 mg comprimido', '500 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '500 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('c08e3f4f-1fd1-48f0-8700-49fe89872f3e', 'Metformina 850 mg comprimido', 'Metformina', 'Antidiabético', '850 mg comprimido', '850 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '850 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('2777ecc8-e413-4bcd-aaa2-30fc18c055a9', 'Glibenclamida 5 mg comprimido', 'Glibenclamida', 'Antidiabético', '5 mg comprimido', '5 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '5 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('c0208bb5-6b9e-42f8-b611-9dd0a3107690', 'Gliclazida 30 mg comprimido', 'Gliclazida', 'Antidiabético', '30 mg comprimido', '30 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '30 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('4497a18a-a86c-4a46-ac78-bcdef90aee64', 'Insulina humana NPH 100 UI/mL suspensão injetável', 'Insulina humana NPH', 'Antidiabético', '100 UI/mL injetável', '100 UI/mL', 'subcutânea', true, NULL, true, '2026-04-29 03:02:03.575007+00', '100 UI/mL', 'suspensão injetável', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('36c33e40-12bb-4d30-b00b-61148c91ba79', 'Insulina humana regular 100 UI/mL solução injetável', 'Insulina humana regular', 'Antidiabético', '100 UI/mL injetável', '100 UI/mL', 'subcutânea', true, NULL, true, '2026-04-29 03:02:03.575007+00', '100 UI/mL', 'solução injetável', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('aeec40cf-ae6f-43e1-bc9b-d521373e7b00', 'Fluoxetina 20 mg cápsula', 'Fluoxetina', 'Antidepressivo', '20 mg cápsula', '20 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '20 mg', 'cápsula', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('bd5e1938-34ab-493c-a560-61e03e9fe464', 'Amitriptilina 25 mg comprimido', 'Amitriptilina', 'Antidepressivo', '25 mg comprimido', '25 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '25 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('254f8165-5cf0-4661-b829-f0bb26dbe8ec', 'Sertralina 50 mg comprimido', 'Sertralina', 'Antidepressivo', '50 mg comprimido', '50 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '50 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('8485851f-8c88-4ee1-aa47-cb54dc8d7038', 'Diazepam 5 mg comprimido', 'Diazepam', 'Ansiolítico/Benzodiazepínico', '5 mg comprimido', '5 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '5 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('a1ec52cd-a93f-4d1b-b4d6-46cd1955c7bc', 'Clonazepam 2 mg comprimido', 'Clonazepam', 'Ansiolítico/Benzodiazepínico', '2 mg comprimido', '2 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '2 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('2c214c99-b893-4f58-ae56-69630b10a5fd', 'Haloperidol 5 mg comprimido', 'Haloperidol', 'Antipsicótico', '5 mg comprimido', '5 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '5 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('ad9346ec-338d-4151-960e-a49f124ec9d0', 'Risperidona 1 mg comprimido', 'Risperidona', 'Antipsicótico', '1 mg comprimido', '1 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '1 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('7d99d089-1110-4ffc-af41-09384419d5fc', 'Carbamazepina 200 mg comprimido', 'Carbamazepina', 'Anticonvulsivante', '200 mg comprimido', '200 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '200 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('3ffc6a91-1127-4724-99ea-56b0bf528b15', 'Ácido valproico 250 mg cápsula', 'Ácido valproico', 'Anticonvulsivante', '250 mg cápsula', '250 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '250 mg', 'cápsula', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('042eaad0-62be-4a9a-9306-bbbb70363a49', 'Loratadina 10 mg comprimido', 'Loratadina', 'Antialérgico', '10 mg comprimido', '10 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '10 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('62842766-8733-4ab6-8277-7501d5f81c1c', 'Loratadina 1 mg/mL xarope', 'Loratadina', 'Antialérgico', '1 mg/mL xarope', '1 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '1 mg/mL', 'xarope', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('80daa660-e985-4ce5-a507-a71e4928ad94', 'Dexclorfeniramina 2 mg comprimido', 'Dexclorfeniramina', 'Antialérgico', '2 mg comprimido', '2 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '2 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('966527b5-652d-4462-9d3f-99eb2be53116', 'Dexclorfeniramina 0,4 mg/mL solução oral', 'Dexclorfeniramina', 'Antialérgico', '0,4 mg/mL solução', '0,4 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '0,4 mg/mL', 'solução oral', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('c7decf12-302f-42ee-8c6d-4fc928100169', 'Prometazina 25 mg comprimido', 'Prometazina', 'Antialérgico', '25 mg comprimido', '25 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '25 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('2f3b9535-240b-485f-9cde-995293da8540', 'Prednisona 5 mg comprimido', 'Prednisona', 'Corticoide', '5 mg comprimido', '5 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.575007+00', '5 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.575007+00');
INSERT INTO public.medications VALUES ('eaee9cc6-836f-4290-b0c4-ec9a3ac4a3da', 'Prednisona 20 mg comprimido', 'Prednisona', 'Corticoide', '20 mg comprimido', '20 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '20 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('19344cf3-6bdd-4738-8c86-97a7ed582235', 'Prednisolona 3 mg/mL solução oral', 'Prednisolona', 'Corticoide', '3 mg/mL solução', '3 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '3 mg/mL', 'solução oral', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('29f78be7-1477-4524-9ae6-95bcc286486b', 'Dexametasona 4 mg comprimido', 'Dexametasona', 'Corticoide', '4 mg comprimido', '4 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '4 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('8ab7ed50-0c1a-4a77-975a-c56ef1ded0a0', 'Hidrocortisona 100 mg pó para solução injetável', 'Hidrocortisona', 'Corticoide', '100 mg injetável', '100 mg', 'intravenosa', true, NULL, true, '2026-04-29 03:02:03.997157+00', '100 mg', 'pó para solução injetável', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('b84815aa-3845-47b9-81ba-085b2f49212e', 'Omeprazol 20 mg cápsula', 'Omeprazol', 'Gastrointestinal', '20 mg cápsula', '20 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '20 mg', 'cápsula', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('13be301d-5e6d-48a5-a30b-a3d414648520', 'Pantoprazol 40 mg comprimido', 'Pantoprazol', 'Gastrointestinal', '40 mg comprimido', '40 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '40 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('1c511627-fceb-4e85-9e16-3a75b9fa9708', 'Metoclopramida 10 mg comprimido', 'Metoclopramida', 'Antiemético', '10 mg comprimido', '10 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '10 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('2515e05c-3664-4a15-80e8-c8ab911ea564', 'Bromoprida 10 mg cápsula', 'Bromoprida', 'Antiemético', '10 mg cápsula', '10 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '10 mg', 'cápsula', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('653f7b47-8c70-457d-9f5f-66a0cde3f528', 'Simeticona 75 mg/mL gotas', 'Simeticona', 'Gastrointestinal', '75 mg/mL gotas', '75 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '75 mg/mL', 'solução oral gotas', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('6cb704e8-ccb6-4f1b-a2c4-1fc228aeb58a', 'Lactulose 667 mg/mL solução oral', 'Lactulose', 'Laxativo', '667 mg/mL solução', '667 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '667 mg/mL', 'solução oral', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('d2e24713-ef6d-414a-96eb-e9480a3512aa', 'Sais de reidratação oral pó para solução', 'Sais de reidratação oral', 'Reidratante', 'sachê pó', 'sachê', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', 'sachê', 'pó para solução oral', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('ab662c17-baa2-4882-9db7-a3d1ad952d67', 'Salbutamol 100 mcg/dose aerossol', 'Salbutamol', 'Broncodilatador', '100 mcg/dose aerossol', '100 mcg/dose', 'inalatória', true, NULL, true, '2026-04-29 03:02:03.997157+00', '100 mcg/dose', 'aerossol', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('f5376bde-0e72-4ab1-a05f-66412e35a436', 'Salbutamol 2 mg/5 mL xarope', 'Salbutamol', 'Broncodilatador', '2 mg/5 mL xarope', '2 mg/5 mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '2 mg/5 mL', 'xarope', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('dfc04d11-dd0d-4ddc-8d8d-b03054efd755', 'Ipratrópio 0,25 mg/mL solução para inalação', 'Ipratrópio', 'Broncodilatador', '0,25 mg/mL inalação', '0,25 mg/mL', 'inalatória', true, NULL, true, '2026-04-29 03:02:03.997157+00', '0,25 mg/mL', 'solução para inalação', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('5000e03d-4caf-4de9-a9f0-64287bb69075', 'Budesonida 50 mcg/dose spray nasal', 'Budesonida', 'Corticoide inalatório', '50 mcg/dose spray', '50 mcg/dose', 'nasal', true, NULL, true, '2026-04-29 03:02:03.997157+00', '50 mcg/dose', 'spray nasal', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('03cb6e93-87c8-478d-917b-ff8194fbf681', 'Beclometasona 250 mcg/dose aerossol', 'Beclometasona', 'Corticoide inalatório', '250 mcg/dose aerossol', '250 mcg/dose', 'inalatória', true, NULL, true, '2026-04-29 03:02:03.997157+00', '250 mcg/dose', 'aerossol', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('ebf23dc4-699b-4939-a1ec-247526985122', 'Acetilcisteína 600 mg granulado', 'Acetilcisteína', 'Mucolítico', '600 mg granulado', '600 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '600 mg', 'granulado', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('79c7542b-37ed-46b5-9705-8b09ad7352b7', 'Sulfato ferroso 40 mg comprimido', 'Sulfato ferroso', 'Suplemento', '40 mg comprimido', '40 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '40 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('608eb5d2-eaac-41a4-b958-6ae5ab2f9ebc', 'Sulfato ferroso 25 mg/mL solução oral', 'Sulfato ferroso', 'Suplemento', '25 mg/mL solução', '25 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '25 mg/mL', 'solução oral', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('4623a83f-a724-4f1b-9406-f1e6f3f26436', 'Ácido fólico 5 mg comprimido', 'Ácido fólico', 'Suplemento', '5 mg comprimido', '5 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '5 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('bbe4abc8-cfd5-43f9-a744-d7d3461dfe60', 'Vitamina D 7.000 UI cápsula', 'Colecalciferol (Vitamina D)', 'Suplemento', '7.000 UI cápsula', '7.000 UI', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '7.000 UI', 'cápsula', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('5b973cb9-23eb-435c-9b98-afca7b29e294', 'Complexo B comprimido', 'Complexo B', 'Suplemento', 'comprimido', 'composto', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', 'composto', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('e5fc649f-f238-4eb1-acc2-e16bdccce220', 'Neomicina + Bacitracina pomada', 'Neomicina + Bacitracina', 'Antibiótico tópico', 'pomada', 'pomada', 'tópica', true, NULL, true, '2026-04-29 03:02:03.997157+00', 'pomada', 'pomada', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('c113af5b-2e97-4616-a32d-b1710210b64a', 'Cetoconazol 20 mg/g creme', 'Cetoconazol', 'Antifúngico', '20 mg/g creme', '20 mg/g', 'tópica', true, NULL, true, '2026-04-29 03:02:03.997157+00', '20 mg/g', 'creme', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('4e932184-97a8-4646-9f5e-7bcb0b0f7dfa', 'Nistatina 100.000 UI/mL suspensão oral', 'Nistatina', 'Antifúngico', '100.000 UI/mL suspensão', '100.000 UI/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '100.000 UI/mL', 'suspensão oral', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('e67daeaa-6612-4fb0-8a4a-85addc19d6db', 'Sulfadiazina de prata 10 mg/g creme', 'Sulfadiazina de prata', 'Antibiótico tópico', '10 mg/g creme', '10 mg/g', 'tópica', true, NULL, true, '2026-04-29 03:02:03.997157+00', '10 mg/g', 'creme', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('28b6c7ef-6d78-403b-9dc4-8809ada70468', 'Ácido acetilsalicílico 100 mg comprimido', 'Ácido acetilsalicílico', 'Antiagregante plaquetário', '100 mg comprimido', '100 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '100 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('9aa6aceb-13d6-4ac3-b6a0-c314b9ed9b7f', 'Sinvastatina 20 mg comprimido', 'Sinvastatina', 'Hipolipemiante', '20 mg comprimido', '20 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '20 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('a3f4ac24-a8e3-4b85-b9c3-34b46c4a6868', 'Albendazol 400 mg comprimido', 'Albendazol', 'Antiparasitário', '400 mg comprimido', '400 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '400 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('69dad794-fb40-41fd-9bfa-4fe8d7dd9a56', 'Albendazol 40 mg/mL suspensão oral', 'Albendazol', 'Antiparasitário', '40 mg/mL suspensão', '40 mg/mL', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '40 mg/mL', 'suspensão oral', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('71866573-3741-46e8-8a89-2af09cbeccb9', 'Mebendazol 100 mg comprimido', 'Mebendazol', 'Antiparasitário', '100 mg comprimido', '100 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '100 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('76a17408-400e-40a4-89f4-37bb637c11e5', 'Ivermectina 6 mg comprimido', 'Ivermectina', 'Antiparasitário', '6 mg comprimido', '6 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '6 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('199b9a72-6459-423d-85ad-435b39830101', 'Escopolamina 10 mg comprimido', 'Escopolamina', 'Antiespasmódico', '10 mg comprimido', '10 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '10 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');
INSERT INTO public.medications VALUES ('83d8a685-dcec-489c-8edc-d2bc41c43eab', 'Ondansetrona 4 mg comprimido', 'Ondansetrona', 'Antiemético', '4 mg comprimido', '4 mg', 'oral', true, NULL, true, '2026-04-29 03:02:03.997157+00', '4 mg', 'comprimido', 'RENAME', '', '2026-04-29 03:02:03.997157+00');


--
-- Data for Name: multiprofessional_evaluations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_logs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: nursing_evaluations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: pacientes; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.pacientes VALUES ('p1777916668790', 'TESTE', '04778279263', '5593991919125', '1999-11-23', '', 'TESTESAASDASDASD', '', '2026-05-04 17:44:29.117009+00', NULL, '', '', '047412214455555', 'TESTE', 'Oriximiná', false, '', '', '', '', '', '', '', '', 'documentos/1777928808964.PDF', '', '', false, '', '', '', false, '{}', '', false, '', '', '', false, false, false, '{"uf": "PA", "cep": "68270000", "cid": "", "sexo": "M", "bairro": "TESTE", "numero": "1245", "raca_cor": "parda", "municipio": "Oriximiná", "logradouro": "TESTESAASDASDASD", "complemento": "", "naturalidade": "Oriximiná - PA", "nacionalidade": "Brasil", "naturalidadeUf": "PA", "tipo_logradouro": "Rua", "telefone_secundario": "", "especialidade_destino": "", "naturalidadeCodigoIbge": "1505304"}', 'un1776974690707', '2026-05-08 16:11:49.006691+00', 'M', 'Oriximiná - PA', 'Brasil', 'parda', '68270000', 'Rua', '1245', '', 'TESTE', 'PA', '', false, '', '', '', '081');


--
-- Data for Name: paciente_documentos; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.paciente_documentos VALUES ('49ceb453-c60f-433e-83a6-e1d842fe9392', 'p1777916668790', '', 'Documento Legado', 'documento_legado.pdf', 'Outros', NULL, NULL, 'sms', 'documentos/1777928808964.PDF', NULL, NULL, true, '2026-05-04 17:44:29.117009+00', '2026-05-04 21:12:29.111801+00', NULL, NULL, NULL);


--
-- Data for Name: paciente_encaminhamentos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: paciente_encaminhamento_anexos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: pts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: treatment_cycles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: patient_discharges; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: patient_regulation; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: patient_evaluations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: permissoes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: permissoes_usuario; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sigtap_procedimentos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: procedimento_profissionais; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: procedimentos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: professional_preferences; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: profissionais_carimbo; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: profissionais_externos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: prontuario_anexos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: prontuario_config; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: prontuarios; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.prontuarios VALUES ('e4cdff72-5265-41ba-abd0-4d21bc604d4f', 'p1777916668790', 'TESTE', 'e9407009-6760-40cb-bed2-53a003066079', 'Administrador SMS', '', '', 'Administração', '', '2026-05-08', '', '', '', '', '', '', '', '', '', '', '', '2026-05-08 21:23:41.674672+00', '2026-05-08 21:23:41.674672+00', '', '', NULL, '', '', 'avaliacao_inicial', '', '', '', '', '{}');


--
-- Data for Name: prontuario_procedimentos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: prontuario_resultados_exames; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: pts_cid; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: pts_import_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: pts_sigtap; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: quotas_externas; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: unidades; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.unidades VALUES ('un1776974690707', 'CAPS II', '', '', '', true, '2026-04-23 20:04:50.412075+00', '{}', '');


--
-- Data for Name: salas; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sigtap_procedimento_cids; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: soap_custom_options; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: system_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.system_config VALUES ('default', '{"gmail": {"ativo": false, "email": "", "senhaApp": "", "smtpHost": "smtp.gmail.com", "smtpPort": 587}, "webhook": {"url": "https://hook.us2.make.com/a12e4puc3o58b3z78k9qu3wxevr5qkwa", "ativo": true, "status": "ativo"}, "whatsapp": {"ativo": false, "token": "", "numero": "", "provedor": "zapi", "notificacoes": {"lembrete2h": true, "remarcacao": true, "confirmacao": true, "lembrete24h": true, "cancelamento": true}}, "templates": {"lembrete": "Lembrete: Sua consulta é em {data} às {hora} na {unidade} com {profissional}.", "confirmacao": "Olá {nome}! Sua consulta foi agendada para {data} às {hora} na {unidade}. Profissional: {profissional}."}, "filaEspera": {"modoEncaixe": "assistido"}, "config_sistema": {"backup": {"autoBackup": false, "agendamento": "semanal", "ultimoBackup": null}, "aparencia": {"tema": "escuro", "fonte": "Inter", "corPrimaria": "#2A6F97", "tamanhoFonte": "medio"}, "instituicao": {"cer": "CAPS II", "cnpj": "", "nome": "Secretaria Municipal de Saúde de Oriximiná", "email": "", "logoUrl": "", "endereco": "", "telefone": ""}, "conformidade": {"lgpdTexto": "Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.", "retencaoDados": 20, "anonimizarApos": 25, "exibirAvisoLgpd": true}, "notificacoes": {"canal": "ambos", "resumoDiario": false, "alertarFimCiclo": true, "alertarPtsVencer": true, "notificarChegada": true, "relatorioSemanal": true, "notificarTriagemPendente": true}}, "googleCalendar": {"conectado": false, "criarEvento": true, "enviarEmail": true, "removerCancelar": true, "atualizarRemarcar": true}, "portalPaciente": {"permitirPortal": false, "enviarLinkAcesso": false, "pacientesBloqueados": [], "enviarSenhaAutomaticamente": false}, "canalNotificacao": "webhook", "config_impressao": {"cabecalho": {"cor": "#0c4a6e", "fonte": "Arial", "linha1": "SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ", "linha2": "CAPS II", "logoUrl": "", "alinhamento": "center", "logoDireita": "https://dgebfmohtoszzrmzxefy.supabase.co/storage/v1/object/public/document-logos/logo-direita-1777918259166.png", "logoEsquerda": "https://dgebfmohtoszzrmzxefy.supabase.co/storage/v1/object/public/document-logos/logo-esquerda-1777919100348.png", "tamanhoFonte": 12}, "receituario": {"rodape": "", "titulo": "RECEITUÁRIO MÉDICO", "mostrarConvenio": true, "mostrarAssinatura": true, "mostrarNascimento": false, "mostrarProntuario": true}, "rodapeTexto": "", "relatorioEvolucao": {"habilitado": true, "camposVisiveis": ["subjetivo", "objetivo", "avaliacao", "plano"], "historicoSessoes": 5}, "solicitacaoExames": {"rodape": "", "titulo": "SOLICITAÇÃO DE EXAMES", "mostrarCodigoSus": true, "mostrarIndicacao": true, "mostrarAssinatura": true}, "termoConsentimento": {"texto": "", "habilitado": false}}, "config_prontuario_tipos": {"campos": [{"id": "c1", "key": "queixa_principal", "tipo": "textarea", "label": "Queixa Principal", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": true, "tiposProntuario": ["primeira_consulta", "urgencia"]}, {"id": "c2", "key": "historia_doenca", "tipo": "textarea", "label": "História da Doença Atual (HDA)", "order": 2, "isBuiltin": false, "habilitado": true, "obrigatorio": true, "tiposProntuario": ["primeira_consulta"]}, {"id": "c3", "key": "historico_saude", "tipo": "textarea", "label": "Histórico de Saúde", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta"]}, {"id": "c4", "key": "medicacoes_uso", "tipo": "textarea", "label": "Medicações em Uso", "order": 4, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta"]}, {"id": "c5", "key": "alergias", "tipo": "textarea", "label": "Alergias", "order": 5, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta"]}, {"id": "c6", "key": "diagnostico_funcional", "tipo": "textarea", "label": "Diagnóstico Funcional", "order": 6, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta"]}, {"id": "c7", "key": "conduta", "tipo": "textarea", "label": "Conduta", "order": 7, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["primeira_consulta", "urgencia"]}, {"id": "c8", "key": "reavaliacao", "tipo": "textarea", "label": "Reavaliação", "order": 1, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["retorno"]}, {"id": "c9", "key": "evolucao_clinica", "tipo": "textarea", "label": "Evolução Clínica", "order": 2, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["retorno"]}, {"id": "c10", "key": "ajuste_conduta", "tipo": "textarea", "label": "Ajuste de Conduta", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["retorno"]}, {"id": "c11", "key": "contador_sessao", "tipo": "text", "label": "Contador de Sessão", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": true, "tiposProntuario": ["sessao"]}, {"id": "c12", "key": "procedimentos_realizados", "tipo": "textarea", "label": "Procedimentos Realizados", "order": 2, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["sessao"]}, {"id": "c13", "key": "resposta_paciente", "tipo": "textarea", "label": "Resposta do Paciente", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["sessao"]}, {"id": "c14", "key": "intercorrencias", "tipo": "textarea", "label": "Intercorrências", "order": 4, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["sessao"]}, {"id": "c15", "key": "sinais_vitais_urgencia", "tipo": "text", "label": "Sinais Vitais Ampliados", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": true, "tiposProntuario": ["urgencia"]}, {"id": "c16", "key": "conduta_rapida", "tipo": "textarea", "label": "Conduta Rápida", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["urgencia"]}, {"id": "c17", "key": "encaminhamentos", "tipo": "textarea", "label": "Encaminhamento", "order": 4, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["urgencia"]}, {"id": "c18", "key": "tipo_procedimento", "tipo": "text", "label": "Tipo de Exame/Procedimento", "order": 1, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["procedimento"]}, {"id": "c19", "key": "resultado", "tipo": "textarea", "label": "Resultado", "order": 2, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["procedimento"]}, {"id": "c20", "key": "conduta_pos", "tipo": "textarea", "label": "Conduta Pós-Procedimento", "order": 3, "isBuiltin": false, "habilitado": true, "obrigatorio": false, "tiposProntuario": ["procedimento"]}], "alertas": [{"id": "a1", "condicao": "risco_alto", "mensagem": "⚠️ Acionar protocolo de segurança", "isBuiltin": true, "habilitado": true}, {"id": "a2", "campo": "eva", "valor": "8", "condicao": "dor_eva_alta", "mensagem": "⚠️ Dor severa — avaliar conduta imediata", "operador": ">=", "isBuiltin": true, "habilitado": true}, {"id": "a3", "campo": "imc", "valor": "18.5-30", "condicao": "imc_fora", "mensagem": "⚠️ IMC fora da faixa ideal", "operador": "fora", "isBuiltin": true, "habilitado": true}, {"id": "a4", "condicao": "emergencia", "mensagem": "🚨 Classificação de risco: Emergência", "isBuiltin": true, "habilitado": true}], "soapLabels": {"plano": "Plano", "objetivo": "Objetivo", "avaliacao": "Avaliação", "subjetivo": "Subjetivo"}, "tempoLimiteEdicao": 24, "exigirSenhaAoSalvar": false}, "config_fluxo_atendimento": {"turnos": [{"id": "turno_manha", "nome": "Manhã", "ativo": true, "horaFim": "12:00", "horaInicio": "07:00"}, {"id": "turno_tarde", "nome": "Tarde", "ativo": true, "horaFim": "18:00", "horaInicio": "13:00"}, {"id": "turno_noite", "nome": "Noite", "ativo": false, "horaFim": "22:00", "horaInicio": "18:00"}], "triagem": {"camposOpcionais": [{"key": "peso", "label": "Peso", "habilitado": false}, {"key": "glicemia", "label": "Glicemia Capilar", "habilitado": false}], "camposObrigatorios": [{"key": "pressao_arterial", "label": "Pressão Arterial", "obrigatorio": true}, {"key": "temperatura", "label": "Temperatura", "obrigatorio": true}, {"key": "saturacao_oxigenio", "label": "Saturação", "obrigatorio": true}, {"key": "frequencia_cardiaca", "label": "Frequência Cardíaca", "obrigatorio": true}, {"key": "classificacao_risco", "label": "Classificação de Risco", "obrigatorio": true}]}, "ptsCiclo": {"exigirPts": false, "exigirCiclo": false, "sessoesPadrao": 10, "prazoAlertaPts": 6, "frequenciaPadrao": "semanal", "alertarPtsVencido": true, "alertarUltimaSessao": true}, "tiposAtendimento": [{"key": "avaliacao_inicial", "label": "1ª Consulta", "isBuiltin": true, "habilitado": true}, {"key": "retorno", "label": "Retorno", "isBuiltin": true, "habilitado": true}, {"key": "sessao", "label": "Sessão", "isBuiltin": true, "habilitado": true}, {"key": "urgencia", "label": "Urgência", "isBuiltin": true, "habilitado": true}, {"key": "procedimento", "label": "Procedimento", "isBuiltin": true, "habilitado": true}], "regrasAgendamento": {"intervalo": 15, "tempoSessao": 45, "tempoConsulta": 30, "maxPacientesDia": 20, "permitirEncaixe": true, "antecedenciaMaxima": 60, "antecedenciaMinima": 2}, "classificacaoRisco": [{"cor": "#22c55e", "key": "nao_urgente", "label": "Não urgente"}, {"cor": "#eab308", "key": "pouco_urgente", "label": "Pouco urgente"}, {"cor": "#f97316", "key": "urgente", "label": "Urgente"}, {"cor": "#ef4444", "key": "muito_urgente", "label": "Muito urgente"}, {"cor": "#dc2626", "key": "emergencia", "label": "Emergência"}]}, "config_prescricao_perfil": {"medicina": true, "nutricao": true, "enfermagem": true, "psicologia": true, "odontologia": true, "fisioterapia": true, "fonoaudiologia": true}, "config_especialidades_campos": [{"key": "fisioterapia", "ativa": true, "label": "Fisioterapia", "campos": [{"id": "f1", "key": "avaliacao_funcional", "tipo": "textarea", "label": "Avaliação Funcional", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "f2", "key": "adm", "tipo": "textarea", "label": "ADM (Amplitude de Movimento)", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "f3", "key": "forca_muscular", "tipo": "number", "label": "Força Muscular (MRC 0-5)", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "f4", "key": "dor_eva", "tipo": "number", "label": "Dor EVA (0-10)", "order": 4, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "f5", "key": "postura_marcha", "tipo": "textarea", "label": "Postura e Marcha", "order": 5, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["fisioterapia"]}, {"key": "psicologia", "ativa": true, "label": "Psicologia", "campos": [{"id": "p1", "key": "estado_emocional", "tipo": "textarea", "label": "Estado Emocional", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno", "sessao"]}, {"id": "p2", "key": "comportamento", "tipo": "textarea", "label": "Comportamento Observado", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "p3", "key": "relato_subjetivo", "tipo": "textarea", "label": "Relato Subjetivo", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "p4", "key": "risco", "tipo": "select", "label": "Risco Auto/Heteroagressão", "order": 4, "opcoes": ["Ausente", "Baixo", "Moderado", "Alto"], "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["psicologia"]}, {"key": "fonoaudiologia", "ativa": true, "label": "Fonoaudiologia", "campos": [{"id": "fo1", "key": "comunicacao", "tipo": "textarea", "label": "Avaliação da Comunicação", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "fo2", "key": "linguagem", "tipo": "textarea", "label": "Linguagem", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "fo3", "key": "degluticao", "tipo": "textarea", "label": "Deglutição", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "fo4", "key": "voz", "tipo": "textarea", "label": "Voz", "order": 4, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["fonoaudiologia"]}, {"key": "nutricao", "ativa": true, "label": "Nutrição", "campos": [{"id": "n1", "key": "peso", "tipo": "number", "label": "Peso (kg)", "order": 1, "isBuiltin": true, "habilitado": false, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "n2", "key": "altura", "tipo": "number", "label": "Altura (m)", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "n3", "key": "imc", "tipo": "text", "label": "IMC (calculado)", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "n4", "key": "avaliacao_nutricional", "tipo": "textarea", "label": "Avaliação Nutricional", "order": 4, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "n5", "key": "habitos", "tipo": "textarea", "label": "Hábitos Alimentares", "order": 5, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "n6", "key": "plano_alimentar", "tipo": "textarea", "label": "Plano Alimentar", "order": 6, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["nutricao"]}, {"key": "terapia_ocupacional", "ativa": true, "label": "Terapia Ocupacional", "campos": [{"id": "to1", "key": "mif", "tipo": "number", "label": "MIF (18-126)", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "to2", "key": "avd", "tipo": "textarea", "label": "AVD", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "to3", "key": "aivd", "tipo": "textarea", "label": "AIVD", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "to4", "key": "contexto", "tipo": "textarea", "label": "Contexto Ambiental e Social", "order": 4, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["terapia_ocupacional"]}, {"key": "medicina", "ativa": true, "label": "Medicina", "campos": [{"id": "m1", "key": "exame_fisico", "tipo": "textarea", "label": "Exame Físico Geral", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "m2", "key": "sistemas", "tipo": "textarea", "label": "Sistemas Avaliados", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "m3", "key": "hipotese_cid", "tipo": "textarea", "label": "Hipótese Diagnóstica com CID", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["medicina"]}, {"key": "odontologia", "ativa": true, "label": "Odontologia", "campos": [{"id": "o1", "key": "exame_intrabucal", "tipo": "textarea", "label": "Exame Intrabucal", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "o2", "key": "queixa_odonto", "tipo": "textarea", "label": "Queixa Odontológica", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "o3", "key": "plano_tratamento", "tipo": "textarea", "label": "Plano de Tratamento", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["odontologia"]}, {"key": "enfermagem", "ativa": true, "label": "Enfermagem", "campos": [{"id": "e1", "key": "avaliacao_enfermagem", "tipo": "textarea", "label": "Avaliação de Enfermagem", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "e2", "key": "cuidados", "tipo": "textarea", "label": "Cuidados Realizados", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "e3", "key": "intercorrencias", "tipo": "textarea", "label": "Intercorrências", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["enfermagem"]}, {"key": "servico_social", "ativa": true, "label": "Serviço Social", "campos": [{"id": "ss1", "key": "situacao_socioeconomica", "tipo": "textarea", "label": "Situação Socioeconômica", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "ss2", "key": "rede_apoio", "tipo": "textarea", "label": "Rede de Apoio", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "ss3", "key": "vulnerabilidade", "tipo": "select", "label": "Vulnerabilidade Social", "order": 3, "opcoes": ["Baixa", "Média", "Alta", "Extrema"], "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "ss4", "key": "encaminhamentos_sociais", "tipo": "textarea", "label": "Encaminhamentos Sociais", "order": 4, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "ss5", "key": "parecer_social", "tipo": "textarea", "label": "Parecer Social", "order": 5, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["servico_social", "assistente_social"]}, {"key": "cirurgia_geral", "ativa": true, "label": "Cirurgia Geral", "campos": [{"id": "cg1", "key": "indicacao_cirurgica", "tipo": "textarea", "label": "Indicação Cirúrgica", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "cg2", "key": "avaliacao_preop", "tipo": "textarea", "label": "Avaliação Pré-operatória", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "cg3", "key": "descricao_procedimento", "tipo": "textarea", "label": "Descrição do Procedimento", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "cg4", "key": "orientacoes_posop", "tipo": "textarea", "label": "Orientações Pós-operatórias", "order": 4, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["cirurgia_geral", "cirurgiao"]}, {"key": "infectologia", "ativa": true, "label": "Infectologia", "campos": [{"id": "inf1", "key": "agente_infeccioso", "tipo": "textarea", "label": "Agente Infeccioso / Suspeita", "order": 1, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "inf2", "key": "exames_lab", "tipo": "textarea", "label": "Exames Laboratoriais", "order": 2, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "inf3", "key": "esquema_terapeutico", "tipo": "textarea", "label": "Esquema Terapêutico", "order": 3, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}, {"id": "inf4", "key": "medidas_controle", "tipo": "textarea", "label": "Medidas de Controle", "order": 4, "isBuiltin": true, "habilitado": true, "obrigatorio": false, "tipos_prontuario": ["avaliacao", "retorno"]}], "profissoes": ["infectologia", "infectologista"]}], "config_modos_disponibilidade": {"cce7c26f-507c-4eef-aa2c-021b5cac249a": "por_turno"}, "estrutura_prontuario_primeira_consulta": {"fields": [{"id": "f_1777905190439_qx21y", "type": "text", "label": "CONSULTA", "required": false}], "version": 2, "updatedAt": "2026-05-04T14:33:39.935Z"}}', '2026-05-08 21:23:08.33319+00');


--
-- Data for Name: treatment_extensions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: treatment_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: triage_records; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: triage_settings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: whatsapp_config; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: whatsapp_consents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: whatsapp_event_config; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: whatsapp_queue; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: whatsapp_templates; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--

\unrestrict lzRIwoHM5QbmOwjTJUc9n4o1YTKE4eTNu6c1e4vQb8RON8i9QPtgOCsJqtFGis2




-- PARTE 8 — VALIDAÇÃO
SELECT 'Tabelas' as item, count(*) as total FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL
SELECT 'Funções', count(*) FROM information_schema.routines WHERE routine_schema = 'public'
UNION ALL
SELECT 'Triggers', count(*) FROM information_schema.triggers WHERE event_object_schema = 'public'
UNION ALL
SELECT 'Policies', count(*) FROM pg_policies WHERE schemaname = 'public';
