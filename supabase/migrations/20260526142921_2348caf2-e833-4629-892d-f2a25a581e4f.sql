ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'finalizado';
UPDATE public.prontuarios SET status = 'finalizado' WHERE status IS NULL;
