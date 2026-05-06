import { PageHeader } from '@/components/layout/PageHeader';
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
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
  Loader2, Shield, Search, User as UserIcon, Building2, 
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { PERMISSION_REGISTRY } from "@/config/permissionsRegistry";
import { cn } from "@/lib/utils";

const PERFIS = ["gestao", "recepcao", "tecnico", "avaliacao_enfermagem", "profissional"] as const;
const PERFIL_LABELS: Record<string, string> = {
  gestao: "GESTÃO",
  recepcao: "RECEPÇÃO",
  tecnico: "TRIAGEM",
  enfermagem: "ENFERMAGEM",
  profissional: "PROFISSIONAL",
};

const Permissoes: React.FC = () => {
  const { hasPermission } = useAuth();
  const { getDetail } = usePermissions();

  const [unidades, setUnidades] = useState<{id: string, nome: string}[]>([]);
  const [selectedUnidade, setSelectedUnidade] = useState<string>("");
  const [tab, setTab] = useState("perfil");
  const [selectedPerfil, setSelectedPerfil] = useState<string>(PERFIS[0]);
  const [perfilRows, setPerfilRows] = useState<any[]>([]);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [searchUser, setSearchUser] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userRows, setUserRows] = useState<any[]>([]);
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
      setFuncionarios((f.data || []));
    })();
  }, []);

  const loadPerfil = useCallback(async () => {
    if (!selectedUnidade) return;
    setLoading(true);
    const { data, error } = await supabase
        .from("permissoes")
        .select("*")
        .eq("perfil", selectedPerfil)
        .in("unidade_id", [selectedUnidade, ""]);
    if (error) {
      toast.error("Erro ao carregar permissões");
      setLoading(false);
      return;
    }
    setPerfilRows(data || []);
    setLoading(false);
  }, [selectedPerfil, selectedUnidade]);

  useEffect(() => { if (tab === "perfil") loadPerfil(); }, [loadPerfil, tab]);

  const loadUser = useCallback(async () => {
    if (!selectedUserId || !selectedUnidade) { setUserRows([]); return; }
    setLoading(true);
    const { data, error } = await supabase
        .from("permissoes_usuario")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("unidade_id", selectedUnidade);
    if (error) {
      toast.error("Erro ao carregar exceções do usuário");
      setLoading(false);
      return;
    }
    setUserRows(data || []);
    setLoading(false);
  }, [selectedUserId, selectedUnidade]);

  useEffect(() => { if (tab === "individual") loadUser(); }, [loadUser, tab]);

  const getPerfilRow = (modulo: string) => {
    return perfilRows.find((r) => r.modulo === modulo && r.unidade_id === selectedUnidade)
      || perfilRows.find((r) => r.modulo === modulo && r.unidade_id === "");
  };

  const getUserRow = (modulo: string) =>
    userRows.find((r) => r.modulo === modulo);

  const togglePerfil = async (modulo: string, action: string) => {
    const existing = getPerfilRow(modulo);
    const newVal = !existing?.[action];
    
    const updated = existing ? { ...existing } : { perfil: selectedPerfil, modulo, unidade_id: selectedUnidade, acoes_especificas: {} };
    
    // Lista de colunas booleanas legadas que existem fisicamente na tabela
    const legacyColumns = ['can_view', 'can_create', 'can_edit', 'can_delete', 'can_execute', 'can_print', 'can_export', 'can_attach', 'can_sign', 'can_approve', 'can_cancel', 'can_config'];

    if (legacyColumns.includes(action)) {
        updated[action] = newVal;
    } else {
        updated.acoes_especificas = { ...(updated.acoes_especificas || {}), [action]: newVal };
    }

    setSaving(`perfil-${modulo}-${action}`);

    const { error } = await supabase.from("permissoes").upsert(updated, { onConflict: "perfil,modulo,unidade_id" } as any);
    
    if (error) { toast.error(`Erro: ${error.message}`); loadPerfil(); } else {
      toast.success("Permissão atualizada");
      loadPerfil();
    }
    setSaving(null);
  };

  const toggleUser = async (modulo: string, action: string) => {
    const existing = getUserRow(modulo);
    const newVal = !existing?.[action];
    
    const updated = existing ? { ...existing } : { user_id: selectedUserId, modulo, unidade_id: selectedUnidade, acoes_especificas: {} };
    
    const legacyColumns = ['can_view', 'can_create', 'can_edit', 'can_delete', 'can_execute', 'can_print', 'can_export', 'can_attach', 'can_sign', 'can_approve', 'can_cancel', 'can_config'];

    if (legacyColumns.includes(action)) {
        updated[action] = newVal;
    } else {
        updated.acoes_especificas = { ...(updated.acoes_especificas || {}), [action]: newVal };
    }

    setSaving(`user-${modulo}-${action}`);

    const { error } = await supabase.from("permissoes_usuario").upsert(updated, { onConflict: "user_id,modulo,unidade_id" } as any);
    
    if (error) { toast.error(`Erro: ${error.message}`); loadUser(); } else {
      toast.success("Exceção salva");
      loadUser();
    }
    setSaving(null);
  };

  const funcionariosFiltered = useMemo(() => {
    const q = searchUser.toLowerCase().trim();
    let list = funcionarios;
    if (selectedUnidade) list = list.filter((f: any) => f.unidade_id === selectedUnidade || !f.unidade_id);
    if (!q) return [];
    return list.filter((f: any) =>
      f.nome.toLowerCase().includes(q) || f.usuario.toLowerCase().includes(q) || f.role.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [funcionarios, searchUser, selectedUnidade]);

  if (!hasPermission(["master"])) return <div className="p-6 text-center text-muted-foreground"><Shield className="w-12 h-12 mx-auto mb-3" /> Acesso restrito ao perfil MASTER.</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <PageHeader title="Configuração de Permissões" subtitle="Controle de acesso por módulo, ação granular e unidade." />
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-6">
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
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="perfil">Permissões por Perfil</TabsTrigger>
          <TabsTrigger value="individual">Exceções por Funcionário</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="space-y-4">
          <div className="flex items-center gap-3 py-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Perfil Selecionado:</span>
            <Select value={selectedPerfil} onValueChange={setSelectedPerfil}>
              <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERFIS.map((p) => <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Accordion type="multiple" className="space-y-2">
            {PERMISSION_REGISTRY.map((mod) => {
              const row = getPerfilRow(mod.id);
              const activeCount = mod.actions.filter(act => row ? (row[act.key] ?? row.acoes_especificas?.[act.key]) : false).length;
              
              return (
                <AccordionItem key={mod.id} value={mod.id} className="border rounded-lg px-4 bg-card/50">
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex items-center gap-3 flex-1">
                      {mod.icon && <mod.icon className="w-5 h-5 text-muted-foreground" />}
                      <div className="flex flex-col text-left">
                        <span className="font-semibold text-sm">{mod.label}</span>
                        <span className="text-[11px] text-muted-foreground font-normal line-clamp-1">{mod.description}</span>
                      </div>
                      <Badge variant={activeCount > 0 ? "default" : "outline"} className="ml-auto text-[10px] h-5">
                        {activeCount} {activeCount === 1 ? 'ativa' : 'ativas'}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                      {mod.actions.map((act) => {
                        const val = row ? (row[act.key] ?? row.acoes_especificas?.[act.key]) : false;
                        const isSaving = saving === `perfil-${mod.id}-${act.key}`;
                        return (
                            <div key={act.key} className="flex items-center justify-between p-3 rounded-md bg-background border border-border/50 hover:border-primary/30 transition-colors group">
                                <div className="flex flex-col">
                                    <span className="text-xs font-medium group-hover:text-primary transition-colors">{act.label}</span>
                                    {act.description && <span className="text-[10px] text-muted-foreground">{act.description}</span>}
                                </div>
                                {isSaving ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                ) : (
                                    <Switch checked={!!val} onCheckedChange={() => togglePerfil(mod.id, act.key)} />
                                )}
                            </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </TabsContent>

        <TabsContent value="individual" className="space-y-4">
          <Card className="border-dashed">
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                Buscar Funcionário
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
               <div className="flex flex-col gap-2">
                  <Input 
                    placeholder="Nome, CPF ou usuário..." 
                    value={searchUser} 
                    onChange={(e) => setSearchUser(e.target.value)} 
                    className="h-9"
                  />
                  {!selectedUserId && searchUser.length > 0 && (
                    <div className="mt-2 border rounded-md overflow-hidden divide-y bg-background shadow-sm">
                        {funcionariosFiltered.length > 0 ? funcionariosFiltered.map((f: any) => (
                            <button 
                                key={f.id} 
                                className="w-full px-4 py-2.5 text-left text-sm hover:bg-accent flex items-center justify-between transition-colors"
                                onClick={() => setSelectedUserId(f.id)}
                            >
                                <div className="flex flex-col">
                                    <span className="font-medium">{f.nome}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{PERFIL_LABELS[f.role] || f.role}</span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </button>
                        )) : (
                            <div className="p-4 text-center text-xs text-muted-foreground italic">Nenhum funcionário encontrado</div>
                        )}
                    </div>
                  )}
               </div>

               {selectedUserId && (
                   <div className="mt-4 flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
                       <div className="flex items-center gap-3">
                           <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                               {funcionarios.find(f => f.id === selectedUserId)?.nome.charAt(0)}
                           </div>
                           <div>
                               <div className="text-sm font-bold">{funcionarios.find(f => f.id === selectedUserId)?.nome}</div>
                               <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                                   PERFIL: {PERFIL_LABELS[funcionarios.find(f => f.id === selectedUserId)?.role] || funcionarios.find(f => f.id === selectedUserId)?.role}
                               </div>
                           </div>
                       </div>
                       <Button variant="ghost" size="sm" onClick={() => setSelectedUserId("")} className="h-8 text-xs">Alterar Profissional</Button>
                   </div>
               )}
            </CardContent>
          </Card>

          {selectedUserId && (
              <Accordion type="multiple" className="space-y-2">
                {PERMISSION_REGISTRY.map((mod) => {
                  const row = getUserRow(mod.id);
                  const perfilRow = getPerfilRow(mod.id);
                  const hasOverride = row !== undefined;
                  
                  return (
                    <AccordionItem key={mod.id} value={mod.id} className="border rounded-lg px-4 bg-card/50">
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center gap-3 flex-1 text-left">
                          {mod.icon && <mod.icon className="w-5 h-5 text-muted-foreground" />}
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm">{mod.label}</span>
                            {hasOverride ? (
                                <Badge variant="default" className="w-fit text-[9px] h-4 mt-0.5 bg-amber-500 hover:bg-amber-600">Exceção Ativa</Badge>
                            ) : (
                                <span className="text-[10px] text-muted-foreground font-normal">Herda do perfil</span>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                          {mod.actions.map((act) => {
                            const val = row ? (row[act.key] ?? row.acoes_especificas?.[act.key]) : !!perfilRow?.[act.key];
                            const isSaving = saving === `user-${mod.id}-${act.key}`;
                            const isOverridden = row && (row[act.key] !== undefined || row.acoes_especificas?.[act.key] !== undefined);

                            return (
                                <div key={act.key} className={cn(
                                    "flex items-center justify-between p-3 rounded-md bg-background border transition-all",
                                    isOverridden ? "border-amber-500/50 shadow-sm" : "border-border/50"
                                )}>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-medium">{act.label}</span>
                                        {isOverridden && <span className="text-[9px] text-amber-600 font-bold uppercase tracking-tighter">Sobrescrito</span>}
                                    </div>
                                    {isSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                    ) : (
                                        <Switch checked={!!val} onCheckedChange={() => toggleUser(mod.id, act.key)} />
                                    )}
                                </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Permissoes;
