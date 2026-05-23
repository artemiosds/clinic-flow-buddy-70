ALTER TABLE public.prontuarios 
ADD COLUMN IF NOT EXISTS dados_acolhimento JSONB;

-- Atualizar o comentário para documentação
COMMENT ON COLUMN public.prontuarios.dados_acolhimento IS 'Dados estruturados do formulário de acolhimento de saúde mental';