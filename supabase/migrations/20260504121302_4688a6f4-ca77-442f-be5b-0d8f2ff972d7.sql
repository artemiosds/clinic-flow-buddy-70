-- Ensure system_config is the primary store for all modular JSON configurations
-- We don't drop the old tables yet for safety, but we ensure system_config can hold them.

-- Add index on ID if not present (assuming it is PK)
-- Standardize unit-specific configuration pattern: 'default' for global, 'unit:<uuid>' for units

-- Migrate clinica_config to system_config (id='default')
DO $$
DECLARE
    clinica_rec RECORD;
BEGIN
    SELECT * INTO clinica_rec FROM public.clinica_config LIMIT 1;
    IF FOUND THEN
        INSERT INTO public.system_config (id, configuracoes, updated_at)
        VALUES ('default', jsonb_build_object('config_clinica', row_to_json(clinica_rec)), now())
        ON CONFLICT (id) DO UPDATE SET
        configuracoes = public.system_config.configuracoes || jsonb_build_object('config_clinica', row_to_json(clinica_rec)),
        updated_at = now();
    END IF;
END $$;

-- Migrate triage_settings to system_config (using unit partitioning)
DO $$
DECLARE
    triage_rec RECORD;
    config_id TEXT;
BEGIN
    FOR triage_rec IN SELECT * FROM public.triage_settings LOOP
        config_id := COALESCE('unit:' || triage_rec.unidade_id::text, 'default');
        INSERT INTO public.system_config (id, configuracoes, updated_at)
        VALUES (config_id, jsonb_build_object('config_triagem_enabled', triage_rec.enabled), now())
        ON CONFLICT (id) DO UPDATE SET
        configuracoes = public.system_config.configuracoes || jsonb_build_object('config_triagem_enabled', triage_rec.enabled),
        updated_at = now();
    END LOOP;
END $$;

-- Migrate whatsapp_config to system_config
DO $$
DECLARE
    wa_rec RECORD;
    config_id TEXT;
BEGIN
    FOR wa_rec IN SELECT * FROM public.whatsapp_config LOOP
        config_id := 'unit:' || wa_rec.unidade_id::text;
        INSERT INTO public.system_config (id, configuracoes, updated_at)
        VALUES (config_id, jsonb_build_object('config_whatsapp_antiban', row_to_json(wa_rec)), now())
        ON CONFLICT (id) DO UPDATE SET
        configuracoes = public.system_config.configuracoes || jsonb_build_object('config_whatsapp_antiban', row_to_json(wa_rec)),
        updated_at = now();
    END LOOP;
END $$;
