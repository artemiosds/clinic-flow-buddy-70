-- Criar bucket se não existir
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Política para funcionários autenticados lerem arquivos da própria unidade (simplificado para teste, pode ser refinado)
CREATE POLICY "Funcionários podem ler documentos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documentos' AND auth.role() = 'authenticated');

-- Política para a Service Role (Edge Functions) fazer upload
CREATE POLICY "Service role pode gerenciar documentos" 
ON storage.objects 
FOR ALL 
USING (bucket_id = 'documentos') 
WITH CHECK (bucket_id = 'documentos');
