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

const PERFIS = ["gestao", "recepcao", "tecnico", "avaliacao_enfermagem", "profissional"] as const;
const PERFIL_LABELS: Record<string, string> = {
  gestao: "GESTÃO",
  recepcao: "RECEPÇÃO",
  tecnico: "TRIAGEM",
  enfermagem: "ENFERMAGEM",
  profissional: "PROFISSIONAL",
};

type PermRow = any; // simplified for now
type UserPermRow = any; // simplified for now

const Permissoes: React.FC = () => {
  const { hasPermission } = useAuth();
  const { getDetail } = usePermissions();

  const [unidades, setUnidades] = useState<{id: string, nome: string}[]>([]);
  const [selectedUnidade, setSelectedUnidade] = useState<string>("");
  const [tab, setTab] = useState("perfil");
  const [selectedPerfil, setSelectedPerfil] = useState<string>(PERFIS[0]);
  const [perfilRows, setPerfilRows] = useState<PermRow[]>([]);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
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
    
    // Logic to handle both boolean and JSONB
    const updated = existing ? { ...existing } : { perfil: selectedPerfil, modulo, unidade_id: selectedUnidade, acoes_especificas: {} };
    
    // Check if column exists, else update json
    if (Object.keys(updated).includes(action)) {
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
    
    if (Object.keys(updated).includes(action)) {
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
    if (!q) return list.slice(0, 50);
    return list.filter((f: any) =>
      f.nome.toLowerCase().includes(q) || f.usuario.toLowerCase().includes(q) || f.role.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [funcionarios, searchUser, selectedUnidade]);

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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="perfil">Permissões por Perfil</TabsTrigger>
          <TabsTrigger value="individual">Permissões Individuais</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="space-y-4">
          <Accordion type="multiple" className="space-y-2">
            {PERMISSION_REGISTRY.map((mod) => {
              const row = getPerfilRow(mod.id);
              return (
                <AccordionItem key={mod.id} value={mod.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline text-left">
                    <div className="flex items-center gap-3 flex-1 font-medium">{mod.label}</div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-3">
                      {mod.actions.map((act) => {
                        const val = row ? (row[act.key] ?? row.acoes_especificas?.[act.key]) : false;
                        return (
                            <label key={act.key} className="flex items-center justify-between p-2 border rounded">
                                <span className="text-sm">{act.label}</span>
                                <Switch checked={!!val} onCheckedChange={() => togglePerfil(mod.id, act.key)} />
                            </label>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Permissoes;
