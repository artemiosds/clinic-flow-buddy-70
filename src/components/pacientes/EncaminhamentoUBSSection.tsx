import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Plus, History, FileText, Printer, Trash2, Download, Eye, 
  Loader2, Paperclip, Building2, Calendar, User, Search,
  CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp,
  FileDown, Upload, X
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import EspecialidadeCombobox from "@/components/EspecialidadeCombobox";

const BUCKET = "paciente-documentos";

const UBS_LIST = [
  "UBS Dr. Lauro Corrêa Pinto", "UBS Penta", "UBS Corino Guerreiro",
  "UBS Santa Luzia", "UBS Tânia Siqueira da Fonseca", "UBS Antônio Miléo",
  "Hospital Municipal de Oriximiná", "UBS Nossa Sra. das Graças",
  "UBS Fluvial Manoel Andrade", "UBS Ribeirinho", "Hospital Regional Menino Jesus",
];

interface Attachment {
  id?: string;
  nome_arquivo: string;
  storage_path: string;
  mime_type?: string;
  tamanho_bytes?: number;
  file?: File; // For pending uploads
}

interface Encaminhamento {
  id: string;
  paciente_id: string;
  especialidade_destino: string;
  ubs_origem: string;
  profissional_solicitante: string;
  tipo_encaminhamento: string;
  cid: string;
  diagnostico_resumido: string;
  justificativa: string;
  data_encaminhamento: string;
  status: 'pendente' | 'realizado' | 'cancelado';
  created_at: string;
  anexos?: Attachment[];
}

interface EncaminhamentoUBSSectionProps {
  pacienteId?: string;
  pacienteNome?: string;
  unidadeId?: string;
  onReferralsChange?: (referrals: Partial<Encaminhamento>[]) => void;
}

const EncaminhamentoUBSSection: React.FC<EncaminhamentoUBSSectionProps> = ({ 
  pacienteId, 
  pacienteNome,
  unidadeId,
  onReferralsChange 
}) => {
  const { user } = useAuth();
  const [history, setHistory] = useState<Encaminhamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState<Partial<Encaminhamento>>({
    especialidade_destino: "",
    ubs_origem: "",
    profissional_solicitante: "",
    tipo_encaminhamento: "ubs",
    cid: "",
    diagnostico_resumido: "",
    justificativa: "",
    data_encaminhamento: format(new Date(), 'yyyy-MM-dd'),
    status: 'pendente'
  });

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const loadHistory = useCallback(async () => {
    if (!pacienteId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("paciente_encaminhamentos")
        .select(`
          *,
          anexos:paciente_encaminhamento_anexos(*)
        `)
        .eq("paciente_id", pacienteId)
        .eq("ativo", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error("[loadHistory]", err);
      toast.error("Erro ao carregar histórico de encaminhamentos");
    } finally {
      setLoading(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} é muito grande (máx 10MB)`);
        continue;
      }
      
      if (pacienteId) {
        setUploading(true);
        try {
          const ext = file.name.split(".").pop();
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `encaminhamentos/${pacienteId}/${Date.now()}_${safeName}`;

          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
          if (upErr) throw upErr;

          newAttachments.push({
            nome_arquivo: file.name,
            storage_path: path,
            mime_type: file.type,
            tamanho_bytes: file.size
          });
        } catch (err) {
          console.error("[upload]", err);
          toast.error(`Erro ao enviar ${file.name}`);
        } finally {
          setUploading(false);
        }
      } else {
        newAttachments.push({
          nome_arquivo: file.name,
          storage_path: "",
          mime_type: file.type,
          tamanho_bytes: file.size,
          file: file
        });
      }
    }

    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = async (index: number) => {
    const att = attachments[index];
    if (att.storage_path) {
      await supabase.storage.from(BUCKET).remove([att.storage_path]);
    }
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!formData.especialidade_destino) {
      toast.error("Selecione a especialidade de destino");
      return;
    }

    if (pacienteId) {
      setSaving(true);
      try {
        const { data: encData, error: encError } = await supabase
          .from("paciente_encaminhamentos")
          .insert({
            ...formData,
            paciente_id: pacienteId,
            unidade_id: unidadeId || user?.unidadeId,
            created_by: user?.id
          } as any)
          .select()
          .single();

        if (encError) throw encError;

        if (attachments.length > 0) {
          const { error: attError } = await supabase
            .from("paciente_encaminhamento_anexos")
            .insert(attachments.map(a => ({
              encaminhamento_id: encData.id,
              nome_arquivo: a.nome_arquivo,
              storage_path: a.storage_path,
              mime_type: a.mime_type,
              tamanho_bytes: a.tamanho_bytes,
              uploaded_by: user?.id
            } as any)));
          
          if (attError) throw attError;
        }

        toast.success("Encaminhamento registrado com sucesso!");
        setShowForm(false);
        setFormData({
          especialidade_destino: "",
          ubs_origem: "",
          profissional_solicitante: "",
          tipo_encaminhamento: "ubs",
          cid: "",
          diagnostico_resumido: "",
          justificativa: "",
          data_encaminhamento: format(new Date(), 'yyyy-MM-dd'),
          status: 'pendente'
        });
        setAttachments([]);
        loadHistory();
      } catch (err) {
        console.error("[save]", err);
        toast.error("Erro ao salvar encaminhamento");
      } finally {
        setSaving(false);
      }
    } else {
      if (onReferralsChange) {
        onReferralsChange([{ ...formData, anexos: attachments }]);
        toast.success("Encaminhamento adicionado à fila de cadastro.");
        setShowForm(false);
      }
    }
  };

  const handlePrint = (enc: Encaminhamento) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>Encaminhamento - ${pacienteNome || 'Paciente'}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            .header { text-align: center; border-bottom: 2px solid #0c4a6e; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { color: #0c4a6e; margin: 0; font-size: 24px; }
            .header p { margin: 5px 0; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; text-transform: uppercase; font-size: 14px; color: #0c4a6e; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .label { font-size: 12px; color: #777; font-weight: bold; text-transform: uppercase; }
            .value { font-size: 16px; margin-top: 2px; }
            .full { grid-column: 1 / -1; }
            .footer { margin-top: 80px; text-align: center; }
            .signature { border-top: 1px solid #333; width: 300px; margin: 0 auto; padding-top: 10px; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ENCAMINHAMENTO MÉDICO / MULTIDISCIPLINAR</h1>
            <p>Secretaria Municipal de Saúde</p>
          </div>

          <div class="section">
            <div class="section-title">Dados do Paciente</div>
            <div class="grid">
              <div>
                <div class="label">Nome do Paciente</div>
                <div class="value">${pacienteNome || '—'}</div>
              </div>
              <div>
                <div class="label">Data do Encaminhamento</div>
                <div class="value">${format(new Date(enc.data_encaminhamento), 'dd/MM/yyyy')}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Informações do Encaminhamento</div>
            <div class="grid">
              <div>
                <div class="label">Especialidade Destino</div>
                <div class="value">${ESPECIALIDADES_DESTINO.find(e => e.value === enc.especialidade_destino)?.label || enc.especialidade_destino}</div>
              </div>
              <div>
                <div class="label">UBS Origem</div>
                <div class="value">${enc.ubs_origem || '—'}</div>
              </div>
              <div>
                <div class="label">Profissional Solicitante</div>
                <div class="value">${enc.profissional_solicitante || '—'}</div>
              </div>
              <div>
                <div class="label">CID-10</div>
                <div class="value">${enc.cid || '—'}</div>
              </div>
              <div class="full">
                <div class="label">Diagnóstico Resumido</div>
                <div class="value">${enc.diagnostico_resumido || '—'}</div>
              </div>
              <div class="full">
                <div class="label">Justificativa Clínica</div>
                <div class="value">${enc.justificativa || '—'}</div>
              </div>
            </div>
          </div>

          <div class="footer">
            <div class="signature">
              <strong>${enc.profissional_solicitante || 'Assinatura do Profissional'}</strong>
              <div>Carimbo e Registro</div>
            </div>
            <p style="font-size: 10px; color: #999; margin-top: 40px;">Documento gerado pelo sistema em ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
          
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'realizado': return <Badge className="bg-success hover:bg-success/90"><CheckCircle2 className="w-3 h-3 mr-1" /> Realizado</Badge>;
      case 'cancelado': return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Cancelado</Badge>;
      default: return <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-200"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <History className="w-4 h-4" /> Histórico de Encaminhamentos
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} className="h-8 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo Encaminhamento
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Novo Encaminhamento (UBS)
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="h-7 w-7 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Especialidade Destino *</Label>
                <Select 
                  value={formData.especialidade_destino} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, especialidade_destino: v }))}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecione a especialidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESPECIALIDADES_DESTINO.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>UBS de Origem</Label>
                <Select 
                  value={formData.ubs_origem} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, ubs_origem: v }))}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecione a UBS" />
                  </SelectTrigger>
                  <SelectContent>
                    {UBS_LIST.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Profissional Solicitante</Label>
                <Input 
                  value={formData.profissional_solicitante} 
                  onChange={(e) => setFormData(prev => ({ ...prev, profissional_solicitante: e.target.value.toUpperCase() }))}
                  placeholder="NOME DO MÉDICO/ENFERMEIRO"
                  className="bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label>CID-10</Label>
                <Input 
                  value={formData.cid} 
                  onChange={(e) => setFormData(prev => ({ ...prev, cid: e.target.value.toUpperCase() }))}
                  placeholder="Ex: G80.0"
                  className="bg-background"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label>Diagnóstico Resumido</Label>
                <Input 
                  value={formData.diagnostico_resumido} 
                  onChange={(e) => setFormData(prev => ({ ...prev, diagnostico_resumido: e.target.value }))}
                  placeholder="Breve descrição do quadro"
                  className="bg-background"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label>Justificativa Clínica</Label>
                <Textarea 
                  value={formData.justificativa} 
                  onChange={(e) => setFormData(prev => ({ ...prev, justificativa: e.target.value }))}
                  placeholder="Detalhes do motivo do encaminhamento"
                  className="bg-background min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Data do Encaminhamento</Label>
                <Input 
                  type="date" 
                  value={formData.data_encaminhamento} 
                  onChange={(e) => setFormData(prev => ({ ...prev, data_encaminhamento: e.target.value }))}
                  className="bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label>Anexos (Encaminhamento / Exames)</Label>
                <div className="flex gap-2">
                  <Input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    id="enc-file-upload" 
                    onChange={handleFileChange}
                    accept="image/*,application/pdf"
                  />
                  <Button 
                    variant="outline" 
                    type="button" 
                    className="w-full bg-background border-dashed gap-2"
                    onClick={() => document.getElementById('enc-file-upload')?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                    Anexar Arquivos
                  </Button>
                </div>
              </div>

              {attachments.length > 0 && (
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  {attachments.map((att, idx) => (
                    <Badge key={idx} variant="secondary" className="pl-2 pr-1 py-1 gap-1 bg-white border">
                      <FileText className="w-3 h-3 text-primary" />
                      <span className="max-w-[150px] truncate">{att.nome_arquivo}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-4 w-4 p-0 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeAttachment(idx)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Salvar Encaminhamento
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">Carregando histórico...</p>
          </div>
        ) : history.length > 0 ? (
          history.map((enc) => (
            <div key={enc.id} className="group relative rounded-lg border border-border/60 bg-card p-4 transition-all hover:shadow-md hover:border-primary/30">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-foreground">
                      {ESPECIALIDADES_DESTINO.find(e => e.value === enc.especialidade_destino)?.label || enc.especialidade_destino}
                    </span>
                    {getStatusBadge(enc.status)}
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {format(new Date(enc.data_encaminhamento), 'dd/MM/yyyy')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      {enc.ubs_origem || 'UBS não informada'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {enc.profissional_solicitante || 'Profissional não informado'}
                    </div>
                    <div className="flex items-center gap-1.5 font-medium text-primary/80">
                      <Search className="w-3.5 h-3.5" />
                      CID-10: {enc.cid || '—'}
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-foreground/80 bg-muted/30 p-2 rounded border-l-2 border-primary/20">
                    <p className="font-medium text-xs text-muted-foreground mb-1">Justificativa:</p>
                    {enc.justificativa || 'Nenhuma justificativa informada.'}
                  </div>

                  {enc.anexos && enc.anexos.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {enc.anexos.map((anexo) => (
                        <Button
                          key={anexo.id}
                          variant="outline"
                          size="sm"
                          className="h-8 text-[11px] gap-1.5 bg-background hover:bg-primary/5 hover:text-primary hover:border-primary/30"
                          onClick={async () => {
                            const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(anexo.storage_path, 60);
                            if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                          }}
                        >
                          <FileText className="w-3 h-3" />
                          {anexo.nome_arquivo}
                          <Download className="w-3 h-3 ml-1 opacity-50" />
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end md:self-start opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => handlePrint(enc)}>
                    <Printer className="w-3.5 h-3.5" /> Imprimir
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                    onClick={async () => {
                      if (!confirm("Remover este encaminhamento do histórico?")) return;
                      const { error } = await supabase.from("paciente_encaminhamentos").update({ ativo: false } as any).eq("id", enc.id);
                      if (!error) {
                        toast.success("Removido com sucesso");
                        loadHistory();
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-border/60 bg-muted/5 text-muted-foreground">
            <History className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhum encaminhamento registrado.</p>
            <p className="text-xs">Use o botão acima para cadastrar o primeiro.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EncaminhamentoUBSSection;