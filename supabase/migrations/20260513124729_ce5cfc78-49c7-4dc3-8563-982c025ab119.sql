-- Update the RPC to be more robust when called from service_role
CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSONB;
    table_stats JSONB;
    alert_count INT;
    is_master_user BOOLEAN := FALSE;
BEGIN
    -- Se chamado via service_role (Edge Function), pulamos a verificação de auth.uid() 
    -- pois a Edge Function já valida o usuário e o cargo.
    -- Se chamado diretamente via API (anon/auth), verificamos o auth.uid().
    
    IF current_setting('role') = 'service_role' THEN
        is_master_user := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM funcionarios 
            WHERE id = auth.uid() 
            AND (lower(trim(role)) IN ('master', 'gestor_master', 'administrador', 'admin') OR lower(trim(usuario)) = 'admin.sms')
        ) INTO is_master_user;
    END IF;

    IF NOT is_master_user THEN
        RAISE EXCEPTION 'Acesso negado: Somente administradores Master podem acessar estatísticas do sistema.';
    END IF;

    -- Coletar estatísticas das tabelas principais
    SELECT jsonb_agg(t) INTO table_stats
    FROM (
        SELECT 
            relname AS table,
            n_live_tup AS count,
            0 as last7,
            0 as last30,
            CASE WHEN n_live_tup > 100000 THEN 'atencao' ELSE 'normal' END as status
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        AND relname IN (
            'pacientes', 'agendamentos', 'prontuarios', 'tratamentos', 
            'sessoes_tratamento', 'fila_espera', 'funcionarios', 'unidades', 
            'logs_auditoria', 'notificacoes', 'documentos'
        )
    ) t;

    -- Coletar contagem de alertas ativos
    BEGIN
        SELECT count(*) INTO alert_count FROM system_monitoring_alerts WHERE status = 'active';
    EXCEPTION WHEN OTHERS THEN
        alert_count := 0;
    END;

    -- Montar resultado final
    result := jsonb_build_object(
        'status', 'online',
        'tableStats', COALESCE(table_stats, '[]'::jsonb),
        'alert_count', alert_count,
        'timestamp', now()
    );

    RETURN result;
END;
$$;