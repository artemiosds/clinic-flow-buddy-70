
-- Extensão para busca por trigramas
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Novas colunas em medications (preservando dados existentes)
ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS nome_comercial text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS codigo_rename text,
  ADD COLUMN IF NOT EXISTS codigo_reme text,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'comum',
  ADD COLUMN IF NOT EXISTS estoque_quantidade integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_unidade text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estoque_localizacao text NOT NULL DEFAULT '';

-- Constraint de tipo válido
DO $$ BEGIN
  ALTER TABLE public.medications
    ADD CONSTRAINT medications_tipo_check
    CHECK (tipo IN ('comum','controlado','psicotropico','antibiotico'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unicidade para códigos quando existirem
CREATE UNIQUE INDEX IF NOT EXISTS uq_medications_codigo_rename
  ON public.medications (codigo_rename) WHERE codigo_rename IS NOT NULL AND codigo_rename <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_medications_codigo_reme
  ON public.medications (codigo_reme) WHERE codigo_reme IS NOT NULL AND codigo_reme <> '';

-- Índices de busca rápida (GIN trgm)
CREATE INDEX IF NOT EXISTS idx_medications_nome_trgm
  ON public.medications USING GIN (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_medications_principio_trgm
  ON public.medications USING GIN (principio_ativo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_medications_comercial_trgm
  ON public.medications USING GIN (nome_comercial gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_medications_classe_trgm
  ON public.medications USING GIN (classe_terapeutica gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_medications_tipo
  ON public.medications (tipo);

-- Backfill: classificar medicamentos já existentes
UPDATE public.medications
SET tipo = 'antibiotico'
WHERE tipo = 'comum' AND classe_terapeutica ILIKE '%antibió%';

UPDATE public.medications
SET tipo = 'psicotropico'
WHERE tipo = 'comum' AND (
  classe_terapeutica ILIKE '%psicotróp%'
  OR classe_terapeutica ILIKE '%antidepress%'
  OR classe_terapeutica ILIKE '%ansiolít%'
  OR classe_terapeutica ILIKE '%antipsicót%'
  OR lower(principio_ativo) IN (
    'diazepam','clonazepam','fluoxetina','amitriptilina','sertralina',
    'haloperidol','carbamazepina','fenobarbital','alprazolam','bromazepam',
    'risperidona','olanzapina','quetiapina','lorazepam','midazolam'
  )
);

UPDATE public.medications
SET tipo = 'controlado'
WHERE tipo = 'comum' AND lower(principio_ativo) IN (
  'morfina','codeína','codeina','tramadol','metilfenidato','fentanil','tramadol cloridrato'
);
