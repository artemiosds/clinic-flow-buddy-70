-- Garantir que a tabela tenha os campos necessários
ALTER TABLE public.assinatura_eletronica_config 
ADD COLUMN IF NOT EXISTS status_conexao TEXT DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS ultimo_teste_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ultimo_erro TEXT,
ADD COLUMN IF NOT EXISTS notificar_email BOOLEAN DEFAULT true;

-- Criar índice único para evitar duplicidade (provider + unidade_id)
-- Como unidade_id pode ser NULL para global, usamos um índice parcial ou tratamos no código
DROP INDEX IF EXISTS idx_assinatura_config_provider_unidade;
CREATE UNIQUE INDEX idx_assinatura_config_provider_unidade ON public.assinatura_eletronica_config (provider, COALESCE(unidade_id, 'global'));

-- Remover políticas antigas para recriar corretamente
DROP POLICY IF EXISTS "Apenas Master vê configurações completas" ON public.assinatura_eletronica_config;
DROP POLICY IF EXISTS "Outros perfis veem se está ativo (sem token)" ON public.assinatura_eletronica_config;
DROP POLICY IF EXISTS "Apenas Master edita configurações" ON public.assinatura_eletronica_config;

-- Nova política: Leitura
-- Master global vê tudo. Master de unidade vê apenas a sua ou global. Outros veem apenas se está ativo.
CREATE POLICY "Leitura de configuração de assinatura" 
ON public.assinatura_eletronica_config 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM funcionarios 
    WHERE auth_user_id = auth.uid() 
    AND (
      role = 'master' 
      OR cargo ILIKE '%administrador%'
    )
  )
  OR ativo = true
);

-- Nova política: Inserção/Atualização/Deleção
-- Apenas Master global ou Administrador Master pode gerenciar
CREATE POLICY "Gerenciamento de configuração de assinatura" 
ON public.assinatura_eletronica_config 
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM funcionarios 
    WHERE auth_user_id = auth.uid() 
    AND (
      role = 'master' 
      OR cargo ILIKE '%administrador%'
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM funcionarios 
    WHERE auth_user_id = auth.uid() 
    AND (
      role = 'master' 
      OR cargo ILIKE '%administrador%'
    )
  )
);

-- Função para salvar com segurança (pode ser chamada via RPC ou Edge Function)
CREATE OR REPLACE FUNCTION public.salvar_configuracao_autentique(
  p_ativo BOOLEAN,
  p_ambiente TEXT,
  p_token_api TEXT,
  p_organizacao_nome TEXT,
  p_enviar_email BOOLEAN,
  p_exigir_profissional BOOLEAN,
  p_baixar_assinado_automaticamente BOOLEAN,
  p_unidade_id TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_is_master BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  -- Verificar se é master
  SELECT EXISTS (
    SELECT 1 FROM funcionarios 
    WHERE auth_user_id = v_user_id 
    AND (role = 'master' OR cargo ILIKE '%administrador%')
  ) INTO v_is_master;

  IF NOT v_is_master THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem salvar configurações.';
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
    p_token_api,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
