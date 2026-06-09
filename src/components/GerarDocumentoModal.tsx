import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileText, Printer, Save, ShieldCheck, Plus, Trash2, Loader2, Info } from 'lucide-react';
import { openPrintDocument, loadDocumentConfig, docHeader, docFooter, buildInstitutionalCSS, type DocumentConfig } from '@/lib/printLayout';
import { salvarEncaminhamento } from '@/services/encaminhamentoService';
import { generateSignature, formatSignatureBlock, formatCarimboBlock, type CarimboData } from '@/lib/documentSignature';
import type { DocumentTemplate } from '@/components/ModelosDocumentos';
import { getBaseTemplate } from '@/constants/modelosBase';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente?: { id?: string; nome: string; cpf: string; cns: string; data_nascimento: string; cid: string; especialidade_destino: string };
  profissional?: { id?: string; nome: string; profissao: string; numero_conselho: string; tipo_conselho: string; uf_conselho: string };
  unidade?: string;
  dataAtendimento?: string;
}

const ENCAMINHAMENTO_TIPOS = ['encaminhamentos', 'guia de encaminhamento'];

interface MedicamentoRow {
  medicamento: string;
  dosagem: string;
  via: string;
  frequencia: string;
  duracao: string;
  observacao: string;
}

const emptyMedicamento = (): MedicamentoRow => ({
  medicamento: '', dosagem: '', via: 'oral', frequencia: '', duracao: '', observacao: ''
});

const GerarDocumentoModal: React.FC<Props> = ({ open, onOpenChange, paciente, profissional, unidade, dataAtendimento }) => {
  const { user } = useAuth();
  const { funcionarios } = useData();
  const [docConfig, setDocConfig] = useState<DocumentConfig | null>(null);
  const [modelos, setModelos] = useState<DocumentTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [conteudoFinal, setConteudoFinal] = useState('');
  const [profDestinoId, setProfDestinoId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [carimbo, setCarimbo] = useState<CarimboData | null>(null);

  // Type-specific fields
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [medicamentos, setMedicamentos] = useState<MedicamentoRow[]>([emptyMedicamento()]);
  const [exibirCid, setExibirCid] = useState(false);

  useEffect(() => {
    if (open) {
      loadModelos();
      loadCarimbo();
      loadDocConfig();
      resetFields();
    }
  }, [open]);

  const loadDocConfig = async () => {
    const cfg = await loadDocumentConfig();
    setDocConfig(cfg);
  };

  const resetFields = () => {
    setSelectedId('');
    setConteudoFinal('');
    setProfDestinoId('');
    setCampos({});
    setMedicamentos([emptyMedicamento()]);
    setExibirCid(false);
  };

  const loadModelos = async () => {
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      const all = (data || []) as unknown as DocumentTemplate[];
      setModelos(all.filter(m => m.perfis_permitidos.includes(user?.role || '')));
    } catch (e) { console.error(e); }
  };

  const loadCarimbo = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('profissionais_carimbo')
      .select('*')
      .eq('profissional_id', user.id)
      .maybeSingle();
    if (data) setCarimbo(data as unknown as CarimboData);
  };

  const hoje = new Date().toLocaleDateString('pt-BR');

  const carimboInlineHtml = (() => {
    if (!carimbo) {
      const nome = profissional?.nome || user?.nome || '—';
      const consName = profissional?.tipo_conselho || '';
      const consNum = profissional?.numero_conselho || '';
      const consUf = profissional?.uf_conselho || '';
      return `<div class="carimbo-digital" style="display:inline-block;border:1px solid #1e293b;border-radius:6px;padding:8px 14px;text-align:center;font-size:12px;line-height:1.4;">
        <div style="font-weight:700;">${nome}</div>
        ${consName ? `<div>${consName} ${consNum}${consUf ? '/' + consUf : ''}</div>` : ''}
        <div style="font-size:10px;color:#64748b;">${unidade || 'CAPS II — Oriximiná/PA'}</div>
      </div>`;
    }
    if (carimbo.tipo === 'imagem' && carimbo.imagem_url) {
      return `<img src="${carimbo.imagem_url}" alt="Carimbo" style="max-width:250px;max-height:120px;" />`;
    }
    return `<div class="carimbo-digital" style="display:inline-block;border:1px solid #1e293b;border-radius:6px;padding:8px 14px;text-align:center;font-size:12px;line-height:1.4;">
      <div style="font-weight:700;">${carimbo.nome || profissional?.nome || ''}</div>
      <div>${carimbo.conselho} ${carimbo.numero_registro}${carimbo.uf ? '-' + carimbo.uf : ''}</div>
      ${carimbo.especialidade ? `<div>${carimbo.especialidade}</div>` : ''}
      ${carimbo.cargo ? `<div>${carimbo.cargo}</div>` : ''}
      <div style="font-size:10px;color:#64748b;">CAPS II — Oriximiná/PA</div>
    </div>`;
  })();

  const substituir = (conteudo: string): string => {
    let text = conteudo
      .replace(/\{\{nome_paciente\}\}/g, paciente?.nome || '—')
      .replace(/\{\{cpf\}\}/g, paciente?.cpf || '—')
      .replace(/\{\{cns\}\}/g, paciente?.cns || '—')
      .replace(/\{\{data_nascimento\}\}/g, paciente?.data_nascimento || '—')
      .replace(/\{\{idade\}\}/g, paciente?.data_nascimento ? (new Date().getFullYear() - new Date(paciente.data_nascimento).getFullYear()).toString() : '—')
      .replace(/\{\{data_atendimento\}\}/g, dataAtendimento || hoje)
      .replace(/\{\{carimbo_profissional\}\}/g, carimboInlineHtml)
      .replace(/\{\{assinatura_profissional\}\}/g, carimboInlineHtml)
      .replace(/\{\{profissional\}\}/g, profissional?.nome || '—')
      .replace(/\{\{cid\}\}/g, campos.cid || paciente?.cid || '—')
      .replace(/\{\{especialidade\}\}/g, campos.especialidade_destino || paciente?.especialidade_destino || '—')
      .replace(/\{\{unidade\}\}/g, unidade || 'CAPS II Oriximiná')
      .replace(/\{\{numero_conselho\}\}/g, profissional?.numero_conselho || '—')
      .replace(/\{\{conselho\}\}/g, profissional?.tipo_conselho || '—')
      .replace(/\{\{data_hoje\}\}/g, hoje);

    const formatIfDate = (val: string) => {
      if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const [y, m, d] = val.split('-');
        return `${d}/${m}/${y}`;
      }
      return val;
    };

    Object.entries(campos).forEach(([k, v]) => {
      const out = v ? formatIfDate(v) : '—';
      const regex = new RegExp(`\\{\\{${k}\\}\\}`, 'g');
      text = text.replace(regex, out);
    });

    if (medicamentos.length > 0 && medicamentos[0].medicamento) {
      const medList = medicamentos
        .filter(m => m.medicamento)
        .map((m, i) => `${i + 1}. ${m.medicamento} — ${m.dosagem}, ${m.via}, ${m.frequencia}, ${m.duracao}${m.observacao ? ` (${m.observacao})` : ''}`)
        .join('\n');
      text = text.replace(/\{\{medicamentos\}\}/g, medList);
    }

    return text;
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setProfDestinoId('');
    setCampos({});
    setMedicamentos([emptyMedicamento()]);
    const m = modelos.find(x => x.id === id);
    if (m) {
      const base = getBaseTemplate(m.tipo);
      const defaults: Record<string, string> = {};
      
      if (base?.campos_manuais) {
        base.campos_manuais.forEach(field => {
          defaults[field] = '';
        });
      }

      if (m.tipo.toLowerCase().includes('atestado')) {
        defaults.dias_afastamento = '1';
        defaults.data_inicio = new Date().toISOString().split('T')[0];
      }
      
      setCampos(defaults);
      setConteudoFinal(substituir(m.conteudo));
    }
  };

  useEffect(() => {
    const m = modelos.find(x => x.id === selectedId);
    if (!m) return;
    setConteudoFinal(substituir(m.conteudo));
  }, [campos, medicamentos, carimbo, selectedId]);

  const selected = modelos.find(x => x.id === selectedId);
  const isEncaminhamento = selected && ENCAMINHAMENTO_TIPOS.includes(selected.tipo.toLowerCase());

  const buildHtmlBody = (signatureHtml: string) => {
    const html = conteudoFinal.includes('<') ? conteudoFinal : conteudoFinal.replace(/\n/g, '<br/>');
    const carimboHtml = formatCarimboBlock(carimbo);
    return `
      <div class="content-block" style="margin-top:20px;">
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;line-height:1.8;">${html}</div>
      </div>
      <div class="doc-sign-footer">
        <div class="sign-block">${signatureHtml}</div>
        <div class="carimbo-block">${carimboHtml}</div>
      </div>
    `;
  };

  const handleSignAndFinalize = async () => {
    if (!selected) return;
    setSalvando(true);
    try {
      const sig = await generateSignature(
        conteudoFinal,
        profissional?.id || user?.id || '',
        profissional?.nome || user?.nome || '',
        profissional?.tipo_conselho || carimbo?.conselho || '',
        profissional?.numero_conselho || carimbo?.numero_registro || '',
        profissional?.uf_conselho || carimbo?.uf || ''
      );

      const signatureHtml = formatSignatureBlock(sig);
      const body = buildHtmlBody(signatureHtml);

      if (isEncaminhamento && profDestinoId) {
        const conselho = profissional ? `${profissional.tipo_conselho} ${profissional.numero_conselho}/${profissional.uf_conselho}` : '';
        await salvarEncaminhamento({
          paciente_id: paciente?.id || '',
          paciente_nome: paciente?.nome || '',
          paciente_cpf: paciente?.cpf || '',
          paciente_cns: paciente?.cns || '',
          paciente_data_nascimento: paciente?.data_nascimento || '',
          paciente_cid: paciente?.cid || '',
          paciente_especialidade_destino: campos.especialidade_destino || paciente?.especialidade_destino || '',
          profissional_origem_id: profissional?.id || user?.id || '',
          profissional_origem_nome: profissional?.nome || user?.nome || '',
          profissional_origem_profissao: profissional?.profissao || '',
          profissional_origem_conselho: conselho,
          profissional_destino_id: profDestinoId,
          especialidade_destino: campos.especialidade_destino || paciente?.especialidade_destino || '',
          conteudo_documento: conteudoFinal,
          observacao: campos.observacoes || '',
          gerado_por: user?.nome || '',
          gerado_por_perfil: user?.role || '',
          unidade: unidade || 'CAPS II Oriximiná',
          tipo_documento: selected.tipo,
        });
      }

      await supabase.from('documentos_gerados').insert({
        paciente_id: paciente?.id || '',
        paciente_nome: paciente?.nome || '',
        profissional_id: profissional?.id || user?.id || '',
        profissional_nome: profissional?.nome || user?.nome || '',
        tipo_documento: selected.tipo,
        conteudo_original: conteudoFinal,
        conteudo_html: body,
        campos_formulario: { ...campos, medicamentos } as any,
        hash_assinatura: sig.hash,
        ip_assinatura: sig.ip,
        assinado_em: sig.timestamp,
        modelo_id: selected.id,
        modelo_versao: selected.version || 1,
        unidade_id: unidade || '',
        status: 'assinado',
      });

      openPrintDocument(selected.tipo, body, {
        'Paciente': paciente?.nome || '',
        'CPF': paciente?.cpf || '',
        'Data': hoje,
      });

      toast.success('✅ Documento assinado e finalizado!');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
    setSalvando(false);
  };

  const updateCampo = (key: string, value: string) => setCampos(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (campos.dias_afastamento && campos.data_inicio) {
      const start = new Date(campos.data_inicio);
      start.setDate(start.getDate() + parseInt(campos.dias_afastamento || '0'));
      updateCampo('data_fim', start.toISOString().split('T')[0]);
    }
  }, [campos.dias_afastamento, campos.data_inicio]);

  const addMedicamento = () => setMedicamentos(prev => [...prev, emptyMedicamento()]);
  const removeMedicamento = (i: number) => setMedicamentos(prev => prev.filter((_, idx) => idx !== i));
  const updateMedicamento = (i: number, field: keyof MedicamentoRow, value: string) => {
    setMedicamentos(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };

  const profissionaisDestino = funcionarios.filter(f => f.ativo && f.role === 'profissional' && f.id !== (profissional?.id || user?.id));

  const renderTypeSpecificFields = () => {
    if (!selected) return null;

    const base = getBaseTemplate(selected.tipo);
    const manualFields = base?.campos_manuais || [];

    if (manualFields.length === 0 && !selected.tipo.toLowerCase().includes('receitu')) return null;

    return (
      <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-xs uppercase text-primary">Campos de Preenchimento</h4>
        </div>
        
        {selected.tipo.toLowerCase().includes('receitu') && (
          <div className="space-y-3 mb-4">
             {medicamentos.map((med, i) => (
                <div key={i} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end border-b pb-2">
                  <div className="space-y-1"><Label className="text-[10px]">Medicamento</Label><Input value={med.medicamento} onChange={e => updateMedicamento(i, 'medicamento', e.target.value)} className="h-8 text-xs" /></div>
                  <div className="space-y-1"><Label className="text-[10px]">Dosagem</Label><Input value={med.dosagem} onChange={e => updateMedicamento(i, 'dosagem', e.target.value)} className="h-8 text-xs" /></div>
                  <div className="space-y-1"><Label className="text-[10px]">Via</Label><Input value={med.via} onChange={e => updateMedicamento(i, 'via', e.target.value)} className="h-8 text-xs" /></div>
                  <div className="space-y-1"><Label className="text-[10px]">Frequência</Label><Input value={med.frequencia} onChange={e => updateMedicamento(i, 'frequencia', e.target.value)} className="h-8 text-xs" /></div>
                  <div className="space-y-1"><Label className="text-[10px]">Duração</Label><Input value={med.duracao} onChange={e => updateMedicamento(i, 'duracao', e.target.value)} className="h-8 text-xs" /></div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeMedicamento(i)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addMedicamento} className="gap-1"><Plus className="w-3.5 h-3.5" /> Adicionar medicamento</Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {manualFields.map(field => {
            const label = field.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            
            if (field.includes('corpo') || field.includes('orientações') || field.includes('resumo') || field.includes('motivo') || field.includes('justificativa') || field.includes('histórico') || field.includes('avaliação') || field.includes('diagnóstico') || field.includes('conclusão') || field.includes('objetivo') || field.includes('intervenções')) {
               return (
                <div key={field} className="md:col-span-2">
                  <FieldArea 
                    label={label} 
                    value={campos[field]} 
                    onChange={v => updateCampo(field, v)} 
                  />
                </div>
              );
            }

            if (field.includes('data')) {
              return (
                <Field 
                  key={field} 
                  label={label} 
                  type="date" 
                  value={campos[field]} 
                  onChange={v => updateCampo(field, v)} 
                />
              );
            }

            if (field.includes('horario')) {
              return (
                <Field 
                  key={field} 
                  label={label} 
                  type="time" 
                  value={campos[field]} 
                  onChange={v => updateCampo(field, v)} 
                />
              );
            }

            if (field === 'prioridade') {
              return (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs font-semibold">Prioridade</Label>
                  <RadioGroup 
                    value={campos.prioridade || 'eletivo'} 
                    onValueChange={v => updateCampo('prioridade', v)} 
                    className="flex gap-4"
                  >
                    {['eletivo', 'prioritário', 'urgência'].map(p => (
                      <div key={p} className="flex items-center gap-1.5">
                        <RadioGroupItem value={p} id={`pri-${p}`} />
                        <Label htmlFor={`pri-${p}`} className="text-xs capitalize">{p}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              );
            }

            return (
              <Field 
                key={field} 
                label={label} 
                value={campos[field]} 
                onChange={v => updateCampo(field, v)} 
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap break-words pr-6">
            <FileText className="w-5 h-5 shrink-0" />
            <span className="break-words">Gerar Documento Clínico</span>
          </DialogTitle>
          <DialogDescription className="break-words">
            {paciente?.nome ? `Paciente: ${paciente.nome}` : 'Selecione um modelo e preencha os campos'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 px-6 py-4">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-bold">Selecionar modelo</Label>
            {modelos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum modelo disponível para seu perfil.</p>
            ) : (
              <Select value={selectedId} onValueChange={handleSelect}>
                <SelectTrigger><SelectValue placeholder="Escolha um modelo..." /></SelectTrigger>
                <SelectContent>
                  {modelos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome} — {m.tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selected && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{selected.tipo}</Badge>
                {paciente?.nome && <span className="text-sm font-medium">{paciente.nome}</span>}
              </div>

              {isEncaminhamento && (
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Profissional destino (fila interna)</Label>
                  <Select value={profDestinoId} onValueChange={setProfDestinoId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o profissional destino..." /></SelectTrigger>
                    <SelectContent>
                      {profissionaisDestino.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {renderTypeSpecificFields()}

              <Separator />

              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Preview</Label>
                <div className="border rounded-lg bg-white max-h-[400px] overflow-y-auto">
                  {docConfig && (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: buildInstitutionalCSS() + docHeader(selected.tipo, docConfig) +
                          '<div class="doc-content" style="padding:0 20px;">' +
                          conteudoFinal.replace(/\n/g, '<br/>') +
                          '</div>' + docFooter(docConfig)
                      }}
                    />
                  )}
                  {!docConfig && (
                    <div className="p-5 text-center text-muted-foreground text-sm">Carregando preview...</div>
                  )}

                  {carimbo && (
                    <div className="mt-6 text-right px-4">
                       <div dangerouslySetInnerHTML={{ __html: formatCarimboBlock(carimbo) }} />
                    </div>
                  )}

                  <div className="mt-4 border border-dashed border-muted-foreground/30 rounded p-3 text-center text-xs text-muted-foreground mx-4 mb-4">
                    <ShieldCheck className="w-4 h-4 mx-auto mb-1" />
                    Bloco de assinatura eletrônica será inserido ao assinar
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 border-t p-4 shrink-0 bg-background">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {selected && (
              <Button onClick={handleSignAndFinalize} disabled={salvando} className="gap-1.5">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Assinar e Imprimir
              </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type FieldProps = {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
};

const Field = React.forwardRef<HTMLInputElement, FieldProps>(({ label, value, onChange, type = 'text', disabled }, ref) => (
  <div className="space-y-1">
    <Label className="text-xs font-semibold">{label}</Label>
    <Input
      ref={ref}
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className="h-8 text-xs"
      disabled={disabled}
    />
  </div>
));
Field.displayName = 'Field';

type FieldAreaProps = {
  label: string;
  value?: string;
  onChange: (v: string) => void;
};

const FieldArea = React.forwardRef<HTMLTextAreaElement, FieldAreaProps>(({ label, value, onChange }, ref) => (
  <div className="space-y-1">
    <Label className="text-xs font-semibold">{label}</Label>
    <Textarea ref={ref} value={value || ''} onChange={e => onChange(e.target.value)} className="min-h-[60px] text-xs" />
  </div>
));
FieldArea.displayName = 'FieldArea';

export default GerarDocumentoModal;
