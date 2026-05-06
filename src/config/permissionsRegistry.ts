import { ModuleName, ModulePermission } from "@/contexts/PermissionsContext";

export interface PermissionDefinition {
  id: ModuleName;
  label: string;
  description?: string;
  actions: (keyof ModulePermission)[];
}

export const PERMISSION_REGISTRY: PermissionDefinition[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Visão geral e indicadores do sistema",
    actions: ["can_view"]
  },
  {
    id: "agenda",
    label: "Agenda",
    description: "Gestão de agendamentos e horários",
    actions: ["can_view", "can_create", "can_edit", "can_delete", "can_execute", "can_print", "can_cancel"]
  },
  {
    id: "fila_espera",
    label: "Fila de Espera",
    description: "Controle de pacientes aguardando atendimento",
    actions: ["can_view", "can_create", "can_edit", "can_delete", "can_execute"]
  },
  {
    id: "pacientes",
    label: "Pacientes",
    description: "Cadastro e gestão de dados de pacientes",
    actions: ["can_view", "can_create", "can_edit", "can_delete", "can_print", "can_export"]
  },
  {
    id: "atendimentos",
    label: "Atendimentos",
    description: "Registro de atendimentos realizados",
    actions: ["can_view", "can_create", "can_edit", "can_delete", "can_print"]
  },
  {
    id: "prontuario",
    label: "Prontuário",
    description: "Histórico clínico e evoluções",
    actions: ["can_view", "can_create", "can_edit", "can_delete", "can_print", "can_sign", "can_attach"]
  },
  {
    id: "triagem",
    label: "Triagem",
    description: "Avaliação inicial e classificação",
    actions: ["can_view", "can_create", "can_edit", "can_print"]
  },
  {
    id: "historico_triagem",
    label: "Histórico Triagem",
    description: "Consulta de triagens anteriores",
    actions: ["can_view"]
  },
  {
    id: "gestao_tratamentos",
    label: "Gestão de Tratamentos",
    description: "Planejamento e controle de ciclos de tratamento",
    actions: ["can_view", "can_create", "can_edit", "can_delete", "can_execute", "can_approve"]
  },
  {
    id: "avaliacao_enfermagem",
    label: "Avaliação Enfermagem",
    description: "Registros específicos da enfermagem",
    actions: ["can_view", "can_create", "can_edit", "can_print", "can_sign"]
  },
  {
    id: "pts",
    label: "PTS",
    description: "Projeto Terapêutico Singular",
    actions: ["can_view", "can_create", "can_edit", "can_print", "can_sign", "can_approve"]
  },
  {
    id: "avaliacao_multi",
    label: "Avaliação Multi",
    description: "Avaliações da equipe multiprofissional",
    actions: ["can_view", "can_create", "can_edit", "can_print", "can_sign"]
  },
  {
    id: "relatorio_alta",
    label: "Relatório de Alta",
    description: "Geração de documentos de encerramento",
    actions: ["can_view", "can_create", "can_edit", "can_print"]
  },
  {
    id: "encaminhamentos",
    label: "Encaminhamentos",
    description: "Gestão de envios para outros serviços",
    actions: ["can_view", "can_create", "can_edit", "can_print"]
  },
  {
    id: "encaminhamentos_externos",
    label: "Encam. Externos",
    description: "Recebimento de demandas externas",
    actions: ["can_view", "can_execute", "can_approve"]
  },
  {
    id: "arquivo_digital",
    label: "Arquivo Digital",
    description: "Documentos digitalizados e anexos",
    actions: ["can_view", "can_create", "can_delete", "can_attach"]
  },
  {
    id: "relatorios",
    label: "Relatórios",
    description: "Relatórios gerenciais e estatísticos",
    actions: ["can_view", "can_export", "can_print"]
  },
  {
    id: "bpa_producao",
    label: "BPA-Produção",
    description: "Exportação de produção para o SUS",
    actions: ["can_view", "can_execute", "can_export"]
  },
  {
    id: "funcionarios",
    label: "Funcionários",
    description: "Gestão de equipe e usuários",
    actions: ["can_view", "can_create", "can_edit", "can_delete", "can_config"]
  },
  {
    id: "unidades_salas",
    label: "Unidades/Salas",
    description: "Configuração de locais de atendimento",
    actions: ["can_view", "can_create", "can_edit", "can_config"]
  },
  {
    id: "disponibilidade",
    label: "Disponibilidade",
    description: "Configuração de horários de trabalho",
    actions: ["can_view", "can_edit"]
  },
  {
    id: "feriados_bloqueios",
    label: "Feriados/Bloqueios",
    description: "Bloqueio de agenda por datas",
    actions: ["can_view", "can_create", "can_delete"]
  },
  {
    id: "logs_auditoria",
    label: "Logs & Auditoria",
    description: "Rastreamento de ações no sistema",
    actions: ["can_view", "can_export"]
  },
  {
    id: "configuracoes",
    label: "Configurações",
    description: "Parâmetros gerais do sistema",
    actions: ["can_view", "can_edit", "can_config"]
  },
  {
    id: "permissoes",
    label: "Permissões",
    description: "Controle de níveis de acesso",
    actions: ["can_view", "can_edit", "can_config"]
  },
  {
    id: "assinatura_eletronica",
    label: "Assinatura Eletrônica",
    description: "Configuração de certificados e selos",
    actions: ["can_view", "can_edit", "can_sign"]
  },
  {
    id: "modelos_documentos",
    label: "Modelos de Documentos",
    description: "Configuração de templates de impressão",
    actions: ["can_view", "can_create", "can_edit", "can_delete"]
  },
  {
    id: "sistema",
    label: "Sistema",
    description: "Recursos críticos e credenciais",
    actions: ["can_view", "can_config"]
  }
];

export const getPermissionDefinition = (id: ModuleName) => {
  return PERMISSION_REGISTRY.find(p => p.id === id);
};
