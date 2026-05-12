-- PARTE 8 — VALIDAÇÃO
SELECT 'Tabelas' as item, count(*) as total FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL
SELECT 'Funções', count(*) FROM information_schema.routines WHERE routine_schema = 'public'
UNION ALL
SELECT 'Triggers', count(*) FROM information_schema.triggers WHERE event_object_schema = 'public'
UNION ALL
SELECT 'Policies', count(*) FROM pg_policies WHERE schemaname = 'public';
