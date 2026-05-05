ALTER TABLE public.prontuario_procedimentos 
DROP CONSTRAINT IF EXISTS prontuario_procedimentos_procedimento_id_fkey;

ALTER TABLE public.prontuario_procedimentos 
ALTER COLUMN procedimento_id TYPE TEXT;
