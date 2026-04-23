
-- Tabela de anexos vinculados a um prontuário
CREATE TABLE IF NOT EXISTS public.prontuario_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prontuario_id UUID NOT NULL,
  paciente_id TEXT NOT NULL,
  agendamento_id TEXT DEFAULT '',
  tipo_registro TEXT NOT NULL DEFAULT 'consulta',
  categoria TEXT NOT NULL DEFAULT 'documento', -- documento | exame | laudo | imagem | outro
  nome_arquivo TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  tamanho_bytes BIGINT NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT '',
  uploaded_by_nome TEXT NOT NULL DEFAULT '',
  unidade_id TEXT NOT NULL DEFAULT '',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prontuario_anexos_prontuario ON public.prontuario_anexos(prontuario_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_anexos_paciente ON public.prontuario_anexos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_anexos_agendamento ON public.prontuario_anexos(agendamento_id);

ALTER TABLE public.prontuario_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read prontuario_anexos" ON public.prontuario_anexos
  FOR SELECT TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff insert prontuario_anexos" ON public.prontuario_anexos
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_member());

CREATE POLICY "Staff update prontuario_anexos" ON public.prontuario_anexos
  FOR UPDATE TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

CREATE POLICY "Staff delete prontuario_anexos" ON public.prontuario_anexos
  FOR DELETE TO authenticated
  USING (is_staff_member());

-- Storage bucket privado para anexos clínicos
INSERT INTO storage.buckets (id, name, public)
VALUES ('prontuario-anexos', 'prontuario-anexos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff read prontuario anexos files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'prontuario-anexos' AND is_staff_member());

CREATE POLICY "Staff upload prontuario anexos files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'prontuario-anexos' AND is_staff_member());

CREATE POLICY "Staff delete prontuario anexos files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'prontuario-anexos' AND is_staff_member());
