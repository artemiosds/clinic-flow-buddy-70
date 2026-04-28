
-- 1) Tabela de anexos
CREATE TABLE IF NOT EXISTS public.encaminhamentos_anexos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  encaminhamento_id uuid NOT NULL,
  direcao text NOT NULL DEFAULT 'saida',
  nome_arquivo text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT '',
  tamanho_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL DEFAULT '',
  url_remota text NOT NULL DEFAULT '',
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enc_anexos_enc ON public.encaminhamentos_anexos(encaminhamento_id);

ALTER TABLE public.encaminhamentos_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read encaminhamentos_anexos"
ON public.encaminhamentos_anexos FOR SELECT
TO authenticated
USING (is_staff_member());

CREATE POLICY "Staff insert encaminhamentos_anexos"
ON public.encaminhamentos_anexos FOR INSERT
TO authenticated
WITH CHECK (is_staff_member());

CREATE POLICY "Staff update encaminhamentos_anexos"
ON public.encaminhamentos_anexos FOR UPDATE
TO authenticated
USING (is_staff_member())
WITH CHECK (is_staff_member());

CREATE POLICY "Staff delete encaminhamentos_anexos"
ON public.encaminhamentos_anexos FOR DELETE
TO authenticated
USING (is_staff_member());

-- 2) Campos extras para retry/backoff e PDF
ALTER TABLE public.encaminhamentos_externos
  ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_path text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_enc_ext_retry
  ON public.encaminhamentos_externos(status, proxima_tentativa_em)
  WHERE status = 'falha_envio';

-- 3) Storage policies para o bucket "encaminhamentos" (privado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Staff read encaminhamentos bucket'
  ) THEN
    CREATE POLICY "Staff read encaminhamentos bucket"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'encaminhamentos' AND is_staff_member());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Staff upload encaminhamentos bucket'
  ) THEN
    CREATE POLICY "Staff upload encaminhamentos bucket"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'encaminhamentos' AND is_staff_member());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Staff update encaminhamentos bucket'
  ) THEN
    CREATE POLICY "Staff update encaminhamentos bucket"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'encaminhamentos' AND is_staff_member())
    WITH CHECK (bucket_id = 'encaminhamentos' AND is_staff_member());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Staff delete encaminhamentos bucket'
  ) THEN
    CREATE POLICY "Staff delete encaminhamentos bucket"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'encaminhamentos' AND is_staff_member());
  END IF;
END $$;
