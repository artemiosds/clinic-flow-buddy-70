import { Agendamento, Paciente, FilaEspera, Atendimento, Unidade, Sala, Setor, User, Disponibilidade, Configuracoes, Procedimento, EpisodioClinico, QuotaExterna } from "@/types";
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { getPublicIp, getDeviceInfo } from "@/lib/clientInfo";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { offlineDb } from "@/lib/offline-db";
import { enqueueOfflineMutation } from "@/lib/offline/offlineMutation";
import { v4 as uuidv4 } from "uuid";
import { addDaysToDateStr, isoDayOfWeek, localDateStr, nowMinutesInBrazil, todayLocalStr, isNetworkError } from "@/lib/utils";

const inlineSetores = [
  { id: "st1", nome: "Clínica Geral" }, { id: "st2", nome: "Pediatria" }, { id: "st3", nome: "Odontologia" },
  { id: "st4", nome: "Enfermagem" }, { id: "st5", nome: "Fisioterapia" }, { id: "st6", nome: "Psicologia" },
  { id: "st7", nome: "Nutrição" },
];

export interface TurnoInfoResult {
  turnoId: string; nome: string; horaInicio: string; horaFim: string; vagasTotal: number;
  vagasInternas: number; vagasExternasReservadas: number; vagasInternasOcupadas: number;
  vagasExternasOcupadas: number; vagasInternasLivres: number; vagasExternasLivres: number;
  vagasOcupadas: number; vagasLivres: number; lotado: boolean; lotadoInterno: boolean; lotadoExterno: boolean;
}

interface BloqueioAgenda {
  id: string; titulo: string; tipo: "feriado" | "ferias" | "reuniao" | "indisponibilidade";
  dataInicio: string; dataFim: string; diaInteiro: boolean; horaInicio: string; horaFim: string;
  unidadeId: string; profissionalId: string; criadoPor: string;
}

const defaultConfiguracoes: Configuracoes = {
  whatsapp: { ativo: false, provedor: "zapi", token: "", numero: "", notificacoes: { confirmacao: true, lembrete24h: true, lembrete2h: true, remarcacao: true, cancelamento: true } },
  googleCalendar: { conectado: false, criarEvento: true, atualizarRemarcar: true, removerCancelar: true, enviarEmail: true },
  filaEspera: { modoEncaixe: "assistido" },
  templates: { confirmacao: "Olá {nome}! Sua consulta foi agendada para {data} às {hora} na {unidade}. Profissional: {profissional}.", lembrete: "Lembrete: Sua consulta é em {data} às {hora} na {unidade} com {profissional}." },
  webhook: { ativo: true, url: "https://hook.us2.make.com/a12e4puc3o58b3z78k9qu3wxevr5qkwa", status: "ativo" },
  gmail: { ativo: false, email: "", senhaApp: "", smtpHost: "smtp.gmail.com", smtpPort: 587 },
  canalNotificacao: "webhook",
  portalPaciente: { permitirPortal: true, enviarSenhaAutomaticamente: true, enviarLinkAcesso: true, pacientesBloqueados: [] },
};

interface DataContextType {
  agendamentos: Agendamento[]; pacientes: Paciente[]; fila: FilaEspera[]; atendimentos: Atendimento[];
  unidades: Unidade[]; salas: Sala[]; setores: Setor[]; funcionarios: User[]; disponibilidades: Disponibilidade[];
  bloqueios: BloqueioAgenda[]; quotasExternas: QuotaExterna[]; configuracoes: Configuracoes;
  addAgendamento: (ag: Agendamento) => Promise<void>;
  updateAgendamento: (id: string, data: Partial<Agendamento>) => Promise<void>;
  cancelAgendamento: (id: string) => Promise<FilaEspera[]>;
  deleteAgendamento: (id: string) => Promise<void>;
  addPaciente: (p: Paciente) => Promise<void>;
  updatePaciente: (id: string, data: Partial<Paciente>) => Promise<void>;
  addToFila: (f: FilaEspera) => Promise<void>;
  updateFila: (id: string, data: Partial<FilaEspera>) => Promise<void>;
  removeFromFila: (id: string) => Promise<void>;
  addAtendimento: (a: Atendimento) => Promise<void>;
  updateAtendimento: (id: string, data: Partial<Atendimento>) => void;
  addUnidade: (u: Unidade) => void; updateUnidade: (id: string, data: Partial<Unidade>) => void; deleteUnidade: (id: string) => void;
  addSala: (s: Sala) => void; updateSala: (id: string, data: Partial<Sala>) => void; deleteSala: (id: string) => void;
  addFuncionario: (u: User) => void; updateFuncionario: (id: string, data: Partial<User>) => void; deleteFuncionario: (id: string) => void;
  addDisponibilidade: (d: Disponibilidade) => void; updateDisponibilidade: (id: string, data: Partial<Disponibilidade>) => void; deleteDisponibilidade: (id: string) => void;
  addBloqueio: (b: Omit<BloqueioAgenda, "id">) => Promise<void>;
  updateBloqueio: (id: string, data: Partial<BloqueioAgenda>) => Promise<void>;
  deleteBloqueio: (id: string) => Promise<void>;
  getAvailableSlots: (p: string, u: string, d: string, pub?: boolean) => string[];
  getTurnoInfo: (p: string, u: string, d: string) => TurnoInfoResult[];
  getAvailableDates: (p: string, u: string, pub?: boolean) => string[];
  getNextAvailableSlots: (p: string, u: string, f: string, l?: number, pub?: boolean) => string[];
  getBlockingInfo: (p: string, u: string, d: string) => { blocked: boolean; type?: string; label?: string };
  getDayInfoMap: (p: string, u: string, pub?: boolean) => Record<string, any>;
  updateConfiguracoes: (data: Partial<Configuracoes>) => void;
  checkFilaForSlot: (p: string, u: string, d: string, h: string) => FilaEspera[];
  encaixarDaFila: (fId: string, ag: Omit<Agendamento, "id" | "criadoEm">) => void;
  refreshFuncionarios: () => Promise<void>; refreshDisponibilidades: () => Promise<void>;
  refreshAgendamentos: () => Promise<void>; refreshPacientes: () => Promise<void>;
  searchPacientes: (q: string) => Promise<Paciente[]>; refreshFila: () => Promise<void>;
  refreshBloqueios: () => Promise<void>; refreshQuotasExternas: () => Promise<void>;
  logAction: (i: { acao: string; entidade: string; entidadeId?: string; detalhes?: Record<string, unknown>; user?: User | null; unidadeId?: string; modulo?: string; status?: string; erro?: string; }) => void;
}

const DataContext = createContext<DataContextType | null>(null);
export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
};

const safeConfigMerge = (incoming: any): Configuracoes => {
  if (!incoming) return defaultConfiguracoes;
  return { ...defaultConfiguracoes, ...incoming, whatsapp: { ...defaultConfiguracoes.whatsapp, ...incoming.whatsapp, notificacoes: { ...defaultConfiguracoes.whatsapp.notificacoes, ...incoming.whatsapp?.notificacoes } }, portalPaciente: { ...defaultConfiguracoes.portalPaciente, ...incoming.portalPaciente } };
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const isGlobalAdmin = authUser?.usuario === 'admin.sms';
  const userUnidadeId = authUser?.unidadeId || '';
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [fila, setFila] = useState<FilaEspera[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [setores] = useState<Setor[]>(inlineSetores);
  const [funcionarios, setFuncionarios] = useState<User[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<Disponibilidade[]>([]);
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [quotasExternas, setQuotasExternas] = useState<QuotaExterna[]>([]);
  const [configuracoes, setConfiguracoes] = useState<Configuracoes>(defaultConfiguracoes);

  const agendamentosRef = useRef(agendamentos); agendamentosRef.current = agendamentos;
  const bloqueiosRef = useRef(bloqueios); bloqueiosRef.current = bloqueios;

  const invalidateCache = useCallback((...keys: (readonly string[])[]) => keys.forEach(k => queryClient.invalidateQueries({ queryKey: k })), [queryClient]);

  const logAction = useCallback((input: any) => {
    const actor = input.user;
    getPublicIp().then(ip => {
      supabase.from("action_logs").insert({
        user_id: actor?.id || "", user_nome: actor?.nome || "sistema", role: actor?.role || "sistema",
        unidade_id: input.unidadeId || actor?.unidadeId || "", acao: input.acao, entidade: input.entidade,
        entidade_id: input.entidadeId || "", detalhes: { ...(input.detalhes || {}), usuario_cpf: actor?.cpf || "", dispositivo: getDeviceInfo() },
        modulo: input.modulo || input.entidade || "", status: input.status || "sucesso", erro: input.erro || "", ip,
      }).then(null, err => console.error("Error action log:", err));
    });
  }, []);

  const loadConfiguracoes = useCallback(async () => {
    const { data } = await supabase.from("system_config").select("configuracoes").eq("id", "default").maybeSingle();
    if (data) setConfiguracoes(safeConfigMerge(data.configuracoes));
  }, []);

  const loadUnidades = useCallback(async () => {
    let q = supabase.from("unidades").select("id,nome,nome_exibicao,endereco,telefone,whatsapp,ativo,custom_data");
    if (!isGlobalAdmin && userUnidadeId) q = q.eq('id', userUnidadeId);
    const { data } = await q;
    if (data) setUnidades(data.map((u: any) => ({ id: u.id, nome: u.nome, nomeExibicao: u.nome_exibicao || "", endereco: u.endereco || "", telefone: u.telefone || "", whatsapp: u.whatsapp || "", ativo: u.ativo, cnes: (u.custom_data?.cnes || '').toString(), custom_data: u.custom_data || {} })));
  }, [isGlobalAdmin, userUnidadeId]);

  const loadSalas = useCallback(async () => {
    let q = supabase.from("salas").select("id,nome,unidade_id,ativo");
    if (!isGlobalAdmin && userUnidadeId) q = q.eq('unidade_id', userUnidadeId);
    const { data } = await q;
    if (data) setSalas(data.map((s: any) => ({ id: s.id, nome: s.nome, unidadeId: s.unidade_id, ativo: s.ativo })));
  }, [isGlobalAdmin, userUnidadeId]);

  const loadFuncionarios = useCallback(async () => {
    const { data } = await supabase.from("funcionarios").select("*");
    if (data) setFuncionarios(data.map((f: any) => ({ id: f.id, authUserId: f.auth_user_id || "", nome: f.nome, usuario: f.usuario, email: f.email || "", cpf: f.cpf || "", profissao: f.profissao || "", tipoConselho: f.tipo_conselho || "", numeroConselho: f.numero_conselho || "", ufConselho: f.uf_conselho || "", role: f.role, unidadeId: f.unidade_id || "", salaId: f.sala_id || "", setor: f.setor || "", cargo: f.cargo || "", criadoEm: f.criado_em || "", criadoPor: f.criado_por || "", tempoAtendimento: f.tempo_atendimento || 30, podeAgendarRetorno: f.pode_agendar_retorno || false, coren: f.coren || "", ativo: f.ativo ?? true })));
  }, []);

  const loadAgendamentos = useCallback(async () => {
    const cutoff = localDateStr(addDaysToDateStr(todayLocalStr(), -30) as any);
    let q = supabase.from("agendamentos").select("*").gte("data", cutoff).order("data", { ascending: false });
    if (!isGlobalAdmin && userUnidadeId) q = q.eq('unidade_id', userUnidadeId);
    const { data } = await q;
    if (data) setAgendamentos(data.map((a: any) => ({ id: a.id, pacienteId: a.paciente_id, pacienteNome: a.paciente_nome, unidadeId: a.unidade_id, salaId: a.sala_id || "", setorId: a.setor_id || "", profissionalId: a.profissional_id, profissionalNome: a.profissional_nome, data: a.data, hora: a.hora, status: a.status, tipo: a.tipo, observacoes: a.observacoes || "", origem: a.origem || "recepcao", googleEventId: a.google_event_id || "", syncStatus: a.sync_status || "", criadoEm: a.criado_em || "", criadoPor: a.criado_por || "", horaChegada: a.hora_chegada || "" })));
  }, [isGlobalAdmin, userUnidadeId]);

  const loadPacientes = useCallback(async () => {
    let q = supabase.from("pacientes").select("*").order("nome", { ascending: true }).limit(2000);
    if (!isGlobalAdmin && userUnidadeId) q = q.eq('unidade_id', userUnidadeId);
    const { data } = await q;
    if (data) setPacientes(data.map((p: any) => ({ id: p.id, nome: p.nome, cpf: p.cpf, cns: p.cns, nomeMae: p.nome_mae, telefone: p.telefone, dataNascimento: p.data_nascimento, email: p.email, endereco: p.endereco, observacoes: p.observacoes, descricaoClinica: p.descricao_clinica, cid: p.cid, criadoEm: p.criado_em, unidadeId: p.unidade_id, customData: p.custom_data || {} })));
  }, [isGlobalAdmin, userUnidadeId]);

  const loadFila = useCallback(async () => {
    let q = supabase.from("fila_espera").select("*").not('status', 'in', '(atendido,cancelado,falta,concluido,excluido_da_fila_triagem)').order("criado_em", { ascending: true });
    if (!isGlobalAdmin && userUnidadeId) q = q.eq('unidade_id', userUnidadeId);
    const { data } = await q;
    if (data) setFila(data.map((f: any) => ({ id: f.id, pacienteId: f.paciente_id, pacienteNome: f.paciente_nome, unidadeId: f.unidade_id, profissionalId: f.profissional_id || "", setor: f.setor || "", prioridade: (f.prioridade_perfil || f.prioridade) as any, status: f.status as any, posicao: f.posicao, horaChegada: f.hora_chegada, horaChamada: f.hora_chamada || "", observacoes: f.observacoes || "", descricaoClinica: f.descricao_clinica || "", cid: f.cid || "", criadoPor: f.criado_por || "", criadoEm: f.criado_em || "", dataSolicitacaoOriginal: f.data_solicitacao_original || "", origemCadastro: f.origem_cadastro || "normal", especialidadeDestino: f.especialidade_destino || "" })));
  }, [isGlobalAdmin, userUnidadeId]);

  const addAgendamento = useCallback(async (ag: Agendamento) => {
    const id = ag.id || uuidv4();
    await enqueueOfflineMutation("INSERT", { ...ag, id, paciente_id: ag.pacienteId, paciente_nome: ag.pacienteNome, unidade_id: ag.unidadeId, profissional_id: ag.profissionalId, profissional_nome: ag.profissionalNome, criado_por: authUser?.id, criado_em: new Date().toISOString() }, { table: "agendamentos", onSuccess: () => setAgendamentos(prev => [{ ...ag, id }, ...prev]) });
    invalidateCache(queryKeys.agendamentos.all);
  }, [authUser, invalidateCache]);

  const updateAgendamento = useCallback(async (id: string, data: Partial<Agendamento>) => {
    await enqueueOfflineMutation("UPDATE", data, { table: "agendamentos", lookupField: "id", lookupValue: id, onSuccess: () => setAgendamentos(prev => prev.map(a => a.id === id ? { ...a, ...data } : a)) });
    invalidateCache(queryKeys.agendamentos.all);
  }, [invalidateCache]);

  const addPaciente = useCallback(async (p: Paciente) => {
    const id = p.id || uuidv4();
    await enqueueOfflineMutation("INSERT", { ...p, id, nome_mae: p.nomeMae, data_nascimento: p.dataNascimento, descricao_clinica: p.descricaoClinica, unidade_id: p.unidadeId || userUnidadeId }, { table: "pacientes", onSuccess: () => setPacientes(prev => [{ ...p, id }, ...prev]) });
    invalidateCache(queryKeys.pacientes.all);
  }, [userUnidadeId, invalidateCache]);

  const updatePaciente = useCallback(async (id: string, data: Partial<Paciente>) => {
    await enqueueOfflineMutation("UPDATE", data, { table: "pacientes", lookupField: "id", lookupValue: id, onSuccess: () => setPacientes(prev => prev.map(p => p.id === id ? { ...p, ...data } : p)) });
    invalidateCache(queryKeys.pacientes.all);
  }, [invalidateCache]);

  const addToFila = useCallback(async (f: FilaEspera) => {
    await enqueueOfflineMutation("INSERT", { ...f, paciente_id: f.pacienteId, paciente_nome: f.pacienteNome, unidade_id: f.unidadeId, profissional_id: f.profissionalId, hora_chegada: f.horaChegada, criado_por: f.criadoPor }, { table: "fila_espera", onSuccess: () => setFila(prev => [...prev, f]) });
    invalidateCache(queryKeys.fila.all);
  }, [invalidateCache]);

  const updateFila = useCallback(async (id: string, data: Partial<FilaEspera>) => {
    await enqueueOfflineMutation("UPDATE", data, { table: "fila_espera", lookupField: "id", lookupValue: id, onSuccess: () => setFila(prev => prev.map(f => f.id === id ? { ...f, ...data } : f)) });
    invalidateCache(queryKeys.fila.all);
  }, [invalidateCache]);

  const addAtendimento = useCallback(async (a: Atendimento) => {
    await enqueueOfflineMutation("INSERT", { ...a, agendamento_id: a.agendamentoId, paciente_id: a.pacienteId, profissional_id: (a as any).professionalId || a.profissionalId, unidade_id: a.unidadeId, hora_inicio: a.horaInicio }, { table: "atendimentos", onSuccess: () => setAtendimentos(prev => [...prev, a]) });
    invalidateCache(queryKeys.atendimentos.all);
  }, [invalidateCache]);

  useEffect(() => { if (authUser) { loadConfiguracoes(); loadUnidades(); loadSalas(); loadFuncionarios(); loadAgendamentos(); loadPacientes(); loadFila(); } }, [authUser, loadConfiguracoes, loadUnidades, loadSalas, loadFuncionarios, loadAgendamentos, loadPacientes, loadFila]);

  useEffect(() => {
    const handleOfflineSyncComplete = (event: Event) => {
      const syncedTables = (event as CustomEvent<{ syncedTables?: string[] }>).detail?.syncedTables || [];
      if (syncedTables.includes("agendamentos")) { loadAgendamentos(); invalidateCache(queryKeys.agendamentos.all); }
      if (syncedTables.includes("pacientes")) { loadPacientes(); invalidateCache(queryKeys.pacientes.all); }
      if (syncedTables.includes("fila_espera")) { loadFila(); invalidateCache(queryKeys.fila.all); }
      if (syncedTables.includes("atendimentos")) invalidateCache(queryKeys.atendimentos.all);
      if (syncedTables.includes("prontuarios")) invalidateCache(queryKeys.prontuarios.all);
      if (syncedTables.includes("triage_records")) invalidateCache(queryKeys.triagem.all);
    };
    window.addEventListener("offline-sync-complete", handleOfflineSyncComplete);
    return () => window.removeEventListener("offline-sync-complete", handleOfflineSyncComplete);
  }, [invalidateCache, loadAgendamentos, loadPacientes, loadFila]);

  const value = useMemo(() => ({
    agendamentos, pacientes, fila, atendimentos, unidades, salas, setores, funcionarios, disponibilidades, bloqueios, quotasExternas, configuracoes,
    addAgendamento, updateAgendamento, addPaciente, updatePaciente, addToFila, updateFila, addAtendimento,
    cancelAgendamento: async () => [], deleteAgendamento: async () => {}, removeFromFila: async () => {}, updateAtendimento: () => {},
    addUnidade: () => {}, updateUnidade: () => {}, deleteUnidade: () => {}, addSala: () => {}, updateSala: () => {}, deleteSala: () => {},
    addFuncionario: () => {}, updateFuncionario: () => {}, deleteFuncionario: () => {}, addDisponibilidade: () => {}, updateDisponibilidade: () => {}, deleteDisponibilidade: () => {},
    addBloqueio: async () => {}, updateBloqueio: async () => {}, deleteBloqueio: async () => {},
    getAvailableSlots: () => [], getTurnoInfo: () => [], getAvailableDates: () => [], getNextAvailableSlots: () => [], getBlockingInfo: () => ({ blocked: false }), getDayInfoMap: () => ({}),
    updateConfiguracoes: () => {}, checkFilaForSlot: () => [], encaixarDaFila: () => {}, refreshFuncionarios: async () => {}, refreshDisponibilidades: async () => {}, refreshAgendamentos: async () => {}, refreshPacientes: async () => {}, searchPacientes: async () => [], refreshFila: async () => {}, refreshBloqueios: async () => {}, refreshQuotasExternas: async () => {}, logAction
  }), [agendamentos, pacientes, fila, atendimentos, unidades, salas, setores, funcionarios, disponibilidades, bloqueios, quotasExternas, configuracoes, addAgendamento, updateAgendamento, addPaciente, updatePaciente, addToFila, updateFila, addAtendimento, logAction]);

  return <DataContext.Provider value={value as any}>{children}</DataContext.Provider>;
};
