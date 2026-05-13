import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Loader2, Eye, EyeOff, UserPlus, Ticket, Search, Calendar as CalendarIcon, Clock, Filter, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";

interface ExternalProf {
  id: string;
  auth_user_id: string | null;
  nome: string;
  email: string;
  telefone?: string;
  documento_registro?: string;
  unidade_origem?: string;
  responsavel?: string;
  observacoes?: string;
  unidade_id: string;
  ativo: boolean;
  validade_acesso?: string;
  permissoes?: {
    can_schedule: boolean;
    can_view_own: boolean;
    can_cancel: boolean;
    can_edit_patient: boolean;
    can_create_patient: boolean;
    can_select_patient: boolean;
    can_attach_docs: boolean;
    can_use_online_agenda: boolean;
  };
  criado_em: string;
}

interface QuotaRow {
  id: string;
  profissional_externo_id: string;
  profissional_interno_id: string;
  especialidade?: string;
  unidade_id: string;
  dia_semana?: number;
  turno?: string;
  hora_inicio?: string;
  hora_fim?: string;
  vagas_total: number;
  vagas_usadas: number;
  periodo_inicio: string;
  periodo_fim: string;
  ativo?: boolean;
}

const ProfissionaisExternos: React.FC = () => {
  const { user } = useAuth();
  const { unidades, funcionarios } = useData();
  const { unidadesVisiveis } = useUnidadeFilter();
  const { can } = usePermissions();
  const canManage = can("funcionarios", "can_edit");

  const [externos, setExternos] = useState<ExternalProf[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showSenha, setShowSenha] = useState(false);
  const [form, setForm] = useState({ 
    nome: "", 
    email: "", 
    senha: "", 
    unidade_id: "",
    telefone: "",
    documento_registro: "",
    unidade_origem: "",
    responsavel: "",
    observacoes: "",
    validade_acesso: "",
    permissoes: {
      can_schedule: true,
      can_view_own: true,
      can_cancel: true,
      can_edit_patient: true,
      can_create_patient: true,
      can_select_patient: true,
      can_attach_docs: false,
      can_use_online_agenda: false
    }
  });

  // Quotas
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [selectedExternoId, setSelectedExternoId] = useState<string>("");
  const [selectedProfIds, setSelectedProfIds] = useState<string[]>([]);
  const [vagasPorProf, setVagasPorProf] = useState<Record<string, number>>({});
  const [bodyQuota, setBodyQuota] = useState({
    unidade_id: "",
    especialidade: "",
    turno: "Integral",
    hora_inicio: "",
    hora_fim: "",
    periodo_inicio: new Date().toISOString().slice(0, 10),
    periodo_fim: `${new Date().getFullYear()}-12-31`,
  });
  const [savingQuota, setSavingQuota] = useState(false);
  const [editingQuotaId, setEditingQuotaId] = useState<string | null>(null);
  const [quotaEditModalOpen, setQuotaEditModalOpen] = useState(false);
  const [quotaEditForm, setQuotaEditForm] = useState({
    vagas_total: 5,
    turno: "Integral",
    especialidade: "",
    unidade_id: "",
    hora_inicio: "",
    hora_fim: "",
    periodo_inicio: "",
    periodo_fim: "",
    ativo: true,
    vagas_usadas: 0,
  });

  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedExtForDetails, setSelectedExtForDetails] = useState<ExternalProf | null>(null);
  const [detailsTab, setDetailsTab] = useState("cotas");
  const [extAgendamentos, setExtAgendamentos] = useState<any[]>([]);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);

  const loadAgendamentos = async (externoId: string) => {
    setLoadingAgendamentos(true);
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("agendado_por_externo", externoId)
        .order("data", { ascending: false });
      
      if (error) throw error;
      setExtAgendamentos(data || []);
    } catch (err) {
      console.error("[Funcionários Externos] Erro ao carregar agendamentos", err);
      toast.error("Erro ao carregar agenda.");
    } finally {
      setLoadingAgendamentos(false);
    }
  };

  const openDetails = (ext: ExternalProf, tab: string = "cotas") => {
    setSelectedExtForDetails(ext);
    setDetailsTab(tab);
    setDetailsDialogOpen(true);
    if (tab === "agenda") {
      loadAgendamentos(ext.id);
    }
  };

  const loadExternos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("manage-external", { body: { action: "list" } });
      setExternos(data?.profissionais || []);
      const { data: quotasData } = await supabase.from("quotas_externas").select("*");
      setQuotas(quotasData || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadExternos(); }, [loadExternos]);

  const openNew = () => {
    setEditId(null);
    setForm({ 
      nome: "", email: "", senha: "", unidade_id: "",
      telefone: "", documento_registro: "", unidade_origem: "",
      responsavel: "", observacoes: "", validade_acesso: "",
      permissoes: {
        can_schedule: true, can_view_own: true, can_cancel: true,
        can_edit_patient: true, can_create_patient: true,
        can_select_patient: true, can_attach_docs: false,
        can_use_online_agenda: false
      }
    });
    setDialogOpen(true);
  };

  const openEdit = (e: ExternalProf) => {
    setEditId(e.id);
    setForm({ 
      nome: e.nome, email: e.email, senha: "", unidade_id: e.unidade_id,
      telefone: e.telefone || "", documento_registro: e.documento_registro || "",
      unidade_origem: e.unidade_origem || "", responsavel: e.responsavel || "",
      observacoes: e.observacoes || "", 
      validade_acesso: e.validade_acesso ? e.validade_acesso.slice(0, 10) : "",
      permissoes: e.permissoes || {
        can_schedule: true, can_view_own: true, can_cancel: true,
        can_edit_patient: true, can_create_patient: true,
        can_select_patient: true, can_attach_docs: false,
        can_use_online_agenda: false
      }
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome || !form.email) { toast.error("Nome e e-mail são obrigatórios."); return; }
    setSaving(true);
    try {
      if (editId) {
        const body: any = { 
          action: "update", 
          id: editId, 
          ...form 
        };
        delete body.senha;
        if (form.senha) body.senha = form.senha;
        const { data, error } = await supabase.functions.invoke("manage-external", { body });
        if (error || data?.error) { toast.error(data?.error || "Erro."); setSaving(false); return; }
        toast.success("Profissional externo atualizado!");
      } else {
        if (!form.senha) { toast.error("Senha obrigatória para novo cadastro."); setSaving(false); return; }
        const { data, error } = await supabase.functions.invoke("manage-external", {
          body: { 
            action: "create", 
            ...form,
            criado_por: user?.id || "" 
          },
        });
        if (error || data?.error) { toast.error(data?.error || "Erro."); setSaving(false); return; }
        toast.success("Profissional externo cadastrado!");
      }
      setDialogOpen(false);
      await loadExternos();
    } catch { toast.error("Erro ao salvar."); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-external", { body: { action: "delete", id } });
      if (error || data?.error) { toast.error("Erro ao excluir."); return; }
      toast.success("Excluído!");
      await loadExternos();
    } catch { toast.error("Erro."); }
  };

  const handleToggleActive = async (ext: ExternalProf) => {
    const { data, error } = await supabase.functions.invoke("manage-external", {
      body: { action: "update", id: ext.id, ativo: !ext.ativo },
    });
    if (!error && !data?.error) {
      toast.success(ext.ativo ? "Desativado" : "Ativado");
      await loadExternos();
    }
  };

  // Quota management – multi-select
  const openQuotaDialog = (externoId: string) => {
    setSelectedExternoId(externoId);
    // Pre-select already configured professionals
    const existing = quotas.filter(q => q.profissional_externo_id === externoId);
    const existingIds = existing.map(q => q.profissional_interno_id);
    // Only show unconfigured professionals as candidates
    setSelectedProfIds([]);
    setVagasPorProf({});
    setQuotaDialogOpen(true);
  };

  const toggleProfSelection = (profId: string) => {
    setSelectedProfIds(prev => {
      if (prev.includes(profId)) {
        const next = prev.filter(id => id !== profId);
        setVagasPorProf(v => { const copy = { ...v }; delete copy[profId]; return copy; });
        return next;
      }
      setVagasPorProf(v => ({ ...v, [profId]: 5 }));
      return [...prev, profId];
    });
  };

  const handleSaveQuotas = async () => {
    if (selectedProfIds.length === 0) {
      toast.error("Selecione ao menos um profissional.");
      return;
    }
    setSavingQuota(true);
    try {
      const inserts = selectedProfIds.map(profId => ({
        profissional_externo_id: selectedExternoId,
        profissional_interno_id: profId,
        unidade_id: bodyQuota.unidade_id || "",
        especialidade: bodyQuota.especialidade || "",
        vagas_total: vagasPorProf[profId] || 5,
        vagas_usadas: 0,
        turno: bodyQuota.turno || "Integral",
        hora_inicio: bodyQuota.hora_inicio || null,
        hora_fim: bodyQuota.hora_fim || null,
        periodo_inicio: bodyQuota.periodo_inicio || new Date().toISOString().slice(0, 10),
        periodo_fim: bodyQuota.periodo_fim || `${new Date().getFullYear()}-12-31`,
      }));

      const { error } = await supabase.from("quotas_externas").insert(inserts);
      if (error) throw error;
      toast.success(`${inserts.length} quota(s) adicionada(s)!`);
      setQuotaDialogOpen(false);
      await loadExternos();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar quotas.");
    }
    setSavingQuota(false);
  };

  const handleDeleteQuota = async (quotaId: string) => {
    try {
      const q = quotas.find(item => item.id === quotaId);
      if (q && q.vagas_usadas > 0) {
        const confirmou = window.confirm(`Esta cota possui ${q.vagas_usadas} agendamentos vinculados. Para preservar o histórico, ela será desativada em vez de excluída. Deseja continuar?`);
        if (!confirmou) return;
        
        const { error } = await supabase.from("quotas_externas").update({ ativo: false }).eq("id", quotaId);
        if (error) throw error;
        toast.success("Cota desativada para preservar histórico.");
      } else {
        const { error } = await supabase.from("quotas_externas").delete().eq("id", quotaId);
        if (error) throw error;
        toast.success("Quota removida.");
      }
      await loadExternos();
    } catch (err: any) {
      console.error("[Funcionários Externos] Erro ao gerenciar cota", { cotaId: quotaId, error: err });
      toast.error("Não foi possível processar a solicitação.");
    }
  };

  const handleEditQuota = (q: QuotaRow) => {
    setEditingQuotaId(q.id);
    setQuotaEditForm({
      vagas_total: q.vagas_total,
      vagas_usadas: q.vagas_usadas,
      turno: q.turno || "Integral",
      especialidade: q.especialidade || "",
      unidade_id: q.unidade_id || "",
      hora_inicio: q.hora_inicio || "",
      hora_fim: q.hora_fim || "",
      periodo_inicio: q.periodo_inicio || "",
      periodo_fim: q.periodo_fim || "",
      ativo: q.ativo !== undefined ? (q as any).ativo : true,
    });
    setQuotaEditModalOpen(true);
  };

  const handleSaveQuotaEdit = async () => {
    if (!editingQuotaId) return;
    
    if (quotaEditForm.vagas_total < quotaEditForm.vagas_usadas) {
      toast.error(`Não é possível reduzir para ${quotaEditForm.vagas_total} vagas, pois já existem ${quotaEditForm.vagas_usadas} agendamentos vinculados a esta cota.`);
      return;
    }

    setSavingQuota(true);
    try {
      const { error } = await supabase
        .from("quotas_externas")
        .update({
          vagas_total: quotaEditForm.vagas_total,
          turno: quotaEditForm.turno,
          especialidade: quotaEditForm.especialidade,
          unidade_id: quotaEditForm.unidade_id,
          hora_inicio: quotaEditForm.hora_inicio || null,
          hora_fim: quotaEditForm.hora_fim || null,
          periodo_inicio: quotaEditForm.periodo_inicio,
          periodo_fim: quotaEditForm.periodo_fim,
          ativo: quotaEditForm.ativo,
        })
        .eq("id", editingQuotaId);

      if (error) throw error;
      toast.success("Cota atualizada com sucesso!");
      setQuotaEditModalOpen(false);
      await loadExternos();
    } catch (err: any) {
      console.error("[Funcionários Externos] Erro ao editar cota", { cotaId: editingQuotaId, error: err });
      toast.error("Erro ao atualizar cota.");
    } finally {
      setSavingQuota(false);
    }
  };

  const handleToggleQuotaActive = async (q: QuotaRow) => {
    try {
      const { error } = await supabase
        .from("quotas_externas")
        .update({ ativo: !(q as any).ativo })
        .eq("id", q.id);
      
      if (error) throw error;
      toast.success( (q as any).ativo ? "Cota desativada" : "Cota ativada");
      await loadExternos();
    } catch (err: any) {
      console.error("[Funcionários Externos] Erro ao alternar status da cota", err);
      toast.error("Erro ao alterar status.");
    }
  };

  const profissionaisInternos = useMemo(() => funcionarios.filter((f: any) => f.role === "profissional" && f.ativo), [funcionarios]);

  const filteredExternos = externos.filter(e => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return e.nome.toLowerCase().includes(term) || e.email.toLowerCase().includes(term);
  });

  // For quota dialog: filter out professionals that already have a quota for this external
  const availableForQuota = useMemo(() => profissionaisInternos.filter((f: any) =>
    !quotas.some(q => q.profissional_externo_id === selectedExternoId && q.profissional_interno_id === f.id)
  ), [profissionaisInternos, quotas, selectedExternoId]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Profissionais Externos</h1>
          <p className="text-muted-foreground text-sm">{filteredExternos.length} de {externos.length} cadastrados</p>
        </div>
        {canManage && (
          <Button onClick={openNew} className="gradient-primary text-primary-foreground">
            <UserPlus className="w-4 h-4 mr-2" /> Novo Externo
          </Button>
        )}
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, e-mail..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filteredExternos.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{externos.length === 0 ? "Nenhum profissional externo cadastrado." : "Nenhum resultado encontrado."}</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filteredExternos.map(ext => {
            const unidade = unidades.find((u: any) => u.id === ext.unidade_id);
            const extQuotas = quotas.filter(q => q.profissional_externo_id === ext.id);
            return (
              <Card key={ext.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-foreground">{ext.nome}</p>
                        <Badge variant={ext.ativo ? "default" : "secondary"}>{ext.ativo ? "Ativo" : "Inativo"}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{ext.email}</p>
                      {unidade && <p className="text-xs text-muted-foreground">Unidade: {unidade.nome}</p>}
                      
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-[11px] gap-1.5"
                          onClick={() => openDetails(ext, "cotas")}
                        >
                          <Ticket className="w-3.5 h-3.5" />
                          Cotas Ativas: {extQuotas.length}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-[11px] gap-1.5"
                          onClick={() => openDetails(ext, "cotas")}
                        >
                          <Search className="w-3.5 h-3.5" />
                          Vagas Livres: {extQuotas.reduce((acc, q) => acc + (q.vagas_total - q.vagas_usadas), 0)}/{extQuotas.reduce((acc, q) => acc + q.vagas_total, 0)}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-[11px] gap-1.5"
                          onClick={() => openDetails(ext, "agenda")}
                        >
                          <CalendarIcon className="w-3.5 h-3.5" />
                          Agenda
                        </Button>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openQuotaDialog(ext.id)} title="Gerenciar Quotas">
                          <Ticket className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(ext)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleToggleActive(ext)}>
                          {ext.ativo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir {ext.nome}?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(ext.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>

                  {/* Quotas for this external */}
                  {extQuotas.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground">COTAS E TURNOS</p>
                        <Badge variant="outline" className="text-[10px]">{extQuotas.length} vinculada(s)</Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {extQuotas.map(q => {
                          const prof = profissionaisInternos.find((f: any) => f.id === q.profissional_interno_id);
                          const restantes = q.vagas_total - q.vagas_usadas;
                          return (
                            <div key={q.id} className="flex flex-col p-2 rounded bg-accent/30 text-sm border border-border/50">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium truncate max-w-[150px]">{prof?.nome || "—"}</span>
                                <div className="flex items-center gap-1">
                                  {canManage && (
                                    <Button size="icon" variant="ghost" className="h-5 w-5 hover:text-destructive" onClick={() => handleDeleteQuota(q.id)}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{q.turno || 'Integral'} {q.hora_inicio ? `(${q.hora_inicio.slice(0, 5)}-${q.hora_fim?.slice(0, 5)})` : ''}</span>
                                <Badge variant={restantes > 0 ? "default" : "destructive"} className="h-4 text-[9px] px-1">
                                  {restantes}/{q.vagas_total}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit External Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Cadastrar"} Profissional Externo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-3">
              <h3 className="font-semibold text-sm border-b pb-1">Dados Básicos</h3>
              <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
              <div><Label>E-mail *</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} /></div>
              <div><Label>Documento/Registro</Label><Input value={form.documento_registro} onChange={e => setForm(p => ({ ...p, documento_registro: e.target.value }))} /></div>
              <div><Label>Unidade de Origem</Label><Input value={form.unidade_origem} onChange={e => setForm(p => ({ ...p, unidade_origem: e.target.value }))} /></div>
              <div><Label>Responsável</Label><Input value={form.responsavel} onChange={e => setForm(p => ({ ...p, responsavel: e.target.value }))} /></div>
              <div><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} /></div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm border-b pb-1">Acesso e Permissões</h3>
              <div>
                <Label>{editId ? "Nova Senha (opcional)" : "Senha *"}</Label>
                <div className="relative">
                  <Input type={showSenha ? "text" : "password"} value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} placeholder="Min. 6 caracteres" className="pr-10" />
                  <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Unidade Destino</Label>
                <Select value={form.unidade_id} onValueChange={v => setForm(p => ({ ...p, unidade_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{unidadesVisiveis.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Validade do Acesso</Label><Input type="date" value={form.validade_acesso} onChange={e => setForm(p => ({ ...p, validade_acesso: e.target.value }))} /></div>
              
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold text-muted-foreground">PERMISSÕES</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'can_schedule', label: 'Pode agendar?' },
                    { id: 'can_view_own', label: 'Ver próprios agendamentos?' },
                    { id: 'can_cancel', label: 'Pode cancelar?' },
                    { id: 'can_edit_patient', label: 'Editar paciente?' },
                    { id: 'can_create_patient', label: 'Cadastrar paciente?' },
                    { id: 'can_select_patient', label: 'Selecionar paciente?' },
                  ].map(perm => (
                    <div key={perm.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={perm.id} 
                        checked={(form.permissoes as any)[perm.id]} 
                        onCheckedChange={(v) => setForm(p => ({ ...p, permissoes: { ...p.permissoes, [perm.id]: !!v } }))}
                      />
                      <Label htmlFor={perm.id} className="text-sm cursor-pointer">{perm.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Salvar
          </Button>
        </DialogContent>
      </Dialog>

      {/* Add Quota Dialog – Multi-select */}
      <Dialog open={quotaDialogOpen} onOpenChange={setQuotaDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Adicionar Quotas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 pb-3 border-b">
              <div className="col-span-2">
                <Label className="text-xs">Unidade Destino</Label>
                <Select value={bodyQuota.unidade_id} onValueChange={v => setBodyQuota(p => ({ ...p, unidade_id: v }))}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{unidadesVisiveis.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Turno</Label>
                <Select value={bodyQuota.turno} onValueChange={v => setBodyQuota(p => ({ ...p, turno: v }))}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manhã">Manhã</SelectItem>
                    <SelectItem value="Tarde">Tarde</SelectItem>
                    <SelectItem value="Noite">Noite</SelectItem>
                    <SelectItem value="Integral">Integral</SelectItem>
                    <SelectItem value="Personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Especialidade</Label>
                <Input className="h-8" value={bodyQuota.especialidade} onChange={e => setBodyQuota(p => ({ ...p, especialidade: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Hora Início</Label>
                <Input type="time" className="h-8" value={bodyQuota.hora_inicio} onChange={e => setBodyQuota(p => ({ ...p, hora_inicio: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Hora Fim</Label>
                <Input type="time" className="h-8" value={bodyQuota.hora_fim} onChange={e => setBodyQuota(p => ({ ...p, hora_fim: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="date" className="h-8" value={bodyQuota.periodo_inicio} onChange={e => setBodyQuota(p => ({ ...p, periodo_inicio: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Input type="date" className="h-8" value={bodyQuota.periodo_fim} onChange={e => setBodyQuota(p => ({ ...p, periodo_fim: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Selecione os profissionais internos que receberão estas cotas:
            </p>

            {availableForQuota.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Todos os profissionais já possuem quota configurada para este externo.
              </p>
            ) : (
              <div className="space-y-2">
                {availableForQuota.map((f: any) => {
                  const isSelected = selectedProfIds.includes(f.id);
                  return (
                    <div key={f.id} className={`rounded-lg border p-3 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleProfSelection(f.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{f.nome}</p>
                          <p className="text-xs text-muted-foreground">{f.profissao || f.cargo || ""}</p>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Label className="text-xs whitespace-nowrap">Vagas:</Label>
                            <Input
                              type="number"
                              min={1}
                              value={vagasPorProf[f.id] || 5}
                              onChange={e => setVagasPorProf(v => ({ ...v, [f.id]: Math.max(1, Number(e.target.value)) }))}
                              className="w-16 h-8 text-center text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedProfIds.length > 0 && (
              <div className="bg-accent/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">RESUMO</p>
                {selectedProfIds.map(id => {
                  const prof = profissionaisInternos.find((f: any) => f.id === id);
                  return (
                    <p key={id} className="text-sm">
                      {prof?.nome || "—"}: <strong>{vagasPorProf[id] || 5} vagas</strong>
                    </p>
                  );
                })}
              </div>
            )}

            <Button
              onClick={handleSaveQuotas}
              disabled={savingQuota || selectedProfIds.length === 0}
              className="w-full gradient-primary text-primary-foreground"
            >
              {savingQuota && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Adicionar {selectedProfIds.length > 0 ? `${selectedProfIds.length} Quota(s)` : "Quotas"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Details/Agenda/Cotas Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Painel do Profissional: {selectedExtForDetails?.nome}</DialogTitle>
          </DialogHeader>
          
          <Tabs value={detailsTab} onValueChange={(v) => { setDetailsTab(v); if (v === "agenda" && selectedExtForDetails) loadAgendamentos(selectedExtForDetails.id); }} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="cotas">Cotas Ativas</TabsTrigger>
              <TabsTrigger value="agenda">Agenda do Externo</TabsTrigger>
              <TabsTrigger value="resumo">Resumo de Vagas</TabsTrigger>
            </TabsList>
            
            <TabsContent value="cotas" className="mt-4">
              <div className="space-y-3">
                {quotas.filter(q => q.profissional_externo_id === selectedExtForDetails?.id).length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Nenhuma cota configurada.</p>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left">Profissional Destino</th>
                          <th className="px-4 py-2 text-left">Turno</th>
                          <th className="px-4 py-2 text-center">Vagas</th>
                          <th className="px-4 py-2 text-center">Usadas</th>
                          <th className="px-4 py-2 text-center">Livres</th>
                          <th className="px-4 py-2 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {quotas.filter(q => q.profissional_externo_id === selectedExtForDetails?.id).map(q => {
                          const prof = profissionaisInternos.find(f => f.id === q.profissional_interno_id);
                          return (
                            <tr key={q.id}>
                              <td className="px-4 py-3">
                                <p className="font-medium">{prof?.nome || "—"}</p>
                                <p className="text-xs text-muted-foreground">{q.especialidade || (prof as any)?.profissao}</p>
                              </td>
                              <td className="px-4 py-3">{q.turno}</td>
                              <td className="px-4 py-3 text-center font-semibold">{q.vagas_total}</td>
                              <td className="px-4 py-3 text-center text-primary">{q.vagas_usadas}</td>
                              <td className="px-4 py-3 text-center text-success">{q.vagas_total - q.vagas_usadas}</td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => handleEditQuota(q)}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className={`h-8 w-8 ${q.ativo ? 'text-destructive' : 'text-success'}`} onClick={() => handleToggleQuotaActive(q)}>
                                    {q.ativo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteQuota(q.id)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="agenda" className="mt-4">
              {loadingAgendamentos ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : extAgendamentos.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">Nenhum agendamento externo encontrado para este funcionário.</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3 pr-4">
                    {extAgendamentos.map(a => (
                      <Card key={a.id} className="shadow-sm">
                        <CardContent className="p-3 flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{a.paciente_nome}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {new Date(a.data + "T12:00:00").toLocaleDateString()}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {a.hora}</span>
                            </div>
                            <p className="text-[11px] mt-1">Destino: <span className="font-medium text-foreground">{a.profissional_nome}</span></p>
                          </div>
                          <Badge className="capitalize">{a.status.replace("_", " ")}</Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
            
            <TabsContent value="resumo" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase font-bold">Vagas Liberadas</p>
                    <p className="text-3xl font-display font-bold mt-2">{quotas.filter(q => q.profissional_externo_id === selectedExtForDetails?.id).reduce((acc, q) => acc + q.vagas_total, 0)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase font-bold">Vagas Usadas</p>
                    <p className="text-3xl font-display font-bold mt-2 text-primary">{quotas.filter(q => q.profissional_externo_id === selectedExtForDetails?.id).reduce((acc, q) => acc + q.vagas_usadas, 0)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-success/5 border-success/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase font-bold">Vagas Livres</p>
                    <p className="text-3xl font-display font-bold mt-2 text-success">{quotas.filter(q => q.profissional_externo_id === selectedExtForDetails?.id).reduce((acc, q) => acc + (q.vagas_total - q.vagas_usadas), 0)}</p>
                  </CardContent>
                </Card>
              </div>
              
              <div className="mt-6">
                <h4 className="text-sm font-bold mb-3">Vagas por Turno</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {["Manhã", "Tarde", "Noite", "Integral"].map(turno => {
                    const tQuotas = quotas.filter(q => q.profissional_externo_id === selectedExtForDetails?.id && q.turno === turno);
                    if (tQuotas.length === 0) return null;
                    const total = tQuotas.reduce((acc, q) => acc + q.vagas_total, 0);
                    const usadas = tQuotas.reduce((acc, q) => acc + q.vagas_usadas, 0);
                    return (
                      <div key={turno} className="p-3 border rounded-lg bg-muted/30">
                        <p className="text-xs font-bold uppercase">{turno}</p>
                        <p className="text-lg font-bold mt-1">{total - usadas}/{total}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfissionaisExternos;
