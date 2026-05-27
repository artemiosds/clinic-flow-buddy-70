import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, User, MapPin, Phone, FileHeart, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MunicipioIbgeCombobox from "@/components/MunicipioIbgeCombobox";
import LogradouroDneAutocomplete from "@/components/LogradouroDneAutocomplete";
import { applyPhoneMask } from "@/lib/phoneUtils";
import { maskCNS } from "@/lib/cnsUtils";
import { useData } from "@/contexts/DataContext";
import { useQueryClient } from "@tanstack/react-query";
import { updatePacienteCadastro } from "@/lib/pacienteService";
import UnidadeSelect from "./UnidadeSelect";
import { calcularPendenciasPaciente } from "@/lib/pacientePendencias";
import { Badge } from "@/components/ui/badge";

const ESCOLARIDADE_OPTIONS = [
  { value: "analfabeto", label: "Analfabeto" },
  { value: "fundamental_incompleto", label: "Fundamental – incompleto" },
  { value: "fundamental_completo", label: "Fundamental – completo" },
  { value: "medio_incompleto", label: "Médio – incompleto" },
  { value: "medio_completo", label: "Médio – completo" },
  { value: "superior_incompleto", label: "Superior – incompleto" },
  { value: "superior_completo", label: "Superior – completo" },
];

const ESTADO_CIVIL_OPTIONS = [
  { value: "solteiro", label: "Solteiro" },
  { value: "casado", label: "Casado/união estável" },
  { value: "divorciado", label: "Divorciado/Separado" },
  { value: "viuvo", label: "Viúvo" },
  { value: "ignorado", label: "Ignorado" },
];

const SITUACAO_MERCADO_OPTIONS = [
  { value: "empregado_registrado", label: "Empregado registrado" },
  { value: "empregado_nao_registrado", label: "Empregado não registrado" },
  { value: "autonomo", label: "Autônomo conta própria" },
  { value: "servidor_estatutario", label: "Servidor público Estatutário" },
  { value: "servidor_celetista", label: "Servidor Público Celetista" },
  { value: "aposentado", label: "Aposentado" },
  { value: "desempregado", label: "Desempregado" },
  { value: "trabalho_temporario", label: "Trabalho Temporário" },
  { value: "cooperativado", label: "Cooperativado" },
  { value: "trabalhador_avulso", label: "Trabalhador Avulso" },
  { value: "empregador", label: "Empregador" },
  { value: "outros", label: "Outros" },
  { value: "ignorado", label: "Ignorado" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteId: string;
  onSaved: () => void;
}

const QuickEditPatientModal: React.FC<Props> = ({ open, onOpenChange, pacienteId, onSaved }) => {
  const { refreshPacientes, logAction } = useData();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("identificacao");
  const [form, setForm] = useState<any>({});
  const [dirty, setDirty] = useState(false);
  const lastSavedFormRef = useRef<string>("");

  useEffect(() => {
    if (open && pacienteId) {
      loadPaciente();
    }
  }, [open, pacienteId]);

  const loadPaciente = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("pacientes").select("*").eq("id", pacienteId).single();
    if (data) {
      setForm(data);
      lastSavedFormRef.current = JSON.stringify(data);
      setDirty(false);
    }
    setLoading(false);
  };

  const handleSave = useCallback(async (manual = false) => {
    if (!pacienteId || saving) return;
    
    const currentFormStr = JSON.stringify(form);
    if (!manual && currentFormStr === lastSavedFormRef.current) {
      setDirty(false);
      return;
    }

    setSaving(true);
    
    try {
      const updatedData = await updatePacienteCadastro(pacienteId, form, "QuickEditModal");
      
      setDirty(false);
      lastSavedFormRef.current = JSON.stringify(updatedData);
      setForm(updatedData);
      
      queryClient.invalidateQueries({ queryKey: ["pacientes"] });
      queryClient.invalidateQueries({ queryKey: ["paciente"] });
      queryClient.invalidateQueries({ queryKey: ["pacientes-pendencias"] });
      queryClient.invalidateQueries({ queryKey: ["pacientes-paginated"] });

      await refreshPacientes();

      if (manual) {
        toast.success("Dados cadastrais salvos com sucesso.");
        onSaved();
      }
    } catch (error: any) {
      console.error("Erro ao salvar paciente:", error);
      if (manual) toast.error("Erro ao salvar alterações: " + (error.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }, [pacienteId, form, saving, onSaved, queryClient, refreshPacientes]);

  const set = (field: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const setCustom = (key: string, value: any) => {
    setForm((prev: any) => ({
      ...prev,
      custom_data: { ...(prev.custom_data || {}), [key]: value }
    }));
    setDirty(true);
  };
  
  useEffect(() => {
    if (!dirty || !pacienteId || saving) return;
    const timer = setTimeout(() => {
      handleSave(false);
    }, 2000); 
    return () => clearTimeout(timer);
  }, [form, dirty, pacienteId, saving, handleSave]);

  const sanitizeUpper = (v: string) => (v || "").toUpperCase();

  const pendencias = useMemo(() => {
    if (!form || Object.keys(form).length === 0) return { labels: [], score: 0 };
    return calcularPendenciasPaciente(form);
  }, [form]);

  const isCritical = (type: string) => {
    const criticalMap: Record<string, string[]> = {
      "identificacao": ["nome", "nome_mae", "data_nascimento", "sexo", "cpf", "cns"],
      "endereco": ["endereco", "bairro", "municipio"],
      "sus": ["raca_cor"]
    };
    
    if (type === "identificacao") {
      return !form.nome || !form.nome_mae || !form.data_nascimento || !form.sexo || !form.cpf || !form.cns;
    }
    if (type === "endereco") {
      return !form.endereco || !form.bairro || !form.municipio;
    }
    if (type === "sus") {
      return !form.raca_cor;
    }
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) {
        if (dirty) handleSave(false);
        onSaved();
      }
      onOpenChange(val);
    }}>
      <DialogContent className="max-w-3xl max-h-[95vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-8 pb-4 bg-slate-50/80 border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight">
                  Atualização Cadastral
                </DialogTitle>
                <p className="text-slate-500 font-medium">{form.nome || "Paciente"}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Completude</span>
                <span className="text-sm font-bold text-primary">{pendencias.score}%</span>
              </div>
              <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${pendencias.score}%` }}
                />
              </div>
            </div>
          </div>
          
          {pendencias.labels.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase pt-1">Pendentes:</span>
              {pendencias.labels.map((l, i) => (
                <Badge key={i} variant="secondary" className="bg-red-50 text-red-600 border-red-100 text-[10px] px-2 py-0">
                  {l}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-24 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary/40" />
            <p className="text-sm text-slate-400 font-medium">Carregando formulário...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 bg-white">
            <div className="px-8 border-b">
              <TabsList className="h-14 w-full justify-start gap-8 bg-transparent p-0 border-none">
                <TabsTrigger 
                  value="identificacao" 
                  className="h-14 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 flex items-center gap-2 text-slate-500 data-[state=active]:text-primary font-semibold transition-all"
                >
                  <User className="w-4 h-4" /> 
                  Identificação
                  {isCritical("identificacao") && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                </TabsTrigger>
                <TabsTrigger 
                  value="endereco" 
                  className="h-14 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 flex items-center gap-2 text-slate-500 data-[state=active]:text-primary font-semibold transition-all"
                >
                  <MapPin className="w-4 h-4" /> 
                  Endereço
                  {isCritical("endereco") && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                </TabsTrigger>
                <TabsTrigger 
                  value="contato" 
                  className="h-14 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 flex items-center gap-2 text-slate-500 data-[state=active]:text-primary font-semibold transition-all"
                >
                  <Phone className="w-4 h-4" /> 
                  Contato
                </TabsTrigger>
                <TabsTrigger 
                  value="sus" 
                  className="h-14 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 flex items-center gap-2 text-slate-500 data-[state=active]:text-primary font-semibold transition-all"
                >
                  <FileHeart className="w-4 h-4" /> 
                  SUS / Complementares
                  {isCritical("sus") && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
              <TabsContent value="identificacao" className="space-y-6 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      Nome Completo <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      className={`h-11 border-slate-200 focus:border-primary transition-all ${!form.nome ? 'bg-red-50/30' : ''}`}
                      value={form.nome || ""} 
                      onChange={e => set("nome", sanitizeUpper(e.target.value))} 
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      Nome da Mãe <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      className={`h-11 border-slate-200 focus:border-primary transition-all ${!form.nome_mae ? 'bg-red-50/30' : ''}`}
                      value={form.nome_mae || ""} 
                      onChange={e => set("nome_mae", sanitizeUpper(e.target.value))} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      Data de Nascimento <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      type="date" 
                      className={`h-11 border-slate-200 focus:border-primary transition-all ${!form.data_nascimento ? 'bg-red-50/30' : ''}`}
                      value={form.data_nascimento || ""} 
                      onChange={e => set("data_nascimento", e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      Sexo <span className="text-red-500">*</span>
                    </Label>
                    <Select value={form.sexo || ""} onValueChange={v => set("sexo", v)}>
                      <SelectTrigger className={`h-11 border-slate-200 ${!form.sexo ? 'bg-red-50/30' : ''}`}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="F">Feminino</SelectItem>
                        <SelectItem value="I">Ignorado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      CPF <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      className={`h-11 border-slate-200 focus:border-primary transition-all ${!form.cpf ? 'bg-red-50/30' : ''}`}
                      value={form.cpf || ""} 
                      onChange={e => set("cpf", e.target.value)} 
                      placeholder="000.000.000-00" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      CNS <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      className={`h-11 border-slate-200 focus:border-primary transition-all ${!form.cns ? 'bg-red-50/30' : ''}`}
                      value={maskCNS(form.cns || "")} 
                      onChange={e => set("cns", e.target.value)} 
                      placeholder="000 0000 0000 0000" 
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="endereco" className="space-y-6 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold">CEP</Label>
                    <Input 
                      className="h-11 border-slate-200 focus:border-primary"
                      value={form.cep || ""} 
                      onChange={e => set("cep", e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      Município <span className="text-red-500">*</span>
                    </Label>
                    <MunicipioIbgeCombobox 
                      value={form.municipio || ""} 
                      onChange={(label) => set("municipio", label)} 
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-slate-600 font-bold">Tipo de Logradouro (DNE)</Label>
                    <LogradouroDneAutocomplete 
                      value={form.tipo_logradouro || ""}
                      codigo={form.tipo_logradouro_codigo || ""}
                      onChange={(desc, cod) => {
                        set("tipo_logradouro", desc);
                        set("tipo_logradouro_codigo", cod);
                      }}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      Logradouro <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      className={`h-11 border-slate-200 focus:border-primary transition-all ${!form.endereco ? 'bg-red-50/30' : ''}`}
                      value={form.endereco || ""} 
                      onChange={e => set("endereco", sanitizeUpper(e.target.value))} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold">Número</Label>
                    <Input 
                      className="h-11 border-slate-200 focus:border-primary"
                      value={form.numero || ""} 
                      onChange={e => set("numero", e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      Bairro <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      className={`h-11 border-slate-200 focus:border-primary transition-all ${!form.bairro ? 'bg-red-50/30' : ''}`}
                      value={form.bairro || ""} 
                      onChange={e => set("bairro", sanitizeUpper(e.target.value))} 
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contato" className="space-y-6 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold">Telefone Principal</Label>
                    <Input 
                      className="h-11 border-slate-200 focus:border-primary"
                      value={applyPhoneMask(form.telefone || "")} 
                      onChange={e => set("telefone", e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold">Telefone Secundário</Label>
                    <Input 
                      className="h-11 border-slate-200 focus:border-primary"
                      value={applyPhoneMask(form.telefone_secundario || "")} 
                      onChange={e => set("telefone_secundario", e.target.value)} 
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-slate-600 font-bold">E-mail</Label>
                    <Input 
                      type="email" 
                      className="h-11 border-slate-200 focus:border-primary"
                      value={form.email || ""} 
                      onChange={e => set("email", e.target.value.toLowerCase())} 
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="sus" className="space-y-6 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold flex items-center gap-1.5">
                      Raça / Cor (IBGE) <span className="text-red-500">*</span>
                    </Label>
                    <Select value={form.raca_cor || ""} onValueChange={v => set("raca_cor", v)}>
                      <SelectTrigger className={`h-11 border-slate-200 ${!form.raca_cor ? 'bg-red-50/30' : ''}`}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="branca">Branca</SelectItem>
                        <SelectItem value="preta">Preta</SelectItem>
                        <SelectItem value="parda">Parda</SelectItem>
                        <SelectItem value="amarela">Amarela</SelectItem>
                        <SelectItem value="indigena">Indígena</SelectItem>
                        <SelectItem value="nao_declarado">Não declarado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-bold">Nacionalidade</Label>
                    <Input 
                      className="h-11 border-slate-200 focus:border-primary"
                      value={form.nacionalidade || "Brasil"} 
                      onChange={e => set("nacionalidade", sanitizeUpper(e.target.value))} 
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-slate-600 font-bold">Unidade Vinculada (Opcional)</Label>
                    <UnidadeSelect 
                      value={form.unidade_id === "" ? "none" : (form.unidade_id || "")} 
                      onValueChange={v => set("unidade_id", v === "none" ? "" : v)} 
                    />
                    <p className="text-[10px] text-slate-400">Vínculo administrativo secundário para esta central.</p>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="p-8 border-t bg-slate-50/80 flex items-center justify-between sm:justify-between">
          <div className="flex items-center gap-3 text-slate-400">
            {dirty ? (
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider animate-pulse">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                Alterações não salvas
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-500">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Dados sincronizados
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="font-semibold text-slate-500 hover:bg-slate-200/50" onClick={() => onOpenChange(false)} disabled={saving}>
              Fechar
            </Button>
            <Button className="font-bold shadow-lg shadow-primary/20 h-11 px-8" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Salvar Agora</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickEditPatientModal;