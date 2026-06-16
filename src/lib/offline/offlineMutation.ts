import { offlineDb, type OfflineOperation } from "../offline-db";
import { supabase } from "@/integrations/supabase/client";
import { isNetworkError } from "@/lib/utils";
import { toast } from "sonner";

export type OfflineOperationType = 'INSERT' | 'UPDATE' | 'DELETE' | string;

export interface EnqueueOptions {
  table: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  showToast?: boolean;
  lookupField?: string;
  lookupValue?: any;
}

export interface OfflineSyncResult {
  synced: number;
  failed: number;
  pending: number;
  syncedTables: string[];
  failedOperations: OfflineOperation[];
}

const IDEMPOTENCY_CONSTRAINTS = new Set([
  "unique_action_logs_client_op",
  "unique_agendamentos_client_op",
  "unique_atendimentos_client_op",
  "unique_especialidades_client_op",
  "unique_exam_types_client_op",
  "unique_fila_espera_client_op",
  "unique_horarios_funcionamento_client_op",
  "unique_medications_client_op",
  "unique_multiprofessional_evaluations_client_op",
  "unique_nursing_evaluations_client_op",
  "unique_pacientes_client_op",
  "unique_patient_discharges_client_op",
  "unique_patient_evaluations_client_op",
  "unique_patient_regulation_client_op",
  "unique_prontuario_procedimentos_client_op",
  "unique_prontuarios_client_op",
  "unique_pts_client_op",
  "unique_pts_cid_client_op",
  "unique_pts_metas_client_op",
  "unique_pts_revisoes_client_op",
  "unique_pts_sigtap_client_op",
  "unique_treatment_cycles_client_op",
  "unique_treatment_sessions_client_op",
  "unique_triage_records_client_op",
]);

const TABLE_COLUMNS: Record<string, Set<string>> = {
  agendamentos: new Set(["id", "paciente_id", "paciente_nome", "unidade_id", "sala_id", "setor_id", "profissional_id", "profissional_nome", "data", "hora", "status", "tipo", "observacoes", "origem", "google_event_id", "sync_status", "criado_em", "criado_por", "prioridade_perfil", "procedimento_sigtap", "nome_procedimento", "turno", "agendado_por_externo", "custom_data", "falta_liberada", "liberada_em", "liberada_por", "motivo_liberacao", "regularizada", "status_falta_registro", "falta_justificada", "motivo_falta_justificada", "client_operation_id"]),
  atendimentos: new Set(["id", "agendamento_id", "paciente_id", "paciente_nome", "profissional_id", "profissional_nome", "unidade_id", "sala_id", "setor", "procedimento", "observacoes", "data", "hora_inicio", "hora_fim", "duracao_minutos", "status", "criado_em", "custom_data", "client_operation_id"]),
  fila_espera: new Set(["id", "paciente_id", "paciente_nome", "unidade_id", "profissional_id", "setor", "prioridade", "status", "posicao", "hora_chegada", "hora_chamada", "observacoes", "criado_por", "criado_em", "prioridade_perfil", "descricao_clinica", "cid", "data_solicitacao_original", "origem_cadastro", "especialidade_destino", "custom_data", "client_operation_id"]),
  pacientes: new Set(["id", "nome", "cpf", "telefone", "data_nascimento", "email", "endereco", "observacoes", "criado_em", "auth_user_id", "descricao_clinica", "cid", "cns", "nome_mae", "municipio", "menor_idade", "nome_responsavel", "cpf_responsavel", "ubs_origem", "profissional_solicitante", "tipo_encaminhamento", "diagnostico_resumido", "justificativa", "data_encaminhamento", "documento_url", "tipo_condicao", "mobilidade", "usa_dispositivo", "tipo_dispositivo", "comunicacao", "comportamento", "usa_equipamentos", "equipamentos", "observacao_equipamentos", "outro_servico_sus", "transporte", "turno_preferido", "especialidade_destino", "is_gestante", "is_pne", "is_autista", "custom_data", "unidade_id", "atualizado_em", "sexo", "naturalidade", "nacionalidade", "raca_cor", "cep", "tipo_logradouro", "numero", "complemento", "bairro", "uf", "telefone_secundario", "situacao_rua", "etnia", "etnia_outra", "pais_nascimento", "tipo_logradouro_codigo", "total_faltas", "faltas_consecutivas", "status_falta", "is_tfd", "possui_ordem_judicial", "motivo_excecao_bloqueio", "observacao_tfd_ordem_judicial", "data_marcacao_excecao", "marcado_por", "rg", "nome_pai", "client_operation_id"]),
  prontuarios: new Set(["id", "paciente_id", "paciente_nome", "profissional_id", "profissional_nome", "unidade_id", "sala_id", "setor", "agendamento_id", "data_atendimento", "hora_atendimento", "queixa_principal", "anamnese", "sinais_sintomas", "exame_fisico", "hipotese", "conduta", "prescricao", "solicitacao_exames", "evolucao", "observacoes", "criado_em", "atualizado_em", "indicacao_retorno", "motivo_alteracao", "episodio_id", "procedimentos_texto", "outro_procedimento", "tipo_registro", "soap_subjetivo", "soap_objetivo", "soap_avaliacao", "soap_plano", "custom_data", "dados_acolhimento", "status", "pts_meta_id", "client_operation_id"]),
  triage_records: new Set(["id", "agendamento_id", "tecnico_id", "peso", "altura", "imc", "pressao_arterial", "temperatura", "frequencia_cardiaca", "saturacao_oxigenio", "glicemia", "alergias", "medicamentos", "queixa", "iniciado_em", "confirmado_em", "criado_em", "classificacao_risco", "custom_data", "observacoes", "client_operation_id"]),
};

const FIELD_ALIASES: Record<string, string> = {
  pacienteId: "paciente_id",
  pacienteNome: "paciente_nome",
  unidadeId: "unidade_id",
  salaId: "sala_id",
  setorId: "setor_id",
  profissionalId: "profissional_id",
  profissionalNome: "profissional_nome",
  googleEventId: "google_event_id",
  syncStatus: "sync_status",
  criadoEm: "criado_em",
  criadoPor: "criado_por",
  agendadoPorExterno: "agendado_por_externo",
  customData: "custom_data",
  attachmentUrl: "attachment_url",
  attachmentName: "attachment_name",
  attachmentType: "attachment_type",
  aprovadoPor: "aprovado_por",
  aprovadoEm: "aprovado_em",
  rejeitadoMotivo: "rejeitado_motivo",
  agendamentoId: "agendamento_id",
  horaInicio: "hora_inicio",
  horaFim: "hora_fim",
  duracaoMinutos: "duracao_minutos",
  nomeMae: "nome_mae",
  dataNascimento: "data_nascimento",
  descricaoClinica: "descricao_clinica",
  isGestante: "is_gestante",
  isPne: "is_pne",
  isAutista: "is_autista",
  horaChegada: "hora_chegada",
  horaChamada: "hora_chamada",
  dataSolicitacaoOriginal: "data_solicitacao_original",
  origemCadastro: "origem_cadastro",
  especialidadeDestino: "especialidade_destino",
  clientOperationId: "client_operation_id",
};

let syncPromise: Promise<OfflineSyncResult> | null = null;

const toSnakeCase = (key: string) => FIELD_ALIASES[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

const sanitizePayloadForTable = (table: string, payload: any, clientOperationId: string, operation: string) => {
  const allowed = TABLE_COLUMNS[table];
  const out: Record<string, any> = {};

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value === undefined || typeof value === "function" || key.startsWith("__")) return;
    const dbKey = toSnakeCase(key);
    if (allowed && !allowed.has(dbKey)) return;
    if (operation === "UPDATE" && dbKey === "id") return;
    out[dbKey] = value;
  });

  if (!allowed || allowed.has("client_operation_id")) {
    out.client_operation_id = clientOperationId;
  }

  return out;
};

const getConstraintName = (error: any) => {
  if (typeof error?.constraint === "string") return error.constraint;
  const text = `${error?.message || ""}\n${error?.details || ""}\n${error?.hint || ""}`;
  return text.match(/unique constraint "([^"]+)"/)?.[1] || text.match(/constraint "([^"]+)"/)?.[1] || "";
};

const isIdempotencyConflict = (error: any) => error?.code === "23505" && IDEMPOTENCY_CONSTRAINTS.has(getConstraintName(error));

const markNetworkPending = async (op: OfflineOperation) => {
  await offlineDb.operations.update(op.id!, {
    status: "pendente",
    lastError: "Conexão indisponível. Aguardando nova sincronização.",
  });
};

const processQueueInternal = async (): Promise<OfflineSyncResult> => {
  const summary: OfflineSyncResult = { synced: 0, failed: 0, pending: 0, syncedTables: [], failedOperations: [] };
  if (!navigator.onLine) return summary;

  await offlineDb.operations.where("status").equals("sincronizando").modify({ status: "pendente" });

  while (navigator.onLine) {
    const pendingOps = await offlineDb.operations.where("status").equals("pendente").sortBy("createdAt");
    if (pendingOps.length === 0) break;

    for (const op of pendingOps) {
      try {
        await offlineDb.operations.update(op.id!, { status: "sincronizando" });

        const { __lookupField, __lookupValue } = op.payload || {};
        const operation = String(op.operation || "").toUpperCase();
        const cleanPayload = sanitizePayloadForTable(op.table, op.payload, op.clientOperationId, operation);
        const supabaseAny = supabase as any;
        const tableQuery = supabaseAny.from(op.table);
        let result: any;

        if (operation === "INSERT") {
          result = await tableQuery.insert(cleanPayload);
        } else if (operation === "UPDATE") {
          const lookupField = __lookupField || (op.payload?.id ? "id" : null);
          const lookupValue = __lookupValue ?? op.payload?.id;
          if (!lookupField || lookupValue === undefined || lookupValue === null || lookupValue === "") {
            throw new Error(`Operação UPDATE sem identificador em ${op.table}.`);
          }
          result = await tableQuery.update(cleanPayload).eq(toSnakeCase(lookupField), lookupValue).select("id");
          if (!result?.error && Array.isArray(result?.data) && result.data.length === 0) {
            throw new Error(`Registro não localizado para UPDATE em ${op.table}.`);
          }
        } else if (operation === "DELETE") {
          const lookupField = __lookupField || (op.payload?.id ? "id" : null);
          const lookupValue = __lookupValue ?? op.payload?.id;
          if (!lookupField || lookupValue === undefined || lookupValue === null || lookupValue === "") {
            throw new Error(`Operação DELETE sem identificador em ${op.table}.`);
          }
          result = await tableQuery.delete().eq(toSnakeCase(lookupField), lookupValue).select("id");
        } else {
          throw new Error(`Operação offline não suportada: ${operation}`);
        }

        if (result?.error) throw result.error;

        await offlineDb.operations.update(op.id!, { status: "sincronizado", lastError: undefined });
        summary.synced += 1;
        summary.syncedTables.push(op.table);
      } catch (error: any) {
        if (isIdempotencyConflict(error)) {
          await offlineDb.operations.update(op.id!, { status: "sincronizado", lastError: undefined });
          summary.synced += 1;
          summary.syncedTables.push(op.table);
          continue;
        }

        if (isNetworkError(error)) {
          await markNetworkPending(op);
          summary.pending += 1;
          return summary;
        }

        const failedOp = { ...op, lastError: error?.message || error?.details || "Erro desconhecido", attempts: (op.attempts || 0) + 1, status: "falha" as const };
        await offlineDb.operations.update(op.id!, {
          status: "falha",
          attempts: failedOp.attempts,
          lastError: failedOp.lastError,
        });
        summary.failed += 1;
        summary.failedOperations.push(failedOp);
      }
    }
  }

  summary.syncedTables = Array.from(new Set(summary.syncedTables));
  return summary;
};

export const processOfflineQueue = async () => {
  if (!syncPromise) {
    syncPromise = processQueueInternal().finally(() => {
      syncPromise = null;
    });
  }
  return syncPromise;
};

/**
 * Funçao central para enfileirar mutações offline (Local-First).
 * Salva no Dexie imediatamente e dispara o worker de sincronização.
 */
export const enqueueOfflineMutation = async (
  operationOrObject: OfflineOperationType | any,
  payloadOrUndefined?: any,
  optionsOrUndefined?: EnqueueOptions
) => {
  // Overload handling for legacy calls
  let operation: OfflineOperationType;
  let payload: any;
  let options: EnqueueOptions;

  if (typeof operationOrObject === 'string') {
    operation = operationOrObject;
    payload = payloadOrUndefined;
    options = optionsOrUndefined!;
  } else {
    // Legacy call: enqueueOfflineMutation(object)
    const obj = operationOrObject;
    operation = obj.operation;
    payload = obj.payload;
    options = {
      table: obj.table,
      lookupField: obj.lookupField,
      lookupValue: obj.lookupValue,
    };
  }

  const clientOperationId = crypto.randomUUID();
  
  let userId = 'anonymous';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id || 'anonymous';
  } catch (e) {
    console.warn("Auth session not available for offline mutation", e);
  }

  const opType = (operation === 'INSERT' || operation === 'UPDATE' || operation === 'DELETE') 
    ? operation 
    : operation.includes('CREATE') ? 'INSERT' : operation.includes('EDIT') || operation.includes('UPDATE') ? 'UPDATE' : 'INSERT';

  const op: Omit<OfflineOperation, 'id'> = {
    clientOperationId,
    operation: opType,
    table: options.table,
    payload: {
      ...payload,
      __lookupField: options.lookupField,
      __lookupValue: options.lookupValue
    },
    userId,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pendente'
  };

  try {
    await offlineDb.operations.add(op);

    const isOnline = navigator.onLine;

    let savedOperation: OfflineOperation | undefined;
    if (isOnline) {
      await processOfflineQueue();
      savedOperation = await offlineDb.operations.where("clientOperationId").equals(clientOperationId).first();
      if (savedOperation?.status === "falha") {
        const error = new Error(savedOperation.lastError || "Falha ao sincronizar com o banco de dados.");
        if (options.onError) options.onError(error);
        if (options.showToast !== false) toast.error(error.message);
        throw error;
      }
    }

    if (options.showToast !== false) {
      if (isOnline && savedOperation?.status === "sincronizado") {
        toast.success("Salvo e sincronizado com sucesso.", { duration: 2000 });
      } else {
        toast.success("Salvo localmente. Aguardando sincronização.", {
          description: "Os dados serão enviados automaticamente assim que houver conexão.",
          duration: 3000,
        });
      }
    }

    if (isOnline) {
      window.dispatchEvent(new Event('trigger-offline-sync'));
    }

    if (options.onSuccess) {
      options.onSuccess({ clientOperationId, status: 'pendente', id: options.lookupValue });
    }

    return { clientOperationId, status: 'pendente', id: options.lookupValue };
  } catch (error) {
    console.error("Failed to enqueue offline mutation:", error);
    if (options.onError) {
      options.onError(error);
    }
    toast.error("Erro ao salvar localmente.");
    throw error;
  }
};
