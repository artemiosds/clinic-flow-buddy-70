-- Adicionar colunas na tabela permissoes (perfil)
ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS can_print BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS can_export BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS can_attach BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS can_sign BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS can_approve BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS can_cancel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes ADD COLUMN IF NOT EXISTS can_config BOOLEAN NOT NULL DEFAULT false;

-- Adicionar colunas na tabela permissoes_usuario (individual)
ALTER TABLE public.permissoes_usuario ADD COLUMN IF NOT EXISTS can_print BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes_usuario ADD COLUMN IF NOT EXISTS can_export BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes_usuario ADD COLUMN IF NOT EXISTS can_attach BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes_usuario ADD COLUMN IF NOT EXISTS can_sign BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes_usuario ADD COLUMN IF NOT EXISTS can_approve BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes_usuario ADD COLUMN IF NOT EXISTS can_cancel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.permissoes_usuario ADD COLUMN IF NOT EXISTS can_config BOOLEAN NOT NULL DEFAULT false;
