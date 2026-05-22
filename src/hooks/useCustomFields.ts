import { useCallback } from 'react';
import { useConfiguracao } from '@/hooks/useConfiguracao';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CustomFieldType =
  | 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'textarea' | 'radio'
  | 'phone' | 'cpf' | 'cnpj' | 'cep' | 'email' | 'url' | 'time' | 'currency' | 'file' | 'image'
  | 'checklist' | 'scale_numeric' | 'scale_eva' | 'scale_functional' | 'cid' | 'sigtap' | 'signature' | 'table' | 'calculated' | 'separator';

export type ConditionalOperator = 'eq' | 'neq' | 'in' | 'notin' | 'gt' | 'lt' | 'filled' | 'empty';
export interface CustomFieldCondition {
  campo: string;
  operador: ConditionalOperator;
  valor?: any;
}
export interface CustomFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  mascara?: 'cpf' | 'cnpj' | 'telefone' | 'cep' | 'data' | 'hora' | 'currency' | 'custom';
  mascaraCustom?: string;
  allowFutureDate?: boolean;
  allowPastDate?: boolean;
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
  decimals?: number;
}

export interface CustomFieldDef {
  id: string;
  nome: string;
  rotulo: string;
  tipo: CustomFieldType;
  opcoes: string[];
  obrigatorio: boolean;
  ativo: boolean;
  ordem: number;
  valorPadrao: string;
  mostrarListagem: boolean;
  // ---- Extensões (todas opcionais — retrocompatível) ----
  secao?: string;
  especialidades?: string[];           // [] = todas
  tiposProntuario?: string[];          // [] = todos
  validacao?: CustomFieldValidation;
  condicional?: CustomFieldCondition[]; // AND entre regras
  placeholder?: string;
  ajuda?: string;
  legacyNames?: string[];              // fallback p/ leitura quando renomeado
  destaque?: boolean;
  
  // Novas propriedades
  largura?: 25 | 50 | 75 | 100;
  displayMode?: 'inline' | 'block';
  rules?: {
    onlyFirstConsult?: boolean;
    onlyReturn?: boolean;
    onlyChild?: boolean;
    onlyElderly?: boolean;
    profiles?: string[];
    unidades?: string[];
  };
  printSettings?: {
    visibleInProntuario?: boolean;
    editableInProntuario?: boolean;
    visibleInPrint?: boolean;
    restricted?: boolean;
  };
}

export type ScreenKey =
  | 'paciente'
  | 'agendamento'
  | 'gestao_tratamento'
  | 'pts'
  | 'relatorio_multiprof'
  | 'relatorio_alta'
  | 'funcionario'
  | 'unidade'
  | 'triagem'
  | 'prontuario'
  | 'encaminhamentos'
  | 'fila_espera'
  | 'atendimentos';

export const SCREEN_LABELS: Record<ScreenKey, string> = {
  paciente: 'Cadastro de Paciente',
  agendamento: 'Agendamento',
  gestao_tratamento: 'Gestão de Tratamentos',
  pts: 'PTS',
  relatorio_multiprof: 'Relatório Multiprofissional',
  relatorio_alta: 'Relatório de Alta',
  funcionario: 'Funcionários',
  unidade: 'Unidades',
  triagem: 'Triagem',
  prontuario: 'Prontuário',
  encaminhamentos: 'Encaminhamento',
  fila_espera: 'Fila de Espera',
  atendimentos: 'Atendimentos',
};

// Native fields per screen — exported so config UI and forms share one source of truth.
export const NATIVE_FIELDS: Record<ScreenKey, { nome: string; rotulo: string }[]> = {
  paciente: [
    // Aba Identificação
    { nome: 'nome', rotulo: 'Nome' },
    { nome: 'nomeMae', rotulo: 'Nome da Mãe' },
    { nome: 'dataNascimento', rotulo: 'Data de Nascimento' },
    { nome: 'sexo', rotulo: 'Sexo' },
    { nome: 'cpf', rotulo: 'CPF' },
    { nome: 'cns', rotulo: 'CNS' },
    { nome: 'situacaoRua', rotulo: 'Pessoa em situação de rua' },
    { nome: 'menorIdade', rotulo: 'Menor de idade' },
    { nome: 'nomeResponsavel', rotulo: 'Nome do Responsável' },
    { nome: 'cpfResponsavel', rotulo: 'CPF do Responsável' },
    // Aba Endereço
    { nome: 'cep', rotulo: 'CEP' },
    { nome: 'tipoLogradouro', rotulo: 'Tipo de Logradouro (DNE)' },
    { nome: 'logradouro', rotulo: 'Logradouro' },
    { nome: 'numero', rotulo: 'Número' },
    { nome: 'complemento', rotulo: 'Complemento' },
    { nome: 'bairro', rotulo: 'Bairro' },
    { nome: 'municipio', rotulo: 'Município' },
    { nome: 'uf', rotulo: 'UF' },
    { nome: 'endereco', rotulo: 'Endereço (legado)' },
    // Aba Contato
    { nome: 'telefone', rotulo: 'Telefone Principal' },
    { nome: 'telefoneSecundario', rotulo: 'Telefone Secundário' },
    { nome: 'email', rotulo: 'E-mail' },
    // Aba Complementares — SUS / BPA
    { nome: 'nacionalidade', rotulo: 'Nacionalidade' },
    { nome: 'racaCor', rotulo: 'Raça/Cor (IBGE)' },
    { nome: 'etnia', rotulo: 'Etnia (Indígena)' },
    { nome: 'paisNascimento', rotulo: 'País de Nascimento' },
    // Encaminhamento
    { nome: 'especialidadeDestino', rotulo: 'Especialidade Destino' },
    { nome: 'ubsOrigem', rotulo: 'UBS Origem' },
    { nome: 'profissionalSolicitante', rotulo: 'Profissional Solicitante' },
    { nome: 'tipoEncaminhamento', rotulo: 'Tipo de Encaminhamento' },
    { nome: 'cid', rotulo: 'CID-10' },
    { nome: 'diagnosticoResumido', rotulo: 'Diagnóstico Resumido' },
    { nome: 'justificativa', rotulo: 'Justificativa' },
    { nome: 'dataEncaminhamento', rotulo: 'Data do Encaminhamento' },
    { nome: 'documentoUrl', rotulo: 'Documento' },
    // Clínico
    { nome: 'tipoCondicao', rotulo: 'Tipo de Condição' },
    { nome: 'mobilidade', rotulo: 'Mobilidade' },
    { nome: 'usaDispositivo', rotulo: 'Usa Dispositivo' },
    { nome: 'tipoDispositivo', rotulo: 'Tipo de Dispositivo' },
    { nome: 'comunicacao', rotulo: 'Comunicação' },
    { nome: 'comportamento', rotulo: 'Comportamento' },
    // Prioridade Especial
    { nome: 'isGestante', rotulo: 'Gestante' },
    { nome: 'isPne', rotulo: 'PNE' },
    { nome: 'isAutista', rotulo: 'Autista (TEA)' },
    // Dados Adicionais
    { nome: 'usaEquipamentos', rotulo: 'Usa Equipamentos' },
    { nome: 'equipamentos', rotulo: 'Equipamentos' },
    { nome: 'observacaoEquipamentos', rotulo: 'Obs. Equipamentos' },
    { nome: 'transporte', rotulo: 'Transporte' },
    { nome: 'turnoPreferido', rotulo: 'Turno Preferido' },
    { nome: 'outroServicoSus', rotulo: 'Outro Serviço SUS' },
    { nome: 'observacoes', rotulo: 'Observações' },
    { nome: 'descricaoClinica', rotulo: 'Descrição Clínica' },
  ],
  agendamento: [
    { nome: 'pacienteNome', rotulo: 'Paciente' },
    { nome: 'profissionalNome', rotulo: 'Profissional' },
    { nome: 'data', rotulo: 'Data' },
    { nome: 'hora', rotulo: 'Hora' },
    { nome: 'tipo', rotulo: 'Tipo' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  gestao_tratamento: [
    { nome: 'specialty', rotulo: 'Especialidade' },
    { nome: 'frequency', rotulo: 'Frequência' },
    { nome: 'total_sessions', rotulo: 'Total de Sessões' },
    { nome: 'clinical_notes', rotulo: 'Notas Clínicas' },
  ],
  pts: [
    { nome: 'diagnostico_funcional', rotulo: 'Diagnóstico Funcional' },
    { nome: 'objetivos_terapeuticos', rotulo: 'Objetivos Terapêuticos' },
    { nome: 'metas_curto_prazo', rotulo: 'Metas Curto Prazo' },
    { nome: 'metas_medio_prazo', rotulo: 'Metas Médio Prazo' },
    { nome: 'metas_longo_prazo', rotulo: 'Metas Longo Prazo' },
  ],
  relatorio_multiprof: [
    { nome: 'clinical_evaluation', rotulo: 'Avaliação Clínica' },
    { nome: 'parecer', rotulo: 'Parecer' },
    { nome: 'observations', rotulo: 'Observações' },
  ],
  relatorio_alta: [
    { nome: 'reason', rotulo: 'Motivo da Alta' },
    { nome: 'final_notes', rotulo: 'Notas Finais' },
  ],
  funcionario: [
    { nome: 'nome', rotulo: 'Nome' },
    { nome: 'email', rotulo: 'E-mail' },
    { nome: 'cpf', rotulo: 'CPF' },
    { nome: 'usuario', rotulo: 'Usuário' },
    { nome: 'profissao', rotulo: 'Profissão' },
    { nome: 'cargo', rotulo: 'Cargo' },
    { nome: 'setor', rotulo: 'Setor' },
    { nome: 'tipo_conselho', rotulo: 'Tipo de Conselho' },
    { nome: 'numero_conselho', rotulo: 'Nº do Conselho' },
    { nome: 'uf_conselho', rotulo: 'UF do Conselho' },
    { nome: 'tempo_atendimento', rotulo: 'Tempo de Atendimento' },
  ],
  unidade: [
    { nome: 'nome', rotulo: 'Nome' },
    { nome: 'endereco', rotulo: 'Endereço' },
    { nome: 'telefone', rotulo: 'Telefone' },
    { nome: 'whatsapp', rotulo: 'WhatsApp' },
  ],
  triagem: [
    { nome: 'peso', rotulo: 'Peso' },
    { nome: 'altura', rotulo: 'Altura' },
    { nome: 'pressaoArterial', rotulo: 'Pressão Arterial' },
    { nome: 'temperatura', rotulo: 'Temperatura' },
    { nome: 'frequenciaCardiaca', rotulo: 'Frequência Cardíaca' },
    { nome: 'saturacaoOxigenio', rotulo: 'Saturação de Oxigênio' },
    { nome: 'glicemia', rotulo: 'Glicemia' },
    { nome: 'queixaPrincipal', rotulo: 'Queixa Principal' },
    { nome: 'classificacaoRisco', rotulo: 'Classificação de Risco' },
  ],
  prontuario: [
    { nome: 'soap_subjetivo', rotulo: 'Subjetivo (S)' },
    { nome: 'soap_objetivo', rotulo: 'Objetivo (O)' },
    { nome: 'soap_avaliacao', rotulo: 'Avaliação (A)' },
    { nome: 'soap_plano', rotulo: 'Plano (P)' },
    { nome: 'evolucao', rotulo: 'Evolução' },
    { nome: 'queixa_principal', rotulo: 'Queixa Principal' },
    { nome: 'anamnese', rotulo: 'Anamnese' },
    { nome: 'exame_fisico', rotulo: 'Exame Físico' },
    { nome: 'hipotese', rotulo: 'Hipótese' },
    { nome: 'conduta', rotulo: 'Conduta' },
    { nome: 'prescricao', rotulo: 'Prescrição' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  encaminhamentos: [
    { nome: 'profissionalDestino', rotulo: 'Profissional de Destino' },
    { nome: 'especialidadeDestino', rotulo: 'Especialidade de Destino' },
    { nome: 'motivo', rotulo: 'Motivo' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  fila_espera: [
    { nome: 'pacienteNome', rotulo: 'Paciente' },
    { nome: 'prioridade', rotulo: 'Prioridade' },
    { nome: 'setor', rotulo: 'Setor' },
    { nome: 'especialidadeDestino', rotulo: 'Especialidade' },
    { nome: 'descricaoClinica', rotulo: 'Descrição Clínica' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  atendimentos: [
    { nome: 'pacienteNome', rotulo: 'Paciente' },
    { nome: 'profissionalNome', rotulo: 'Profissional' },
    { nome: 'procedimento', rotulo: 'Procedimento' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
};

export interface SectionConfig {
  id: string;
  nome: string;
  descricao?: string;
  ordem: number;
  ativo: boolean;
  expandida?: boolean;
}

export interface ScreenConfig {
  fields: CustomFieldDef[];
  sections?: SectionConfig[];
  hiddenNative: string[];
  labelOverrides: Record<string, string>;
  /** Unified ordering across native + custom field names. Optional for backward compat. */
  orderedNames?: string[];
}

export interface CustomFieldsConfig {
  [screen: string]: {
    [unidadeId: string]: ScreenConfig;
  };
}

const CONFIG_ID = 'custom_fields_config';

const emptyScreenConfig = (): ScreenConfig => ({
  fields: [],
  sections: [],
  hiddenNative: [],
  labelOverrides: {},
  orderedNames: [],
});

export function useCustomFields(screen?: ScreenKey, unidadeId?: string) {
  const { configuracoes, loading, atualizarConfiguracao } = useConfiguracao();
  
  const allConfig = (configuracoes[CONFIG_ID] || {}) as CustomFieldsConfig;

  // Resolved config for screen+unit (merges global with unit-specific)
  const getScreenConfig = useCallback(
    (s: ScreenKey, uid?: string): ScreenConfig => {
      const screenData = allConfig[s];
      if (!screenData) return emptyScreenConfig();

      const globalCfg = screenData['__global__'] || emptyScreenConfig();
      if (!uid || uid === '__global__') return globalCfg;

      const unitCfg = screenData[uid];
      if (!unitCfg) return globalCfg;

      return {
        fields: [...globalCfg.fields, ...unitCfg.fields].sort((a, b) => a.ordem - b.ordem),
        sections: [...(globalCfg.sections || []), ...(unitCfg.sections || [])].sort((a, b) => a.ordem - b.ordem),
        hiddenNative: [...new Set([...globalCfg.hiddenNative, ...unitCfg.hiddenNative])],
        labelOverrides: { ...globalCfg.labelOverrides, ...unitCfg.labelOverrides },
        orderedNames: unitCfg.orderedNames?.length ? unitCfg.orderedNames : globalCfg.orderedNames,
      };
    },
    [allConfig],
  );

  const getRawScreenConfig = useCallback(
    (s: ScreenKey, uid: string): ScreenConfig => {
      return allConfig[s]?.[uid] || emptyScreenConfig();
    },
    [allConfig],
  );

  const updateScreenConfig = useCallback(
    async (s: ScreenKey, uid: string, screenCfg: ScreenConfig) => {
      const newConfig = {
        ...allConfig,
        [s]: {
          ...allConfig[s],
          [uid]: screenCfg,
        },
      };
      await atualizarConfiguracao(CONFIG_ID, newConfig, { silent: true, auditAcao: 'ALTERAR_CAMPOS_CUSTOM' });
    },
    [allConfig, atualizarConfiguracao],
  );

  const resolved = screen ? getScreenConfig(screen, unidadeId) : emptyScreenConfig();

  // ---------- Convenience helpers for consumers ----------

  /** Get the (possibly renamed) label for a native field on the active screen. */
  const getNativeLabel = useCallback(
    (fieldName: string, fallback?: string): string => {
      const overridden = resolved.labelOverrides?.[fieldName];
      if (overridden) return overridden;
      if (fallback) return fallback;
      const native = screen ? NATIVE_FIELDS[screen]?.find((f) => f.nome === fieldName) : undefined;
      return native?.rotulo || fieldName;
    },
    [resolved.labelOverrides, screen],
  );

  /** True when a native field has been hidden in this screen/unit. */
  const isNativeHidden = useCallback(
    (fieldName: string): boolean => resolved.hiddenNative.includes(fieldName),
    [resolved.hiddenNative],
  );

  return {
    config: allConfig,
    loading,
    resolved,
    getScreenConfig,
    getRawScreenConfig,
    updateScreenConfig,
    getNativeLabel,
    isNativeHidden,
    refetch: () => Promise.resolve(), // hook now handles its own sync via useConfiguracao
  };
}
