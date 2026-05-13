-- 1. Snapshot de monitoramento
CREATE TABLE IF NOT EXISTS public.system_monitoring_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    status_geral TEXT NOT NULL,
    db_status TEXT,
    storage_status TEXT,
    hosting_status TEXT,
    total_registros BIGINT,
    total_arquivos BIGINT,
    alertas_count INTEGER,
    payload JSONB
);

-- 2. Alertas do sistema
CREATE TABLE IF NOT EXISTS public.system_monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    severity TEXT NOT NULL CHECK (severity IN ('critico', 'atencao', 'normal')),
    title TEXT NOT NULL,
    description TEXT,
    source TEXT,
    recommendation TEXT,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id)
);

-- 3. Logs de limpeza segura
CREATE TABLE IF NOT EXISTS public.system_cleanup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    cleanup_type TEXT NOT NULL,
    items_count INTEGER,
    details JSONB,
    status TEXT NOT NULL,
    error_message TEXT
);

-- 4. Configurações de monitoramento
CREATE TABLE IF NOT EXISTS public.system_monitoring_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    hosting_type TEXT,
    public_url TEXT,
    api_url TEXT,
    coolify_url TEXT,
    monitoring_enabled BOOLEAN DEFAULT true,
    config JSONB
);

-- Habilitar RLS
ALTER TABLE public.system_monitoring_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_cleanup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_monitoring_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para MASTER
-- Assumindo que o perfil do usuário está na tabela 'perfis' ou similar e que 'role' é um campo lá.
-- Como não tenho certeza do nome da tabela de perfis, vou usar uma subquery comum ou basear no auth.users se houver metadados.
-- O sistema usa useAuth() que verifica user?.role.

DO $$ 
BEGIN
    -- Snapshots
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Master can manage system_monitoring_snapshots') THEN
        CREATE POLICY "Master can manage system_monitoring_snapshots" 
        ON public.system_monitoring_snapshots 
        FOR ALL 
        USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND (LOWER(TRIM(f.role)) = 'master' OR LOWER(TRIM(f.usuario)) = 'admin.sms')));
    END IF;

    -- Alerts
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Master can manage system_monitoring_alerts') THEN
        CREATE POLICY "Master can manage system_monitoring_alerts" 
        ON public.system_monitoring_alerts 
        FOR ALL 
        USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND (LOWER(TRIM(f.role)) = 'master' OR LOWER(TRIM(f.usuario)) = 'admin.sms')));
    END IF;

    -- Cleanup Logs
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Master can manage system_cleanup_logs') THEN
        CREATE POLICY "Master can manage system_cleanup_logs" 
        ON public.system_cleanup_logs 
        FOR ALL 
        USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND (LOWER(TRIM(f.role)) = 'master' OR LOWER(TRIM(f.usuario)) = 'admin.sms')));
    END IF;

    -- Settings
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Master can manage system_monitoring_settings') THEN
        CREATE POLICY "Master can manage system_monitoring_settings" 
        ON public.system_monitoring_settings 
        FOR ALL 
        USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND (LOWER(TRIM(f.role)) = 'master' OR LOWER(TRIM(f.usuario)) = 'admin.sms')));
    END IF;
END $$;
