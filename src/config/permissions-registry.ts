import {
  LayoutDashboard, Calendar, Users, ClipboardList, FileText,
  Settings, Building2, UserCog, ListOrdered, LogOut, Menu,
  Activity, CalendarClock, Stethoscope, ShieldCheck, HeartPulse,
  BookOpen, History, Send, Printer, FileDown, CheckCircle,
  XCircle, PenTool, Database, Plus, Search, Archive
} from 'lucide-react';

export interface ActionDefinition {
  key: string;
  label: string;
  description?: string;
  icon?: any;
}

export interface ModuleDefinition {
  id: string;
  label: string;
  icon: any;
  actions: ActionDefinition[];
}

// Ações genéricas que a maioria dos módulos possui
const genericActions: ActionDefinition[] = [
  { key: 'can_view', label: 'Visualizar', icon: Search },
  { key: 'can_create', label: 'Criar/Adicionar', icon: Plus },
  { key: 'can_edit', label: 'Editar/Alterar', icon: PenTool },
  { key: 'can_delete', label: 'Excluir/Remover', icon: XCircle },
  { key: 'can_print', label: 'Imprimir', icon: Printer },
  { key: 'can_export', label: 'Exportar Dados', icon: FileDown },
];

export const PERMISSIONS_REGISTRY: ModuleDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    actions: [...genericActions]
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    actions: [
      ...genericActions,
      { key: 'confirmar_chegada', label: 'Confirmar Chegada', description: 'Mudar status para Presente' },
      { key: 'iniciar_atendimento', label: 'Iniciar Atendimento', description: 'Mudar status para Em Atendimento' },
      { key: 'finalizar_atendimento', label: 'Finalizar Atendimento', description: 'Concluir consulta' },
      { key: 'bloquear_horario', label: 'Bloquear Horário', icon: Lock },
      { key: 'liberar_horario', label: 'Liberar Horário' },
      { key: 'remarcar', label: 'Remarcar Agendamento' },
      { key: 'cancelar_agendamento', label: 'Cancelar Agendamento', icon: XCircle },
    ]
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    icon: Users,
    actions: [
      ...genericActions,
      { key: 'vincular_responsavel', label: 'Vincular Responsável' },
      { key: 'ver_prontuario_resumo', label: 'Ver Resumo de Prontuário' },
      { key: 'anexar_documentos', label: 'Anexar Documentos Digitais', icon: Archive },
      { key: 'atualizacao_cadastral', label: 'Central de Atualização', description: 'Corrigir dados em massa' }
    ]
  },
  {
    id: 'prontuario',
    label: 'Prontuário Eletrônico',
    icon: Stethoscope,
    actions: [
      ...genericActions,
      { key: 'finalizar_prontuario', label: 'Finalizar Evolução/Prontuário', icon: CheckCircle },
      { key: 'reabrir_prontuario', label: 'Reabrir Evolução Finalizada', icon: History },
      { key: 'assinar_eletronicamente', label: 'Assinar Eletronicamente', icon: PenTool },
      { key: 'vincular_cid', label: 'Vincular CID' },
      { key: 'cadastrar_procedimento', label: 'Adicionar Procedimentos SUS' },
      { key: 'prescrever_medicamentos', label: 'Prescrever Medicamentos' },
      { key: 'emitir_atestado', label: 'Emitir Atestado/Declaração' },
    ]
  },
  {
    id: 'bpa_producao',
    label: 'Produção BPA',
    icon: FileText,
    actions: [
      { key: 'can_view', label: 'Acessar Módulo', icon: Search },
      { key: 'gerar_bpa', label: 'Gerar Lote BPA', icon: Database },
      { key: 'exportar_bpa_txt', label: 'Exportar TXT (SIA/SUS)', icon: FileDown },
      { key: 'exportar_bpa_xlsx', label: 'Exportar Planilha Conferência', icon: FileDown },
      { key: 'validar_producao', label: 'Executar Validador de Regras' },
    ]
  },
  {
    id: 'triagem',
    label: 'Triagem / Acolhimento',
    icon: HeartPulse,
    actions: [...genericActions]
  },
  {
    id: 'gestao_tratamentos',
    label: 'Gestão de Tratamentos',
    icon: Activity,
    actions: [
      ...genericActions,
      { key: 'aprovar_plano', label: 'Aprovar Plano de Tratamento', icon: CheckCircle },
      { key: 'encerrar_tratamento', label: 'Encerrar Tratamento' },
    ]
  },
  {
    id: 'encaminhamentos',
    label: 'Regulação / Encaminhamentos',
    icon: Send,
    actions: [
      ...genericActions,
      { key: 'aprovar_encaminhamento', label: 'Aprovar/Autorizar', icon: CheckCircle },
      { key: 'recusar_encaminhamento', label: 'Recusar/Devolver', icon: XCircle },
    ]
  },
  {
    id: 'funcionarios',
    label: 'Funcionários e Equipe',
    icon: UserCog,
    actions: [...genericActions]
  },
  {
    id: 'unidades_salas',
    label: 'Unidades e Salas',
    icon: Building2,
    actions: [...genericActions, { key: 'can_config', label: 'Configurações de Unidade', icon: Settings }]
  },
  {
    id: 'permissoes',
    label: 'Controle de Acesso',
    icon: Lock,
    actions: [
      { key: 'can_view', label: 'Ver Matriz de Permissões', icon: Search },
      { key: 'can_edit', label: 'Alterar Permissões (Perfil/Usuário)', icon: PenTool },
      { key: 'gerenciar_perfis', label: 'Criar/Editar Perfis/Cargos' }
    ]
  },
  {
    id: 'logs_auditoria',
    label: 'Auditoria e Segurança',
    icon: ShieldCheck,
    actions: [
      { key: 'can_view', label: 'Ver Logs de Sistema', icon: Search },
      { key: 'exportar_logs', label: 'Exportar Relatórios de Auditoria', icon: FileDown }
    ]
  },
  {
    id: 'configuracoes',
    label: 'Configurações Globais',
    icon: Settings,
    actions: [
      { key: 'can_view', label: 'Visualizar Configurações', icon: Search },
      { key: 'can_edit', label: 'Alterar Parâmetros de Sistema', icon: PenTool },
      { key: 'can_config_avancada', label: 'Acesso a Configurações Avançadas' }
    ]
  },
  {
    id: 'sistema',
    label: 'Sistema (Infraestrutura)',
    icon: Database,
    actions: [
      { key: 'can_view', label: 'Ver Status do Sistema', icon: Search },
      { key: 'gerenciar_credenciais', label: 'Gerenciar Chaves/API', icon: ShieldCheck }
    ]
  }
];

// Mapeia o ID do módulo para suas ações disponíveis
export const MODULE_ACTIONS_MAP = PERMISSIONS_REGISTRY.reduce((acc, mod) => {
  acc[mod.id] = mod.actions.map(a => a.key);
  return acc;
}, {} as Record<string, string[]>);

// Função para descobrir se uma ação é válida para um módulo
export const isValidAction = (moduleId: string, actionKey: string): boolean => {
  return MODULE_ACTIONS_MAP[moduleId]?.includes(actionKey) || false;
};
