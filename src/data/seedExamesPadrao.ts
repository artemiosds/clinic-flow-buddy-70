// Base inicial de Exames padrão SUS organizada por categoria

export interface ExameSeed {
  nome: string;
  categoria: string;
  subcategoria?: string;
  codigo_sus?: string;
  preparo?: string;
  necessidade_jejum?: boolean;
  tempo_jejum?: string;
}

export const EXAMES_PADRAO: ExameSeed[] = [
  // LABORATORIAIS
  { nome: 'Hemograma completo', categoria: 'Laboratoriais', subcategoria: 'Hematologia' },
  { nome: 'Glicemia de jejum', categoria: 'Laboratoriais', subcategoria: 'Bioquímica', necessidade_jejum: true, tempo_jejum: '8 horas' },
  { nome: 'Hemoglobina glicada', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Colesterol total', categoria: 'Laboratoriais', subcategoria: 'Bioquímica', necessidade_jejum: true, tempo_jejum: '12 horas' },
  { nome: 'HDL', categoria: 'Laboratoriais', subcategoria: 'Bioquímica', necessidade_jejum: true, tempo_jejum: '12 horas' },
  { nome: 'LDL', categoria: 'Laboratoriais', subcategoria: 'Bioquímica', necessidade_jejum: true, tempo_jejum: '12 horas' },
  { nome: 'Triglicerídeos', categoria: 'Laboratoriais', subcategoria: 'Bioquímica', necessidade_jejum: true, tempo_jejum: '12 horas' },
  { nome: 'Ureia', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Creatinina', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'TGO/AST', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'TGP/ALT', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Gama GT', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Fosfatase alcalina', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Bilirrubina total e frações', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Sódio', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Potássio', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Cálcio', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Magnésio', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'TSH', categoria: 'Laboratoriais', subcategoria: 'Hormonal' },
  { nome: 'T4 livre', categoria: 'Laboratoriais', subcategoria: 'Hormonal' },
  { nome: 'EAS / Urina tipo 1', categoria: 'Laboratoriais', subcategoria: 'Urinálise' },
  { nome: 'Urocultura', categoria: 'Laboratoriais', subcategoria: 'Microbiologia' },
  { nome: 'Parasitológico de fezes', categoria: 'Laboratoriais', subcategoria: 'Parasitologia' },
  { nome: 'Coprocultura', categoria: 'Laboratoriais', subcategoria: 'Microbiologia' },
  { nome: 'PCR (Proteína C reativa)', categoria: 'Laboratoriais', subcategoria: 'Imunologia' },
  { nome: 'VHS', categoria: 'Laboratoriais', subcategoria: 'Hematologia' },
  { nome: 'Coagulograma', categoria: 'Laboratoriais', subcategoria: 'Hematologia' },
  { nome: 'TAP/INR', categoria: 'Laboratoriais', subcategoria: 'Hematologia' },
  { nome: 'TTPA', categoria: 'Laboratoriais', subcategoria: 'Hematologia' },
  { nome: 'Beta HCG', categoria: 'Laboratoriais', subcategoria: 'Hormonal' },
  { nome: 'PSA', categoria: 'Laboratoriais', subcategoria: 'Hormonal' },
  { nome: 'Ferritina', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },
  { nome: 'Vitamina B12', categoria: 'Laboratoriais', subcategoria: 'Vitaminas' },
  { nome: 'Vitamina D', categoria: 'Laboratoriais', subcategoria: 'Vitaminas' },
  { nome: 'Ácido úrico', categoria: 'Laboratoriais', subcategoria: 'Bioquímica' },

  // SOROLOGIAS / TESTES RÁPIDOS
  { nome: 'HIV', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'HBsAg', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'Anti-HBs', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'Anti-HCV', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'VDRL', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'Dengue NS1', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'Dengue IgM/IgG', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'Chikungunya IgM/IgG', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'Zika IgM/IgG', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'COVID-19 teste rápido', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'COVID-19 RT-PCR', categoria: 'Sorologias e Testes Rápidos' },
  { nome: 'Teste rápido de gravidez', categoria: 'Sorologias e Testes Rápidos' },

  // IMAGEM
  { nome: 'Radiografia', categoria: 'Imagem', subcategoria: 'Raio X' },
  { nome: 'Ultrassonografia', categoria: 'Imagem', subcategoria: 'Ultrassom' },
  { nome: 'Tomografia computadorizada', categoria: 'Imagem', subcategoria: 'Tomografia' },
  { nome: 'Ressonância magnética', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Mamografia', categoria: 'Imagem', subcategoria: 'Raio X' },
  { nome: 'Densitometria óssea', categoria: 'Imagem' },

  // RESSONÂNCIAS ESPECÍFICAS
  { nome: 'Ressonância Magnética de Crânio', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Coluna Cervical', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Coluna Torácica', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Coluna Lombar', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Ombro', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Cotovelo', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Punho', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Quadril', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Joelho', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Tornozelo', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },
  { nome: 'Ressonância Magnética de Abdome', categoria: 'Imagem', subcategoria: 'Ressonância Magnética', necessidade_jejum: true, tempo_jejum: '6 horas' },
  { nome: 'Ressonância Magnética de Pelve', categoria: 'Imagem', subcategoria: 'Ressonância Magnética' },

  // CARDIOLÓGICOS
  { nome: 'Eletrocardiograma', categoria: 'Cardiológicos' },
  { nome: 'Ecocardiograma', categoria: 'Cardiológicos' },
  { nome: 'Holter 24 horas', categoria: 'Cardiológicos' },
  { nome: 'MAPA 24 horas', categoria: 'Cardiológicos' },
  { nome: 'Teste ergométrico', categoria: 'Cardiológicos' },
  { nome: 'Doppler vascular', categoria: 'Cardiológicos' },

  // NEUROLÓGICOS
  { nome: 'Eletroencefalograma', categoria: 'Neurológicos' },
  { nome: 'Eletroneuromiografia', categoria: 'Neurológicos' },

  // RESPIRATÓRIOS
  { nome: 'Espirometria', categoria: 'Respiratórios' },
  { nome: 'Oximetria', categoria: 'Respiratórios' },
  { nome: 'Gasometria arterial', categoria: 'Respiratórios' },

  // FONOAUDIOLOGIA / AUDIOLOGIA
  { nome: 'Audiometria tonal', categoria: 'Fonoaudiologia / Audiologia' },
  { nome: 'Audiometria vocal', categoria: 'Fonoaudiologia / Audiologia' },
  { nome: 'Imitanciometria', categoria: 'Fonoaudiologia / Audiologia' },
  { nome: 'Emissões otoacústicas', categoria: 'Fonoaudiologia / Audiologia' },
  { nome: 'BERA / PEATE', categoria: 'Fonoaudiologia / Audiologia' },

  // OFTALMOLÓGICOS
  { nome: 'Fundoscopia', categoria: 'Oftalmológicos' },
  { nome: 'Tonometria', categoria: 'Oftalmológicos' },
  { nome: 'Acuidade visual', categoria: 'Oftalmológicos' },
  { nome: 'Mapeamento de retina', categoria: 'Oftalmológicos' },
  { nome: 'Refração', categoria: 'Oftalmológicos' },

  // REABILITAÇÃO / FUNCIONAIS
  { nome: 'Avaliação funcional', categoria: 'Reabilitação / Funcionais' },
  { nome: 'Avaliação postural', categoria: 'Reabilitação / Funcionais' },
  { nome: 'Avaliação de marcha', categoria: 'Reabilitação / Funcionais' },
  { nome: 'Avaliação de força muscular', categoria: 'Reabilitação / Funcionais' },
  { nome: 'Avaliação de amplitude de movimento', categoria: 'Reabilitação / Funcionais' },
  { nome: 'Avaliação neurológica funcional', categoria: 'Reabilitação / Funcionais' },
  { nome: 'Avaliação de equilíbrio', categoria: 'Reabilitação / Funcionais' },
  { nome: 'Avaliação de coordenação motora', categoria: 'Reabilitação / Funcionais' },
];
