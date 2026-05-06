import { PageHeader } from '@/components/layout/PageHeader';
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ModuleName, ModulePermission, usePermissions, PermissionSourceType } from "@/contexts/PermissionsContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Loader2, Shield, ShieldCheck, Search, User as UserIcon, Building2, 
  RotateCcw, Radio, LayoutGrid, ClipboardCheck, Settings2, Info,
  Unlock, Lock as LockIcon, CheckCircle2, XCircle, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { PERMISSION_REGISTRY } from "@/config/permissionsRegistry";

const PERFIS = ["gestao", "recepcao", "tecnico", "avaliacao_enfermagem", "profissional"] as const;
const PERFIL_LABELS: Record<string, string> = {
  gestao: "GESTÃO",
  recepcao: "RECEPÇÃO",
  tecnico: "TRIAGEM",
  enfermagem: "ENFERMAGEM",
  profissional: "PROFISSIONAL",
};

const MODULOS = PERMISSION_REGISTRY.map(m => m.id);
const MODULO_LABELS = PERMISSION_REGISTRY.reduce((acc, m) => ({ ...acc, [m.id]: m.label }), {} as Record<string, string>);
const ACTIONS: (keyof ModulePermission)[] = [
  "can_view", "can_create", "can_edit", "can_delete", "can_execute",
  "can_print", "can_export", "can_attach", "can_sign", "can_approve",
  "can_cancel", "can_config"
];

const ACTION_LABELS: Record<keyof ModulePermission, string> = {
  can_view: "Visualizar",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  can_execute: "Executar",
  can_print: "Imprimir",
  can_export: "Exportar",
  can_attach: "Anexar",
  can_sign: "Assinar",
  can_approve: "Aprovar",
  can_cancel: "Cancelar",
  can_config: "Configurar",
};

const SOURCE_LABELS: Record<PermissionSourceType, string> = {
  role_global: "Perfil (G)",
  role_unit: "Perfil (U)",
  user_global: "Individual (G)",
  user_unit: "Individual (U)",
  master_global: "Master Total",
  default: "Padrão Sistema"
};

interface PermRow extends ModulePermission {
  id?: string;
  perfil: string;
  modulo: string;
  unidade_id: string;
}

interface UserPermRow extends ModulePermission {
  id?: string;
  user_id: string;
  modulo: string;
  unidade_id: string;
}

interface UnidadeOption { id: string; nome: string; }
interface FuncOption { id: string; nome: string; usuario: string; role: string; unidade_id: string; }

const Permissoes: React.FC = () => {
  const { hasPermission } = useAuth();
  const { getDetail } = usePermissions();

  const [unidades, setUnidades] = useState<UnidadeOption[]>([]);
  const [selectedUnidade, setSelectedUnidade] = useState<string>("");
  const [tab, setTab] = useState("perfil");
  const [selectedPerfil, setSelectedPerfil] = useState<string>(PERFIS[0]);
  const [perfilRows, setPerfilRows] = useState<PermRow[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncOption[]>([]);
  const [searchUser, setSearchUser] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userRows, setUserRows] = useState<UserPermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [u, f] = await Promise.all([
        supabase.from("unidades").select("id, nome, ativo").eq("ativo", true).order("nome"),
        supabase.from("funcionarios").select("id, nome, usuario, role, unidade_id").eq("ativo", true).order("nome"),
      ]);
      const ulist = (u.data || []).map((x: any) => ({ id: x.id, nome: x.nome }));
      setUnidades(ulist);
      if (!selectedUnidade && ulist.length > 0) setSelectedUnidade(ulist[0].id);
      setFuncionarios((f.data || []) as FuncOption[]);
    })();
  }, []);

  const loadPerfil = useCallback(async () => {
    if (!selectedUnidade) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("permissoes")
      .select("*")
      .eq("perfil", selectedPerfil)
      .in("unidade_id", [selectedUnidade, ""]);
    if (error) {
      toast.error("Erro ao carregar permissões");
      setLoading(false);
      return;
    }
    setPerfilRows((data || []) as PermRow[]);
    setLoading(false);
  }, [selectedPerfil, selectedUnidade]);

  useEffect(() => { if (tab === "perfil") loadPerfil(); }, [loadPerfil, tab]);

  const loadUser = useCallback(async () => {
    if (!selectedUserId || !selectedUnidade) { setUserRows([]); return; }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("permissoes_usuario")
      .select("*")
      .eq("user_id", selectedUserId)
      .eq("unidade_id", selectedUnidade);
    if (error) {
      toast.error("Erro ao carregar exceções do usuário");
      setLoading(false);
      return;
    }
    setUserRows((data || []) as UserPermRow[]);
    setLoading(false);
  }, [selectedUserId, selectedUnidade]);

  useEffect(() => { if (tab === "individual") loadUser(); }, [loadUser, tab]);

  const getPerfilRow = (modulo: ModuleName): PermRow | undefined => {
    return perfilRows.find((r) => r.modulo === modulo && r.unidade_id === selectedUnidade)
      || perfilRows.find((r) => r.modulo === modulo && r.unidade_id === "");
  };

  const togglePerfil = async (modulo: ModuleName, action: keyof ModulePermission) => {
    const existing = getPerfilRow(modulo);
    const baseRow: PermRow = existing
      ? { ...existing, unidade_id: selectedUnidade }
      : { 
          perfil: selectedPerfil, modulo, unidade_id: selectedUnidade,
          can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false,
          can_print: false, can_export: false, can_attach: false, can_sign: false, can_approve: false,
          can_cancel: false, can_config: false
        };
    const newVal = !baseRow[action];
    const updated: PermRow = { ...baseRow, [action]: newVal };
    const key = `perfil-${modulo}-${action}`;
    setSaving(key);

    setPerfilRows((prev) => {
      const idx = prev.findIndex((r) => r.modulo === modulo && r.unidade_id === selectedUnidade);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = updated; return cp; }
      return [...prev, updated];
    });

    const updateData: any = { perfil: selectedPerfil, modulo, unidade_id: selectedUnidade };
    ACTIONS.forEach(a => updateData[a] = updated[a]);

    const { error } = await supabase.from("permissoes").upsert(updateData, { onConflict: "perfil,modulo,unidade_id" } as any);
    if (error) { toast.error(`Erro: ${error.message}`); loadPerfil(); } else {
      toast.success(`${MODULO_LABELS[modulo]} → ${ACTION_LABELS[action]}: ${newVal ? "ATIVADO" : "DESATIVADO"}`);
    }
    setSaving(null);
  };

  const getUserRow = (modulo: ModuleName): UserPermRow | undefined =>
    userRows.find((r) => r.modulo === modulo);

  const toggleUser = async (modulo: ModuleName, action: keyof ModulePermission) => {
    if (!selectedUserId) return;
    const existing = getUserRow(modulo);
    const userObj = funcionarios.find((f) => f.id === selectedUserId);
    
    let base: any;
    if (existing) base = { ...existing };
    else {
      const { data: perfilData } = await (supabase as any)
        .from("permissoes")
        .select("*")
        .eq("perfil", userObj?.role || "recepcao")
        .eq("modulo", modulo)
        .in("unidade_id", [selectedUnidade, ""]);
      const ref = (perfilData || []).find((r: any) => r.unidade_id === selectedUnidade) || (perfilData || []).find((r: any) => r.unidade_id === "");
      base = {
        user_id: selectedUserId, modulo, unidade_id: selectedUnidade,
        can_view: !!ref?.can_view, can_create: !!ref?.can_create,
        can_edit: !!ref?.can_edit, can_delete: !!ref?.can_delete,
        can_execute: !!ref?.can_execute, can_print: !!ref?.can_print,
        can_export: !!ref?.can_export, can_attach: !!ref?.can_attach,
        can_sign: !!ref?.can_sign, can_approve: !!ref?.can_approve,
        can_cancel: !!ref?.can_cancel, can_config: !!ref?.can_config,
      };
    }
    const newVal = !base[action];
    const updated = { ...base, [action]: newVal };
    setSaving(`user-${modulo}-${action}`);

    setUserRows((prev) => {
      const idx = prev.findIndex((r) => r.modulo === modulo);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = updated; return cp; }
      return [...prev, updated];
    });

    const updateData: any = { user_id: selectedUserId, modulo, unidade_id: selectedUnidade };
    ACTIONS.forEach(a => updateData[a] = updated[a]);

    const { error } = await supabase.from("permissoes_usuario").upsert(updateData, { onConflict: "user_id,modulo,unidade_id" } as any);
    if (error) { toast.error(`Erro: ${error.message}`); loadUser(); } else {
      toast.success(`Exceção salva: ${MODULO_LABELS[modulo]} → ${ACTION_LABELS[action]}`);
    }
    setSaving(null);
  };

  const resetUserOverride = async (modulo: ModuleName) => {
    if (!selectedUserId) return;
    const { error } = await (supabase as any)
      .from("permissoes_usuario")
      .delete()
      .eq("user_id", selectedUserId)
      .eq("modulo", modulo)
      .eq("unidade_id", selectedUnidade);
    if (error) toast.error("Erro ao remover exceção");
    else {
        toast.success(`Exceção removida: ${MODULO_LABELS[modulo]}`);
        setUserRows((prev) => prev.filter((r) => r.modulo !== modulo));
    }
  };

  const funcionariosFiltered = useMemo(() => {
    const q = searchUser.toLowerCase().trim();
    let list = funcionarios;
    if (selectedUnidade) list = list.filter((f) => f.unidade_id === selectedUnidade || !f.unidade_id);
    if (!q) return list.slice(0, 50);
    return list.filter((f) =>
      f.nome.toLowerCase().includes(q) || f.usuario.toLowerCase().includes(q) || f.role.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [funcionarios, searchUser, selectedUnidade]);

  const selectedUser = funcionarios.find((f) => f.id === selectedUserId);

  if (!hasPermission(["master"])) return <div className="p-6 text-center text-muted-foreground"><Shield className="w-12 h-12 mx-auto mb-3" /> Acesso restrito ao perfil MASTER.</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Configuração de Permissões" subtitle="Controle de acesso por módulo e unidade de saúde." />

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium">Unidade:</span>
            <Select value={selectedUnidade} onValueChange={setSelectedUnidade}>
              <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selectedUnidade ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">Selecione uma unidade para continuar.</CardContent></Card>
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="perfil">Permissões por Perfil</TabsTrigger>
          <TabsTrigger value="individual">Permissões Individuais</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Perfil:</span>
            <Select value={selectedPerfil} onValueChange={setSelectedPerfil}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERFIS.map((p) => <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Accordion type="multiple" className="space-y-2">
            {PERMISSION_REGISTRY.map((mod) => {
              const row = getPerfilRow(mod.id);
              const activeCount = row ? ACTIONS.filter((a) => row[a]).length : 0;
              return (
                <AccordionItem key={mod.id} value={mod.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline text-left">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex flex-col">
                        <span className="font-medium">{mod.label}</span>
                        <span className="text-[10px] text-muted-foreground font-normal">{mod.description}</span>
                      </div>
                      <Badge variant={activeCount > 0 ? "default" : "outline"} className="ml-auto">
                        {activeCount} ações
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 py-3">
                      {mod.actions.map((action) => (
                        <label key={action} className="flex items-center gap-2 cursor-pointer group">
                          <Switch 
                            checked={!!row?.[action]} 
                            onCheckedChange={() => togglePerfil(mod.id, action)} 
                            disabled={saving === `perfil-${mod.id}-${action}`}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium group-hover:text-primary transition-colors">{ACTION_LABELS[action]}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </TabsContent>

        <TabsContent value="individual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserIcon className="w-4 h-4" /> Selecionar Profissional
              </CardTitle>
              <CardDescription>Configure exceções para um funcionário específico.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, usuário ou perfil…"
                  className="pl-9"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                />
              </div>
              {!selectedUserId && (
                <div className="max-h-60 overflow-y-auto border rounded-md divide-y">
                  {funcionariosFiltered.map((f) => (
                    <button key={f.id} type="button" onClick={() => setSelectedUserId(f.id)}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{f.nome}</span>
                        <span className="text-xs text-muted-foreground">{PERFIL_LABELS[f.role] || f.role}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
              {selectedUser && (
                <div className="flex items-center justify-between p-3 bg-accent/50 rounded-md border border-accent">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {selectedUser.nome.charAt(0)}
                    </div>
                    <div>
                        <div className="font-semibold text-sm">{selectedUser.nome}</div>
                        <div className="text-xs text-muted-foreground">Perfil Base: {PERFIL_LABELS[selectedUser.role] || selectedUser.role}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedUserId("")}>Trocar</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedUserId && (
            <Accordion type="multiple" className="space-y-2">
              {PERMISSION_REGISTRY.map((mod) => {
                const override = getUserRow(mod.id);
                return (
                  <AccordionItem key={mod.id} value={mod.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline text-left">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex flex-col">
                            <span className="font-medium">{mod.label}</span>
                            {override ? <Badge variant="default" className="w-fit text-[9px] h-4">Com Exceção</Badge> : <span className="text-[10px] text-muted-foreground font-normal">Herda do perfil</span>}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 py-3">
                        {mod.actions.map((action) => (
                          <label key={action} className="flex items-center gap-2 cursor-pointer">
                            <Switch 
                                checked={!!override?.[action]} 
                                onCheckedChange={() => toggleUser(mod.id, action)} 
                            />
                            <span className="text-sm">{ACTION_LABELS[action]}</span>
                          </label>
                        ))}
                      </div>
                      {override && (
                        <div className="pt-2 border-t mt-2 flex justify-end">
                          <Button variant="ghost" size="xs" onClick={() => resetUserOverride(mod.id)} className="text-[10px] h-7">
                            <RotateCcw className="w-3 h-3 mr-1" /> Remover exceção
                          </Button>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
};

// Add missing icon
const ChevronRight = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6"/></svg>
);

export default Permissoes;
