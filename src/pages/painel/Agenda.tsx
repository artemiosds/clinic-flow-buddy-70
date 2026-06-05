import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { patientAbsenceService } from "@/services/patientAbsenceService";
import { usePacienteNomeResolver } from "@/hooks/usePacienteNomeResolver";
import { isSameDay } from "date-fns";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useWebhookNotify } from "@/hooks/useWebhookNotify";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Clock,
  UserCheck,
  RotateCcw,
  Play,
  LogIn,
  Trash2,
  CalendarOff,
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarRange,
  Columns,
  Eye,
  FileText,
  CheckCircle2,
  XCircle,
  Paperclip,
  Bell,
  Search,
  Pencil,
  Loader2,
  FilterX,
  Filter,
  Stethoscope,
  Building2,
  Phone,
  RefreshCw,
  Info,
  LayoutGrid,
  ChevronsUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import DetalheDrawer, { Secao, Campo, StatusBadge, calcularIdade, formatarData } from "@/components/DetalheDrawer";
import ContactActionButton from "@/components/ContactActionButton";
import { addDaysToDateStr, cn, isoDayOfWeek, nowMinutesInBrazil, todayLocalStr } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useFilaAutomatica } from "@/hooks/useFilaAutomatica";
import { useEnsurePortalAccess } from "@/hooks/useEnsurePortalAccess";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { SlotInfoBadge } from "@/components/SlotInfoBadge";
import { CalendarioAgenda } from "./CalendarioAgenda";
import { AgendaVisaoSemana } from "./AgendaVisaoSemana";
import { AgendaVisaoDia } from "./AgendaVisaoDia";
import { getManchesterBadgeStyle } from "@/lib/manchesterProtocol";
import { whatsappService } from "@/services/whatsappService";
import { AgendaNotificacaoIndividual, AgendaNotificacoesMassa } from "@/components/AgendaNotificacoes";
import { RegistrarFaltaModal } from "@/components/RegistrarFaltaModal";
import { ConferirDadosPacienteModal } from "@/components/ConferirDadosPacienteModal";
import PacienteDocumentos from "@/components/PacienteDocumentos";
import { PageHeader } from "@/components/layout/PageHeader";

const statusActions = [
  { key: "confirmado_chegada", label: "Confirmar Chegada", icon: LogIn, color: "bg-success text-success-foreground" },
  { key: "atraso", label: "Atrasou", icon: Clock, color: "bg-warning text-warning-foreground" },
  { key: "falta", label: "Faltou", icon: X, color: "bg-destructive text-destructive-foreground" },
  { key: "concluido", label: "Atendido", icon: UserCheck, color: "bg-info text-info-foreground" },
  { key: "remarcado", label: "Remarcou", icon: RotateCcw, color: "bg-muted text-muted-foreground" },
] as const;

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  confirmado_chegada: "Chegou",
  cancelado: "Cancelado",
  concluido: "Concluído",
  falta: "Falta",
  atraso: "Atraso",
  remarcado: "Remarcado",
  em_atendimento: "Em Atendimento",
  aguardando_triagem: "Aguard. Triagem",
  aguardando_atendimento: "Aguard. Atendimento",
  aguardando_enfermagem: "Aguard. Enfermagem",
  apto_agendamento: "Apto p/ Agendamento",
  apto_atendimento: "Apto p/ Atendimento",
  aguardando_multiprofissional: "Aguard. Multiprofissional",
  indeferido: "Indeferido",
  pendente_revisao: "Pendente de Revisão",
};

const STATUS_GROUPS: Record<string, string[]> = {
  confirmado: ["confirmado", "confirmada", "agendado"],
  apto_atendimento: ["apto_atendimento", "apto", "aguardando_profissional", "triagem_concluida"],
  em_atendimento: ["em_atendimento"],
  concluido: ["concluido", "finalizado", "atendido", "prontuario_finalizado"],
  falta: ["falta", "faltou"],
  cancelado: ["cancelado", "cancelada"],
  confirmado_chegada: ["confirmado_chegada"],
  aguardando_triagem: ["aguardando_triagem"],
  triagem_concluida: ["triagem_concluida"],
  pendente: ["pendente", "avaliacao"],
};

const STATUS_GROUP_LABELS: Record<string, string> = {
  all: "Todos",
  confirmado: "Confirmado",
  apto_atendimento: "Apto para Atendimento",
  em_atendimento: "Em Atendimento",
  concluido: "Concluído",
  falta: "Faltou",
  cancelado: "Cancelado",
  confirmado_chegada: "Chegada Confirmada",
  aguardando_triagem: "Aguardando Triagem",
  triagem_concluida: "Triagem Concluída",
  pendente: "Pendente",
};

const statusBadgeClass: Record<string, string> = {
  pendente: "bg-warning/10 text-warning",
  confirmado: "bg-success/10 text-success",
  confirmado_chegada: "bg-emerald-500/10 text-emerald-600",
  cancelado: "bg-destructive/10 text-destructive",
  concluido: "bg-info/10 text-info",
  falta: "bg-destructive/10 text-destructive",
  atraso: "bg-warning/10 text-warning",
  remarcado: "bg-muted text-muted-foreground",
  em_atendimento: "bg-primary/10 text-primary",
  aguardando_triagem: "bg-warning/10 text-warning",
  aguardando_atendimento: "bg-emerald-500/10 text-emerald-600",
  aguardando_enfermagem: "bg-orange-500/10 text-orange-600",
  apto_agendamento: "bg-success/10 text-success",
  apto_atendimento: "bg-green-500/10 text-green-600",
  aguardando_multiprofissional: "bg-purple-500/10 text-purple-600",
  indeferido: "bg-destructive/10 text-destructive",
  pendente_revisao: "bg-warning/10 text-warning ring-1 ring-warning/30",
};

const tipoBadge: Record<string, { label: string; class: string; icon: string }> = {
  "Avaliação/TR": { label: "Avaliação/TR", class: "bg-success/15 text-success border border-success/30", icon: "🟢" },
  Consulta: { label: "Avaliação/TR", class: "bg-success/15 text-success border border-success/30", icon: "🟢" },
  Retorno: { label: "Retorno", class: "bg-info/15 text-info border border-info/30", icon: "🔵" },
  Exame: { label: "Exame", class: "bg-warning/15 text-warning border border-warning/30", icon: "🟡" },
  Procedimento: {
    label: "Procedimento",
    class: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30",
    icon: "🟣",
  },
  Urgência: { label: "Urgência", class: "bg-destructive/15 text-destructive border border-destructive/30", icon: "🔴" },
  "Sessão de Tratamento": {
    label: "Sessão",
    class: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30",
    icon: "🟠",
  },
};

const Agenda: React.FC = () => {
  const {
    agendamentos,
    updateAgendamento,
    pacientes,
    funcionarios,
    unidades,
    salas,
    addAgendamento,
    configuracoes,
    addAtendimento,
    logAction,
    refreshAgendamentos,
    refreshFila,
    fila,
    updateFila,
    addToFila,
    disponibilidades,
    getAvailableSlots,
    getAvailableDates,
    getTurnoInfo,
    bloqueios,
  } = useData();
  const [lastProntuarios, setLastProntuarios] = React.useState<
    Record<string, { data: string; profissional: string; procedimentos: string; queixa: string; tipo: string }>
  >({});
  const { user } = useAuth();
  const { can } = usePermissions();
  const gcal = useGoogleCalendar();
  const { notify } = useWebhookNotify();
  const { handleVagaLiberada } = useFilaAutomatica();
  const { ensurePortalAccess } = useEnsurePortalAccess();
  const navigate = useNavigate();
  const resolvePaciente = usePacienteNomeResolver();
  const [selectedDate, setSelectedDate] = useState(todayLocalStr());
  const [agendaView, setAgendaView] = useState<"day" | "week" | "month">("month");
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [filterUnit, setFilterUnit] = useState("all");
  const [filterProf, setFilterProf] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTipo, setFilterTipo] = useState("Todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [retornoDialogOpen, setRetornoDialogOpen] = useState(false);
  const [retornoAg, setRetornoAg] = useState<{ pacienteId: string; pacienteNome: string } | null>(null);
  const [retornoForm, setRetornoForm] = useState({ data: "", hora: "" });
  const [newAg, setNewAg] = useState({
    pacienteId: "",
    profissionalId: filterProf !== "all" ? filterProf : "",
    salaId: "",
    hora: "",
    tipo: "Avaliação/TR",
    obs: "",
  });
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [detalheAg, setDetalheAg] = useState<(typeof agendamentos)[0] | null>(null);
  const [rejeicaoTarget, setRejeicaoTarget] = useState<(typeof agendamentos)[0] | null>(null);
  const [rejeicaoMotivo, setRejeicaoMotivo] = useState("");
  const [cancelTarget, setCancelTarget] = useState<(typeof agendamentos)[0] | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [faltaTarget, setFaltaTarget] = useState<(typeof agendamentos)[0] | null>(null);
  const [cancelConfig, setCancelConfig] = useState<{
    prazo_minimo_horas: number;
    limite_cancelamentos_mes: number;
    dias_bloqueio_apos_limite: number;
    motivos: string[];
    notificar_profissional: boolean;
    liberar_vaga_automaticamente: boolean;
  }>({
    prazo_minimo_horas: 24,
    limite_cancelamentos_mes: 3,
    dias_bloqueio_apos_limite: 7,
    motivos: ['Compromisso pessoal', 'Problema de saúde', 'Falta de transporte', 'Horário incompatível', 'Outro'],
    notificar_profissional: true,
    liberar_vaga_automaticamente: true,
  });

  React.useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('system_config')
          .select('configuracoes')
          .eq('id', 'config_cancelamentos')
          .maybeSingle();
        if (data?.configuracoes) {
          setCancelConfig(prev => ({ ...prev, ...(data.configuracoes as any) }));
        }
      } catch {}
    })();
  }, []);

  const [abaAtiva, setAbaAtiva] = useState<"agenda" | "pendentes">("agenda");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  React.useEffect(() => {
    const t = setTimeout(() => {
      const term = searchTerm.trim().toLowerCase();
      setDebouncedSearch(term);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editAg, setEditAg] = useState<{
    id: string;
    tipo: string;
    data: string;
    hora: string;
    profissionalId: string;
    observacoes: string;
  } | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [agendamentoSaving, setAgendamentoSaving] = useState(false);
  const canEdit = can('agenda', 'can_edit');

  const [conferenciaModal, setConferenciaModal] = useState<{
    open: boolean;
    pacienteId: string;
    modo: "agendamento" | "chegada";
    agendamentoInfo?: {
      data: string;
      hora: string;
      tipo: string;
      profissionalNome: string;
      profissionalEspecialidade?: string;
      profissionalCbo?: string;
      unidadeNome?: string;
    };
    onConfirm: () => void;
  }>({ open: false, pacienteId: "", modo: "agendamento", onConfirm: () => {} });

  const [pacientesConferidos, setPacientesConferidos] = useState<Set<string>>(new Set());
  const [profPopoverOpen, setProfPopoverOpen] = useState(false);

  const handlePacienteSelecionadoNovoAg = (pacienteId: string) => {
    if (!pacienteId) {
      setNewAg((p) => ({ ...p, pacienteId: "" }));
      return;
    }
    setNewAg((p) => ({ ...p, pacienteId }));
    if (pacientesConferidos.has(pacienteId)) return;
    setConferenciaModal({
      open: true,
      pacienteId,
      modo: "agendamento",
      onConfirm: () => {
        setPacientesConferidos((prev) => {
          const next = new Set(prev);
          next.add(pacienteId);
          return next;
        });
      },
    });
  };

  const { isMaster, unidadesVisiveis, profissionaisVisiveis, showUnitSelector } = useUnidadeFilter();
  const isProfissional = user?.role === "profissional";
  const canRetorno = isProfissional && user?.podeAgendarRetorno === true;
  const canAprovar = can('agenda', 'can_execute');
  const canCreate = can('agenda', 'can_create');
  const profissionais = profissionaisVisiveis;

  const agendamentosPendentesOnline = React.useMemo(() => {
    return agendamentos
      .filter((a) => {
        if (a.origem !== "online" || a.status !== "pendente") return false;
        if (user?.unidadeId && user?.usuario !== 'admin.sms' && a.unidadeId !== user.unidadeId) return false;
        return true;
      })
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }, [agendamentos, user]);

  const agendamentosPendentesRevisao = React.useMemo(() => {
    const today = todayLocalStr();
    const nowTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    // Status que geram pendência (conforme regra solicitada)
    const PENDENTE_STATUSES = new Set([
      "confirmado",
      "confirmada",
      "agendado",
      "confirmado_chegada",
      "chegada_confirmada",
      "aguardando_triagem",
      "triagem_concluida",
      "apto_atendimento",
      "apto",
      "apto_para_atendimento",
      "em_atendimento",
      "pendente",
      "aguardando_profissional",
      "aguardando_atendimento",
      "aguardando_enfermagem"
    ]);

    return agendamentos.filter((a) => {
      // 1. Data atual ou passada
      if (a.data > today) return false;
      
      // 2. Se for hoje, o horário já deve ter passado
      if (a.data === today && a.hora >= nowTime) return false;
      
      // 3. Respeitar permissões de perfil
      const isMasterGlobal = user?.role === "master" && user?.usuario === 'admin.sms';
      const isMasterUnidade = user?.role === "master" && !isMasterGlobal;
      
      // Profissional vê apenas os seus vinculados
      if (isProfissional && user?.id && a.profissionalId !== user.id) return false;
      
      // Recepção vê apenas da sua unidade
      if (user?.role === "recepcao" && user?.unidadeId && a.unidadeId !== user.unidadeId) return false;
      
      // Master de unidade vê apenas da sua unidade
      if (isMasterUnidade && user?.unidadeId && a.unidadeId !== user.unidadeId) return false;

      // 4. Deve estar em um status de pendência
      return PENDENTE_STATUSES.has(a.status);
    });
  }, [agendamentos, user, isProfissional, nowTick]);

  const [revisaoDialogOpen, setRevisaoDialogOpen] = useState(false);
  const blockedForDate = React.useMemo(() => {
    return bloqueios.filter((b) => selectedDate >= b.dataInicio && selectedDate <= b.dataFim && b.diaInteiro);
  }, [selectedDate, bloqueios]);

  const weekendInfo = React.useMemo(() => {
    const dayOfWeek = isoDayOfWeek(selectedDate);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (!isWeekend) return { isWeekend: false, hasAvailability: true };
    const hasAvailability = disponibilidades.some(
      (d) => d.diasSemana.includes(dayOfWeek) && selectedDate >= d.dataInicio && selectedDate <= d.dataFim,
    );
    return { isWeekend, hasAvailability };
  }, [selectedDate, disponibilidades]);

  const selectedProfUnit = profissionais.find((p) => p.id === newAg.profissionalId)?.unidadeId || "";

  const newAgTurnoInfo = React.useMemo(() => {
    if (!newAg.profissionalId || !selectedProfUnit) return [];
    return getTurnoInfo(newAg.profissionalId, selectedProfUnit, selectedDate);
  }, [newAg.profissionalId, selectedProfUnit, selectedDate, getTurnoInfo]);

  const isTurnoMode = newAgTurnoInfo.length > 0;

  const quotaAlert = useMemo(() => {
    if (!newAg.profissionalId || !newAg.hora || newAgTurnoInfo.length === 0) return null;
    const t = newAgTurnoInfo.find(ti => newAg.hora >= ti.horaInicio && newAg.hora < ti.horaFim);
    if (!t || t.vagasExternasReservadas === 0) return null;
    return (
      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs mt-2 animate-in fade-in slide-in-from-top-1">
        <p className="font-semibold text-primary mb-1 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" /> Controle de Cotas Ativo
        </p>
        <p className="text-muted-foreground leading-relaxed">
          {t.nome}: <strong>{t.vagasTotal} vagas totais</strong>. 
          Destas, {t.vagasExternasReservadas} estão reservadas para externos e <strong>{t.vagasInternas}</strong> para recepção.
        </p>
        <p className="mt-1 font-medium text-foreground">
          Uso Recepção: {t.vagasInternasOcupadas} de {t.vagasInternas} ({t.vagasInternasLivres} livres)
        </p>
      </div>
    );
  }, [newAg.profissionalId, newAg.hora, newAgTurnoInfo]);

  const newAgSlots = React.useMemo(() => {
    if (!newAg.profissionalId) return [];
    if (!selectedProfUnit) return [];
    return getAvailableSlots(newAg.profissionalId, selectedProfUnit, selectedDate);
  }, [newAg.profissionalId, selectedProfUnit, selectedDate, getAvailableSlots]);

  React.useEffect(() => {
    if (isMaster) return;
    if (newAg.hora && newAgSlots.length > 0 && !newAgSlots.includes(newAg.hora)) {
      setNewAg((p) => ({ ...p, hora: "" }));
    }
    if (newAgSlots.length === 0 && newAg.hora) {
      setNewAg((p) => ({ ...p, hora: "" }));
    }
  }, [newAgSlots, newAg.hora, isMaster]);

  const retornoAvailableDates = React.useMemo(() => {
    if (!user || !retornoDialogOpen) return [];
    return getAvailableDates(user.id, user.unidadeId);
  }, [user, retornoDialogOpen, getAvailableDates]);

  const retornoAvailableSlots = React.useMemo(() => {
    if (!user || !retornoForm.data) return [];
    return getAvailableSlots(user.id, user.unidadeId, retornoForm.data);
  }, [user, retornoForm.data, getAvailableSlots]);

  const filteredProfissionais = React.useMemo(() => {
    let list = filterUnit === "all" ? profissionais : profissionais.filter((p) => p.unidadeId === filterUnit || !p.unidadeId);
    return [...list].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [profissionais, filterUnit]);

  const groupedProfissionais = React.useMemo(() => {
    const groups: Record<string, typeof filteredProfissionais> = {};
    filteredProfissionais.forEach((p) => {
      const spec = p.profissao || "Outros";
      if (!groups[spec]) groups[spec] = [];
      groups[spec].push(p);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredProfissionais]);

  const baseAgendamentos = useMemo(() => {
    return agendamentos.filter((a) => {
      if (a.data !== selectedDate) return false;
      if (filterUnit !== "all" && a.unidadeId !== filterUnit) return false;
      if (filterProf !== "all" && a.profissionalId !== filterProf) return false;
      if (filterTipo !== "Todos" && a.tipo !== filterTipo) return false;
      if (isProfissional && user) {
        if (a.profissionalId !== user.id) return false;
      }
      if (user?.unidadeId && user?.usuario !== 'admin.sms' && a.unidadeId !== user.unidadeId) return false;
      if (debouncedSearch) {
        const pac = pacientes.find((p) => p.id === a.pacienteId);
        const nome = resolvePaciente(a.pacienteId, a.pacienteNome).toLowerCase();
        const cpf = pac?.cpf?.toLowerCase() || "";
        const cns = pac?.cns?.toLowerCase() || "";
        const tfd = pac?.is_tfd ? "tfd" : "";
        const judicial = pac?.possui_ordem_judicial ? "judicial" : "";
        if (!nome.includes(debouncedSearch) && !cpf.includes(debouncedSearch) && !cns.includes(debouncedSearch) && !tfd.includes(debouncedSearch) && !judicial.includes(debouncedSearch)) {
          return false;
        }
      }
      return true;
    });
  }, [agendamentos, selectedDate, filterUnit, filterProf, isProfissional, user, debouncedSearch, pacientes, resolvePaciente]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: baseAgendamentos.length };
    Object.keys(STATUS_GROUPS).forEach(key => {
      const group = STATUS_GROUPS[key];
      counts[key] = baseAgendamentos.filter(a => group.includes(a.status)).length;
    });
    return counts;
  }, [baseAgendamentos]);

  const [triageMap, setTriageMap] = useState<Record<string, { risco: string }>>({});
  const [arrivalMap, setArrivalMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const dayAgIds = agendamentos.filter((a) => a.data === selectedDate).map((a) => a.id);
    if (dayAgIds.length === 0) { setTriageMap({}); setArrivalMap({}); return; }
    const loadTriageAndArrival = async () => {
      const [triageRes, filaRes] = await Promise.all([
        supabase
          .from("triage_records")
          .select("agendamento_id, classificacao_risco")
          .in("agendamento_id", dayAgIds),
        supabase
          .from("fila_espera" as any)
          .select("id, hora_chegada")
          .in("id", dayAgIds),
      ]);
      if (cancelled) return;
      if (triageRes.data) {
        const m: Record<string, { risco: string }> = {};
        for (const r of triageRes.data) {
          m[r.agendamento_id] = { risco: (r.classificacao_risco || "").toLowerCase() };
        }
        setTriageMap(m);
      }
      if (filaRes.data) {
        const a: Record<string, string> = {};
        for (const f of filaRes.data as any[]) {
          if (f.hora_chegada) a[f.id] = f.hora_chegada;
        }
        setArrivalMap(a);
      }
    };
    loadTriageAndArrival();
    const channel = supabase
      .channel(`agenda-triage-${selectedDate}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'triage_records' }, (payload: any) => {
        const agId = payload?.new?.agendamento_id || payload?.old?.agendamento_id;
        if (agId && dayAgIds.includes(agId)) loadTriageAndArrival();
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [agendamentos, selectedDate]);

  const filtered = useMemo(() => {
    const CHECKED_IN_STATUSES = new Set([
      "confirmado_chegada", "aguardando_triagem", "aguardando_atendimento",
      "em_atendimento", "aguardando_enfermagem", "apto_atendimento",
    ]);
    const RISCO_PRIO: Record<string, number> = { vermelho: 1, laranja: 2, amarelo: 3, verde: 4, azul: 6 };
    const calcAge = (dob: string): number => {
      if (!dob) return 0;
      const parts = dob.includes("/") ? dob.split("/").reverse().join("-") : dob;
      const birth = new Date(parts + "T12:00:00");
      if (isNaN(birth.getTime())) return 0;
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      return age;
    };
    const getShift = (hora: string): number => hora < "12:00" ? 0 : 1;
    const getFixedPrio = (pac: (typeof pacientes)[0] | undefined, age: number): number => {
      if (!pac) return 8;
      if ((pac as any).isGestante || (pac as any).isPne || (pac as any).isAutista) return 5;
      if (age >= 60) return 6;
      if (age > 0 && age <= 12) return 7;
      return 8;
    };
    const getPrioLevel = (ag: (typeof agendamentos)[0]): number => {
      const st = ag.status as string;
      if (st === "concluido") return 99;
      const pac = pacientes.find((p) => p.id === ag.pacienteId);
      const age = pac ? calcAge(pac.dataNascimento) : 0;
      const fixedPrio = getFixedPrio(pac, age);
      if (!CHECKED_IN_STATUSES.has(st)) return 50 + Math.min(fixedPrio, 8);
      const triage = triageMap[ag.id];
      const risco = triage?.risco || "";
      if (risco && RISCO_PRIO[risco] !== undefined) return Math.min(RISCO_PRIO[risco], fixedPrio);
      return fixedPrio;
    };
    const visiveis = baseAgendamentos.filter((a) => {
      if (filterStatus !== "all") {
        const group = STATUS_GROUPS[filterStatus];
        if (group) { if (!group.includes(a.status)) return false; }
        else if (a.status !== filterStatus) return false;
      }
      return true;
    });
    const tardeStartMin: number | null = (() => {
      let min: number | null = null;
      for (const a of visiveis) {
        if (a.hora >= "12:00") {
          const [hh, mm] = a.hora.split(":").map(Number);
          const m = (hh || 0) * 60 + (mm || 0);
          if (min === null || m < min) min = m;
        }
      }
      return min;
    })();
    const isToday = selectedDate === todayLocalStr();
    const nowMin = nowMinutesInBrazil();
    const afternoonOnTop = isToday && tardeStartMin !== null && nowMin >= tardeStartMin;
    return [...visiveis].sort((a, b) => {
      const shiftA = getShift(a.hora);
      const shiftB = getShift(b.hora);
      const prioA = getPrioLevel(a);
      const prioB = getPrioLevel(b);
      const isConcA = prioA === 99;
      const isConcB = prioB === 99;
      const isAptoA = (a.status as string) === "apto_atendimento";
      const isAptoB = (b.status as string) === "apto_atendimento";
      if (shiftA !== shiftB) return afternoonOnTop ? shiftB - shiftA : shiftA - shiftB;
      if (isAptoA !== isAptoB) return isAptoA ? -1 : 1;
      if (isConcA !== isConcB) return isConcA ? 1 : -1;
      if (prioA !== prioB) return prioA - prioB;
      const isCheckedA = prioA < 50;
      const isCheckedB = prioB < 50;
      const ha = isCheckedA ? (arrivalMap[a.id] || a.horaChegada || a.hora) : a.hora;
      const hb = isCheckedB ? (arrivalMap[b.id] || b.horaChegada || b.hora) : b.hora;
      return ha.localeCompare(hb);
    });
  }, [baseAgendamentos, filterStatus, selectedDate, triageMap, arrivalMap, nowTick, pacientes]);

  const filteredPacienteKey = React.useMemo(() => [...new Set(filtered.map((f) => f.pacienteId))].sort().join(","), [filtered]);

  React.useEffect(() => {
    const pacienteIds = filteredPacienteKey.split(",").filter(Boolean);
    if (pacienteIds.length === 0) { setLastProntuarios({}); return; }
    let cancelled = false;
    const loadLast = async () => {
      const results: typeof lastProntuarios = {};
      let query = (supabase as any).from("prontuarios").select("paciente_id,data_atendimento,profissional_id,profissional_nome,procedimentos_texto,queixa_principal").in("paciente_id", pacienteIds).order("data_atendimento", { ascending: false });
      if (isProfissional && user?.id) query = query.eq("profissional_id", user.id);
      query = query.limit(pacienteIds.length * 2);
      const { data } = await query;
      if (!cancelled && data) {
        for (const row of data) {
          if (!results[row.paciente_id]) {
            results[row.paciente_id] = { data: row.data_atendimento, profissional: row.profissional_nome, procedimentos: row.procedimentos_texto || "", queixa: row.queixa_principal || "", tipo: "" };
          }
        }
        setLastProntuarios(results);
      }
    };
    loadLast();
    return () => { cancelled = true; };
  }, [filteredPacienteKey, isProfissional, user?.id]);

  const changeDate = (days: number) => setSelectedDate((prev) => addDaysToDateStr(prev, days));

  const syncToGoogleCalendar = async (ag: { pacienteNome: string; profissionalNome: string; data: string; hora: string; tipo: string; unidadeId: string; pacienteId?: string; }) => {
    if (!configuracoes.googleCalendar.conectado || !configuracoes.googleCalendar.criarEvento) return null;
    try {
      const unidade = unidades.find((u) => u.id === ag.unidadeId);
      const paciente = pacientes.find((p) => p.nome === ag.pacienteNome || p.id === ag.pacienteId);
      const startDateTime = `${ag.data}T${ag.hora}:00`;
      const [h, m] = ag.hora.split(":").map(Number);
      const endH = m + 30 >= 60 ? h + 1 : h;
      const endM = (m + 30) % 60;
      const endDateTime = `${ag.data}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;
      const description = [`Paciente: ${ag.pacienteNome}`, paciente?.telefone ? `Telefone: ${paciente.telefone}` : "", paciente?.email ? `E-mail: ${paciente.email}` : "", `Profissional: ${ag.profissionalNome}`, `Tipo: ${ag.tipo}`, unidade ? `Unidade: ${unidade.nome}` : ""].filter(Boolean).join("\n");
      const attendees = paciente?.email ? [{ email: paciente.email }] : undefined;
      const result = await gcal.createEvent({ summary: `${ag.tipo} - ${ag.pacienteNome}`, description, start: { dateTime: startDateTime, timeZone: "America/Belem" }, end: { dateTime: endDateTime, timeZone: "America/Belem" }, attendees });
      return result?.eventId || null;
    } catch (err) { console.error("Google Calendar sync failed:", err); return null; }
  };

  const handleCreate = async () => {
    if (!newAg.pacienteId || !newAg.profissionalId || !newAg.hora) { toast.error("Preencha paciente, profissional e horário."); return; }
    if (!pacientesConferidos.has(newAg.pacienteId)) {
      toast.error("Confira os dados do paciente antes de agendar.");
      const profSel = profissionais.find((p) => p.id === newAg.profissionalId);
      const unidSel = unidades.find((u) => u.id === profSel?.unidadeId);
      setConferenciaModal({
        open: true,
        pacienteId: newAg.pacienteId,
        modo: "agendamento",
        agendamentoInfo: {
          data: selectedDate,
          hora: newAg.hora,
          tipo: newAg.tipo,
          profissionalNome: profSel?.nome || "",
          profissionalEspecialidade: (profSel as any)?.especialidade || (profSel as any)?.profissao || "",
          profissionalCbo: (profSel as any)?.custom_data?.cbo || "",
          unidadeNome: unidSel?.nomeExibicao || unidSel?.nome || "",
        },
        onConfirm: () => {
          setPacientesConferidos((prev) => { const next = new Set(prev); next.add(newAg.pacienteId); return next; });
          void executarCreate();
        },
      });
      return;
    }
    void executarCreate();
  };

  const executarCreate = async () => {
    let pac = pacientes.find((p) => p.id === newAg.pacienteId);
    const prof = profissionais.find((p) => p.id === newAg.profissionalId);
    if (!pac && newAg.pacienteId) {
      const { data, error } = await (supabase as any).from("pacientes").select("id, nome, telefone, email").eq("id", newAg.pacienteId).maybeSingle();
      if (error || !data) { toast.error("Paciente selecionado não foi encontrado no banco."); return; }
      pac = { id: data.id, nome: data.nome, telefone: data.telefone || "", email: data.email || "" } as typeof pac;
    }
    if (!pac || !prof || !newAg.hora) return;
    // Bloqueio por excesso de faltas
    try {
      const { data: pacStatus } = await (supabase as any).from("pacientes").select("status_falta, total_faltas, faltas_consecutivas").eq("id", pac.id).maybeSingle();
      if (pacStatus?.status_falta === "BLOQUEADO") {
        toast.error(
          `🚫 ${pac.nome} está BLOQUEADO por excesso de faltas (${pacStatus.total_faltas} faltas totais, ${pacStatus.faltas_consecutivas} consecutivas). ` +
          `Apenas Master ou Gestor podem remover o bloqueio em Pacientes Faltosos (/painel/faltosos).`,
          { duration: 8000 }
        );
        return;
      }
      if (pacStatus?.status_falta === "FALTOSO") {
        toast.warning(
          `⚠️ ${pac.nome} está marcado como FALTOSO (${pacStatus.total_faltas} faltas). Confirme a presença e oriente sobre a política de faltas.`,
          { duration: 6000 }
        );
      }
    } catch {}
    if (selectedDate < todayLocalStr()) {
      if (!isMaster) { toast.error("Não é possível agendar em data passada."); return; }
      const confirmouPassado = window.confirm("⚠️ Atenção: Você está agendando em DATA PASSADA como MASTER. Deseja continuar com o registro retroativo?");
      if (!confirmouPassado) return;
    }
    if (weekendInfo.isWeekend && !weekendInfo.hasAvailability) {
      if (user?.role === "recepcao") { toast.error("Não é possível agendar em fim de semana sem disponibilidade cadastrada."); return; }
      if (user && ["master", "coordenador"].includes(user.role)) {
        const confirmou = window.confirm("Este dia é fim de semana sem disponibilidade cadastrada. Deseja criar um encaixe mesmo assim?");
        if (!confirmou) return;
      }
    }
    const canOverride = user && ["master", "coordenador"].includes(user.role);
    
    // Validar Cotas Externas vs Internas
    const turnoAlvo = newAgTurnoInfo.find(t => newAg.hora >= t.horaInicio && newAg.hora < t.horaFim);
    if (turnoAlvo && turnoAlvo.vagasExternasReservadas > 0 && turnoAlvo.lotadoInterno) {
      const msg = `As vagas internas deste profissional para o turno ${turnoAlvo.nome} estão esgotadas (${turnoAlvo.vagasInternas} vagas). Existem vagas reservadas para agendamento externo.`;
      if (!canOverride) {
        toast.error(msg);
        return;
      }
      const confirmou = window.confirm(`${msg}\n\nDeseja realizar um override Master e usar uma das vagas reservadas?`);
      if (!confirmou) return;
      
      // Registrar override na auditoria
      logAction({
        acao: "override_cota_externa",
        entidade: "agendamento",
        modulo: "agenda",
        user,
        detalhes: {
          profissional_id: newAg.profissionalId,
          data: selectedDate,
          hora: newAg.hora,
          turno: turnoAlvo.nome,
          motivo: "Vagas internas esgotadas, utilizando reserva externa",
        }
      });
    }

    try {
      const { data: slotCheck } = await supabase.rpc("check_slot_availability", { p_profissional_id: newAg.profissionalId, p_unidade_id: prof.unidadeId, p_data: selectedDate, p_hora: newAg.hora });
      if (slotCheck && typeof slotCheck === "object" && "available" in slotCheck && !slotCheck.available) {
        const reason = (slotCheck as any).reason;
        const reasonMsg = reason === "date_blocked" ? "Data bloqueada." : reason === "day_full" ? "Vagas do dia esgotadas." : reason === "hour_full" ? "Vagas deste horário esgotadas." : reason === "no_availability" ? "Sem disponibilidade cadastrada." : "Sem disponibilidade.";
        if (!canOverride) { toast.error(`Não é possível agendar: ${reasonMsg}`); return; }
        const confirmou = window.confirm(`${reasonMsg} Deseja forçar um encaixe como ${user?.role}?`);
        if (!confirmou) return;
      }
    } catch {}

    // Regra de bloqueio por profissional
    try {
      const { data: absenceInfo } = await supabase
        .from('paciente_faltas_profissional')
        .select('status_falta')
        .eq('paciente_id', pac.id)
        .eq('profissional_id', prof.id)
        .maybeSingle();

      const isExempt = pac.is_tfd || pac.possui_ordem_judicial;

      if (absenceInfo?.status_falta === 'BLOQUEADO' && !isExempt) {
        toast.error("Paciente bloqueado por faltas injustificadas para este profissional.");
        return;
      }
    } catch (err) {
      console.error("Erro ao verificar bloqueio por profissional:", err);
    }
    const unidade = unidades.find((u) => u.id === prof.unidadeId);
    const agId = `ag${Date.now()}`;
    const agData = { id: agId, pacienteId: pac.id, pacienteNome: pac.nome, unidadeId: prof.unidadeId, salaId: newAg.salaId, setorId: "", profissionalId: prof.id, profissionalNome: prof.nome, data: selectedDate, hora: newAg.hora, status: "confirmado" as const, tipo: newAg.tipo, observacoes: newAg.obs, origem: "recepcao" as const, criadoEm: new Date().toISOString(), criadoPor: "current" };
    addAgendamento(agData);
    setDialogOpen(false);
    setNewAg({ pacienteId: "", profissionalId: filterProf !== "all" ? filterProf : "", salaId: "", hora: "", tipo: "Consulta", obs: "" });
    toast.success("Agendamento criado!");
    ensurePortalAccess({ pacienteId: pac.id, contexto: "agendamento", data: selectedDate, hora: newAg.hora, unidade: unidade?.nome || "", profissional: prof.nome, tipo: newAg.tipo }).then((result) => { if (result.created) toast.info(`Acesso ao portal criado para ${pac.nome}. ${result.emailSent ? "E-mail enviado." : ""}`); }).catch(() => {});
    syncToGoogleCalendar({ ...agData, pacienteId: pac.id }).then((googleEventId) => { if (googleEventId) updateAgendamento(agId, { googleEventId, syncStatus: "ok" }); });
    notify({ evento: "novo_agendamento", paciente_nome: pac.nome, telefone: pac.telefone, email: pac.email, data_consulta: selectedDate, hora_consulta: newAg.hora, unidade: unidade?.nome || "", profissional: prof.nome, tipo_atendimento: newAg.tipo, status_agendamento: "confirmado", id_agendamento: agId, observacoes: newAg.obs });
    whatsappService.sendByAgendamento(agId, "confirmacao").catch(() => {});
  };

  const handleAprovar = async (ag: (typeof agendamentos)[0]) => {
    // Verificar bloqueio antes de aprovar
    const { data: pData } = await supabase
      .from("pacientes")
      .select("status_falta, is_tfd, possui_ordem_judicial, nome")
      .eq("id", ag.pacienteId)
      .single();

    // Verificar bloqueio específico por profissional antes de aprovar
    const { data: absenceInfo } = await supabase
      .from('paciente_faltas_profissional')
      .select('status_falta')
      .eq('paciente_id', ag.pacienteId)
      .eq('profissional_id', ag.profissionalId)
      .maybeSingle();

    const isExempt = !!(pData?.is_tfd || pData?.possui_ordem_judicial);

    if (absenceInfo?.status_falta === "BLOQUEADO" && !isExempt) {
      toast.error(`Paciente ${pData?.nome} está BLOQUEADO por faltas injustificadas para este profissional.`);
      return;
    }

    try {
      await updateAgendamento(ag.id, { status: "confirmado" } as any);
      await (supabase as any).from("agendamentos").update({ aprovado_por: user?.id || "", aprovado_em: new Date().toISOString() }).eq("id", ag.id);
      const paciente = pacientes.find((p) => p.id === ag.pacienteId);
      const unidade = unidades.find((u) => u.id === ag.unidadeId);
      await notify({ evento: "confirmacao", paciente_nome: ag.pacienteNome, telefone: paciente?.telefone || "", email: paciente?.email || "", data_consulta: ag.data, hora_consulta: ag.hora, unidade: unidade?.nome || "", profissional: ag.profissionalNome, tipo_atendimento: ag.tipo, status_agendamento: "confirmado", id_agendamento: ag.id, observacoes: "Agendamento aprovado pela recepção." });
      await logAction({ acao: "aprovar_agendamento_online", entidade: "agendamento", entidadeId: ag.id, modulo: "agenda", user, detalhes: { paciente: ag.pacienteNome, data: ag.data, hora: ag.hora } });
      toast.success(`Agendamento de ${ag.pacienteNome} aprovado! E-mail de confirmação enviado.`);
    } catch (err) { console.error(err); toast.error("Erro ao aprovar agendamento."); }
  };

  const handleRejeitar = async () => {
    if (!rejeicaoTarget || !rejeicaoMotivo.trim()) { toast.error("Informe o motivo da rejeição."); return; }
    try {
      await updateAgendamento(rejeicaoTarget.id, { status: "cancelado" } as any);
      await (supabase as any).from("agendamentos").update({ rejeitado_motivo: rejeicaoMotivo }).eq("id", rejeicaoTarget.id);
      const paciente = pacientes.find((p) => p.id === rejeicaoTarget.pacienteId);
      const unidade = unidades.find((u) => u.id === rejeicaoTarget.unidadeId);
      await notify({ evento: "cancelamento", paciente_nome: rejeicaoTarget.pacienteNome, telefone: paciente?.telefone || "", email: paciente?.email || "", data_consulta: rejeicaoTarget.data, hora_consulta: rejeicaoTarget.hora, unidade: unidade?.nome || "", profissional: rejeicaoTarget.profissionalNome, tipo_atendimento: rejeicaoTarget.tipo, status_agendamento: "cancelado", id_agendamento: rejeicaoTarget.id, observacoes: `Motivo da rejeição: ${rejeicaoMotivo}` });
      await logAction({ acao: "rejeitar_agendamento_online", entidade: "agendamento", entidadeId: rejeicaoTarget.id, modulo: "agenda", user, detalhes: { paciente: rejeicaoTarget.pacienteNome, motivo: rejeicaoMotivo } });
      toast.success("Agendamento rejeitado. Paciente notificado por e-mail.");
      setRejeicaoTarget(null);
      setRejeicaoMotivo("");
    } catch (err) { console.error(err); toast.error("Erro ao rejeitar agendamento."); }
  };

  const handleStatusChange = async (agId: string, newStatus: string) => {
    const ag = agendamentos.find((a) => a.id === agId);
    if (!ag) return;
    if (isProfissional && !isMaster && ag.profissionalId !== user?.id) { toast.error("Você só pode registrar falta em pacientes vinculados à sua agenda."); return; }
    if (newStatus === "falta") { setFaltaTarget(ag); return; }
    if (newStatus === "confirmado_chegada") {
      const profSel = profissionais.find((p) => p.id === ag.profissionalId);
      const unidSel = unidades.find((u) => u.id === ag.unidadeId);
      setConferenciaModal({ open: true, pacienteId: ag.pacienteId, modo: "chegada", agendamentoInfo: { data: ag.data, hora: ag.hora, tipo: ag.tipo, profissionalNome: ag.profissionalNome || profSel?.nome || "", profissionalEspecialidade: (profSel as any)?.especialidade || (profSel as any)?.profissao || "", profissionalCbo: (profSel as any)?.custom_data?.cbo || "", unidadeNome: unidSel?.nomeExibicao || unidSel?.nome || "" }, onConfirm: () => { void executarStatusChange(agId, newStatus); } });
      return;
    }
    return executarStatusChange(agId, newStatus);
  };

  const executarStatusChange = async (agId: string, newStatus: string) => {
    if (statusUpdating) return;
    const ag = agendamentos.find((a) => a.id === agId);
    if (!ag) return;
    setStatusUpdating(true);
    const toastId = toast.loading("Atualizando status...");
    try {
      if (newStatus === "concluido") {
        const today = todayLocalStr();
        if (ag.data > today) { toast.error("⚠️ Não é possível concluir um agendamento antes da data marcada.", { id: toastId }); setStatusUpdating(false); return; }
        const { count } = await supabase.from("prontuarios").select("*", { count: "exact", head: true }).eq("agendamento_id", agId).not("tipo_registro", "in", '("triagem","avaliacao_enfermagem","avaliacao_multiprofissional")');
        if (!count || count === 0) { toast.error("⚠️ Não é possível concluir sem registro no prontuário. Preencha o prontuário primeiro.", { id: toastId }); setStatusUpdating(false); return; }
      }
      if (newStatus === "confirmado_chegada") {
        const horaChegada = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        setArrivalMap((prev) => ({ ...prev, [agId]: horaChegada }));
        let triagemHabilitada = false;
        const { data: profSetting } = await supabase.from('triage_settings').select('enabled').eq('profissional_id', ag.profissionalId).maybeSingle();
        if (profSetting) triagemHabilitada = !!profSetting.enabled;
        else { 
          const { data: globalSetting } = await supabase.from('triage_settings').select('enabled').is('profissional_id', null).maybeSingle(); 
          if (globalSetting) triagemHabilitada = !!globalSetting.enabled; 
        }

        // Regra Especial: Profissional ou Master com permissão "confirmar_chegada" pode pular a triagem (fluxo excepcional)
        const podePularTriagem = (isProfissional || isMaster) && can('agenda', 'confirmar_chegada');

        if (triagemHabilitada && !podePularTriagem) {
          await updateAgendamento(agId, { status: "confirmado_chegada" as any });
          const filaExistente = fila.find((item) => item.id === agId);
          if (filaExistente) await updateFila(filaExistente.id, { status: "chegada_confirmada" as any, pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome, unidadeId: ag.unidadeId, profissionalId: ag.profissionalId, horaChegada, observacoes: ag.observacoes || "" } as any);
          else await addToFila({ id: agId, pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome, unidadeId: ag.unidadeId, profissionalId: ag.profissionalId, setor: "", prioridade: "normal", status: "chegada_confirmada" as any, posicao: fila.length + 1, horaChegada, observacoes: ag.observacoes || "", criadoPor: user?.nome || "recepcao" } as any);
          await Promise.all([refreshAgendamentos(), refreshFila()]);
          toast.success(`Chegada de ${ag.pacienteNome} confirmada! Encaminhado para triagem.`, { id: toastId });
        } else {
          await updateAgendamento(agId, { status: "apto_atendimento" as any });
          const filaExistente = fila.find((item) => item.id === agId);
          if (filaExistente) await updateFila(filaExistente.id, { status: "apto_atendimento" as any, pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome, unidadeId: ag.unidadeId, profissionalId: ag.profissionalId, horaChegada, observacoes: ag.observacoes || "" } as any);
          else await addToFila({ id: agId, pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome, unidadeId: ag.unidadeId, profissionalId: ag.profissionalId, setor: "", prioridade: "normal", status: "apto_atendimento" as any, posicao: fila.length + 1, horaChegada, observacoes: ag.observacoes || "", criadoPor: user?.nome || "recepcao" } as any);
          await Promise.all([refreshAgendamentos(), refreshFila()]);
          toast.success(podePularTriagem ? `Chegada confirmada. ${ag.pacienteNome} liberado diretamente para atendimento.` : `Triagem desabilitada. ${ag.pacienteNome} liberado para atendimento direto.`, { id: toastId });
        }
      } else {
        await updateAgendamento(agId, { status: newStatus as any });
        await Promise.all([refreshAgendamentos(), refreshFila()]);
        toast.success(`Status atualizado para: ${statusLabels[newStatus] || newStatus}`, { id: toastId });
      }
      const paciente = pacientes.find((p) => p.id === ag.pacienteId || p.nome === ag.pacienteNome);
      const unidade = unidades.find((u) => u.id === ag.unidadeId);
      const statusToEvento: Record<string, string> = { cancelado: "cancelamento", remarcado: "reagendamento", falta: "nao_compareceu", confirmado: "confirmacao", confirmado_chegada: "confirmacao", concluido: "atendimento_finalizado" };
      const evento = statusToEvento[newStatus];
      if (evento) await notify({ evento: evento as any, paciente_nome: ag.pacienteNome, telefone: paciente?.telefone || "", email: paciente?.email || "", data_consulta: ag.data, hora_consulta: ag.hora, unidade: unidade?.nome || "", profissional: ag.profissionalNome, tipo_atendimento: ag.tipo, status_agendamento: newStatus, id_agendamento: agId });
      const statusToWhatsapp: Record<string, string> = { cancelado: "cancelamento", remarcado: "remarcacao", falta: "falta" };
      const whatsappTipo = statusToWhatsapp[newStatus];
      if (whatsappTipo) whatsappService.sendByAgendamento(agId, whatsappTipo).catch(() => {});
      if (newStatus === "cancelado" || newStatus === "falta") await handleVagaLiberada({ id: agId, data: ag.data, hora: ag.hora, profissionalId: ag.profissionalId, profissionalNome: ag.profissionalNome, unidadeId: ag.unidadeId, salaId: ag.salaId, tipo: ag.tipo }, newStatus === "cancelado" ? "cancelamento" : "falta", user);
      if (newStatus === "concluido" || newStatus === "confirmado_chegada" || newStatus === "apto_atendimento") {
        try { await (supabase as any).rpc("resetar_faltas_paciente", { p_paciente_id: ag.pacienteId }); } catch (e) { console.warn("resetar_faltas_paciente:", e); }
      }
      if (ag.googleEventId && newStatus === "cancelado" && configuracoes.googleCalendar.removerCancelar) { try { await gcal.deleteEvent(ag.googleEventId); await updateAgendamento(agId, { syncStatus: "ok" }); await refreshAgendamentos(); } catch {} }
    } catch (err) { console.error("Error updating status:", err); toast.error("Erro ao atualizar status.", { id: toastId }); } finally { setStatusUpdating(false); }
  };

  const handleCancelarAgendamento = async () => {
    if (!cancelTarget || !cancelMotivo) return;
    setCancelLoading(true);
    try {
      const ag = cancelTarget;
      const paciente = pacientes.find(p => p.id === ag.pacienteId || p.nome === ag.pacienteNome);
      const now = new Date();
      const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { count: cancelCount } = await supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('paciente_id', ag.pacienteId).eq('status', 'cancelado').gte('atualizado_em', `${mesAtual}-01T00:00:00`).lt('atualizado_em', `${mesAtual === `${now.getFullYear()}-12` ? `${now.getFullYear() + 1}-01` : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}`}-01T00:00:00`);
      if ((cancelCount || 0) >= cancelConfig.limite_cancelamentos_mes) toast.error(`Limite de ${cancelConfig.limite_cancelamentos_mes} cancelamentos/mês atingido para este paciente. Paciente ficará bloqueado por ${cancelConfig.dias_bloqueio_apos_limite} dias.`);
      const obsAnterior = ag.observacoes || '';
      const novaObs = `${obsAnterior}\n[CANCELAMENTO] Motivo: ${cancelMotivo} | Por: ${user?.nome || 'Sistema'} | Em: ${new Date().toLocaleString('pt-BR')}`.trim();
      await updateAgendamento(ag.id, { status: 'cancelado' as any });
      await (supabase as any).from('agendamentos').update({ observacoes: novaObs }).eq('id', ag.id);
      await logAction({ acao: 'cancelar', entidade: 'agendamento', entidadeId: ag.id, modulo: 'agenda', user, detalhes: { paciente: ag.pacienteNome, motivo: cancelMotivo } });
      if (cancelConfig.notificar_profissional) {
        const unidade = unidades.find(u => u.id === ag.unidadeId);
        await notify({ evento: 'cancelamento' as any, paciente_nome: ag.pacienteNome, telefone: paciente?.telefone || '', email: paciente?.email || '', data_consulta: ag.data, hora_consulta: ag.hora, unidade: unidade?.nome || '', profissional: ag.profissionalNome, tipo_atendimento: ag.tipo, status_agendamento: 'cancelado', id_agendamento: ag.id, observacoes: `Motivo: ${cancelMotivo}` });
      }
      whatsappService.sendByAgendamento(ag.id, "cancelamento").catch(() => {});
      if (cancelConfig.liberar_vaga_automaticamente) await handleVagaLiberada({ id: ag.id, data: ag.data, hora: ag.hora, profissionalId: ag.profissionalId, profissionalNome: ag.profissionalNome, unidadeId: ag.unidadeId, salaId: ag.salaId, tipo: ag.tipo }, 'cancelamento', user);
      if (ag.googleEventId && configuracoes.googleCalendar.removerCancelar) { try { await gcal.deleteEvent(ag.googleEventId); await updateAgendamento(ag.id, { syncStatus: 'ok' }); } catch {} }
      await Promise.all([refreshAgendamentos(), refreshFila()]);
      toast.success('Agendamento cancelado com sucesso.');
      setCancelTarget(null);
      setCancelMotivo('');
    } catch (err: any) { console.error(err); toast.error(`Erro ao cancelar: ${err.message}`); } finally { setCancelLoading(false); }
  };

  const handleRegistrarFalta = async (dados: { tipoFalta: "justificada" | "injustificada"; documento?: string; descricao?: string; anexoId?: string; anexoUrl?: string; }) => {
    if (!faltaTarget) return;
    const ag = faltaTarget;
    if (ag.status === "falta" || ag.status === "concluido") { toast.error("Esta sessão já possui registro."); setFaltaTarget(null); return; }
    const obsAnterior = ag.observacoes || "";
    const detalheFalta = [`[FALTA ${dados.tipoFalta.toUpperCase()}]`, dados.documento ? `Documento: ${dados.documento}` : "", dados.descricao ? `Motivo: ${dados.descricao}` : "", `Por: ${user?.nome || "Sistema"} | Em: ${new Date().toLocaleString("pt-BR")}`,].filter(Boolean).join(" | ");
    const novaObs = `${obsAnterior}\n${detalheFalta}`.trim();
    await updateAgendamento(ag.id, { status: "falta" as any, observacoes: novaObs, custom_data: { ...(ag.custom_data as any || {}), falta: { tipo: dados.tipoFalta, documento: dados.documento, descricao: dados.descricao, anexoId: dados.anexoId, anexoUrl: dados.anexoUrl, registradoEm: new Date().toISOString(), registradoPor: user?.id, registradoPorNome: user?.nome } } } as any);
    await supabase.from("agendamentos").update({ observacoes: novaObs, custom_data: { ...(ag.custom_data as any || {}), falta: { tipo: dados.tipoFalta, documento: dados.documento, descricao: dados.descricao, anexoId: dados.anexoId, anexoUrl: dados.anexoUrl, registradoEm: new Date().toISOString(), registradoPor: user?.id, registradoPorNome: user?.nome } } } as any).eq("id", ag.id);
    try {
      const { data: linkedSession } = await (supabase as any).from("treatment_sessions").select("id, status").eq("appointment_id", ag.id).in("status", ["pendente", "agendada"]).maybeSingle();
      if (linkedSession) {
        await (supabase as any).from("treatment_sessions").update({ status: "falta", absence_type: dados.tipoFalta, clinical_notes: JSON.stringify({ tipo: "falta", tipo_falta: dados.tipoFalta, documento: dados.documento || null, descricao: dados.descricao || null, anexo_url: dados.anexoUrl || null, anexo_id: dados.anexoId || null, registrado_em: new Date().toISOString(), registrado_por: user?.nome || "Sistema" }) }).eq("id", linkedSession.id);
      }
    } catch (err) { console.error("Erro ao atualizar sessão de tratamento:", err); }
    await logAction({ acao: "registrar_falta", entidade: "agendamento", entidadeId: ag.id, modulo: "agenda", user, detalhes: { paciente: ag.pacienteNome, tipo_falta: dados.tipoFalta, documento: dados.documento || "", descricao: dados.descricao || "", anexo_url: dados.anexoUrl || "" } });
    const paciente = pacientes.find((p) => p.id === ag.pacienteId);
    const unidade = unidades.find((u) => u.id === ag.unidadeId);
    await notify({ evento: "nao_compareceu" as any, paciente_nome: ag.pacienteNome, telefone: paciente?.telefone || "", email: paciente?.email || "", data_consulta: ag.data, hora_consulta: ag.hora, unidade: unidade?.nome || "", profissional: ag.profissionalNome, tipo_atendimento: ag.tipo, status_agendamento: "falta", id_agendamento: ag.id, observacoes: dados.descricao || "" });
    
    // Recalcular status de falta na origem unificada
    await patientAbsenceService.recalculateStatus(ag.pacienteId);
    patientAbsenceService.notifyStatusChange(ag.pacienteId);
    whatsappService.sendByAgendamento(ag.id, "falta").catch(() => {});
    await handleVagaLiberada({ id: ag.id, data: ag.data, hora: ag.hora, profissionalId: ag.profissionalId, profissionalNome: ag.profissionalNome, unidadeId: ag.unidadeId, salaId: ag.salaId, tipo: ag.tipo }, "falta", user);
    await Promise.all([refreshAgendamentos(), refreshFila()]);
    try { await (supabase as any).rpc("atualizar_status_falta", { p_paciente_id: ag.pacienteId }); } catch (e) { console.warn("atualizar_status_falta:", e); }
    toast.success(`Falta registrada para ${ag.pacienteNome}.`);
    setFaltaTarget(null);
  };

  const handleDeleteAgendamento = async (agId: string) => {
    if (!can("agenda", "can_delete")) { toast.error("Sem permissão para excluir."); return; }
    try {
      await (supabase as any).from("agendamentos").delete().eq("id", agId);
      await logAction({ acao: "excluir", entidade: "agendamento", entidadeId: agId, detalhes: { acao: "exclusão de agendamento" }, user });
      toast.success("Agendamento excluído!");
      await refreshAgendamentos();
    } catch (err) { console.error("Error deleting:", err); toast.error("Erro ao excluir agendamento."); }
  };

  const handleIniciarAtendimento = async (ag: (typeof agendamentos)[0]) => {
    const today = todayLocalStr();
    if (ag.data > today) { toast.error("Não é possível iniciar atendimento antes da data agendada."); return; }
    const statusPermitidos = ["confirmado_chegada", "aguardando_atendimento", "apto_atendimento"];
    
    // Se não estiver nos status permitidos, verificamos se o usuário tem permissão para confirmar chegada e pular triagem
    if (!statusPermitidos.includes(ag.status)) {
      if (ag.status === "confirmado" && can('agenda', 'confirmar_chegada')) {
        // Confirmamos a chegada automaticamente (o executarStatusChange já lidará com o bypass de triagem para profissionais com essa permissão)
        await executarStatusChange(ag.id, "confirmado_chegada");
        // Forçamos o refresh para garantir que o status no banco esteja correto antes de prosseguir
        await refreshAgendamentos();
      } else {
        toast.error("Este agendamento ainda não está liberado para iniciar atendimento."); 
        return; 
      }
    }
    try {
      if (ag.status === "apto_atendimento") await updateAgendamento(ag.id, { status: "em_atendimento" as any });
      else {
        const { error: rpcError } = await supabase.rpc("iniciar_atendimento", { p_agendamento_id: ag.id, p_profissional_id: user?.id || "" });
        if (rpcError) {
          if (rpcError.message.includes("arrival_not_confirmed")) toast.error("A chegada do paciente ainda não foi confirmada pela recepção.");
          else if (rpcError.message.includes("not_authorized")) toast.error("Você não tem permissão para este agendamento.");
          else toast.error("Não foi possível iniciar o atendimento.");
          return;
        }
      }
    } catch (err) { toast.error("Erro ao validar início do atendimento."); return; }
    await Promise.all([refreshAgendamentos(), refreshFila()]);
    const now = new Date();
    const horaInicio = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    localStorage.setItem(`timer_${ag.id}`, JSON.stringify({ agendamentoId: ag.id, horaInicio, tempoLimite: user?.tempoAtendimento || 30, startTimestamp: Date.now() }));
    const pac = pacientes.find((p) => p.id === ag.pacienteId);
    await addAtendimento({ id: `at${Date.now()}`, agendamentoId: ag.id, pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome, profissionalId: ag.profissionalId, profissionalNome: ag.profissionalNome, unidadeId: ag.unidadeId, salaId: ag.salaId, setor: user?.setor || "", procedimento: ag.tipo, observacoes: "", data: ag.data, horaInicio, horaFim: "", status: "em_atendimento" });
    await logAction({ acao: "atendimento_iniciado", entidade: "atendimentos", entidadeId: ag.id, modulo: "atendimentos", user, detalhes: { paciente_nome: ag.pacienteNome, paciente_cpf: pac?.cpf || "", hora_inicio: horaInicio, unidade: ag.unidadeId, sala: ag.salaId || "" } });
    toast.success("Atendimento iniciado!");
    const params = new URLSearchParams({ pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome, agendamentoId: ag.id, horaInicio, data: ag.data, tipo: ag.tipo || '' });
    navigate(`/painel/workspace-prontuario?${params.toString()}`);
  };

  const handleAgendarRetorno = async () => {
    if (!retornoAg || !retornoForm.data || !retornoForm.hora || !user) return;
    const agId = `ag${Date.now()}`;
    const pac = pacientes.find((p) => p.id === retornoAg.pacienteId);
    const unidade = unidades.find((u) => u.id === user.unidadeId);
    const agData = { 
      id: agId, 
      pacienteId: retornoAg.pacienteId, 
      pacienteNome: retornoAg.pacienteNome, 
      unidadeId: user.unidadeId, 
      salaId: isTurnoMode ? newAg.salaId : (user.salaId || ""), 
      setorId: "", 
      profissionalId: user.id, 
      profissionalNome: user.nome, 
      data: retornoForm.data, 
      hora: retornoForm.hora, 
      status: "confirmado" as const, 
      tipo: "Retorno", 
      observacoes: "Retorno agendado pelo profissional", 
      origem: "profissional" as const, 
      criadoEm: new Date().toISOString(), 
      criadoPor: user.id 
    };
    // Verificar bloqueio do paciente antes de agendar retorno
    const { data: pData } = await supabase
      .from("pacientes")
      .select("status_falta, is_tfd, possui_ordem_judicial, nome")
      .eq("id", retornoAg.pacienteId)
      .single();

    if (pData?.status_falta === "BLOQUEADO") {
      const isIsento = !!(pData.is_tfd || pData.possui_ordem_judicial);
      if (isIsento) {
        toast.info(`Paciente ${pData.nome} possui exceção administrativa de bloqueio por TFD/Ordem Judicial. Agendamento de retorno permitido.`);
      } else {
        toast.error("Paciente BLOQUEADO por excesso de faltas. Não é possível agendar retorno.");
        return;
      }
    }

    setAgendamentoSaving(true);
    const toastId = toast.loading("Agendando retorno...");
    try { await addAgendamento(agData); toast.success("Retorno agendado com sucesso!", { id: toastId }); } catch (err) { toast.error("Erro ao agendar retorno.", { id: toastId }); } finally { setAgendamentoSaving(false); }
    await logAction({ acao: "agendar_retorno", entidade: "agendamento", entidadeId: agId, modulo: "agendamento", detalhes: { paciente: retornoAg.pacienteNome, data: retornoForm.data, hora: retornoForm.hora }, user });
    if (pac) { await notify({ evento: "novo_agendamento", paciente_nome: pac.nome, telefone: pac.telefone, email: pac.email, data_consulta: retornoForm.data, hora_consulta: retornoForm.hora, unidade: unidade?.nome || "", profissional: user.nome, tipo_atendimento: "Retorno", status_agendamento: "confirmado", id_agendamento: agId, observacoes: "Retorno agendado pelo profissional" }); ensurePortalAccess({ pacienteId: pac.id, contexto: "agendamento", data: retornoForm.data, hora: retornoForm.hora, unidade: unidade?.nome || "", profissional: user.nome, tipo: "Retorno" }).catch(() => {}); }
    toast.success("Retorno agendado com sucesso!");
    setRetornoDialogOpen(false);
    setRetornoAg(null);
    setRetornoForm({ data: "", hora: "" });
  };

  const editAvailableSlots = useMemo(() => {
    if (!editAg?.profissionalId) return [];
    const prof = profissionais.find((p) => p.id === editAg.profissionalId);
    if (!prof?.unidadeId) return [];
    return getAvailableSlots(editAg.profissionalId, prof.unidadeId, editAg.data);
  }, [editAg?.profissionalId, editAg?.data, profissionais, getAvailableSlots]);

  const handleOpenEdit = useCallback((ag: (typeof agendamentos)[0]) => {
    setEditAg({ id: ag.id, tipo: ag.tipo, data: ag.data, hora: ag.hora, profissionalId: ag.profissionalId, observacoes: ag.observacoes || "" });
    setEditDialogOpen(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editAg) return;
    try {
      const prof = profissionais.find((p) => p.id === editAg.profissionalId);
      const originalAg = agendamentos.find((a) => a.id === editAg.id);
      const dateOrHourChanged = originalAg && (originalAg.data !== editAg.data || originalAg.hora !== editAg.hora || originalAg.profissionalId !== editAg.profissionalId);
      if (dateOrHourChanged && prof?.unidadeId) {
        const canOverride = user && ["master", "coordenador"].includes(user.role);
        const { data: slotCheck } = await supabase.rpc("check_slot_availability", { p_profissional_id: editAg.profissionalId, p_unidade_id: prof.unidadeId, p_data: editAg.data, p_hora: editAg.hora });
        if (slotCheck && typeof slotCheck === "object" && "available" in slotCheck && !slotCheck.available) {
          const reason = (slotCheck as any).reason;
          const reasonMsg = reason === "date_blocked" ? "Data bloqueada." : reason === "day_full" ? "Vagas do dia esgotadas." : reason === "hour_full" ? "Vagas deste horário esgotadas." : "Sem disponibilidade.";
          if (!canOverride) { toast.error(`Não é possível reagendar: ${reasonMsg}`); return; }
          const confirmou = window.confirm(`${reasonMsg} Deseja forçar como ${user?.role}?`);
          if (!confirmou) return;
        }
      }
      await updateAgendamento(editAg.id, { tipo: editAg.tipo, data: editAg.data, hora: editAg.hora, profissionalId: editAg.profissionalId, profissionalNome: prof?.nome || "", observacoes: editAg.observacoes } as any);
      await logAction({ acao: "editar_agendamento", entidade: "agendamento", entidadeId: editAg.id, modulo: "agenda", user, detalhes: { tipo: editAg.tipo, data: editAg.data, hora: editAg.hora, profissional: prof?.nome } });
      toast.success("Agendamento atualizado!");
      setEditDialogOpen(false);
      setEditAg(null);
      await refreshAgendamentos();
    } catch (err) { console.error(err); toast.error("Erro ao editar agendamento."); }
  }, [editAg, profissionais, agendamentos, updateAgendamento, logAction, user, refreshAgendamentos]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Agenda"
        subtitle={isProfissional ? "Pacientes confirmados para seus atendimentos." : "Gestão centralizada de horários e compromissos clínicos."}
        actions={
          <div className="flex flex-wrap gap-2">
            {!isProfissional && (
              <>
                {(user?.role === "master" || user?.role === "recepcao") && (
                  <AgendaNotificacoesMassa
                    agendamentos={agendamentos}
                    pacientes={pacientes}
                    unidades={unidades}
                    selectedDate={selectedDate}
                    userUnidadeId={user?.unidadeId || ""}
                    userUsuario={user?.usuario || ""}
                  />
                )}
                {canAprovar && agendamentosPendentesOnline.length > 0 && (
                  <Button
                    variant={abaAtiva === "pendentes" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAbaAtiva(abaAtiva === "pendentes" ? "agenda" : "pendentes")}
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Pendentes Online
                    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                      {agendamentosPendentesOnline.length}
                    </span>
                  </Button>
                )}
                <Dialog
                  open={dialogOpen}
                  onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setPacientesConferidos(new Set());
                  }}
                >
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      className="gradient-primary"
                      onClick={async (e) => {
                        // Impedir abertura imediata se houver paciente pré-selecionado (ex: filtro)
                        if (newAg.pacienteId) {
                          const { data: pData } = await supabase
                            .from("pacientes")
                            .select("status_falta, is_tfd, possui_ordem_judicial, nome")
                            .eq("id", newAg.pacienteId)
                            .single();

                          if (pData?.status_falta === "BLOQUEADO") {
                            const isIsento = !!(pData.is_tfd || pData.possui_ordem_judicial);
                            if (isIsento) {
                              toast.info(`Paciente ${pData.nome} possui exceção administrativa de bloqueio por TFD/Ordem Judicial. Agendamento permitido.`);
                            } else {
                              e.preventDefault();
                              e.stopPropagation();
                              toast.error(`Paciente ${pData.nome} está BLOQUEADO por faltas e não pode realizar novos agendamentos.`);
                              return;
                            }
                          }
                        }
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" /> Novo Agendamento
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-display">Novo Agendamento</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Paciente</Label>
                        <BuscaPaciente
                          pacientes={pacientes}
                          value={newAg.pacienteId}
                          onChange={async (id) => {
                            if (id) {
                              const { data: pData } = await supabase
                                .from("pacientes")
                                .select("status_falta, is_tfd, possui_ordem_judicial, nome")
                                .eq("id", id)
                                .single();

                              if (pData?.status_falta === "BLOQUEADO") {
                                const isIsento = !!(pData.is_tfd || pData.possui_ordem_judicial);
                                if (isIsento) {
                                  toast.info(`Paciente ${pData.nome} possui exceção administrativa de bloqueio por TFD/Ordem Judicial. Agendamento permitido.`);
                                } else {
                                  toast.error(`Paciente ${pData.nome} está BLOQUEADO por faltas e não pode realizar novos agendamentos.`);
                                  handlePacienteSelecionadoNovoAg("");
                                  return;
                                }
                              }
                            }
                            handlePacienteSelecionadoNovoAg(id);
                          }}
                        />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="flex-1 h-px bg-border" />
                          <span>ou selecione pela lista</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <Select value={newAg.pacienteId} onValueChange={async (id) => {
                            if (id) {
                              const { data: pData } = await supabase
                                .from("pacientes")
                                .select("status_falta, is_tfd, possui_ordem_judicial, nome")
                                .eq("id", id)
                                .single();

                              if (pData?.status_falta === "BLOQUEADO") {
                                const isIsento = !!(pData.is_tfd || pData.possui_ordem_judicial);
                                if (isIsento) {
                                  toast.info(`Paciente ${pData.nome} possui exceção administrativa de bloqueio por TFD/Ordem Judicial. Agendamento permitido.`);
                                } else {
                                  toast.error(`Paciente ${pData.nome} está BLOQUEADO por faltas e não pode realizar novos agendamentos.`);
                                  handlePacienteSelecionadoNovoAg("");
                                  return;
                                }
                              }
                            }
                            handlePacienteSelecionadoNovoAg(id);
                          }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um paciente..." />
                          </SelectTrigger>
                          <SelectContent>
                            {pacientes.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome}
                                {p.cpf ? ` — ${p.cpf}` : ""}
                                {p.telefone ? ` — ${p.telefone}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {newAg.pacienteId && !pacientesConferidos.has(newAg.pacienteId) && (
                          <p className="text-xs text-warning">
                            ⚠ Conferência de dados pendente — selecione novamente o paciente para abrir o modal.
                          </p>
                        )}
                        {newAg.pacienteId && pacientesConferidos.has(newAg.pacienteId) && (
                          <p className="text-xs text-success">✓ Dados conferidos</p>
                        )}
                      </div>
                      <div>
                        <Label>Profissional</Label>
                        <Select
                          value={newAg.profissionalId}
                          onValueChange={(v) => setNewAg((p) => ({ ...p, profissionalId: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {profissionais.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{isTurnoMode ? "Bloco" : "Sala"}</Label>
                        <Select value={newAg.salaId} onValueChange={(v) => setNewAg((p) => ({ ...p, salaId: v }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {isTurnoMode ? (
                              newAgTurnoInfo
                                .filter(t => !newAg.hora || (newAg.hora >= t.horaInicio && newAg.hora < t.horaFim))
                                .map((t) => (
                                  <SelectItem key={t.turnoId} value={t.nome}>
                                    {t.nome} ({t.horaInicio} às {t.horaFim})
                                  </SelectItem>
                                ))
                            ) : (
                              salas.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.nome}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Tipo</Label>
                          <Select value={newAg.tipo} onValueChange={(v) => setNewAg((p) => ({ ...p, tipo: v }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(tipoBadge).map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Data</Label>
                          <Input
                            type="date"
                            value={selectedDate}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Horário</Label>
                        {getAvailableSlots(newAg.profissionalId, selectedProfUnit, selectedDate).length > 0 ? (
                          <Select value={newAg.hora} onValueChange={(v) => setNewAg((p) => ({ ...p, hora: v }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o horário" />
                            </SelectTrigger>
                            <SelectContent>
                              {getAvailableSlots(newAg.profissionalId, selectedProfUnit, selectedDate).map((h) => (
                                <SelectItem key={h} value={h}>
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              type="time"
                              value={newAg.hora}
                              onChange={(e) => setNewAg((p) => ({ ...p, hora: e.target.value }))}
                              placeholder="HH:MM"
                            />
                          </div>
                        )}
                        {quotaAlert}
                      </div>
                      <Button
                        onClick={handleCreate}
                        className="w-full gradient-primary text-primary-foreground"
                        disabled={!newAg.hora || !newAg.pacienteId || !newAg.profissionalId}
                      >
                        Agendar
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                
                <Dialog open={retornoDialogOpen} onOpenChange={setRetornoDialogOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-display">Agendar Retorno</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Paciente</Label>
                        <Input value={retornoAg?.pacienteNome || ""} readOnly className="bg-muted" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Data</Label>
                          <Select 
                            value={retornoForm.data} 
                            onValueChange={(v) => setRetornoForm(p => ({ ...p, data: v, hora: "" }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {retornoAvailableDates.map(d => (
                                <SelectItem key={d} value={d}>
                                  {new Date(d + "T12:00:00").toLocaleDateString("pt-BR")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Horário</Label>
                          <Select 
                            value={retornoForm.hora} 
                            onValueChange={(v) => setRetornoForm(p => ({ ...p, hora: v }))}
                            disabled={!retornoForm.data}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {retornoAvailableSlots.map(h => (
                                <SelectItem key={h} value={h}>
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {isTurnoMode && (
                        <div>
                          <Label>Bloco de Atendimento</Label>
                          <Select 
                            value={newAg.salaId} 
                            onValueChange={(v) => setNewAg(p => ({ ...p, salaId: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o bloco" />
                            </SelectTrigger>
                            <SelectContent>
                              {newAgTurnoInfo
                                .filter(t => !retornoForm.hora || (retornoForm.hora >= t.horaInicio && retornoForm.hora < t.horaFim))
                                .map((t) => (
                                  <SelectItem key={t.turnoId} value={t.nome}>
                                    {t.nome} ({t.horaInicio} às {t.horaFim})
                                  </SelectItem>
                                ))
                              }
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <Button 
                        onClick={handleAgendarRetorno}
                        className="w-full gradient-primary text-primary-foreground"
                        disabled={!retornoForm.data || !retornoForm.hora || agendamentoSaving}
                      >
                        {agendamentoSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                        Confirmar Retorno
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        }
      />

      {abaAtiva === "pendentes" && canAprovar && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Agendamentos Online Pendentes</h2>
            <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full font-medium">
              {agendamentosPendentesOnline.length} aguardando
            </span>
          </div>
          {agendamentosPendentesOnline.length === 0 ? (
            <Card className="shadow-card border-0">
              <CardContent className="p-8 text-center text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-success/40" />
                <p>Nenhum agendamento online pendente.</p>
              </CardContent>
            </Card>
          ) : (
            agendamentosPendentesOnline.map((ag) => {
              const pac = pacientes.find((p) => p.id === ag.pacienteId);
              const unidade = unidades.find((u) => u.id === ag.unidadeId);
              const prof = funcionarios.find((f) => f.id === ag.profissionalId);
              const tipoAnexoLabel: Record<string, string> = {
                laudo: "Laudo Médico",
                encaminhamento: "Encaminhamento",
                audio: "Áudio",
                outro: "Documento",
              };
              const anexoUrl = (ag as any).attachment_url || ag.attachmentUrl;
              const anexoNome = (ag as any).attachment_name || ag.attachmentName;
              const anexoTipo = (ag as any).attachment_type || ag.attachmentType;

              return (
                <Card key={ag.id} className="shadow-card border-0 border-l-4 border-l-warning">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">{ag.pacienteNome}</p>
                        <p className="text-sm text-muted-foreground">
                          {prof?.nome || ag.profissionalNome} • {unidade?.nome} • {ag.tipo}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          📅 {new Date(ag.data + "T12:00:00").toLocaleDateString("pt-BR")} às {ag.hora}
                        </p>
                        {pac?.telefone && <p className="text-xs text-muted-foreground">📞 {pac.telefone}</p>}
                        {pac?.email && <p className="text-xs text-muted-foreground">✉️ {pac.email}</p>}
                        {ag.observacoes && <p className="text-xs text-muted-foreground mt-1">💬 {ag.observacoes}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        Solicitado {new Date(ag.criadoEm).toLocaleDateString("pt-BR")}
                      </span>
                    </div>

                    {anexoUrl ? (
                      <div className="flex items-center gap-2 p-2 bg-info/10 border border-info/20 rounded-lg">
                        <Paperclip className="w-4 h-4 text-info shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            {tipoAnexoLabel[anexoTipo || "outro"] || "Documento"} anexado
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{anexoNome || "Arquivo"}</p>
                        </div>
                        <a href={anexoUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                          </Button>
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground">Nenhum documento anexado</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => handleAprovar(ag)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar e Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setRejeicaoTarget(ag);
                          setRejeicaoMotivo("");
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Rejeitar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {abaAtiva === "agenda" && (
        <div className="space-y-6">
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b pb-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold font-display tracking-tight text-foreground">Agenda Inteligente</h2>
                <p className="text-muted-foreground text-sm">Visualize a ocupação e gerencie seus atendimentos de forma moderna.</p>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {!isProfissional && showUnitSelector && (
                  <Select
                    value={filterUnit}
                    onValueChange={(v) => {
                      setFilterUnit(v);
                      setFilterProf("all");
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-48 bg-background border-muted-foreground/20">
                      <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas Unidades</SelectItem>
                      {unidadesVisiveis.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!isProfissional && (
                  <Popover open={profPopoverOpen} onOpenChange={setProfPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={profPopoverOpen}
                        className="w-full sm:w-64 justify-between bg-background border-muted-foreground/20 font-normal"
                      >
                        <div className="flex items-center truncate">
                          <Stethoscope className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                          <span className="truncate">
                            {filterProf === "all"
                              ? "Todos Profissionais"
                              : profissionais.find((p) => p.id === filterProf)?.nome || "Profissional"}
                          </span>
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar profissional ou especialidade..." />
                        <CommandList>
                          <CommandEmpty>Nenhum profissional encontrado.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="todos profissionais"
                              onSelect={() => {
                                setFilterProf("all");
                                setProfPopoverOpen(false);
                              }}
                              className="flex items-center gap-2"
                            >
                              <div className={cn(
                                "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                filterProf === "all" ? "bg-primary text-primary-foreground" : "opacity-50"
                              )}>
                                {filterProf === "all" && <Check className="h-3 w-3" />}
                              </div>
                              <span className="font-medium">Todos Profissionais</span>
                            </CommandItem>
                          </CommandGroup>
                          
                          <ScrollArea className="h-[300px]">
                            {groupedProfissionais.map(([especialidade, profs]) => (
                              <React.Fragment key={especialidade}>
                                <CommandSeparator />
                                <CommandGroup heading={especialidade}>
                                  {profs.map((p) => (
                                    <CommandItem
                                      key={p.id}
                                      value={`${p.nome} ${p.profissao || ""}`}
                                      onSelect={() => {
                                        setFilterProf(p.id);
                                        setProfPopoverOpen(false);
                                      }}
                                      className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                                    >
                                      <div className="flex items-center w-full justify-between">
                                        <span className="font-medium truncate max-w-[200px]" title={p.nome}>
                                          {p.nome}
                                        </span>
                                        {filterProf === p.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                                      </div>
                                      {p.profissao && (
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                          {p.profissao}
                                        </span>
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </React.Fragment>
                            ))}
                          </ScrollArea>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
                
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full sm:w-52 bg-background border-muted-foreground/20">
                    <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Situação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Status</SelectItem>
                    {Object.entries(STATUS_GROUP_LABELS).filter(([k]) => k !== 'all').map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="w-full sm:w-52 bg-background border-muted-foreground/20">
                    <Stethoscope className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Tipo de atendimento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos os tipos</SelectItem>
                    <SelectItem value="Consulta">Avaliação/TR</SelectItem>
                    <SelectItem value="Retorno">Retorno</SelectItem>
                    <SelectItem value="Exame">Exame</SelectItem>
                    <SelectItem value="Procedimento">Procedimento</SelectItem>
                    <SelectItem value="Sessão de Tratamento">Sessão de Tratamento</SelectItem>
                    <SelectItem value="Urgência">Urgência</SelectItem>
                  </SelectContent>
                </Select>

                {(filterUnit !== "all" || filterProf !== "all" || filterStatus !== "all" || searchTerm) && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setFilterUnit("all");
                      setFilterProf("all");
                      setFilterStatus("all");
                      setFilterTipo("Todos");
                      setSearchTerm("");
                    }}
                    className="h-9 px-3 text-muted-foreground hover:text-foreground"
                  >
                    <FilterX className="w-4 h-4 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-200 dark:border-slate-700 self-center shadow-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAgendaView("day")}
                  className={cn(
                    "px-4 h-9 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2",
                    agendaView === "day" 
                      ? "bg-teal-600 text-white shadow-md hover:bg-teal-700 hover:text-white" 
                      : "text-slate-600 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-700/80 hover:text-slate-900 dark:hover:text-slate-200"
                  )}
                >
                  <CalendarIcon className={cn("w-4 h-4", agendaView === "day" ? "text-white" : "text-teal-600")} />
                  <span className="hidden sm:inline">Dia</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAgendaView("week")}
                  className={cn(
                    "px-4 h-9 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2",
                    agendaView === "week" 
                      ? "bg-teal-600 text-white shadow-md hover:bg-teal-700 hover:text-white" 
                      : "text-slate-600 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-700/80 hover:text-slate-900 dark:hover:text-slate-200"
                  )}
                >
                  <Columns className={cn("w-4 h-4", agendaView === "week" ? "text-white" : "text-teal-600")} />
                  <span className="hidden sm:inline">Semana</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAgendaView("month")}
                  className={cn(
                    "px-4 h-9 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2",
                    agendaView === "month" 
                      ? "bg-teal-600 text-white shadow-md hover:bg-teal-700 hover:text-white" 
                      : "text-slate-600 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-700/80 hover:text-slate-900 dark:hover:text-slate-200"
                  )}
                >
                  <LayoutGrid className={cn("w-4 h-4", agendaView === "month" ? "text-white" : "text-teal-600")} />
                  <span className="hidden sm:inline">Mês</span>
                </Button>
              </div>
            </div>

            {agendaView === "month" && (
              <CalendarioAgenda
                selectedDate={selectedDate}
                onDateChange={(date) => setSelectedDate(date)}
                agendamentos={agendamentos}
                bloqueios={bloqueios}
                disponibilidades={disponibilidades}
                filterProf={filterProf}
                filterUnit={filterUnit}
                profissionais={profissionais}
                getAvailableSlots={getAvailableSlots}
                getAvailableDates={getAvailableDates}
                unidades={unidades}
              />
            )}

            {agendaView === "week" && (
              <AgendaVisaoSemana
                selectedDate={selectedDate}
                onDateChange={(date) => setSelectedDate(date)}
                agendamentos={agendamentos}
                bloqueios={bloqueios}
                disponibilidades={disponibilidades}
                filterProf={filterProf}
                filterUnit={filterUnit}
                profissionais={profissionais}
                getAvailableSlots={getAvailableSlots}
                unidades={unidades}
              />
            )}

            {agendaView === "day" && (
              <AgendaVisaoDia
                selectedDate={selectedDate}
                onDateChange={(date) => setSelectedDate(date)}
                agendamentos={agendamentos}
                bloqueios={bloqueios}
                disponibilidades={disponibilidades}
                filterProf={filterProf}
                filterUnit={filterUnit}
                profissionais={profissionais}
                getAvailableSlots={getAvailableSlots}
                unidades={unidades}
                onNewAgendamento={() => setDialogOpen(true)}
              />
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mt-10 border-b pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary shadow-sm ring-1 ring-primary/20">
                <CalendarIcon className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-bold font-display tracking-tight text-foreground">
                  {isSameDay(new Date(selectedDate + "T12:00:00"), new Date()) ? "Atendimentos de Hoje" : `Atendimentos em ${new Date(selectedDate + "T12:00:00").toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`}
                </h3>
                <p className="text-sm font-medium text-muted-foreground">Exibindo registros filtrados por data e status.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Pesquisar paciente..."
                  className="pl-10 w-72 bg-background border-muted-foreground/20 focus-visible:ring-primary shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {canCreate && (
                <Button onClick={() => setDialogOpen(true)} className="gap-2 h-10 px-5 shadow-lg bg-primary hover:bg-primary/90 font-bold">
                  <Plus className="w-4 h-4" /> Novo Agendamento
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 py-2">
            <button
              onClick={() => setFilterStatus("all")}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border shadow-sm",
                filterStatus === "all" 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              Todos Atendimentos
              <Badge variant="secondary" className="px-1.5 h-5 min-w-[1.25rem] text-[10px] bg-white/20 text-inherit border-none">
                {statusCounts.all || 0}
              </Badge>
            </button>
            {Object.entries(STATUS_GROUP_LABELS).filter(([k]) => k !== 'all').map(([key, label]) => {
              const count = statusCounts[key] || 0;
              if (count === 0 && filterStatus !== key) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border shadow-sm",
                    filterStatus === key 
                      ? "bg-primary text-primary-foreground border-primary" 
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {label}
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "px-1.5 h-5 min-w-[1.25rem] text-[10px] border-none",
                      filterStatus === key ? "bg-white/20 text-white" : "bg-muted-foreground/10 text-muted-foreground"
                    )}
                  >
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>

          {filterProf !== "all" && (
            <SlotInfoBadge
              profissionalId={filterProf}
              unidadeId={
                filterUnit !== "all" ? filterUnit : profissionais.find((p) => p.id === filterProf)?.unidadeId || ""
              }
              date={selectedDate}
            />
          )}

          {blockedForDate.length > 0 && (
            <Card className="shadow-card border-0 bg-destructive/5 ring-1 ring-destructive/20">
              <CardContent className="p-4 flex items-center gap-3">
                <CalendarOff className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">🚫 Data bloqueada para agendamentos</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {blockedForDate.map((b) => b.titulo).join(" • ")}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {weekendInfo.isWeekend && !weekendInfo.hasAvailability && (
            <Card className="shadow-card border-0 bg-destructive/5 ring-1 ring-destructive/20">
              <CardContent className="p-4 flex items-center gap-3">
                <CalendarOff className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">🔴 Fim de semana — sem atendimento</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nenhum profissional possui disponibilidade cadastrada para este dia.
                    {user && ["master", "coordenador"].includes(user.role) && (
                      <span className="block mt-1 text-warning">
                        Master/Coordenador pode forçar encaixe ao criar agendamento.
                      </span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {weekendInfo.isWeekend && weekendInfo.hasAvailability && (
            <Card className="shadow-card border-0 bg-orange-50 ring-1 ring-orange-300 dark:bg-orange-500/10 dark:ring-orange-500/30">
              <CardContent className="p-4 flex items-center gap-3">
                <CalendarIcon className="w-5 h-5 text-orange-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                    🟠 Fim de semana — com atendimento disponível
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Há profissionais com disponibilidade cadastrada para este dia.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {agendamentosPendentesRevisao.length > 0 && (

            <Card className="shadow-card border-0 bg-warning/10 ring-1 ring-warning/30 animate-pulse">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-warning/20 p-2 rounded-full">
                    <Bell className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-warning-foreground">Pendências de agenda</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Existem {agendamentosPendentesRevisao.length} pacientes do período que ainda estão sem conclusão. 
                      Revise para marcar falta ou concluir.
                    </p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full sm:w-auto border-warning/50 text-warning-foreground hover:bg-warning/20"
                  onClick={() => setRevisaoDialogOpen(true)}
                >
                  Ver pendências
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <Card className="shadow-card border-0">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground mb-3">
                    {isProfissional
                      ? "Nenhum paciente confirmado pela recepção para esta data."
                      : "Nenhum agendamento para esta data."}
                  </p>
                  {!isProfissional && (
                    <Button 
                      variant="outline" 
                      onClick={async () => {
                        if (newAg.pacienteId) {
                          const { data: pData } = await supabase
                            .from("pacientes")
                            .select("status_falta, is_tfd, possui_ordem_judicial, nome")
                            .eq("id", newAg.pacienteId)
                            .single();

                          if (pData?.status_falta === "BLOQUEADO") {
                            const isIsento = !!(pData.is_tfd || pData.possui_ordem_judicial);
                            if (isIsento) {
                              toast.info(`Paciente ${pData.nome} possui exceção administrativa de bloqueio por TFD/Ordem Judicial. Agendamento permitido.`);
                            } else {
                              toast.error(`Paciente ${pData.nome} está BLOQUEADO por faltas e não pode realizar novos agendamentos.`);
                              return;
                            }
                          }
                        }
                        setDialogOpen(true);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" /> Novo Agendamento
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              filtered.map((ag) => {
                const ehHoje = isSameDay(new Date(`${ag.data}T12:00:00`), new Date());
                const STATUS_LIBERADOS = ["confirmado_chegada", "aguardando_atendimento", "apto_atendimento"];
                const canStart = isProfissional && (STATUS_LIBERADOS.includes(ag.status) || (ag.status === "confirmado" && can('agenda', 'confirmar_chegada'))) && (ag.status === "apto_atendimento" || ehHoje);
                const isEmAtendimento = ag.status === "em_atendimento";
                const tipoInfo = tipoBadge[ag.tipo] || { label: ag.tipo, class: "bg-muted text-muted-foreground", icon: "⚪" };
                const paciente = pacientes.find((p) => p.id === ag.pacienteId);
                const lastAppt = lastProntuarios[ag.pacienteId];
                const ehPendenteOnline = ag.origem === "online" && ag.status === "pendente";
                const isPendenteRevisao = agendamentosPendentesRevisao.some(p => p.id === ag.id);
                const anexoUrl = (ag as any).attachment_url || ag.attachmentUrl;
                const typeColorBar: Record<string, string> = {
                  "Avaliação/TR": "border-l-[#3B82F6]",
                  Retorno: "border-l-[#10B981]",
                  Procedimento: "border-l-[#8B5CF6]",
                  Exame: "border-l-[#F59E0B]",
                  Urgência: "border-l-[#EF4444]",
                  "Sessão de Tratamento": "border-l-[#F97316]",
                };

                return (
                  <Card
                    key={ag.id}
                    className={cn(
                      "shadow-card border-0 border-l-4",
                      typeColorBar[ag.tipo] || "border-l-muted",
                      isEmAtendimento && "ring-2 ring-primary/50",
                      ehPendenteOnline && "ring-1 ring-warning/40",
                    )}
                  >
                    <CardContent className="p-3 sm:p-4 space-y-2">
                      <div className="flex items-start gap-3">
                        <span className="text-lg font-mono font-bold text-primary w-14 shrink-0">{ag.hora}</span>
                        <div className="flex-1 min-w-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="font-semibold text-foreground cursor-default">
                                {tipoInfo.icon} {resolvePaciente(ag.pacienteId, ag.pacienteNome)}
                                {anexoUrl && <Paperclip className="w-3.5 h-3.5 inline ml-1 text-info" />}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs"><strong>Paciente:</strong> {resolvePaciente(ag.pacienteId, ag.pacienteNome)}</p>
                              {paciente?.telefone && <p className="text-xs"><strong>Tel:</strong> {paciente.telefone}</p>}
                              {paciente?.cpf && <p className="text-xs"><strong>CPF:</strong> {paciente.cpf}</p>}
                              {paciente?.cns && <p className="text-xs"><strong>CNS:</strong> {paciente.cns}</p>}
                              <p className="text-xs"><strong>Tipo:</strong> {tipoInfo.label}</p>
                              <p className="text-xs"><strong>Origem:</strong> {(ag.origem as string) === 'externo' ? '🔗 Externo' : ag.origem}</p>
                              {(ag as any).agendadoPorExterno && <p className="text-xs text-primary font-medium">📋 Agendado por externo</p>}
                              {lastAppt && (
                                <>
                                  <hr className="my-1 border-border" />
                                  <p className="text-xs font-semibold">Último atendimento:</p>
                                  <p className="text-xs">{new Date(lastAppt.data + "T12:00:00").toLocaleDateString("pt-BR")} — {lastAppt.profissional}</p>
                                  {lastAppt.procedimentos && <p className="text-xs">📋 {lastAppt.procedimentos}</p>}
                                  {lastAppt.queixa && <p className="text-xs">QP: {lastAppt.queixa.substring(0, 80)}</p>}
                                </>
                              )}
                            </TooltipContent>
                          </Tooltip>
                          <p className="text-sm text-muted-foreground">{ag.profissionalNome}</p>
                          {lastAppt && isProfissional && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              📋 Último: {new Date(lastAppt.data + "T12:00:00").toLocaleDateString("pt-BR")} — {lastAppt.queixa?.substring(0, 50) || lastAppt.procedimentos || "sem resumo"}
                            </p>
                          )}
                          {ehPendenteOnline && <p className="text-xs text-warning mt-0.5">⏳ Aguardando aprovação</p>}
                        </div>
                        <ContactActionButton phone={paciente?.telefone} patientName={ag.pacienteNome} unitName={unidades.find((u) => u.id === ag.unidadeId)?.nome} />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", tipoInfo.class)}>{tipoInfo.label}</span>
                        <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium shrink-0", statusBadgeClass[ag.status] || "bg-muted text-muted-foreground")}>{statusLabels[ag.status] || ag.status}</span>
                        {isPendenteRevisao && <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-warning/20 text-warning-foreground flex items-center gap-1 animate-pulse"><Bell className="w-3 h-3" /> Revisão Pendente</span>}
                        {(() => {
                          const risco = triageMap[ag.id]?.risco;
                          if (!risco) return null;
                          const m = getManchesterBadgeStyle(risco);
                          return (
                            <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 inline-flex items-center gap-1 border", m.bg, m.text, m.pulse && "animate-pulse")} style={{ borderColor: m.color }}>
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} /> Risco {m.label}
                            </span>
                          );
                        })()}
                        {ag.googleEventId && <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", ag.syncStatus === "ok" ? "bg-success/10 text-success" : ag.syncStatus === "erro" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>📅</span>}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setDetalheAg(ag); setDetalheOpen(true); }} title="Detalhes"><Eye className="w-3.5 h-3.5" /></Button>
                        {(user?.role === "master" || user?.role === "recepcao") && <AgendaNotificacaoIndividual ag={ag} paciente={paciente} unidade={unidades.find((u) => u.id === ag.unidadeId)} />}
                        {canEdit && !["cancelado", "concluido"].includes(ag.status) && <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => handleOpenEdit(ag)} title="Editar"><Pencil className="w-3.5 h-3.5" /></Button>}
                        {ehPendenteOnline && canAprovar && (
                          <>
                            <Button size="sm" className="h-8 px-2 bg-success text-success-foreground hover:bg-success/90" onClick={() => handleAprovar(ag)} title="Aprovar"><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="outline" className="h-8 px-2 border-destructive text-destructive hover:bg-destructive/10" onClick={() => { setRejeicaoTarget(ag); setRejeicaoMotivo(""); }} title="Rejeitar"><XCircle className="w-3.5 h-3.5" /></Button>
                          </>
                        )}
                        {isProfissional && !["falta", "cancelado", "concluido"].includes(ag.status) && (ag.profissionalId === user?.id || isMaster) && (
                          <Button size="sm" variant="outline" className="h-8 px-3 text-xs border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => handleStatusChange(ag.id, "falta")} title="Marcar Falta"><XCircle className="w-3.5 h-3.5 mr-1" /> Faltou</Button>
                        )}
                        {isProfissional && (
                          <>
                            {(ag.status === "pendente" || ag.status === "confirmado") && ehHoje && (
                              can('agenda', 'confirmar_chegada') ? (
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 px-3 text-xs border-success text-success hover:bg-success/10" 
                                  onClick={() => handleStatusChange(ag.id, "confirmado_chegada")}
                                  disabled={statusUpdating}
                                >
                                  {statusUpdating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <LogIn className="w-3.5 h-3.5 mr-1" />}
                                  Confirmar Chegada
                                </Button>
                              ) : (
                                <Tooltip><TooltipTrigger asChild><Button size="sm" variant="ghost" className="h-8 px-3 text-xs cursor-not-allowed opacity-50" disabled>⏳ Aguardando chegada</Button></TooltipTrigger><TooltipContent>Aguardando confirmação de chegada pela recepção</TooltipContent></Tooltip>
                              )
                            )}
                            {ag.status === "aguardando_triagem" && ehHoje && (
                              <Tooltip><TooltipTrigger asChild><Button size="sm" variant="outline" className="h-8 px-3 text-xs cursor-not-allowed opacity-50 border-warning text-warning" disabled>🩺 Em triagem</Button></TooltipTrigger><TooltipContent>Aguardando técnico de enfermagem concluir a triagem</TooltipContent></Tooltip>
                            )}
                            {canStart && (
                              <Button size="sm" className="h-8 px-3 text-xs bg-success text-success-foreground hover:bg-success/90" onClick={() => handleIniciarAtendimento(ag)}><Play className="w-3.5 h-3.5 mr-1" /> Iniciar atendimento</Button>
                            )}
                            {isEmAtendimento && (
                              <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => { const params = new URLSearchParams({ pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome, agendamentoId: ag.id, data: ag.data, tipo: ag.tipo || '' }); try { const stored = localStorage.getItem(`timer_${ag.id}`); if (stored) { const parsed = JSON.parse(stored); if (parsed.horaInicio) params.set('horaInicio', parsed.horaInicio); } } catch {} navigate(`/painel/workspace-prontuario?${params.toString()}`); }}><Clock className="w-3.5 h-3.5 mr-1" /> Continuar</Button>
                            )}
                            {ag.status === "concluido" && (
                              <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => { const params = new URLSearchParams({ pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome, agendamentoId: ag.id, data: ag.data, tipo: ag.tipo || '' }); navigate(`/painel/workspace-prontuario?${params.toString()}`); }}>✅ Ver prontuário</Button>
                            )}
                            {(ag.status === "falta" || ag.status === "cancelado") && <span className="text-xs text-muted-foreground px-2 py-1">{ag.status === "falta" ? "Faltou" : "Cancelado"}</span>}
                            {!ehHoje && !["falta", "cancelado", "concluido"].includes(ag.status) && <span className="text-xs text-muted-foreground px-2 py-1">📅 Agendado para {new Date(ag.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>}
                          </>
                        )}
                        {canRetorno && ag.status === "concluido" && (
                          <Button size="sm" variant="outline" className="h-8 px-3 text-xs border-accent text-accent-foreground" onClick={() => { setRetornoAg({ pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome }); setRetornoForm({ data: "", hora: "" }); setNewAg(p => ({ ...p, profissionalId: user?.id || "" })); setRetornoDialogOpen(true); }}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Retorno</Button>
                        )}
                        {!isProfissional && ag.status !== "cancelado" && ag.status !== "concluido" && !ehPendenteOnline && statusActions.map((sa) => (
                          <Button key={sa.key} size="sm" variant="outline" className={cn("h-8 px-2 text-xs", ag.status === sa.key && sa.color)} onClick={() => handleStatusChange(ag.id, sa.key)} disabled={ag.status === sa.key || statusUpdating} title={sa.label}>{statusUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <sa.icon className="w-3.5 h-3.5" />}</Button>
                        ))}
                        {!isProfissional && ag.status !== "cancelado" && ag.status !== "concluido" && !ehPendenteOnline && (
                          <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-destructive/50 text-destructive" title="Cancelar Agendamento" onClick={() => { setCancelTarget(ag); setCancelMotivo(''); }}><X className="w-3.5 h-3.5" /></Button>
                        )}
                        {can("agenda", "can_delete") && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="h-8 px-2 text-destructive" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Excluir agendamento?</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir o agendamento de {ag.pacienteNome} às {ag.hora}? Esta ação será registrada no log de auditoria.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteAgendamento(ag.id)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 mt-6 p-4 bg-muted/20 rounded-xl border border-border/50">
            <h4 className="text-[10px] font-bold text-muted-foreground w-full mb-1 uppercase tracking-widest">Legenda de Status</h4>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="w-2.5 h-2.5 rounded-full bg-success/20 ring-1 ring-success/40" /> Confirmado</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40" /> Chegou</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="w-2.5 h-2.5 rounded-full bg-primary/20 ring-1 ring-primary/40" /> Em Atendimento</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="w-2.5 h-2.5 rounded-full bg-info/20 ring-1 ring-info/40" /> Concluído</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="w-2.5 h-2.5 rounded-full bg-destructive/20 ring-1 ring-destructive/40" /> Faltou</div>
            <div className="flex items-center gap-2 text-xs text-warning-foreground font-semibold"><div className="w-2.5 h-2.5 rounded-full bg-warning/20 ring-1 ring-warning/40 animate-pulse" /> Pendente de Revisão</div>
          </div>
        </div>
      )}

      <Dialog open={!!rejeicaoTarget} onOpenChange={(o) => { if (!o) { setRejeicaoTarget(null); setRejeicaoMotivo(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rejeitar Agendamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Agendamento de <strong className="text-foreground">{rejeicaoTarget?.pacienteNome}</strong>. O paciente será notificado por e-mail com o motivo.</p>
            <div><Label>Motivo da rejeição *</Label><Textarea value={rejeicaoMotivo} onChange={(e) => setRejeicaoMotivo(e.target.value)} placeholder="Ex: Encaminhamento inválido, data indisponível, documento ilegível..." rows={3} /></div>
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { setRejeicaoTarget(null); setRejeicaoMotivo(""); }}>Voltar</Button><Button variant="destructive" className="flex-1" onClick={handleRejeitar} disabled={!rejeicaoMotivo.trim()}>Confirmar Rejeição</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <RegistrarFaltaModal
        open={!!faltaTarget}
        onOpenChange={(o) => { if (!o) setFaltaTarget(null); }}
        agendamento={faltaTarget ? { id: faltaTarget.id, pacienteId: faltaTarget.pacienteId, pacienteNome: faltaTarget.pacienteNome, profissionalId: faltaTarget.profissionalId, profissionalNome: faltaTarget.profissionalNome, data: faltaTarget.data, hora: faltaTarget.hora, unidadeId: faltaTarget.unidadeId, tipo: faltaTarget.tipo } : null}
        onConfirm={handleRegistrarFalta}
      />
      <ConferirDadosPacienteModal
        open={conferenciaModal.open}
        onOpenChange={(o) => setConferenciaModal((p) => ({ ...p, open: o }))}
        pacienteId={conferenciaModal.pacienteId}
        modo={conferenciaModal.modo}
        agendamento={conferenciaModal.agendamentoInfo}
        onConfirm={conferenciaModal.onConfirm}
      />

      <Dialog open={revisaoDialogOpen} onOpenChange={setRevisaoDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-display flex items-center gap-2 text-xl">
                <Bell className="w-5 h-5 text-warning" /> 
                Pendências de Agenda 
                <Badge variant="outline" className="ml-2 bg-warning/10 text-warning border-warning/20">
                  {agendamentosPendentesRevisao.length}
                </Badge>
              </DialogTitle>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    const tid = toast.loading("Atualizando...");
                    await refreshAgendamentos();
                    toast.success("Atualizado!", { id: tid });
                  }} 
                  className="h-8 text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Atualizar
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {agendamentosPendentesRevisao.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <div className="bg-success/10 p-4 rounded-full">
                  <CheckCircle2 className="w-10 h-10 text-success" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Tudo em dia!</p>
                  <p className="text-muted-foreground">Nenhuma pendência encontrada para o seu perfil.</p>
                </div>
              </div>
            ) : (
              Object.entries(agendamentosPendentesRevisao.reduce((acc, ag) => { 
                const date = ag.data; 
                if (!acc[date]) acc[date] = []; 
                acc[date].push(ag); 
                return acc; 
              }, {} as Record<string, typeof agendamentos>))
              .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
              .map(([date, items]) => (
                <div key={date} className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 sticky top-0 bg-background/95 py-1 z-10">
                    <CalendarIcon className="w-3 h-3" />
                    {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: '2-digit', month: 'long', year: 'numeric' })}
                  </h3>
                  <div className="grid gap-3">
                    {items.sort((a, b) => a.hora.localeCompare(b.hora)).map(ag => {
                      const statusInfo = statusBadgeClass[ag.status] || "bg-muted text-muted-foreground";
                      const pac = pacientes.find(p => p.id === ag.pacienteId);
                      
                      return (
                        <div key={ag.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:shadow-md transition-all gap-4 group">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-foreground truncate">{ag.pacienteNome}</p>
                              <div className="flex gap-1">
                                {pac?.is_tfd && <Badge variant="outline" className="text-[10px] h-5 border-warning text-warning">TFD</Badge>}
                                {pac?.possui_ordem_judicial && <Badge variant="outline" className="text-[10px] h-5 border-warning text-warning">JUDICIAL</Badge>}
                              </div>
                              <Badge variant="outline" className={cn("text-[10px] uppercase font-bold border-none px-2 h-5", statusInfo)}>
                                {statusLabels[ag.status] || ag.status}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1 font-mono font-bold text-primary">
                                <Clock className="w-3 h-3" /> {ag.hora}
                              </span>
                              <span className="flex items-center gap-1">
                                <Stethoscope className="w-3 h-3" /> {ag.profissionalNome}
                              </span>
                              {pac?.telefone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" /> {pac.telefone}
                                </span>
                              )}
                              {isMaster && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3" /> {unidades.find(u => u.id === ag.unidadeId)?.nome}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-9 w-9 p-0 text-info hover:bg-info/10" 
                              onClick={() => { setDetalheAg(ag); setDetalheOpen(true); }}
                              title="Visualizar Detalhes"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>

                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10" 
                              onClick={() => setFaltaTarget(ag)}
                              title="Marcar Falta"
                            >
                              <X className="w-4 h-4" />
                            </Button>

                            {(isProfissional || isMaster) && (
                              <Button 
                                size="sm" 
                                className="h-9 gap-2 bg-success text-success-foreground hover:bg-success/90 px-4" 
                                onClick={() => { handleIniciarAtendimento(ag); setRevisaoDialogOpen(false); }}
                                disabled={!(["confirmado_chegada", "aguardando_atendimento", "apto_atendimento", "apto", "chegada_confirmada"].includes(ag.status) || (ag.status === "confirmado" && can('agenda', 'confirmar_chegada')))}
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span className="text-xs font-bold">Resolver</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-shrink-0">
            <Button variant="outline" onClick={() => setRevisaoDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Agenda;
