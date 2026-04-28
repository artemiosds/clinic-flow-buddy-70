-- Habilita Realtime para a tabela encaminhamentos_externos para notificações ao vivo
ALTER TABLE public.encaminhamentos_externos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'encaminhamentos_externos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.encaminhamentos_externos';
  END IF;
END $$;