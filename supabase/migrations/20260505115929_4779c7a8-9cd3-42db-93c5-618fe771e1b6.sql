-- Tabela para especialidades configuráveis
CREATE TABLE IF NOT EXISTS public.especialidades_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    categoria TEXT,
    descricao TEXT,
    ativo BOOLEAN DEFAULT true,
    origem TEXT DEFAULT 'padrao', -- 'padrao' ou 'personalizada'
    unidade_id UUID, -- Opcional: especialidade vinculada a uma unidade específica
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ativar RLS
ALTER TABLE public.especialidades_config ENABLE ROW LEVEL SECURITY;

-- Política de acesso
CREATE POLICY "Especialidades visíveis por todos autenticados" 
ON public.especialidades_config FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem inserir especialidades" 
ON public.especialidades_config FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Inserir lista padrão de especialidades
INSERT INTO public.especialidades_config (nome, categoria, origem) VALUES
('Fisioterapia', 'Reabilitação', 'padrao'),
('Fisioterapia Motora', 'Reabilitação', 'padrao'),
('Fisioterapia Neurológica', 'Reabilitação', 'padrao'),
('Fisioterapia Respiratória', 'Reabilitação', 'padrao'),
('Terapia Ocupacional', 'Reabilitação', 'padrao'),
('Fonoaudiologia', 'Reabilitação', 'padrao'),
('Psicologia', 'Reabilitação', 'padrao'),
('Neuropsicologia', 'Reabilitação', 'padrao'),
('Serviço Social', 'Reabilitação', 'padrao'),
('Enfermagem', 'Reabilitação', 'padrao'),
('Avaliação Multiprofissional', 'Reabilitação', 'padrao'),
('Estimulação Precoce', 'Reabilitação', 'padrao'),
('Reabilitação Física', 'Reabilitação', 'padrao'),
('Reabilitação Intelectual', 'Reabilitação', 'padrao'),
('Reabilitação Auditiva', 'Reabilitação', 'padrao'),
('Reabilitação Visual', 'Reabilitação', 'padrao'),
('Clínica Geral', 'Médico', 'padrao'),
('Medicina de Família e Comunidade', 'Médico', 'padrao'),
('Pediatria', 'Médico', 'padrao'),
('Neurologia', 'Médico', 'padrao'),
('Neuropediatria', 'Médico', 'padrao'),
('Ortopedia', 'Médico', 'padrao'),
('Traumatologia', 'Médico', 'padrao'),
('Psiquiatria', 'Médico', 'padrao'),
('Geriatria', 'Médico', 'padrao'),
('Ginecologia', 'Médico', 'padrao'),
('Obstetrícia', 'Médico', 'padrao'),
('Cardiologia', 'Médico', 'padrao'),
('Endocrinologia', 'Médico', 'padrao'),
('Pneumologia', 'Médico', 'padrao'),
('Gastroenterologia', 'Médico', 'padrao'),
('Dermatologia', 'Médico', 'padrao'),
('Oftalmologia', 'Médico', 'padrao'),
('Otorrinolaringologia', 'Médico', 'padrao'),
('Urologia', 'Médico', 'padrao'),
('Nefrologia', 'Médico', 'padrao'),
('Reumatologia', 'Médico', 'padrao'),
('Infectologia', 'Médico', 'padrao'),
('Hematologia', 'Médico', 'padrao'),
('Oncologia', 'Médico', 'padrao'),
('Cirurgia Geral', 'Médico', 'padrao'),
('Cirurgia Vascular', 'Médico', 'padrao'),
('Cirurgia Pediátrica', 'Médico', 'padrao'),
('Odontologia', 'Saúde Bucal', 'padrao'),
('Odontopediatria', 'Saúde Bucal', 'padrao'),
('Cirurgia Bucomaxilofacial', 'Saúde Bucal', 'padrao'),
('Periodontia', 'Saúde Bucal', 'padrao'),
('Endodontia', 'Saúde Bucal', 'padrao'),
('Prótese Dentária', 'Saúde Bucal', 'padrao'),
('Audiometria', 'Exames', 'padrao'),
('Imtanciometria', 'Exames', 'padrao'),
('BERA / PEATE', 'Exames', 'padrao'),
('Exame Oftalmológico', 'Exames', 'padrao'),
('Avaliação Funcional', 'Exames', 'padrao'),
('Avaliação Postural', 'Exames', 'padrao'),
('Avaliação de Marcha', 'Exames', 'padrao'),
('Avaliação de Linguagem', 'Exames', 'padrao'),
('Avaliação Psicológica', 'Exames', 'padrao'),
('Avaliação Cognitiva', 'Exames', 'padrao'),
('Nutrição', 'Outros', 'padrao'),
('Farmácia', 'Outros', 'padrao'),
('Educação Física', 'Outros', 'padrao'),
('Assistência Social', 'Outros', 'padrao'),
('Saúde Mental', 'Outros', 'padrao'),
('CAPS', 'Outros', 'padrao'),
('Regulação', 'Outros', 'padrao'),
('UBS', 'Outros', 'padrao'),
('Especialidade Externa', 'Outros', 'padrao'),
('Outro', 'Outros', 'padrao')
ON CONFLICT (nome) DO UPDATE SET categoria = EXCLUDED.categoria;
