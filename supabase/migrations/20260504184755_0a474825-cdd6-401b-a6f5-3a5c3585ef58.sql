-- Update the unit name in the units table
UPDATE public.unidades
SET nome = 'CAPS II'
WHERE nome = 'CAPS II' OR nome = 'CAPS II';

-- Update any mentions in the system_config table (JSONB)
UPDATE public.system_config
SET configuracoes = jsonb_set(
  jsonb_set(
    configuracoes, 
    '{config_impressao,cabecalho,linha2}', 
    '"CAPS II"'
  ),
  '{instituicao,cer}',
  '"CAPS II"'
)
WHERE id = 'default';

-- Update mentions in document templates
UPDATE public.document_templates
SET conteudo = replace(
  replace(conteudo, 'Centro de Especialidades em Reabilitação — CER II', 'CAPS II'),
  'CER II', 'CAPS II'
);

-- Update patient vinculation if stored as string
UPDATE public.pacientes
SET custom_data = jsonb_set(custom_data, '{unidade_vinculada}', '"CAPS II"')
WHERE custom_data->>'unidade_vinculada' = 'CER II';
