
-- Tabela de resultados de exames vinculados ao prontuário
CREATE TABLE IF NOT EXISTS public.prontuario_resultados_exames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prontuario_id uuid,
  paciente_id text NOT NULL,
  agendamento_id text DEFAULT '',
  unidade_id text DEFAULT '',
  
  -- Identificação do exame
  nome_exame text NOT NULL,
  tipo_exame text DEFAULT 'laboratorial',
  laboratorio text DEFAULT '',
  
  -- Datas relevantes
  data_solicitacao date,
  data_coleta date,
  data_resultado date,
  
  -- Profissionais
  medico_solicitante text DEFAULT '',
  medico_solicitante_id text DEFAULT '',
  
  -- Status e vínculo de atendimento
  status text NOT NULL DEFAULT 'pendente',
  tipo_atendimento_vinculado text DEFAULT 'rotina',
  
  -- Resultados
  valor_encontrado text DEFAULT '',
  valor_referencia text DEFAULT '',
  unidade_medida text DEFAULT '',
  interpretacao text DEFAULT 'normal',
  laudo text DEFAULT '',
  observacoes_medicas text DEFAULT '',
  
  -- Anexo opcional (storage path no bucket prontuario-anexos)
  anexo_storage_path text DEFAULT '',
  anexo_nome_arquivo text DEFAULT '',
  
  -- Metadados
  criado_por text DEFAULT '',
  criado_por_nome text DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resultados_exames_paciente ON public.prontuario_resultados_exames(paciente_id);
CREATE INDEX IF NOT EXISTS idx_resultados_exames_prontuario ON public.prontuario_resultados_exames(prontuario_id);
CREATE INDEX IF NOT EXISTS idx_resultados_exames_status ON public.prontuario_resultados_exames(status);
CREATE INDEX IF NOT EXISTS idx_resultados_exames_data ON public.prontuario_resultados_exames(data_resultado DESC);

ALTER TABLE public.prontuario_resultados_exames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read resultados_exames"
  ON public.prontuario_resultados_exames FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff insert resultados_exames"
  ON public.prontuario_resultados_exames FOR INSERT
  TO authenticated
  WITH CHECK (is_staff_member());

CREATE POLICY "Staff update resultados_exames"
  ON public.prontuario_resultados_exames FOR UPDATE
  TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

CREATE POLICY "Staff delete resultados_exames"
  ON public.prontuario_resultados_exames FOR DELETE
  TO authenticated
  USING (is_staff_member());

-- Trigger de updated_at
CREATE TRIGGER set_resultados_exames_updated_at
  BEFORE UPDATE ON public.prontuario_resultados_exames
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_now();
