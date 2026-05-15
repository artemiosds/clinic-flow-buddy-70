CREATE UNIQUE INDEX IF NOT EXISTS cid10_codigos_codigo_unique ON public.cid10_codigos (codigo);
CREATE INDEX IF NOT EXISTS idx_cid10_codigo_trgm ON public.cid10_codigos USING gin (codigo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cid10_descricao_trgm ON public.cid10_codigos USING gin (descricao gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sigtap_proc_nome_trgm ON public.sigtap_procedimentos USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sigtap_proc_codigo_trgm ON public.sigtap_procedimentos USING gin (codigo gin_trgm_ops);