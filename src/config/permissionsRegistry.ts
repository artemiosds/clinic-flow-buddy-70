import {
  LayoutDashboard, Calendar, Users, ClipboardList, FileText,
  Settings, Building2, UserCog, ListOrdered, LogOut, Menu,
  Activity, CalendarClock, Stethoscope, ShieldCheck, HeartPulse,
  BookOpen, History, Send, Printer, FileDown, CheckCircle,
  XCircle, PenTool, Database, Plus, Search, Archive, Lock
} from 'lucide-react';

export interface ActionDefinition {
  key: string;
  label: string;
  description?: string;
  icon?: any;
}

export interface PermissionDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: any;
  actions: ActionDefinition[];
}

const genericActions: ActionDefinition[] = [
  { key: 'can_view', label: 'Visualizar', icon: Search },
  { key: 'can_create', label: 'Criar/Adicionar', icon: Plus },
  { key: 'can_edit', label: 'Editar/Alterar', icon: PenTool },
  { key: 'can_delete', label: 'Excluir/Remover', icon: XCircle },
  { key: 'can_print', label: 'Imprimir', icon: Printer },
  { key: 'can_export', label: 'Exportar Dados', icon: FileDown },
];

export const PERMISSION_REGISTRY: PermissionDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Visão geral e indicadores do sistema',
    actions: [{ key: 'can_view', label: 'Visualizar Dashboard', icon: Search }]
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    description: 'Gestão de agendamentos e horários',
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
    id: 'fila_espera',
    label: 'Fila de Espera',
    icon: ListOrdered,
    description: 'Controle de pacientes aguardando atendimento',
    actions: [
      ...genericActions,
      { key: 'chamar_paciente', label: 'Chamar no Painel' },
      { key: 'can_execute', label: 'Processar Fila' }
    ]
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    icon: Users,
    description: 'Cadastro e gestão de dados de pacientes',
    actions: [
      ...genericActions,
      { key: 'vincular_responsavel', label: 'Vincular Responsável' },
      { key: 'ver_prontuario_resumo', label: 'Ver Resumo de Prontuário' },
      { key: 'anexar_documentos', label: 'Anexar Documentos Digitais', icon: Archive },
      { key: 'atualizacao_cadastral', label: 'Central de Atualização', description: 'Corrigir dados em massa' }
    ]
  },
  {
    id: 'atendimentos',
    label: 'Atendimentos',
    icon: ClipboardList,
    description: 'Registro de atendimentos realizados',
    actions: [...genericActions]
  },
  {
    id: 'prontuario',
    label: 'Prontuário Eletrônico',
    icon: Stethoscope,
    description: 'Histórico clínico e evoluções',
    actions: [
      ...genericActions,
      { key: 'finalizar_prontuario', label: 'Finalizar Evolução/Prontuário', icon: CheckCircle },
      { key: 'reabrir_prontuario', label: 'Reabrir Evolução Finalizada', icon: History },
      { key: 'assinar_eletronicamente', label: 'Assinar Eletronicamente', icon: PenTool },
      { key: 'vincular_cid', label: 'Vincular CID' },
      { key: 'cadastrar_procedimento', label: 'Adicionar Procedimentos SUS' },
      { key: 'prescrever_medicamentos', label: 'Prescrever Medicamentos' },
      { key: 'emitir_atestado', label: 'Emitir Atestado/Declaração' },
      { key: 'can_sign', label: 'Assinar Digitalmente' },
      { key: 'can_attach', label: 'Anexar Arquivos' }
    ]
  },
  {
    id: 'triagem',
    label: 'Triagem / Acolhimento',
    icon: HeartPulse,
    description: 'Avaliação inicial e classificação',
    actions: [...genericActions]
  },
  {
    id: 'historico_triagem',
    label: 'Histórico Triagem',
    icon: History,
    description: 'Consulta de triagens anteriores',
    actions: [{ key: 'can_view', label: 'Visualizar Histórico' }]
  },
  {
    id: 'gestao_tratamentos',
    label: 'Gestão de Tratamentos',
    icon: Activity,
    description: 'Planejamento e controle de ciclos de tratamento',
    actions: [
      ...genericActions,
      { key: 'aprovar_plano', label: 'Aprovar Plano de Tratamento', icon: CheckCircle },
      { key: 'encerrar_tratamento', label: 'Encerrar Tratamento' },
      { key: 'can_approve', label: 'Autorizar Tratamento' }
    ]
  },
  {
    id: 'avaliacao_enfermagem',
    label: 'Avaliação Enfermagem',
    icon: Stethoscope,
    description: 'Registros específicos da enfermagem',
    actions: [...genericActions, { key: 'can_sign', label: 'Assinar Avaliação' }]
  },
  {
    id: 'pts',
    label: 'PTS',
    icon: FileText,
    description: 'Projeto Terapêutico Singular',
    actions: [...genericActions, { key: 'can_sign', label: 'Assinar PTS' }, { key: 'can_approve', label: 'Aprovar PTS' }]
  },
  {
    id: 'avaliacao_multi',
    label: 'Avaliação Multi',
    icon: BookOpen,
    description: 'Avaliações da equipe multiprofissional',
    actions: [...genericActions, { key: 'can_sign', label: 'Assinar Avaliação Multi' }]
  },
  {
    id: 'relatorio_alta',
    label: 'Relatório de Alta',
    icon: FileText,
    description: 'Geração de documentos de encerramento',
    actions: [...genericActions]
  },
  {
    id: 'encaminhamentos',
    label: 'Regulação / Encaminhamentos',
    icon: Send,
    description: 'Gestão de envios para outros serviços',
    actions: [
      ...genericActions,
      { key: 'aprovar_encaminhamento', label: 'Aprovar/Autorizar', icon: CheckCircle },
      { key: 'recusar_encaminhamento', label: 'Recusar/Devolver', icon: XCircle },
      { key: 'can_approve', label: 'Validar Encaminhamento' }
    ]
  },
  {
    id: 'encaminhamentos_externos',
    label: 'Encam. Externos',
    icon: Send,
    description: 'Recebimento de demandas externas',
    actions: [
      { key: 'can_view', label: 'Visualizar Recebidos' },
      { key: 'can_execute', label: 'Processar Recebimento' },
      { key: 'can_approve', label: 'Aprovar Admissão' }
    ]
  },
  {
    id: 'arquivo_digital',
    label: 'Arquivo Digital',
    icon: Archive,
    description: 'Documentos digitalizados e anexos',
    actions: [...genericActions, { key: 'can_attach', label: 'Anexar ao Arquivo' }]
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: FileText,
    description: 'Relatórios gerenciais e estatísticos',
    actions: [{ key: 'can_view', label: 'Acessar Relatórios' }, { key: 'can_export', label: 'Exportar' }, { key: 'can_print', label: 'Imprimir' }]
  },
  {
    id: 'bpa_producao',
    label: 'BPA-Produção',
    icon: FileText,
    description: 'Exportação de produção para o SUS',
    actions: [
      { key: 'can_view', label: 'Acessar Módulo', icon: Search },
      { key: 'gerar_bpa', label: 'Gerar Lote BPA', icon: Database },
      { key: 'exportar_bpa_txt', label: 'Exportar TXT (SIA/SUS)', icon: FileDown },
      { key: 'exportar_bpa_xlsx', label: 'Exportar Planilha Conferência', icon: FileDown },
      { key: 'validar_producao', label: 'Executar Validador de Regras' },
      { key: 'can_execute', label: 'Executar Geração' },
      { key: 'can_export', label: 'Exportar Arquivos' }
    ]
  },
  {
    id: 'funcionarios',
    label: 'Funcionários',
    icon: UserCog,
    description: 'Gestão de equipe e usuários',
    actions: [...genericActions, { key: 'can_config', label: 'Gerenciar Configurações de Equipe' }]
  },
  {
    id: 'unidades_salas',
    label: 'Unidades/Salas',
    icon: Building2,
    description: 'Configuração de locais de atendimento',
    actions: [...genericActions, { key: 'can_config', label: 'Configurar Unidade' }]
  },
  {
    id: 'disponibilidade',
    label: 'Disponibilidade',
    icon: CalendarClock,
    description: 'Configuração de horários de trabalho',
    actions: [{ key: 'can_view', label: 'Visualizar Grade' }, { key: 'can_edit', label: 'Alterar Grade' }]
  },
  {
    id: 'feriados_bloqueios',
    label: 'Feriados/Bloqueios',
    icon: CalendarClock,
    description: 'Bloqueio de agenda por datas',
    actions: [...genericActions]
  },
  {
    id: 'logs_auditoria',
    label: 'Logs & Auditoria',
    icon: ShieldCheck,
    description: 'Rastreamento de ações no sistema',
    actions: [{ key: 'can_view', label: 'Ver Logs' }, { key: 'can_export', label: 'Exportar Logs' }]
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings,
    description: 'Parâmetros gerais do sistema',
    actions: [...genericActions, { key: 'can_config', label: 'Alterar Parâmetros' }]
  },
  {
    id: 'permissoes',
    label: 'Permissões',
    icon: Lock,
    description: 'Controle de níveis de acesso',
    actions: [
      { key: 'can_view', label: 'Ver Matriz', icon: Search },
      { key: 'can_edit', label: 'Alterar Permissões', icon: PenTool },
      { key: 'can_config', label: 'Configurar Perfis' }
    ]
  },
  {
    id: 'assinatura_eletronica',
    label: 'Assinatura Eletrônica',
    icon: PenTool,
    description: 'Configuração de certificados e selos',
    actions: [...genericActions, { key: 'can_sign', label: 'Configurar Assinatura' }]
  },
  {
    id: 'modelos_documentos',
    label: 'Modelos de Documentos',
    icon: FileText,
    description: 'Configuração de templates de impressão',
    actions: [...genericActions]
  },
  {
    id: 'sistema',
    label: 'Sistema',
    icon: Database,
    description: 'Recursos críticos e credenciais',
    actions: [{ key: 'can_view', label: 'Ver Status' }, { key: 'can_config', label: 'Gerenciar Infra' }]
  }
];

export const getPermissionDefinition = (id: string) => {
  return PERMISSION_REGISTRY.find(p => p.id === id);
};
