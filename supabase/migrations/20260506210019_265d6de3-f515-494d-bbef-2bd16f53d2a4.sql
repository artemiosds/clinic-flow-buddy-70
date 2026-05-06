ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS acoes_especificas JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.permissoes_usuario ADD COLUMN IF NOT EXISTS acoes_especificas JSONB DEFAULT '{}'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN public.permissoes.acoes_especificas IS 'Armazena permissões granulares específicas de cada módulo em formato JSON (ex: {"confirmar_chegada": true})';
COMMENT ON COLUMN public.permissoes_usuario.acoes_especificas IS 'Armazena overrides de permissões granulares específicas de cada módulo em formato JSON';
