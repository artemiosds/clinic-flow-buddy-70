-- Add atualizado_em column to pacientes table
ALTER TABLE public.pacientes 
ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.set_pacientes_updated_at_now()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

-- Create trigger for pacientes table
DROP TRIGGER IF EXISTS trg_pacientes_updated_at ON public.pacientes;
CREATE TRIGGER trg_pacientes_updated_at 
BEFORE UPDATE ON public.pacientes 
FOR EACH ROW 
EXECUTE FUNCTION public.set_pacientes_updated_at_now();
