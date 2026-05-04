import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TIPO_REGISTRO_LABELS } from "@/utils/labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FlaskConical, Plus, Edit, Trash2, FileText, Download, Eye, Calendar,
  Microscope, Activity, AlertTriangle, CheckCircle2, Clock, Upload, Paperclip, Loader2,
} from "lucide-react";

const BUCKET = "prontuario-anexos";

const TIPOS_EXAME = [
  { value: "laboratorial", label: "Laboratorial", icon: FlaskConical, color: "text-blue-600" },
  { value: "imagem", label: "Imagem (RX/USG/TC/RM)", icon: Microscope, color: "text-violet-600" },
  { value: "cardiologico", label: "Cardiológico", icon: Activity, color: "text-rose-600" },
  { value: "histopatologico", label: "Histopatológico", icon: Microscope, color: "text-amber-600" },
  { value: "outro", label: "Outro", icon: FileText, color: "text-slate-600" },
];

const STATUS_OPTIONS = [
  { value: "pendente", label: "Pendente", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", icon: Clock },
  { value: "liberado", label: "Liberado", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30", icon: CheckCircle2 },
  { value: "revisado", label: "Revisado", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  { value: "urgente", label: "Urgente", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30", icon: AlertTriangle },
];

const TIPOS_ATENDIMENTO = [
  { value: "rotina", label: "Rotina" },
  { value: "retorno", label: "Retorno" },
  { value: "avaliacao_inicial", label: "Avaliação Inicial" },
  { value: "procedimentos", label: "Procedimentos" },
  { value: "urgencia", label: "Urgência" },
  { value: "internacao", label: "Internação" },
  { value: "pos_operatorio", label: "Pós-operatório" },
];

const INTERPRETACOES = [
  { value: "normal", label: "Normal", color: "text-emerald-600" },
  { value: "alterado_leve", label: "Alterado (leve)", color: "text-amber-600" },
  { value: "alterado_moderado", label: "Alterado (moderado)", color: "text-orange-600" },
  { value: "alterado_grave", label: "Alterado (grave)", color: "text-rose-600" },
  { value: "inconclusivo", label: "Inconclusivo", color: "text-slate-600" },
];

interface ResultadoExame {
  id: string;
  prontuario_id: string | null;
  paciente_id: string;
  agendamento_id: string;
  unidade_id: string;
  nome_exame: string;
  tipo_exame: string;
  laboratorio: string;
  data_solicitacao: string | null;
  data_coleta: string | null;
  data_resultado: string | null;
  medico_solicitante: string;
  medico_solicitante_id: string;
  status: string;
  tipo_atendimento_vinculado: string;
  valor_encontrado: string;
  valor_referencia: string;
  unidade_medida: string;
  interpretacao: string;
  laudo: string;
  observacoes_medicas: string;
  anexo_storage_path: string;
  anexo_nome_arquivo: string;
  criado_por: string;
  criado_por_nome: string;
  criado_em: string;
}

interface ResultadosExamesProps {
  prontuarioId?: string | null;
  pacienteId: string;
  agendamentoId?: string;
  tipoAtendimento?: string;
  unidadeId?: string;
  uploadedBy?: string;
  uploadedByNome?: string;
  disabled?: boolean;
}

const initialForm = {
  nome_exame: "",
  tipo_exame: "laboratorial",
  laboratorio: "",
  data_solicitacao: "",
  data_coleta: "",
  data_resultado: "",
  medico_solicitante: "",
  status: "pendente",
  tipo_atendimento_vinculado: "rotina",
  valor_encontrado: "",
  valor_referencia: "",
  unidade_medida: "",
  interpretacao: "normal",
  laudo: "",
  observacoes_medicas: "",
};

const ResultadosExames: React.FC<ResultadosExamesProps> = ({
  prontuarioId, pacienteId, agendamentoId, tipoAtendimento,
  unidadeId, uploadedBy, uploadedByNome, disabled,
}) => {
  const [exames, setExames] = useState<ResultadoExame[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...initialForm });
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [savingAnexo, setSavingAnexo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ResultadoExame | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  const reload = useCallback(async () => {
    if (!pacienteId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("prontuario_resultados_exames")
        .select("*")
        .eq("paciente_id", pacienteId)
        .order("data_resultado", { ascending: false, nullsFirst: false })
        .order("criado_em", { ascending: false });
      if (error) throw error;
      setExames((data || []) as ResultadoExame[]);
    } catch (err) {
      console.error("[exames]", err);
    } finally {
      setLoading(false);
    }
  }, [pacienteId]);

  useEffect(() => { reload(); }, [reload]);

  const openNew = () => {
    setEditingId(null);
    setForm({
      ...initialForm,
      tipo_atendimento_vinculado: tipoAtendimento || "rotina",
      medico_solicitante: uploadedByNome || "",
    });
    setAnexoFile(null);
    setModalOpen(true);
  };

  const openEdit = (e: ResultadoExame) => {
    setEditingId(e.id);
    setForm({
      nome_exame: e.nome_exame,
      tipo_exame: e.tipo_exame,
      laboratorio: e.laboratorio,
      data_solicitacao: e.data_solicitacao || "",
      data_coleta: e.data_coleta || "",
      data_resultado: e.data_resultado || "",
      medico_solicitante: e.medico_solicitante,
      status: e.status,
      tipo_atendimento_vinculado: e.tipo_atendimento_vinculado,
      valor_encontrado: e.valor_encontrado,
      valor_referencia: e.valor_referencia,
      unidade_medida: e.unidade_medida,
      interpretacao: e.interpretacao,
      laudo: e.laudo,
      observacoes_medicas: e.observacoes_medicas,
    });
    setAnexoFile(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome_exame.trim()) {
      toast.error("Informe o nome do exame");
      return;
    }
    if (!pacienteId) {
      toast.error("Paciente não definido");
      return;
    }

    setSavingAnexo(true);
    try {
      let anexo_storage_path = "";
      let anexo_nome_arquivo = "";

      // Upload anexo se houver
      if (anexoFile) {
        if (anexoFile.size > 15 * 1024 * 1024) {
          toast.error("Arquivo maior que 15MB");
          setSavingAnexo(false);
          return;
        }
        const safeName = anexoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${pacienteId}/exames/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, anexoFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: anexoFile.type || "application/octet-stream",
        });
        if (upErr) {
          toast.error("Falha ao enviar anexo");
          setSavingAnexo(false);
          return;
        }
        anexo_storage_path = path;
        anexo_nome_arquivo = anexoFile.name;
      }

      const payload: any = {
        prontuario_id: prontuarioId || null,
        paciente_id: pacienteId,
        agendamento_id: agendamentoId || "",
        unidade_id: unidadeId || "",
        nome_exame: form.nome_exame.trim(),
        tipo_exame: form.tipo_exame,
        laboratorio: form.laboratorio.trim(),
        data_solicitacao: form.data_solicitacao || null,
        data_coleta: form.data_coleta || null,
        data_resultado: form.data_resultado || null,
        medico_solicitante: form.medico_solicitante.trim(),
        medico_solicitante_id: uploadedBy || "",
        status: form.status,
        tipo_atendimento_vinculado: form.tipo_atendimento_vinculado,
        valor_encontrado: form.valor_encontrado.trim(),
        valor_referencia: form.valor_referencia.trim(),
        unidade_medida: form.unidade_medida.trim(),
        interpretacao: form.interpretacao,
        laudo: form.laudo.trim(),
        observacoes_medicas: form.observacoes_medicas.trim(),
      };

      if (anexo_storage_path) {
        payload.anexo_storage_path = anexo_storage_path;
        payload.anexo_nome_arquivo = anexo_nome_arquivo;
      }

      if (editingId) {
        const { error } = await (supabase as any)
          .from("prontuario_resultados_exames")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Exame atualizado");
      } else {
        payload.criado_por = uploadedBy || "";
        payload.criado_por_nome = uploadedByNome || "";
        const { error } = await (supabase as any)
          .from("prontuario_resultados_exames")
          .insert(payload);
        if (error) throw error;
        toast.success("Exame registrado");
      }

      setModalOpen(false);
      await reload();
    } catch (err: any) {
      console.error("[exames save]", err);
      toast.error("Falha ao salvar exame");
    } finally {
      setSavingAnexo(false);
    }
  };

  const handleDelete = async (e: ResultadoExame) => {
    try {
      if (e.anexo_storage_path) {
        await supabase.storage.from(BUCKET).remove([e.anexo_storage_path]);
      }
      const { error } = await (supabase as any)
        .from("prontuario_resultados_exames")
        .delete()
        .eq("id", e.id);
      if (error) throw error;
      toast.success("Exame removido");
      setConfirmDelete(null);
      reload();
    } catch (err) {
      toast.error("Falha ao remover");
    }
  };

  const handleViewAnexo = async (e: ResultadoExame) => {
    if (!e.anexo_storage_path) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(e.anexo_storage_path, 600);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o anexo");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownloadAnexo = async (e: ResultadoExame) => {
    if (!e.anexo_storage_path) return;
    const { data, error } = await supabase.storage.from(BUCKET).download(e.anexo_storage_path);
    if (error || !data) {
      toast.error("Falha ao baixar");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = e.anexo_nome_arquivo || "anexo";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const formatDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  const filteredExames = filterStatus === "todos"
    ? exames
    : exames.filter(e => e.status === filterStatus);

  const statusCounts = STATUS_OPTIONS.map(s => ({
    ...s,
    count: exames.filter(e => e.status === s.value).length,
  }));

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-primary/5 via-muted/40 to-transparent border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Resultados de Exames</h4>
            <p className="text-[10px] text-muted-foreground">{exames.length} registro(s) no histórico</p>
          </div>
        </div>
        {!disabled && (
          <Button size="sm" onClick={openNew} className="h-8">
            <Plus className="w-3.5 h-3.5 mr-1" /> Novo Exame
          </Button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {disabled && (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-center">
            <FlaskConical className="w-6 h-6 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">Selecione um paciente para liberar os resultados de exames</p>
            <p className="text-[11px] text-muted-foreground mt-1">Depois disso você poderá registrar exames, anexar arquivos e acompanhar o histórico.</p>
          </div>
        )}

        {/* Status counters / filters */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterStatus("todos")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
              filterStatus === "todos"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            Todos · {exames.length}
          </button>
          {statusCounts.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.value}
                onClick={() => setFilterStatus(s.value)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all flex items-center gap-1 ${
                  filterStatus === s.value
                    ? s.color + " ring-1 ring-current"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                <Icon className="w-3 h-3" /> {s.label} · {s.count}
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando exames...
          </div>
        ) : filteredExames.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground italic">
            <FlaskConical className="w-8 h-8 mx-auto opacity-30 mb-2" />
            {filterStatus === "todos" ? "Nenhum exame registrado" : "Nenhum exame neste filtro"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredExames.map(e => {
              const tipoCfg = TIPOS_EXAME.find(t => t.value === e.tipo_exame) || TIPOS_EXAME[0];
              const statusCfg = STATUS_OPTIONS.find(s => s.value === e.status) || STATUS_OPTIONS[0];
              const interpCfg = INTERPRETACOES.find(i => i.value === e.interpretacao) || INTERPRETACOES[0];
              const TipoIcon = tipoCfg.icon;
              const StatusIcon = statusCfg.icon;
              const tipoAtCfg = TIPOS_ATENDIMENTO.find(t => t.value === e.tipo_atendimento_vinculado);

              return (
                <div
                  key={e.id}
                  className="group rounded-lg border border-border/60 bg-card hover:border-primary/30 hover:shadow-sm transition-all overflow-hidden"
                >
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0 ${tipoCfg.color}`}>
                        <TipoIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="text-sm font-semibold text-foreground truncate">{e.nome_exame}</h5>
                          <Badge variant="outline" className={`text-[10px] h-5 px-1.5 border ${statusCfg.color}`}>
                            <StatusIcon className="w-2.5 h-2.5 mr-1" />
                            {statusCfg.label}
                          </Badge>
                          {tipoAtCfg && (
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                              {tipoAtCfg.label}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Resultado: {formatDate(e.data_resultado)}
                          </span>
                          {e.laboratorio && <span>· {e.laboratorio}</span>}
                          {e.medico_solicitante && <span>· Sol.: {e.medico_solicitante}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {e.anexo_storage_path && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleViewAnexo(e)} title="Visualizar anexo">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDownloadAnexo(e)} title="Baixar anexo">
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        {!disabled && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(e)} title="Editar">
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => setConfirmDelete(e)} title="Remover">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Resultado destacado */}
                    {(e.valor_encontrado || e.valor_referencia || e.laudo) && (
                      <div className="mt-2.5 pl-12 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {e.valor_encontrado && (
                          <div className="rounded-md bg-muted/40 px-2 py-1.5">
                            <p className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Valor</p>
                            <p className={`text-sm font-bold ${interpCfg.color}`}>
                              {e.valor_encontrado} {e.unidade_medida && <span className="text-xs font-normal text-muted-foreground">{e.unidade_medida}</span>}
                            </p>
                          </div>
                        )}
                        {e.valor_referencia && (
                          <div className="rounded-md bg-muted/40 px-2 py-1.5">
                            <p className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Referência</p>
                            <p className="text-sm font-medium text-foreground">{e.valor_referencia}</p>
                          </div>
                        )}
                        <div className="rounded-md bg-muted/40 px-2 py-1.5">
                          <p className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Interpretação</p>
                          <p className={`text-sm font-semibold ${interpCfg.color}`}>{interpCfg.label}</p>
                        </div>
                      </div>
                    )}

                    {e.laudo && (
                      <div className="mt-2 pl-12">
                        <p className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider mb-0.5">Laudo</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-3">{e.laudo}</p>
                      </div>
                    )}

                    {e.observacoes_medicas && (
                      <div className="mt-1.5 pl-12">
                        <p className="text-[11px] text-muted-foreground italic line-clamp-2">💬 {e.observacoes_medicas}</p>
                      </div>
                    )}

                    {e.anexo_nome_arquivo && (
                      <div className="mt-2 pl-12 flex items-center gap-1.5 text-[11px] text-primary">
                        <Paperclip className="w-3 h-3" />
                        <span className="truncate">{e.anexo_nome_arquivo}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de edição/criação */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-primary" />
              {editingId ? "Editar Exame" : "Novo Resultado de Exame"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Identificação */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Nome do Exame *</Label>
                <Input
                  value={form.nome_exame}
                  onChange={e => setForm({ ...form, nome_exame: e.target.value })}
                  placeholder="Ex: Hemograma completo, Raio-X tórax..."
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Tipo de Exame</Label>
                <Select value={form.tipo_exame} onValueChange={v => setForm({ ...form, tipo_exame: v })}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_EXAME.map(t => {
                      const I = t.icon;
                      return (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex items-center gap-2">
                            <I className={`w-3.5 h-3.5 ${t.color}`} /> {t.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Laboratório</Label>
                <Input
                  value={form.laboratorio}
                  onChange={e => setForm({ ...form, laboratorio: e.target.value })}
                  placeholder="Ex: Lab Municipal"
                  className="h-9 mt-1"
                />
              </div>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Data Solicitação</Label>
                <Input
                  type="date"
                  value={form.data_solicitacao}
                  onChange={e => setForm({ ...form, data_solicitacao: e.target.value })}
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Data Coleta</Label>
                <Input
                  type="date"
                  value={form.data_coleta}
                  onChange={e => setForm({ ...form, data_coleta: e.target.value })}
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Data Resultado</Label>
                <Input
                  type="date"
                  value={form.data_resultado}
                  onChange={e => setForm({ ...form, data_resultado: e.target.value })}
                  className="h-9 mt-1"
                />
              </div>
            </div>

            {/* Profissional + Status + Tipo atendimento */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Médico Solicitante</Label>
                <Input
                  value={form.medico_solicitante}
                  onChange={e => setForm({ ...form, medico_solicitante: e.target.value })}
                  placeholder="Dr(a)..."
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo de Atendimento</Label>
                <Select value={form.tipo_atendimento_vinculado} onValueChange={v => setForm({ ...form, tipo_atendimento_vinculado: v })}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_ATENDIMENTO.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Resultado */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Resultado do Exame</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Valor Encontrado</Label>
                  <Input
                    value={form.valor_encontrado}
                    onChange={e => setForm({ ...form, valor_encontrado: e.target.value })}
                    placeholder="Ex: 14.2"
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Unidade</Label>
                  <Input
                    value={form.unidade_medida}
                    onChange={e => setForm({ ...form, unidade_medida: e.target.value })}
                    placeholder="g/dL, mg/dL..."
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Valor de Referência</Label>
                  <Input
                    value={form.valor_referencia}
                    onChange={e => setForm({ ...form, valor_referencia: e.target.value })}
                    placeholder="Ex: 12-16"
                    className="h-9 mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Interpretação</Label>
                <Select value={form.interpretacao} onValueChange={v => setForm({ ...form, interpretacao: v })}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERPRETACOES.map(i => (
                      <SelectItem key={i.value} value={i.value}>
                        <span className={i.color}>{i.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Laudo</Label>
                <Textarea
                  rows={3}
                  value={form.laudo}
                  onChange={e => setForm({ ...form, laudo: e.target.value })}
                  placeholder="Texto do laudo do exame..."
                  className="mt-1 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Observações Médicas</Label>
                <Textarea
                  rows={2}
                  value={form.observacoes_medicas}
                  onChange={e => setForm({ ...form, observacoes_medicas: e.target.value })}
                  placeholder="Anotações clínicas, conduta sugerida..."
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            {/* Anexo */}
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
              <Label className="text-xs flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Anexar Resultado (PDF, imagem...)
              </Label>
              <Input
                type="file"
                accept="image/*,application/pdf,.doc,.docx"
                onChange={e => setAnexoFile(e.target.files?.[0] || null)}
                className="h-9 mt-2 text-xs file:mr-2 file:text-xs"
              />
              {anexoFile && (
                <p className="text-[11px] text-emerald-600 mt-1.5">
                  ✓ {anexoFile.name} ({(anexoFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
              {editingId && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Selecione um novo arquivo apenas se quiser substituir o atual.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={savingAnexo}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={savingAnexo}>
              {savingAnexo && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? "Salvar alterações" : "Registrar exame"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este exame?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá <strong>{confirmDelete?.nome_exame}</strong> do histórico
              {confirmDelete?.anexo_storage_path && " e seu anexo associado"}.
              Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && handleDelete(confirmDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ResultadosExames;
