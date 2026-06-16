import { offlineDb, type OfflineOperation } from "../offline-db";
import { supabase } from "@/integrations/supabase/client";
import { isNetworkError } from "@/lib/utils";
import { toast } from "sonner";

export type OfflineOperationType = "INSERT" | "UPDATE" | "DELETE" | string;
type QueueStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

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
  conflicts: number;
  syncedTables: string[];
  failedOperations: OfflineOperation[];
}

const debugOffline = (...args: any[]) => {
  if (import.meta.env.DEV) console.info("[offline-mutation]", ...args);
};

const IDEMPOTENCY_CONSTRAINTS = new Set([
  "unique_action_logs_client_op", "unique_agendamentos_client_op", "unique_atendimentos_client_op",
  "unique_especialidades_client_op", "unique_exam_types_client_op", "unique_fila_espera_client_op",
  "unique_horarios_funcionamento_client_op", "unique_medications_client_op", "unique_multiprofessional_evaluations_client_op",
  "unique_nursing_evaluations_client_op", "unique_pacientes_client_op", "unique_patient_discharges_client_op",
  "unique_patient_evaluations_client_op", "unique_patient_regulation_client_op", "unique_prontuario_procedimentos_client_op",
  "unique_prontuarios_client_op", "unique_pts_client_op", "unique_pts_cid_client_op", "unique_pts_metas_client_op",
  "unique_pts_revisoes_client_op", "unique_pts_sigtap_client_op", "unique_treatment_cycles_client_op",
  "unique_treatment_sessions_client_op", "unique_triage_records_client_op",
]);

const TABLE_COLUMNS: Record<string, Set<string>> = {
  agendamentos: new Set(["id", "paciente_id", "paciente_nome", "unidade_id", "sala_id", "setor_id", "profissional_id", "profissional_nome", "data", "hora", "status", "tipo", "observacoes", "origem", "google_event_id", "sync_status", "criado_em", "criado_por", "prioridade_perfil", "procedimento_sigtap", "nome_procedimento", "turno", "agendado_por_externo", "custom_data", "falta_liberada", "liberada_em", "liberada_por", "motivo_liberacao", "regularizada", "status_falta_registro", "falta_justificada", "motivo_falta_justificada", "client_operation_id"]),
  atendimentos: new Set(["id", "agendamento_id", "paciente_id", "paciente_nome", "profissional_id", "profissional_nome", "unidade_id", "sala_id", "setor", "procedimento", "observacoes", "data", "hora_inicio", "hora_fim", "duracao_minutos", "status", "criado_em", "custom_data", "client_operation_id"]),
  fila_espera: new Set(["id", "paciente_id", "paciente_nome", "unidade_id", "profissional_id", "setor", "prioridade", "status", "posicao", "hora_chegada", "hora_chamada", "observacoes", "criado_por", "criado_em", "prioridade_perfil", "descricao_clinica", "cid", "data_solicitacao_original", "origem_cadastro", "especialidade_destino", "custom_data", "client_operation_id"]),
  pacientes: new Set(["id", "nome", "cpf", "telefone", "data_nascimento", "email", "endereco", "observacoes", "criado_em", "auth_user_id", "descricao_clinica", "cid", "cns", "nome_mae", "municipio", "menor_idade", "nome_responsavel", "cpf_responsavel", "ubs_origem", "profissional_solicitante", "tipo_encaminhamento", "diagnostico_resumido", "justificativa", "data_encaminhamento", "documento_url", "tipo_condicao", "mobilidade", "usa_dispositivo", "tipo_dispositivo", "comunicacao", "comportamento", "usa_equipamentos", "equipamentos", "observacao_equipamentos", "outro_servico_sus", "transporte", "turno_preferido", "especialidade_destino", "is_gestante", "is_pne", "is_autista", "custom_data", "unidade_id", "atualizado_em", "sexo", "naturalidade", "nacionalidade", "raca_cor", "cep", "tipo_logradouro", "numero", "complemento", "bairro", "uf", "telefone_secundario", "situacao_rua", "etnia", "etnia_outra", "pais_nascimento", "tipo_logradouro_codigo", "total_faltas", "faltas_consecutivas", "status_falta", "is_tfd", "possui_ordem_judicial", "motivo_excecao_bloqueio", "observacao_tfd_ordem_judicial", "data_marcacao_excecao", "marcado_por", "rg", "nome_pai", "client_operation_id"]),
  prontuarios: new Set(["id", "paciente_id", "paciente_nome", "profissional_id", "profissional_nome", "unidade_id", "sala_id", "setor", "agendamento_id", "data_atendimento", "hora_atendimento", "queixa_principal", "anamnese", "sinais_sintomas", "exame_fisico", "hipotese", "conduta", "prescricao", "solicitacao_exames", "evolucao", "observacoes", "criado_em", "atualizado_em", "indicacao_retorno", "motivo_alteracao", "episodio_id", "procedimentos_texto", "outro_procedimento", "tipo_registro", "soap_subjetivo", "soap_objetivo", "soap_avaliacao", "soap_plano", "custom_data", "dados_acolhimento", "status", "pts_meta_id", "client_operation_id"]),
  prontuario_procedimentos: new Set(["id", "prontuario_id", "procedimento_id", "observacao", "criado_em", "paciente_id", "agendamento_id", "profissional_id", "unidade_id", "codigo_sigtap", "nome_procedimento", "especialidade", "quantidade", "cid", "origem", "criado_por", "atualizado_por", "updated_at", "client_operation_id"]),
  triage_records: new Set(["id", "agendamento_id", "tecnico_id", "peso", "altura", "imc", "pressao_arterial", "temperatura", "frequencia_cardiaca", "saturacao_oxigenio", "glicemia", "alergias", "medicamentos", "queixa", "iniciado_em", "confirmado_em", "criado_em", "classificacao_risco", "custom_data", "observacoes", "client_operation_id"]),
  patient_regulation: new Set(["id", "patient_id", "cns", "cpf", "name", "mother_name", "priority_level", "referral_source", "cid_code", "requires_specialty", "status", "notes", "created_at", "updated_at", "client_operation_id"]),
  patient_evaluations: new Set(["id", "patient_id", "regulation_id", "professional_id", "unit_id", "evaluation_date", "clinical_notes", "defined_procedures", "sessions_planned", "frequency", "status", "rejection_reason", "created_at", "updated_at", "client_operation_id"]),
  pts: new Set(["id", "patient_id", "professional_id", "unit_id", "diagnostico_funcional", "objetivos_terapeuticos", "metas_curto_prazo", "metas_medio_prazo", "metas_longo_prazo", "especialidades_envolvidas", "status", "created_at", "updated_at", "custom_data", "prioridade", "contextos_afetados", "fatores_risco_vulnerabilidade", "rede_apoio", "tipo_atendimento", "necessidade_interdisciplinar", "motivo_encaminhamento", "barreiras", "potencialidades", "objetivos_especificos", "observacoes_especialidade", "plano_conduta", "data_ultima_revisao", "data_proxima_revisao", "revisao_obrigatoria", "observacoes_revisao", "criterio_alta_atingido", "motivo_encerramento", "resumo_alta_encerramento", "orientacoes_finais", "encaminhamentos_pos_alta", "ciencia_familia", "client_operation_id"]),
  pts_metas: new Set(["id", "pts_id", "titulo", "descricao", "categoria", "especialidade", "responsavel_id", "prioridade", "prazo", "indicador_sucesso", "status", "observacoes", "created_at", "updated_at", "client_operation_id"]),
  pts_sigtap: new Set(["id", "pts_id", "procedimento_codigo", "procedimento_nome", "especialidade", "created_at", "client_operation_id"]),
  pts_cid: new Set(["id", "pts_id", "cid_codigo", "cid_descricao", "created_at", "client_operation_id"]),
  treatment_cycles: new Set(["id", "patient_id", "professional_id", "unit_id", "specialty", "treatment_type", "start_date", "end_date_predicted", "total_sessions", "sessions_done", "frequency", "status", "clinical_notes", "created_by", "created_at", "updated_at", "pts_id", "custom_data", "client_operation_id"]),
  treatment_sessions: new Set(["id", "cycle_id", "patient_id", "professional_id", "appointment_id", "session_number", "total_sessions", "scheduled_date", "status", "absence_type", "clinical_notes", "procedure_done", "created_at", "client_operation_id"]),
  patient_discharges: new Set(["id", "cycle_id", "patient_id", "professional_id", "discharge_date", "reason", "final_notes", "created_at", "custom_data", "client_operation_id"]),
};

const FIELD_ALIASES: Record<string, string> = {
  pacienteId: "paciente_id", pacienteNome: "paciente_nome", unidadeId: "unidade_id", salaId: "sala_id", setorId: "setor_id",
  profissionalId: "profissional_id", profissionalNome: "profissional_nome", googleEventId: "google_event_id", syncStatus: "sync_status",
  criadoEm: "criado_em", criadoPor: "criado_por", agendadoPorExterno: "agendado_por_externo", customData: "custom_data",
  agendamentoId: "agendamento_id", horaInicio: "hora_inicio", horaFim: "hora_fim", duracaoMinutos: "duracao_minutos",
  nomeMae: "nome_mae", dataNascimento: "data_nascimento", descricaoClinica: "descricao_clinica", isGestante: "is_gestante",
  isPne: "is_pne", isAutista: "is_autista", horaChegada: "hora_chegada", horaChamada: "hora_chamada",
  dataSolicitacaoOriginal: "data_solicitacao_original", origemCadastro: "origem_cadastro", especialidadeDestino: "especialidade_destino",
  clientOperationId: "client_operation_id", idOperacaoCliente: "client_operation_id", id_operacao_cliente: "client_operation_id",
};

const SYNC_PRIORITY: Record<string, number> = {
  pacientes: 10,
  agendamentos: 20,
  fila_espera: 25,
  prontuarios: 30,
  prontuario_procedimentos: 40,
  pts: 50,
  pts_metas: 55,
  pts_sigtap: 56,
  pts_cid: 57,
  treatment_cycles: 60,
  treatment_sessions: 70,
  prontuario_anexos: 80,
};

const UPDATED_AT_COLUMN: Record<string, string> = {
  pacientes: "atualizado_em",
  agendamentos: "atualizado_em",
  prontuarios: "atualizado_em",
  prontuario_procedimentos: "updated_at",
  pts: "updated_at",
  pts_metas: "updated_at",
  treatment_cycles: "updated_at",
  patient_regulation: "updated_at",
  patient_evaluations: "updated_at",
};

let syncPromise: Promise<OfflineSyncResult> | null = null;
const toSnakeCase = (key: string) => FIELD_ALIASES[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const normalizeStatus = (status: OfflineOperation["status"]): QueueStatus => ({ pendente: "pending", sincronizando: "syncing", sincronizado: "synced", falha: "failed" } as any)[status] || status as QueueStatus;
const isPendingStatus = (status: OfflineOperation["status"]) => ["pending", "pendente", "syncing", "sincronizando"].includes(status);

const normalizeOperation = (operation: OfflineOperationType) => {
  const op = String(operation || "").toUpperCase();
  if (["INSERT", "UPDATE", "DELETE"].includes(op)) return op as "INSERT" | "UPDATE" | "DELETE";
  if (op.includes("CREATE")) return "INSERT";
  if (op.includes("EDIT") || op.includes("UPDATE")) return "UPDATE";
  if (op.includes("DELETE") || op.includes("REMOVE")) return "DELETE";
  return "INSERT";
};

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
  if (!allowed || allowed.has("client_operation_id")) out.client_operation_id = clientOperationId;
  return out;
};

const getConstraintName = (error: any) => {
  if (typeof error?.constraint === "string") return error.constraint;
  const text = `${error?.message || ""}\n${error?.details || ""}\n${error?.hint || ""}`;
  return text.match(/unique constraint "([^"]+)"/)?.[1] || text.match(/constraint "([^"]+)"/)?.[1] || "";
};

const isIdempotencyConflict = (error: any) => error?.code === "23505" && IDEMPOTENCY_CONSTRAINTS.has(getConstraintName(error));

const getLookup = (op: Pick<OfflineOperation, "payload" | "operation">) => {
  const { __lookupField, __lookupValue } = op.payload || {};
  return {
    lookupField: __lookupField || (op.payload?.id ? "id" : null),
    lookupValue: __lookupValue ?? op.payload?.id,
  };
};

const ensureNoRemoteConflict = async (op: OfflineOperation) => {
  if (normalizeOperation(op.operation) !== "UPDATE") return;
  const timestampColumn = UPDATED_AT_COLUMN[op.table];
  if (!timestampColumn) return;
  const { lookupField, lookupValue } = getLookup(op);
  if (!lookupField || !lookupValue) return;
  const { data, error } = await (supabase as any).from(op.table).select(timestampColumn).eq(toSnakeCase(lookupField), lookupValue).maybeSingle();
  if (error || !data?.[timestampColumn]) return;
  const remoteUpdatedAt = new Date(data[timestampColumn]).getTime();
  if (Number.isFinite(remoteUpdatedAt) && remoteUpdatedAt > op.createdAt + 1000) {
    throw Object.assign(new Error("Conflito detectado: o registro remoto foi alterado após a criação da operação offline."), { offlineConflict: true });
  }
};

const executeSupabaseMutation = async (op: OfflineOperation) => {
  const operation = normalizeOperation(op.operation);
  const cleanPayload = sanitizePayloadForTable(op.table, op.payload, op.clientOperationId, operation);
  const tableQuery = (supabase as any).from(op.table);
  debugOffline("tentativa online", { table: op.table, operation, clientOperationId: op.clientOperationId });

  let result: any;
  if (operation === "INSERT") {
    result = await tableQuery.insert(cleanPayload).select("*");
  } else if (operation === "UPDATE") {
    await ensureNoRemoteConflict(op);
    const { lookupField, lookupValue } = getLookup(op);
    if (!lookupField || lookupValue === undefined || lookupValue === null || lookupValue === "") throw new Error(`Operação UPDATE sem identificador em ${op.table}.`);
    result = await tableQuery.update(cleanPayload).eq(toSnakeCase(lookupField), lookupValue).select("*");
    if (!result?.error && Array.isArray(result?.data) && result.data.length === 0) throw new Error(`Registro não localizado para UPDATE em ${op.table}.`);
  } else if (operation === "DELETE") {
    const { lookupField, lookupValue } = getLookup(op);
    if (!lookupField || lookupValue === undefined || lookupValue === null || lookupValue === "") throw new Error(`Operação DELETE sem identificador em ${op.table}.`);
    result = await tableQuery.delete().eq(toSnakeCase(lookupField), lookupValue).select("id");
  }

  if (result?.error) throw result.error;
  return Array.isArray(result?.data) ? (result.data[0] || null) : result?.data;
};

const buildOperation = async (operation: OfflineOperationType, payload: any, options: EnqueueOptions, clientOperationId = crypto.randomUUID()): Promise<Omit<OfflineOperation, "id">> => {
  let userId = "anonymous";
  try {
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id || "anonymous";
  } catch (e) {
    debugOffline("sessão auth indisponível", e);
  }
  return {
    clientOperationId,
    operation: normalizeOperation(operation),
    table: options.table,
    payload: { ...payload, __lookupField: options.lookupField, __lookupValue: options.lookupValue },
    userId,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
};

const enqueuePending = async (op: Omit<OfflineOperation, "id">) => {
  debugOffline("fallback offline", { table: op.table, operation: op.operation, clientOperationId: op.clientOperationId });
  await offlineDb.operations.add(op);
};

const processQueueInternal = async (): Promise<OfflineSyncResult> => {
  const summary: OfflineSyncResult = { synced: 0, failed: 0, pending: 0, conflicts: 0, syncedTables: [], failedOperations: [] };
  if (!navigator.onLine) return summary;
  debugOffline("sync iniciado");
  await offlineDb.operations.where("status").equals("sincronizando").modify({ status: "pending" });
  await offlineDb.operations.where("status").equals("syncing").modify({ status: "pending" });

  const allOps = await offlineDb.operations.toArray();
  const pendingOps = allOps
    .filter(op => isPendingStatus(op.status))
    .sort((a, b) => (SYNC_PRIORITY[a.table] ?? 999) - (SYNC_PRIORITY[b.table] ?? 999) || a.createdAt - b.createdAt);

  for (const op of pendingOps) {
    if (!navigator.onLine) { summary.pending += 1; break; }
    try {
      await offlineDb.operations.update(op.id!, { status: "syncing" });
      await executeSupabaseMutation({ ...op, status: "syncing" });
      await offlineDb.operations.update(op.id!, { status: "synced", lastError: undefined });
      debugOffline("item removido da fila", { id: op.id, table: op.table });
      summary.synced += 1;
      summary.syncedTables.push(op.table);
    } catch (error: any) {
      if (isIdempotencyConflict(error)) {
        await offlineDb.operations.update(op.id!, { status: "synced", lastError: undefined });
        summary.synced += 1;
        summary.syncedTables.push(op.table);
        continue;
      }
      if (error?.offlineConflict) {
        await offlineDb.operations.update(op.id!, { status: "conflict", attempts: (op.attempts || 0) + 1, lastError: error.message });
        debugOffline("conflito detectado", { id: op.id, table: op.table, error: error.message });
        summary.conflicts += 1;
        continue;
      }
      if (isNetworkError(error)) {
        await offlineDb.operations.update(op.id!, { status: "pending", lastError: "Conexão indisponível. Aguardando nova sincronização." });
        summary.pending += 1;
        debugOffline("sync falhou por rede", error);
        break;
      }
      const failedOp = { ...op, lastError: error?.message || error?.details || "Erro desconhecido", attempts: (op.attempts || 0) + 1, status: "failed" as const };
      await offlineDb.operations.update(op.id!, { status: "failed", attempts: failedOp.attempts, lastError: failedOp.lastError });
      debugOffline("sync falhou", { id: op.id, table: op.table, error: failedOp.lastError });
      summary.failed += 1;
      summary.failedOperations.push(failedOp);
    }
  }

  summary.syncedTables = Array.from(new Set(summary.syncedTables));
  debugOffline("sync concluído", summary);
  return summary;
};

export const processOfflineQueue = async () => {
  if (!syncPromise) syncPromise = processQueueInternal().finally(() => { syncPromise = null; });
  return syncPromise;
};

export const enqueueOfflineMutation = async (operationOrObject: OfflineOperationType | any, payloadOrUndefined?: any, optionsOrUndefined?: EnqueueOptions) => {
  let operation: OfflineOperationType;
  let payload: any;
  let options: EnqueueOptions;
  if (typeof operationOrObject === "string") {
    operation = operationOrObject;
    payload = payloadOrUndefined;
    options = optionsOrUndefined!;
  } else {
    const obj = operationOrObject;
    operation = obj.operation;
    payload = obj.payload;
    options = { table: obj.table, lookupField: obj.lookupField, lookupValue: obj.lookupValue, showToast: obj.showToast, onSuccess: obj.onSuccess, onError: obj.onError };
  }

  const op = await buildOperation(operation, payload, options);
  debugOffline("mutation criada", { table: op.table, operation: op.operation, online: navigator.onLine, clientOperationId: op.clientOperationId });

  try {
    if (navigator.onLine) {
      try {
        const data = await executeSupabaseMutation(op as OfflineOperation);
        if (options.showToast !== false) toast.success("Salvo no banco com sucesso.", { duration: 2000 });
        if (options.onSuccess) options.onSuccess(data || { clientOperationId: op.clientOperationId, status: "synced", id: options.lookupValue || payload?.id });
        window.dispatchEvent(new CustomEvent("offline-sync-complete", { detail: { syncedTables: [options.table], synced: 1 } }));
        return { clientOperationId: op.clientOperationId, status: "synced", id: data?.id || options.lookupValue || payload?.id, data };
      } catch (error: any) {
        if (!isNetworkError(error)) {
          if (options.onError) options.onError(error);
          if (options.showToast !== false) toast.error(error?.message || "Falha ao salvar no banco de dados.");
          throw error;
        }
        await enqueuePending(op);
      }
    } else {
      await enqueuePending(op);
    }

    if (options.showToast !== false) {
      toast.success("Salvo localmente. Aguardando sincronização.", {
        description: "Os dados serão enviados automaticamente assim que houver conexão.",
        duration: 3000,
      });
    }
    if (options.onSuccess) options.onSuccess({ clientOperationId: op.clientOperationId, status: "pending", id: options.lookupValue || payload?.id });
    return { clientOperationId: op.clientOperationId, status: "pending", id: options.lookupValue || payload?.id };
  } catch (error) {
    console.error("Failed to process mutation:", error);
    if (options.onError) options.onError(error);
    throw error;
  }
};
