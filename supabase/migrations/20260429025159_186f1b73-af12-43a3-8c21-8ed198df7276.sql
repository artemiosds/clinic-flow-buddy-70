
-- Estender medications com campos profissionais (RENAME)
ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS concentracao text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS forma_farmaceutica text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'PERSONALIZADO',
  ADD COLUMN IF NOT EXISTS observacoes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Estender exam_types
ALTER TABLE public.exam_types
  ADD COLUMN IF NOT EXISTS subcategoria text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preparo text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS necessidade_jejum boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tempo_jejum text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS observacoes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'PERSONALIZADO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_medications_updated_at ON public.medications;
CREATE TRIGGER trg_medications_updated_at BEFORE UPDATE ON public.medications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

DROP TRIGGER IF EXISTS trg_exam_types_updated_at ON public.exam_types;
CREATE TRIGGER trg_exam_types_updated_at BEFORE UPDATE ON public.exam_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- Permitir DELETE para Master (atualmente bloqueado em exam_types/medications)
DROP POLICY IF EXISTS "Master delete medications" ON public.medications;
CREATE POLICY "Master delete medications" ON public.medications
  FOR DELETE TO authenticated
  USING (has_staff_role('master'::text));

DROP POLICY IF EXISTS "Master manage exam_types" ON public.exam_types;
CREATE POLICY "Master manage exam_types" ON public.exam_types
  FOR ALL TO authenticated
  USING (has_staff_role('master'::text))
  WITH CHECK (has_staff_role('master'::text));

-- Índice de unicidade lógica para evitar duplicidade
CREATE UNIQUE INDEX IF NOT EXISTS uq_medications_dedup
  ON public.medications (lower(principio_ativo), lower(concentracao), lower(forma_farmaceutica), lower(via_padrao))
  WHERE is_global = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_types_dedup
  ON public.exam_types (lower(nome), lower(categoria), lower(subcategoria))
  WHERE is_global = true;
