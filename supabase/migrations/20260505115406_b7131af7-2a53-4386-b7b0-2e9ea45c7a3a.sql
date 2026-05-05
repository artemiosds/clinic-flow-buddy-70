ALTER TABLE public.prontuario_procedimentos 
ALTER COLUMN origem SET DEFAULT 'SIGTAP';

UPDATE public.prontuario_procedimentos SET origem = 'SIGTAP' WHERE origem = 'sigtap';
UPDATE public.prontuario_procedimentos SET origem = 'PERSONALIZADO' WHERE origem = 'personalizado';
