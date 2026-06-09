import React, { useEffect, useState, lazy, Suspense } from 'react';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText, Plus, Pencil, Trash2, Eye, Copy, Loader2, Printer, Search, Globe, Building2, UserIcon, Filter, RefreshCw, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { openPrintDocument } from '@/lib/printLayout';
import { MODELOS_BASE, getBaseTemplate } from '@/constants/modelosBase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const RichTextEditor = lazy(() => import('@/components/editor/RichTextEditor'));
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


export interface TemplateVersion {
  id?: string;
  conteudo: string;
  salvo_em: string;
  salvo_por?: string;
  version: number;
}

export interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  ativo: boolean;
  perfis_permitidos: string[];
  tipo_modelo: 'GLOBAL' | 'UNIDADE' | 'PROFISSIONAL';
  unidade_id: string;
  criado_por: string;
  criado_por_nome: string;
  version: number;
  is_default: boolean;
  especialidade_id?: string;
  profissao_id?: string;
  historico_edicoes: TemplateVersion[];
  blocos_clinicos: any[];
  created_at: string;
  updated_at: string;
}

export const TIPOS_DOCUMENTO = [
  'Declaração de Comparecimento',
  'Declaração de Acompanhante',
  'Atestado Médico',
  'Receituário',
  'Encaminhamento',
  'Solicitação de Exames',
  'Relatório de Evolução Clínica',
  'Relatório Multiprofissional',
  'Relatório de Alta',
  'Parecer Técnico',
  'Laudo',
  'Plano Terapêutico',
  'Termo de Consentimento',
  'Termo de Responsabilidade',
  'Autorização',
  'Guia de Referência',
  'Guia de Contrarreferência',
  'Documento personalizado'
];


const PERFIS = [
  { value: 'master', label: 'Master' },
  { value: 'gestao', label: 'Gestão' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'avaliacao_enfermagem', label: 'Enfermagem' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'triagem', label: 'Triagem' },
];

const TIPO_MODELO_LABELS = {
  GLOBAL: { label: 'Global', icon: Globe, color: 'text-blue-600' },
  UNIDADE: { label: 'Unidade', icon: Building2, color: 'text-green-600' },
  PROFISSIONAL: { label: 'Pessoal', icon: UserIcon, color: 'text-orange-600' },
};

const substituirVariaveis = (conteudo: string): string => {
  const hoje = new Date().toLocaleDateString('pt-BR');
  return conteudo
    .replace(/\{\{nome_paciente\}\}/g, 'João da Silva')
    .replace(/\{\{cpf\}\}/g, '123.456.789-00')
    .replace(/\{\{cns\}\}/g, '123 4567 8901 2345')
    .replace(/\{\{data_nascimento\}\}/g, '01/01/1990')
    .replace(/\{\{idade\}\}/g, '34')
    .replace(/\{\{telefone\}\}/g, '(93) 98888-7777')
    .replace(/\{\{endereco\}\}/g, 'Rua das Flores, 123 - Centro')
    .replace(/\{\{data_atendimento\}\}/g, hoje)
    .replace(/\{\{hora_atendimento\}\}/g, '08:30')
    .replace(/\{\{profissional\}\}/g, 'Dr. Maria Santos')
    .replace(/\{\{especialidade\}\}/g, 'Fisioterapia')
    .replace(/\{\{conselho\}\}/g, 'CREFITO')
    .replace(/\{\{numero_conselho\}\}/g, '12345/PA')
    .replace(/\{\{unidade\}\}/g, 'CAPS II Oriximiná')
    .replace(/\{\{queixa_principal\}\}/g, 'Dor lombar crônica')
    .replace(/\{\{evolucao\}\}/g, 'Paciente apresenta melhora no quadro álgico...')
    .replace(/\{\{conduta\}\}/g, 'Manter exercícios terapêuticos e reavaliação em 15 dias.')
    .replace(/\{\{cid\}\}/g, 'M54.5')
    .replace(/\{\{medicamentos\}\}/g, '1. Paracetamol 500mg — Oral, 8/8h, 5 dias')
    .replace(/\{\{exames\}\}/g, '1. Raio-X de Coluna Lombar')
    .replace(/\{\{assinatura_profissional\}\}/g, '<div style="border-top:1px solid #000; width:200px; margin-top:40px; text-align:center;">Assinatura do Profissional</div>')
    .replace(/\{\{data_hoje\}\}/g, hoje);
};


const ModelosDocumentos: React.FC = () => {
  const { user, isGlobalAdmin } = useAuth();
  const [modelos, setModelos] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [current, setCurrent] = useState<DocumentTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterTipoModelo, setFilterTipoModelo] = useState('todos');

  useEffect(() => { loadModelos(); }, []);

  const loadModelos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setModelos((data || []) as unknown as DocumentTemplate[]);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar modelos');
    }
    setLoading(false);
  };

  const openNew = (tipo?: string) => {
    const base = tipo ? getBaseTemplate(tipo) : undefined;
    setCurrent({
      id: '',
      nome: base ? base.nome : (tipo ? `${tipo} Padrão` : ''),
      tipo: tipo || TIPOS_DOCUMENTO[0],
      conteudo: base?.conteudo || '',
      ativo: true,
      perfis_permitidos: base?.perfis_permitidos || ['master', 'profissional'],
      tipo_modelo: user?.role === 'master' || isGlobalAdmin ? 'UNIDADE' : 'PROFISSIONAL',
      unidade_id: user?.unidadeId || '',
      criado_por: user?.id || '',
      criado_por_nome: user?.nome || '',
      version: 1,
      is_default: false,
      historico_edicoes: [],
      blocos_clinicos: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setEditOpen(true);
  };



  const openEdit = (m: DocumentTemplate) => {
    setCurrent({ ...m, historico_edicoes: m.historico_edicoes || [] });
    setEditOpen(true);
  };


  const handleSave = async () => {
    if (!current) return;
    if (!current.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!current.conteudo.trim()) { toast.error('Conteúdo é obrigatório'); return; }
    setSaving(true);
    try {
      const isNew = !current.id || !modelos.some(m => m.id === current.id);
      let payload: any = {
        nome: current.nome,
        tipo: current.tipo,
        conteudo: current.conteudo,
        ativo: current.ativo,
        perfis_permitidos: current.perfis_permitidos,
        tipo_modelo: isGlobalAdmin && current.tipo_modelo === 'GLOBAL' ? 'GLOBAL' : current.tipo_modelo,
        unidade_id: current.tipo_modelo === 'GLOBAL' ? '' : (current.unidade_id || user?.unidadeId || ''),
        criado_por: current.criado_por || user?.id || '',
        criado_por_nome: current.criado_por_nome || user?.nome || '',
        is_default: current.is_default,
        especialidade_id: current.especialidade_id,
        profissao_id: current.profissao_id,
        blocos_clinicos: current.blocos_clinicos as any,
      };

      if (isNew) {
        payload.version = 1;
        payload.historico_edicoes = [];
        const { error } = await supabase.from('document_templates').insert(payload);
        if (error) throw error;
      } else {
        const old = modelos.find(m => m.id === current.id);
        if (old && old.conteudo !== current.conteudo) {
          const historico = [...(current.historico_edicoes || [])];
          historico.unshift({ 
            conteudo: old.conteudo, 
            salvo_em: old.updated_at, 
            version: old.version || 1,
            salvo_por: user?.nome
          });
          payload.historico_edicoes = historico.slice(0, 20); // Maintain more history
          payload.version = (old.version || 1) + 1;
        }
        const { error } = await supabase.from('document_templates').update(payload).eq('id', current.id);
        if (error) throw error;
      }

      toast.success('Modelo salvo!');
      setEditOpen(false);
      loadModelos();
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || ''));
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este modelo?')) return;
    const { error } = await supabase.from('document_templates').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Modelo excluído');
    loadModelos();
  };

  const handleToggle = async (id: string, ativo: boolean) => {
    await supabase.from('document_templates').update({ ativo }).eq('id', id);
    loadModelos();
  };

  const handleDuplicate = (m: DocumentTemplate) => {
    setCurrent({
      ...m,
      id: '',
      nome: m.nome + ' (Cópia)',
      criado_por: user?.id || '',
      criado_por_nome: user?.nome || '',
      tipo_modelo: 'PROFISSIONAL',
      version: 1,
      historico_edicoes: [],
      is_default: false,

    });
    setEditOpen(true);
  };

  const handlePreview = (m: DocumentTemplate) => {
    setPreviewHtml(substituirVariaveis(m.conteudo));
    setPreviewOpen(true);
  };

  const handlePrintPreview = (m: DocumentTemplate) => {
    const html = substituirVariaveis(m.conteudo);
    const body = `
      <div class="content-block" style="margin-top:20px;">
        <div style="font-size:14px;line-height:1.8;">${html}</div>
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <div class="name">Dr. Maria Santos</div>
        <div class="role">Fisioterapia — CRF 12345/PA</div>
      </div>
    `;
    openPrintDocument(m.tipo, body, {
      'Paciente': 'João da Silva',
      'CPF': '123.456.789-00',
      'Data': new Date().toLocaleDateString('pt-BR'),
    });
  };

  const canEdit = (m: DocumentTemplate) => {
    if (isGlobalAdmin) return true;
    if (user?.role === 'master') return m.tipo_modelo !== 'GLOBAL';
    return m.criado_por === user?.id;
  };

  const handleRestoreBase = () => {
    if (!current) return;
    const base = getBaseTemplate(current.tipo);
    if (base && confirm('Restaurar para o modelo-base padrão? Suas alterações atuais serão perdidas.')) {
      setCurrent({
        ...current,
        conteudo: base.conteudo,
        perfis_permitidos: base.perfis_permitidos
      });
      toast.info('Modelo-base restaurado. Não esqueça de salvar.');
    }
  };

  const handleApplyBase = async (m: DocumentTemplate) => {
    const base = getBaseTemplate(m.tipo);
    if (base && confirm(`Deseja atualizar "${m.nome}" para o novo modelo-base padrão? Uma nova versão será criada.`)) {
      const payload = {
        conteudo: base.conteudo,
        perfis_permitidos: base.perfis_permitidos,
        version: (m.version || 1) + 1,
        updated_at: new Date().toISOString()
      };
      
      const { error } = await supabase.from('document_templates').update(payload).eq('id', m.id);
      if (error) {
        toast.error('Erro ao atualizar: ' + error.message);
      } else {
        toast.success('Modelo atualizado com sucesso!');
        loadModelos();
      }
    }
  };

  if (loading) {
    return (
      <Card className="shadow-card border-0">
        <CardContent className="p-5 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando modelos...
        </CardContent>
      </Card>
    );
  }


  const filtered = modelos.filter(m => {
    if (search && !m.nome.toLowerCase().includes(search.toLowerCase()) && !m.tipo.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTipo !== 'todos' && m.tipo !== filterTipo) return false;
    if (filterTipoModelo !== 'todos' && m.tipo_modelo !== filterTipoModelo) return false;
    return true;
  });

  return (
    <>
      <Card className="shadow-card border-0">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold font-display text-foreground">Modelos de Documentos Clínicos</h3>
                <p className="text-sm text-muted-foreground">{modelos.length} modelo(s) disponível(is)</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Select onValueChange={(v) => openNew(v)}>
                <SelectTrigger className="w-[200px] h-9 gap-2">
                  <Plus className="w-4 h-4" />
                  <span>Novo por Modelo-Base</span>
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DOCUMENTO.map(t => (
                    <SelectItem key={t} value={t}>
                      <div className="flex flex-col">
                        <span>{t}</span>
                        <span className="text-[10px] text-muted-foreground">Usar padrão profissional</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => openNew()} size="sm" variant="outline" className="gap-1.5 h-9">
                Em Branco
              </Button>

            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar modelo..."
                className="pl-8 h-9"
              />
            </div>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[180px] h-9">
                <Filter className="w-3.5 h-3.5 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {TIPOS_DOCUMENTO.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTipoModelo} onValueChange={setFilterTipoModelo}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="GLOBAL">Global</SelectItem>
                <SelectItem value="UNIDADE">Unidade</SelectItem>
                <SelectItem value="PROFISSIONAL">Pessoal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum modelo encontrado.</p>
              <p className="text-xs">Clique em "Novo Modelo" para criar.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(m => {
                const tipoInfo = TIPO_MODELO_LABELS[m.tipo_modelo] || TIPO_MODELO_LABELS.UNIDADE;
                const TipoIcon = tipoInfo.icon;
                const base = getBaseTemplate(m.tipo);
                const isOutdated = base && m.conteudo !== base.conteudo;

                return (
                  <div
                    key={m.id}
                    className={`border rounded-lg p-4 transition-colors ${m.ativo ? 'bg-background hover:bg-muted/20' : 'bg-muted/40 opacity-70'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm truncate">{m.nome}</h4>
                          <Badge variant="outline" className="text-xs shrink-0">{m.tipo}</Badge>
                          <Badge variant="secondary" className={`text-[10px] gap-1 ${tipoInfo.color}`}>
                            <TipoIcon className="w-3 h-3" />
                            {tipoInfo.label}
                          </Badge>
                          {!m.ativo && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                          {isOutdated && (
                            <Badge 
                              variant="outline" 
                              className="text-[10px] bg-amber-50 text-amber-600 border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
                              onClick={() => handleApplyBase(m)}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" /> Atualização disponível
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {m.conteudo.replace(/<[^>]*>/g, '').slice(0, 120)}...
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">por {m.criado_por_nome || '—'}</span>
                          <div className="flex gap-1 flex-wrap">
                            {(m.perfis_permitidos || []).map(p => (
                              <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{p}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {canEdit(m) && <Switch checked={m.ativo} onCheckedChange={v => handleToggle(m.id, v)} />}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePreview(m)} title="Preview">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrintPreview(m)} title="Imprimir">
                          <Printer className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDuplicate(m)} title="Duplicar">
                          <Copy className="w-4 h-4" />
                        </Button>
                        {canEdit(m) && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)} title="Editar">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(m.id)} title="Excluir">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {current?.id ? 'Editar Modelo' : 'Novo Modelo'}
            </DialogTitle>
          </DialogHeader>

          {current && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Nome do modelo</Label>
                  <Input
                    value={current.nome}
                    onChange={e => setCurrent({ ...current, nome: e.target.value })}
                    placeholder="Ex: Atestado padrão CAPS II"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Tipo de documento</Label>
                  <Select 
                    value={current.tipo} 
                    onValueChange={v => {
                      const base = getBaseTemplate(v);
                      const shouldUpdate = !current.id && (!current.conteudo || current.conteudo === '<p><br></p>' || current.conteudo === '');
                      
                      if (shouldUpdate && base) {
                        setCurrent({ 
                          ...current, 
                          tipo: v, 
                          nome: base.nome, 
                          conteudo: base.conteudo,
                          perfis_permitidos: base.perfis_permitidos
                        });
                        toast.info(`Carregado modelo-base para ${v}`);
                      } else {
                        setCurrent({ ...current, tipo: v });
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_DOCUMENTO.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Tipo de modelo</Label>
                  <Select
                    value={current.tipo_modelo}
                    onValueChange={v => setCurrent({ ...current, tipo_modelo: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {isGlobalAdmin && <SelectItem value="GLOBAL">🌐 Global (todas unidades)</SelectItem>}
                      {(isGlobalAdmin || user?.role === 'master') && <SelectItem value="UNIDADE">🏥 Unidade</SelectItem>}
                      <SelectItem value="PROFISSIONAL">👤 Pessoal (meu modelo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Rich Editor with Smart Preview and Variables */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[13px] font-bold">Conteúdo do documento</Label>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-[10px] gap-1"
                      onClick={() => {
                        const base = getBaseTemplate(current.tipo);
                        if (base && confirm('Deseja restaurar o conteúdo para o padrão deste tipo de documento? Todas as alterações atuais serão perdidas no editor.')) {
                          setCurrent({ 
                            ...current, 
                            conteudo: base.conteudo,
                            perfis_permitidos: base.perfis_permitidos
                          });
                          toast.success('Modelo padrão restaurado no editor');
                        }
                      }}
                    >
                      <RefreshCw className="w-3 h-3" /> Restaurar Padrão
                    </Button>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded cursor-help">
                            <Info className="w-3 h-3" /> Variáveis Sugeridas
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[300px]">
                          <p className="font-bold mb-1">Use {`{{ }}`} para variáveis:</p>
                          <div className="flex flex-wrap gap-1">
                            {getBaseTemplate(current.tipo)?.variaveis.map(v => (
                              <Badge key={v} variant="outline" className="text-[9px]">{`{{${v}}}`}</Badge>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 border rounded-xl overflow-hidden bg-muted/20">
                  <div className="bg-background min-h-[400px] border-r">
                    <Suspense fallback={<div className="h-[200px] flex items-center justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" />Carregando editor...</div>}>
                      <RichTextEditor
                        content={current.conteudo}
                        onChange={html => setCurrent(prev => prev ? { ...prev, conteudo: html } : prev)}
                        placeholder="Digite o conteúdo do documento ou insira variáveis..."
                      />
                    </Suspense>
                  </div>
                  
                  <div className="bg-white p-6 shadow-inner overflow-y-auto max-h-[600px] hidden lg:block">
                    <div className="sticky top-0 right-0 float-right mb-2">
                      <Badge variant="secondary" className="text-[9px] gap-1">
                        <Eye className="w-3 h-3" /> Preview A4 (Simulado)
                      </Badge>
                    </div>
                    <div className="clear-both">
                      <div className="text-center mb-6">
                        <h4 className="font-bold text-[10px] uppercase text-primary">Secretaria Municipal de Saúde de Oriximiná</h4>
                        <p className="text-[9px] text-muted-foreground">CAPS II — Sistema de Gestão em Saúde</p>
                      </div>
                      <Separator className="mb-4" />
                      <div className="text-[12px] leading-relaxed min-h-[500px]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(substituirVariaveis(current.conteudo)) }} />
                    </div>
                  </div>
                </div>
                
                {/* Variable Validation */}
                <div className="flex flex-wrap gap-2">
                  {getBaseTemplate(current.tipo)?.variaveis.map(v => {
                    const exists = current.conteudo.includes(`{{${v}}}`);
                    return (
                      <Badge key={v} variant={exists ? "secondary" : "outline"} className={`text-[9px] gap-1 ${exists ? 'bg-green-100 text-green-700 border-green-200' : 'text-amber-600 border-amber-200 opacity-70'}`}>
                        {exists ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                        {`{{${v}}}`}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* Perfis */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Perfis que podem usar</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PERFIS.map(p => (
                    <label key={p.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={current.perfis_permitidos.includes(p.value)}
                        onCheckedChange={checked => {
                          const perfis = checked
                            ? [...current.perfis_permitidos, p.value]
                            : current.perfis_permitidos.filter(x => x !== p.value);
                          setCurrent({ ...current, perfis_permitidos: perfis });
                        }}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={current.ativo} onCheckedChange={v => setCurrent({ ...current, ativo: v })} />
                <Label className="text-sm">Modelo ativo</Label>
              </div>

              {/* Version History */}
              {current.historico_edicoes && current.historico_edicoes.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Histórico ({current.historico_edicoes.length})</Label>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto">
                    {current.historico_edicoes.map((v, i) => (
                      <div key={i} className="flex items-center justify-between border rounded p-2 bg-muted/30 text-xs">
                        <div>
                          <Badge variant="outline" className="text-[10px] mr-2">v{v.version}</Badge>
                          <span className="text-muted-foreground">{new Date(v.salvo_em).toLocaleString('pt-BR')}</span>
                          {v.salvo_por && <span className="text-muted-foreground ml-1">por {v.salvo_por}</span>}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => {
                            if (confirm('Restaurar esta versão?')) {
                              const historico = [...(current.historico_edicoes || [])];
                              // Push current as a version before restoring
                              historico.unshift({ 
                                conteudo: current.conteudo, 
                                salvo_em: new Date().toISOString(),
                                version: current.version,
                                salvo_por: user?.nome
                              });
                              setCurrent({ 
                                ...current, 
                                conteudo: v.conteudo, 
                                version: v.version,
                                historico_edicoes: historico.slice(0, 20) 
                              });
                              toast.info('Versão restaurada no editor. Salve para confirmar.');
                            }
                          }}
                        >
                          Restaurar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar Modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Pré-visualização
            </DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg p-6 bg-white text-foreground">
            <div className="text-center mb-4">
              <h3 className="font-bold text-sm uppercase text-primary">Secretaria Municipal de Saúde de Oriximiná</h3>
              <p className="text-xs text-muted-foreground">CAPS II — Sistema de Gestão em Saúde</p>
            </div>
            <Separator className="mb-4" />
            <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }} />
            <div className="mt-10 text-center">
              <div className="w-64 border-t border-foreground mx-auto mb-1" />
              <p className="text-xs font-semibold">Dr. Maria Santos</p>
              <p className="text-xs text-muted-foreground">Fisioterapia — CRF 12345/PA</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">As variáveis foram substituídas por dados de exemplo.</p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ModelosDocumentos;
