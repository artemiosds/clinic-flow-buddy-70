-- Add missing identification columns
ALTER TABLE public.pacientes 
ADD COLUMN IF NOT EXISTS sexo TEXT,
ADD COLUMN IF NOT EXISTS naturalidade TEXT,
ADD COLUMN IF NOT EXISTS nacionalidade TEXT DEFAULT 'Brasil',
ADD COLUMN IF NOT EXISTS raca_cor TEXT;

-- Add missing address columns
ALTER TABLE public.pacientes 
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS tipo_logradouro TEXT,
ADD COLUMN IF NOT EXISTS numero TEXT,
ADD COLUMN IF NOT EXISTS complemento TEXT,
ADD COLUMN IF NOT EXISTS bairro TEXT,
ADD COLUMN IF NOT EXISTS uf TEXT;

-- Add secondary contact
ALTER TABLE public.pacientes 
ADD COLUMN IF NOT EXISTS telefone_secundario TEXT;

-- Add index for performance on frequently filtered columns if not exists
CREATE INDEX IF NOT EXISTS idx_pacientes_unidade_id ON public.pacientes(unidade_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf ON public.pacientes(cpf);
CREATE INDEX IF NOT EXISTS idx_pacientes_cns ON public.pacientes(cns);
