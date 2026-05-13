-- Função para obter estatísticas do sistema de forma segura
CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Executa como dono (postgres) para ter acesso a metadados
SET search_path = public
AS $$
DECLARE
    result JSONB;
    table_stats JSONB;
    storage_stats JSONB;
    alert_count INT;
BEGIN
    -- Verificar se o usuário é Master
    IF NOT EXISTS (
        SELECT 1 FROM funcionarios 
        WHERE id = auth.uid() 
        AND (lower(trim(role)) = 'master' OR lower(trim(usuario)) = 'admin.sms')
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Somente administradores Master podem acessar estatísticas do sistema.';
    END IF;

    -- Coletar estatísticas das tabelas principais
    SELECT jsonb_agg(t) INTO table_stats
    FROM (
        SELECT 
            relname AS table_name,
            n_live_tup AS row_count
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        AND relname IN (
            'pacientes', 'agendamentos', 'prontuarios', 'tratamentos', 
            'sessoes_tratamento', 'fila_espera', 'funcionarios', 'unidades', 
            'logs_auditoria', 'notificacoes', 'documentos'
        )
    ) t;

    -- Coletar contagem de alertas ativos
    SELECT count(*) INTO alert_count FROM system_monitoring_alerts WHERE status = 'active';

    -- Montar resultado final
    result := jsonb_build_object(
        'status', 'online',
        'table_stats', COALESCE(table_stats, '[]'::jsonb),
        'alert_count', alert_count,
        'timestamp', now()
    );

    RETURN result;
END;
$$;

-- Garantir que as tabelas existam (caso não tenham sido criadas)
CREATE TABLE IF NOT EXISTS public.system_monitoring_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.system_monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity TEXT CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.system_cleanup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cleanup_type TEXT NOT NULL,
    items_count INT DEFAULT 0,
    status TEXT DEFAULT 'success',
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.system_monitoring_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS em todas
ALTER TABLE public.system_monitoring_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_cleanup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_monitoring_settings ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem para evitar conflito
DROP POLICY IF EXISTS "Master can manage system_monitoring_snapshots" ON public.system_monitoring_snapshots;
DROP POLICY IF EXISTS "Master can manage system_monitoring_alerts" ON public.system_monitoring_alerts;
DROP POLICY IF EXISTS "Master can manage system_cleanup_logs" ON public.system_cleanup_logs;
DROP POLICY IF EXISTS "Master can manage system_monitoring_settings" ON public.system_monitoring_settings;

-- Criar políticas restritivas
CREATE POLICY "Master can manage system_monitoring_snapshots" ON public.system_monitoring_snapshots
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM funcionarios f
        WHERE f.id = auth.uid()
        AND (lower(trim(f.role)) = 'master' OR lower(trim(f.usuario)) = 'admin.sms')
    )
);

CREATE POLICY "Master can manage system_monitoring_alerts" ON public.system_monitoring_alerts
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM funcionarios f
        WHERE f.id = auth.uid()
        AND (lower(trim(f.role)) = 'master' OR lower(trim(f.usuario)) = 'admin.sms')
    )
);

CREATE POLICY "Master can manage system_cleanup_logs" ON public.system_cleanup_logs
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM funcionarios f
        WHERE f.id = auth.uid()
        AND (lower(trim(f.role)) = 'master' OR lower(trim(f.usuario)) = 'admin.sms')
    )
);

CREATE POLICY "Master can manage system_monitoring_settings" ON public.system_monitoring_settings
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM funcionarios f
        WHERE f.id = auth.uid()
        AND (lower(trim(f.role)) = 'master' OR lower(trim(f.usuario)) = 'admin.sms')
    )
);
