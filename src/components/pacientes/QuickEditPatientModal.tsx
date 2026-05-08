
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, User, MapPin, Phone, FileHeart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MunicipioIbgeCombobox from "@/components/MunicipioIbgeCombobox";
import LogradouroDneAutocomplete from "@/components/LogradouroDneAutocomplete";
import { applyPhoneMask, normalizePhone } from "@/lib/phoneUtils";
import { maskCNS } from "@/lib/cnsUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteId: string;
  onSaved: () => void;
}

const QuickEditPatientModal: React.FC<Props> = ({ open, onOpenChange, pacienteId, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("identificacao");
  const [form, setForm] = useState<any>({});
  const [customData, setCustomData] = useState<any>({});
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
      const cd = data.custom_data || {};
      setCustomData(cd);
      lastSavedFormRef.current = JSON.stringify({ ...data, custom_data: cd });
      setDirty(false);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    
    // Normalize phone
    const normalizedPhone = normalizePhone(form.telefone) || form.telefone;

    // Campos que são NOT NULL no banco e precisam de sanitização
    const dbFields: any = {
      nome: form.nome || "",
      nome_mae: form.nome_mae || "",
      data_nascimento: form.data_nascimento || "",
      cpf: form.cpf || "",
      cns: form.cns || "",
      telefone: normalizedPhone || "",
      email: form.email || "",
      municipio: form.municipio || "",
      endereco: customData.logradouro || form.endereco || "",
      unidade_id: form.unidade_id || "",
      custom_data: customData || {},
      atualizado_em: new Date().toISOString(),
    };

    // Outros campos importantes que podem estar no form
    const otherFields = [
      'sexo', 'nacionalidade', 'raca_cor', 'naturalidade', 'cep', 'bairro', 'numero', 'complemento'
    ];
    
    // Garantir que não enviamos IDs ou campos de sistema
    delete (dbFields as any).id;
    delete (dbFields as any).criado_em;

    const { error } = await supabase.from("pacientes").update(dbFields).eq("id", pacienteId);

    if (error) {
      console.error("Erro ao salvar paciente:", error);
      toast.error("Erro ao salvar alterações: " + error.message);
    } else {
      toast.success("Paciente atualizado com sucesso!");
      onSaved();
    }
    setSaving(false);
  };

  const set = (field: string, value: any) => setForm((prev: any) => ({ ...prev, [field]: value }));
  const setCD = (field: string, value: any) => setCustomData((prev: any) => ({ ...prev, [field]: value }));

  const sanitizeUpper = (v: string) => (v || "").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Edição Rápida: {form.nome || "Paciente"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-4 mx-6">
              <TabsTrigger value="identificacao" className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Identificação</span>
              </TabsTrigger>
              <TabsTrigger value="endereco" className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Endereço</span>
              </TabsTrigger>
              <TabsTrigger value="contato" className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Contato</span>
              </TabsTrigger>
              <TabsTrigger value="sus" className="flex items-center gap-1.5">
                <FileHeart className="w-3.5 h-3.5" /> <span className="hidden sm:inline">SUS</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-6 pt-2">
              <TabsContent value="identificacao" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Nome Completo</Label>
                    <Input value={form.nome || ""} onChange={e => set("nome", sanitizeUpper(e.target.value))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Nome da Mãe</Label>
                    <Input value={form.nome_mae || ""} onChange={e => set("nome_mae", sanitizeUpper(e.target.value))} />
                  </div>
                  <div>
                    <Label>Data de Nascimento</Label>
                    <Input type="date" value={form.data_nascimento || ""} onChange={e => set("data_nascimento", e.target.value)} />
                  </div>
                  <div>
                    <Label>Sexo</Label>
                    <Select value={form.sexo || customData.sexo || ""} onValueChange={v => {
                      set("sexo", v);
                      setCD("sexo", v);
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="F">Feminino</SelectItem>
                        <SelectItem value="I">Ignorado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>CPF</Label>
                    <Input value={form.cpf || ""} onChange={e => set("cpf", e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <Label>CNS</Label>
                    <Input value={maskCNS(form.cns || "")} onChange={e => set("cns", e.target.value)} placeholder="000 0000 0000 0000" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="endereco" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>CEP</Label>
                    <Input value={customData.cep || ""} onChange={e => setCD("cep", e.target.value)} />
                  </div>
                  <div>
                    <Label>Município</Label>
                    <MunicipioIbgeCombobox 
                      value={form.municipio || customData.municipio || ""} 
                      onChange={(label) => {
                        set("municipio", label);
                        setCD("municipio", label);
                      }} 
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Tipo de Logradouro (DNE)</Label>
                    <LogradouroDneAutocomplete 
                      value={customData.tipo_logradouro_descricao || ""}
                      codigo={customData.tipo_logradouro_codigo || ""}
                      onChange={(desc, cod) => {
                        setCD("tipo_logradouro_descricao", desc);
                        setCD("tipo_logradouro_codigo", cod);
                      }}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Logradouro</Label>
                    <Input value={customData.logradouro || form.endereco || ""} onChange={e => setCD("logradouro", sanitizeUpper(e.target.value))} />
                  </div>
                  <div>
                    <Label>Número</Label>
                    <Input value={customData.numero || ""} onChange={e => setCD("numero", e.target.value)} />
                  </div>
                  <div>
                    <Label>Bairro</Label>
                    <Input value={customData.bairro || ""} onChange={e => setCD("bairro", sanitizeUpper(e.target.value))} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contato" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Telefone Principal</Label>
                    <Input 
                      value={applyPhoneMask(form.telefone || "")} 
                      onChange={e => set("telefone", e.target.value)} 
                    />
                  </div>
                  <div>
                    <Label>Telefone Secundário</Label>
                    <Input 
                      value={applyPhoneMask(customData.telefone_secundario || "")} 
                      onChange={e => setCD("telefone_secundario", e.target.value)} 
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>E-mail</Label>
                    <Input type="email" value={form.email || ""} onChange={e => set("email", e.target.value.toLowerCase())} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="sus" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Raça / Cor (IBGE)</Label>
                    <Select value={customData.raca_cor || ""} onValueChange={v => setCD("raca_cor", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                  <div>
                    <Label>Nacionalidade</Label>
                    <Input value={customData.nacionalidade || "Brasil"} onChange={e => setCD("nacionalidade", sanitizeUpper(e.target.value))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Unidade Vinculada</Label>
                    {/* Simplified for quick edit, ideally a selector of units */}
                    <Input value={form.unidade_id || ""} disabled placeholder="ID da Unidade" />
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="p-6 border-t bg-muted/20">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickEditPatientModal;
