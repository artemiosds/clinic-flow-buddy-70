export const PTS_PRIORITIES = [
  { value: 'baixa', label: 'Baixa', color: 'bg-slate-100 text-slate-700' },
  { value: 'media', label: 'Média', color: 'bg-blue-100 text-blue-700' },
  { value: 'alta', label: 'Alta', color: 'bg-orange-100 text-orange-700' },
  { value: 'urgente', label: 'Urgente', color: 'bg-destructive/10 text-destructive' },
];

export const PTS_CONTEXTS = [
  { id: 'linguagem', label: 'Linguagem' },
  { id: 'motor', label: 'Motor' },
  { id: 'cognicao', label: 'Cognição' },
  { id: 'comportamento', label: 'Comportamento' },
  { id: 'alimentacao', label: 'Alimentação' },
  { id: 'socializacao', label: 'Socialização' },
  { id: 'avds', label: 'AVDs' },
  { id: 'escolar', label: 'Escolar' },
  { id: 'familiar', label: 'Familiar' },
  { id: 'emocional', label: 'Emocional' },
];

export const PTS_ATTENDANCE_TYPES = [
  { id: 'individual', label: 'Individual' },
  { id: 'grupo', label: 'Grupo' },
  { id: 'domiciliar', label: 'Domiciliar' },
  { id: 'escolar', label: 'Escolar' },
  { id: 'compartilhado', label: 'Compartilhado/Interdisciplinar' },
];

export const GOAL_STATUSES = [
  { value: 'nao_iniciado', label: 'Não Iniciada', color: 'bg-slate-100 text-slate-700' },
  { value: 'em_andamento', label: 'Em Andamento', color: 'bg-blue-100 text-blue-700' },
  { value: 'parcialmente_atingida', label: 'Parcialmente Atingida', color: 'bg-orange-100 text-orange-700' },
  { value: 'atingida', label: 'Atingida', color: 'bg-success/10 text-success' },
  { value: 'suspensa', label: 'Suspensa', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'cancelada', label: 'Cancelada', color: 'bg-destructive/10 text-destructive' },
];

export const CLOSURE_REASONS = [
  { value: 'alta_terapeutica', label: 'Alta Terapêutica' },
  { value: 'abandono', label: 'Abandono' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'suspensao', label: 'Suspensão' },
  { value: 'obito', label: 'Óbito' },
  { value: 'outro', label: 'Outro' },
];

export const SPECIALTIES = [
  'Fisioterapia', 'Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional',
  'Neuropsicologia', 'Psicopedagogia', 'Nutrição', 'Serviço Social', 'Enfermagem',
];

export const DEFAULT_METAS_BY_SPECIALTY: Record<string, string[]> = {
  'Fonoaudiologia': [
    'Melhorar compreensão de comandos simples',
    'Aumentar vocabulário expressivo',
    'Melhorar articulação de fonemas específicos',
    'Desenvolver habilidades de mastigação e deglutição'
  ],
  'Fisioterapia': [
    'Melhorar controle de tronco',
    'Desenvolver marcha independente',
    'Aumentar amplitude de movimento',
    'Melhorar equilíbrio estático e dinâmico'
  ],
  'Psicologia': [
    'Desenvolver regulação emocional',
    'Melhorar interação social com pares',
    'Reduzir comportamentos disruptivos',
    'Fortalecer vínculo familiar'
  ],
  'Terapia Ocupacional': [
    'Independência em AVDs (vestir, comer)',
    'Melhorar coordenação motora fina',
    'Desenvolver integração sensorial',
    'Melhorar atenção e foco em atividades'
  ]
};
