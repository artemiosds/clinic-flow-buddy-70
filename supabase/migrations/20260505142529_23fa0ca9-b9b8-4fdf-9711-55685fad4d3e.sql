CREATE OR REPLACE FUNCTION public.salvar_configuracao_autentique(
  p_ativo boolean,
  p_ambiente text,
  p_token_api text,
  p_organizacao_nome text,
  p_enviar_email boolean,
  p_exigir_profissional boolean,
  p_baixar_assinado_automaticamente boolean,
  p_unidade_id text DEFAULT NULL::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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