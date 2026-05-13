-- Atualização da função para retornar campos compatíveis com o frontend
CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSONB;
    table_stats JSONB;
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
            relname AS table,
            n_live_tup AS count,
            0 as last7, -- Omitido por performance na RPC (calculado se necessário)
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
    SELECT count(*) INTO alert_count FROM system_monitoring_alerts WHERE status = 'active';

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
