-- =======================================================================
-- Integração entre sistemas Lovable iguais (Encaminhamento Externo)
-- Fase 1: estrutura base + segurança
-- =======================================================================

-- 1) Sistemas Integrados (cadastro de outras unidades/redes)
CREATE TABLE IF NOT EXISTS public.sistemas_integrados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  identificador_sistema text NOT NULL UNIQUE,
  url_base text NOT NULL DEFAULT '',
  -- Token enviado para o sistema externo (para ENVIAR encaminhamentos): armazenado como está (segredo compartilhado)
  token_saida text NOT NULL DEFAULT '',
  -- Token que o sistema externo deve enviar para nós (para RECEBER): armazenamos apenas o HASH
  token_entrada_hash text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  permite_enviar boolean NOT NULL DEFAULT true,
  permite_receber boolean NOT NULL DEFAULT true,
  ultima_sincronizacao timestamptz,
  observacoes text NOT NULL DEFAULT '',
  criado_por text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sistemas_integrados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master manage sistemas_integrados"
  ON public.sistemas_integrados
  FOR ALL
  TO authenticated
  USING (has_staff_role('master') OR has_staff_role('gestao'))
  WITH CHECK (has_staff_role('master') OR has_staff_role('gestao'));

CREATE POLICY "Staff read sistemas_integrados"
  ON public.sistemas_integrados
  FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE TRIGGER sistemas_integrados_set_updated_at
  BEFORE UPDATE ON public.sistemas_integrados
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- 2) Logs de Integração (auditoria específica)
CREATE TABLE IF NOT EXISTS public.logs_integracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_acao text NOT NULL,                -- envio, recebimento, visualizacao, aceite, recusa, erro, teste_conexao, listar_profissionais
  direcao text NOT NULL DEFAULT 'saida',  -- 'saida' | 'entrada'
  sistema_integrado_id uuid REFERENCES public.sistemas_integrados(id) ON DELETE SET NULL,
  identificador_remoto text NOT NULL DEFAULT '',
  usuario_id text NOT NULL DEFAULT '',
  usuario_nome text NOT NULL DEFAULT '',
  paciente_id text NOT NULL DEFAULT '',
  encaminhamento_id uuid,
  status text NOT NULL DEFAULT 'sucesso', -- sucesso | falha | rejeitado
  http_status integer,
  mensagem text NOT NULL DEFAULT '',
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.logs_integracao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master read logs_integracao"
  ON public.logs_integracao
  FOR SELECT
  TO authenticated
  USING (has_staff_role('master') OR has_staff_role('gestao') OR has_staff_role('coordenador'));

CREATE POLICY "Staff insert logs_integracao"
  ON public.logs_integracao
  FOR INSERT
  TO authenticated
  WITH CHECK (is_staff_member());

CREATE INDEX IF NOT EXISTS idx_logs_integracao_created_at ON public.logs_integracao (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_integracao_sistema ON public.logs_integracao (sistema_integrado_id);

-- 3) Encaminhamentos Externos (caixa de entrada do destino + caixa de saída do origem)
CREATE TABLE IF NOT EXISTS public.encaminhamentos_externos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direcao text NOT NULL,                  -- 'saida' (origem) | 'entrada' (destino)
  sistema_integrado_id uuid REFERENCES public.sistemas_integrados(id) ON DELETE SET NULL,
  remoto_encaminhamento_id text NOT NULL DEFAULT '', -- id no sistema oposto
  -- Origem
  origem_identificador_sistema text NOT NULL DEFAULT '',
  origem_unidade text NOT NULL DEFAULT '',
  origem_profissional_id text NOT NULL DEFAULT '',
  origem_profissional_nome text NOT NULL DEFAULT '',
  origem_especialidade text NOT NULL DEFAULT '',
  -- Destino
  destino_unidade text NOT NULL DEFAULT '',
  destino_profissional_id text NOT NULL DEFAULT '',
  destino_profissional_nome text NOT NULL DEFAULT '',
  destino_especialidade text NOT NULL DEFAULT '',
  -- Paciente (snapshot)
  paciente_id_origem text NOT NULL DEFAULT '',
  paciente_id_destino text NOT NULL DEFAULT '',
  paciente_nome text NOT NULL DEFAULT '',
  paciente_cpf text NOT NULL DEFAULT '',
  paciente_cns text NOT NULL DEFAULT '',
  paciente_data_nascimento text NOT NULL DEFAULT '',
  paciente_telefone text NOT NULL DEFAULT '',
  paciente_dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Conteúdo clínico
  motivo text NOT NULL DEFAULT '',
  resumo_clinico text NOT NULL DEFAULT '',
  cid text NOT NULL DEFAULT '',
  procedimentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  documento_texto text NOT NULL DEFAULT '',
  documento_url text NOT NULL DEFAULT '',
  -- Ciclo
  status text NOT NULL DEFAULT 'pendente_envio', -- pendente_envio | enviado | recebido | visualizado | aceito | recusado | agendado | cancelado | falha_envio
  justificativa_recusa text NOT NULL DEFAULT '',
  recebido_em timestamptz,
  visualizado_em timestamptz,
  aceito_em timestamptz,
  recusado_em timestamptz,
  agendado_em timestamptz,
  -- Auditoria
  criado_por text NOT NULL DEFAULT '',
  ultima_tentativa_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.encaminhamentos_externos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read encaminhamentos_externos"
  ON public.encaminhamentos_externos
  FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff insert encaminhamentos_externos"
  ON public.encaminhamentos_externos
  FOR INSERT
  TO authenticated
  WITH CHECK (is_staff_member());

CREATE POLICY "Staff update encaminhamentos_externos"
  ON public.encaminhamentos_externos
  FOR UPDATE
  TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

CREATE TRIGGER encaminhamentos_externos_set_updated_at
  BEFORE UPDATE ON public.encaminhamentos_externos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

CREATE INDEX IF NOT EXISTS idx_encaminhamentos_externos_status ON public.encaminhamentos_externos (status);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_externos_direcao ON public.encaminhamentos_externos (direcao);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_externos_destino_prof ON public.encaminhamentos_externos (destino_profissional_id);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_externos_created_at ON public.encaminhamentos_externos (created_at DESC);