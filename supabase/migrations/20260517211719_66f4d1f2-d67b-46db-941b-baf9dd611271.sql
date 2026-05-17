ALTER TABLE public.clinica_config
  ADD COLUMN IF NOT EXISTS whatsapp_provider text NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS uazapi_base_url text NOT NULL DEFAULT 'https://free.uazapi.com',
  ADD COLUMN IF NOT EXISTS uazapi_admin_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS uazapi_instance_name text NOT NULL DEFAULT '';

ALTER TABLE public.clinica_config
  ADD CONSTRAINT clinica_config_whatsapp_provider_chk
  CHECK (whatsapp_provider IN ('evolution','uazapi'));