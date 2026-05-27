import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, AlertTriangle, Trash2, ClipboardList, Target, Zap, CheckCircle2, Info, Search, Tag, FileText } from 'lucide-react';
import { BuscaProcedimento } from '../BuscaProcedimento';
import { BuscaCID } from '../BuscaCID';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ptsService, type PTSMeta } from '@/services/ptsService';
import { PTSMetaForm } from './PTSMetaForm';
import { 
  PTS_PRIORITIES, 
  PTS_CONTEXTS, 
  PTS_ATTENDANCE_TYPES, 
  SPECIALTIES, 
  DEFAULT_METAS_BY_SPECIALTY 
} from '@/data/ptsConstants';

const SPECIALTY_TO_SIGTAP: Record<string, string> = {
  'Fisioterapia': 'fisioterapia',
  'Fonoaudiologia': 'fonoaudiologia',
  'Psicologia': 'psicologia',
  'Terapia Ocupacional': 'terapia_ocupacional',
  'Nutrição': 'nutricao',
  'Serviço Social': 'assistencia_social',
  'Enfermagem': 'avaliacao_enfermagem',
};

interface CreatePTSModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteId: string;
  pacienteNome: string;
  onSuccess?: () => void;
}

export const CreatePTSModal: React.FC<CreatePTSModalProps> = ({
  open,
  onOpenChange,
  pacienteId,
  pacienteNome,
  onSuccess
}) => {
  const { user } = useAuth();
  const { logAction, funcionarios } = useData();
  const [saving, setSaving] = useState(false);
  const [loadingProcs, setLoadingProcs] = useState(false);
  const [activeTab, setActiveTab] = useState('contexto');
  
  const [form, setForm] = useState({
    diagnostico_funcional: '',
    objetivos_terapeuticos: '',
    especialidades_envolvidas: [] as string[],
    prioridade: 'media',
    contextos_afetados: [] as string[],
    fatores_risco_vulnerabilidade: '',
    rede_apoio: '',
    tipo_atendimento: [] as string[],
    necessidade_interdisciplinar: false,
    motivo_encaminhamento: '',
    barreiras: '',
    potencialidades: '',
    objetivos_especificos: '',
    plano_conduta: '',
    data_proxima_revisao: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    revisao_obrigatoria: true,
    ciencia_familia: false,
  });

  const [metas, setMetas] = useState<PTSMeta[]>([]);
  const [sigtapProcs, setSigtapProcs] = useState<any[]>([]);
  const [selectedProcCodigo, setSelectedProcCodigo] = useState('');
  const [sigtapSelecionados, setSigtapSelecionados] = useState<any[]>([]);
  const [cidsSelecionados, setCidsSelecionados] = useState<any[]>([]);

  const isMaster = user?.role === 'master';
  const isProfissional = user?.role === 'profissional';

  // Sugerir metas ao selecionar especialidades
  useEffect(() => {
    if (form.especialidades_envolvidas.length === 0) return;
    
    const lastSpec = form.especialidades_envolvidas[form.especialidades_envolvidas.length - 1];
    const suggestions = DEFAULT_METAS_BY_SPECIALTY[lastSpec] || [];
    
    if (suggestions.length > 0) {
      const existingTitles = metas.map(m => m.titulo);
      const newMetas = suggestions
        .filter(title => !existingTitles.includes(title))
        .map(title => ({
          titulo: title,
          descricao: '',
          categoria: 'curto',
          especialidade: lastSpec,
          prioridade: 'media',
          status: 'nao_iniciado',
          indicador_sucesso: '',
          observacoes: ''
        }));
      
      if (newMetas.length > 0) {
        setMetas(prev => [...prev, ...newMetas]);
        toast.info(`Sugeridas ${newMetas.length} metas para ${lastSpec}`);
      }
    }
  }, [form.especialidades_envolvidas]);

  // Load SIGTAP procedures based on selected specialties
  useEffect(() => {
    if (!open) return;
    
    const loadProcs = async () => {
      setLoadingProcs(true);
      try {
        const sigtapKeys = form.especialidades_envolvidas.map(s => SPECIALTY_TO_SIGTAP[s]).filter(Boolean);
        let query = supabase.from('sigtap_procedimentos').select('*').eq('ativo', true);
        if (sigtapKeys.length > 0) {
          query = query.in('especialidade', sigtapKeys);
        } else {
          query = query.limit(50);
        }
        const { data } = await query.order('codigo');
        setSigtapProcs(data || []);
      } finally {
        setLoadingProcs(false);
      }
    };
    loadProcs();
  }, [open, form.especialidades_envolvidas]);

  const toggleSpec = (spec: string) => {
    setForm(p => {
      const newSpecs = p.especialidades_envolvidas.includes(spec)
        ? p.especialidades_envolvidas.filter(s => s !== spec)
        : [...p.especialidades_envolvidas, spec];
      return { ...p, especialidades_envolvidas: newSpecs };
    });
  };

  const toggleContext = (ctx: string) => {
    setForm(p => {
      const newCtx = p.contextos_afetados.includes(ctx)
        ? p.contextos_afetados.filter(c => c !== ctx)
        : [...p.contextos_afetados, ctx];
      return { ...p, contextos_afetados: newCtx };
    });
  };

  const toggleAttendance = (type: string) => {
    setForm(p => {
      const newTypes = p.tipo_atendimento.includes(type)
        ? p.tipo_atendimento.filter(t => t !== type)
        : [...p.tipo_atendimento, type];
      return { ...p, tipo_atendimento: newTypes };
    });
  };

  const addMeta = () => {
    setMetas(prev => [...prev, {
      titulo: '',
      descricao: '',
      categoria: 'curto',
      especialidade: form.especialidades_envolvidas[0] || '',
      prioridade: 'media',
      status: 'nao_iniciado',
      indicador_sucesso: '',
      observacoes: ''
    }]);
  };

  const updateMeta = (index: number, updated: PTSMeta) => {
    const newMetas = [...metas];
    newMetas[index] = updated;
    setMetas(newMetas);
  };

  const removeMeta = (index: number) => {
    setMetas(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddSigtap = () => {
    const proc = sigtapProcs.find(p => p.codigo === selectedProcCodigo);
    if (!proc) return;
    if (sigtapSelecionados.some(s => s.procedimento_codigo === proc.codigo)) return;
    setSigtapSelecionados(prev => [...prev, {
      procedimento_codigo: proc.codigo,
      procedimento_nome: proc.nome,
      especialidade: proc.especialidade,
    }]);
    setSelectedProcCodigo('');
  };

  const handleSave = async () => {
    if (!pacienteId || !form.diagnostico_funcional || !form.objetivos_terapeuticos) {
      toast.error('Preencha os campos obrigatórios (Diagnóstico e Objetivos).');
      setActiveTab('contexto');
      return;
    }

    if (metas.length === 0) {
      toast.error('Adicione pelo menos uma meta ao PTS.');
      setActiveTab('metas');
      return;
    }

    setSaving(true);
    try {
      const ptsId = await ptsService.createPTS(
        {
          ...form,
          patient_id: pacienteId,
          professional_id: user?.id,
          unit_id: user?.unidadeId,
          status: 'ativo'
        },
        metas,
        sigtapSelecionados,
        cidsSelecionados
      );

      // Prontuario entry for audit/history
      await supabase.from('prontuarios').insert({
        paciente_id: pacienteId,
        paciente_nome: pacienteNome,
        profissional_id: user?.id,
        profissional_nome: user?.nome,
        unidade_id: user?.unidadeId,
        data_atendimento: new Date().toISOString().split('T')[0],
        hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        tipo_registro: 'pts',
        queixa_principal: 'Criação de PTS Estruturado',
        anamnese: `Diagnóstico: ${form.diagnostico_funcional}\nContextos: ${form.contextos_afetados.join(', ')}`,
        hipotese: `Objetivo: ${form.objetivos_terapeuticos}`,
        conduta: `Plano: ${form.plano_conduta}\nMetas: ${metas.length} metas definidas.`,
      });

      await logAction({
        acao: 'criar_pts_estruturado',
        entidade: 'pts',
        entidadeId: ptsId,
        modulo: 'pts',
        user,
        detalhes: { paciente_id: pacienteId, metas_count: metas.length }
      });

      toast.success('Projeto Terapêutico Singular criado com sucesso!');
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao salvar PTS');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-0">
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <ClipboardList className="w-6 h-6 text-primary" />
              Evolução do Projeto Terapêutico Singular (PTS)
            </DialogTitle>
          </DialogHeader>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-6 border-b bg-muted/20">
            <TabsList className="bg-transparent h-12 gap-6 p-0">
              <TabsTrigger value="contexto" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 gap-2">
                <Info className="w-4 h-4" /> Contexto
              </TabsTrigger>
              <TabsTrigger value="clinico" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 gap-2">
                <Zap className="w-4 h-4" /> Clínico
              </TabsTrigger>
              <TabsTrigger value="metas" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 gap-2">
                <Target className="w-4 h-4" /> Metas
              </TabsTrigger>
              <TabsTrigger value="execucao" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 gap-2">
                <CheckCircle2 className="w-4 h-4" /> Execução
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            <TabsContent value="contexto" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                    <Label className="text-[10px] uppercase font-black text-primary tracking-widest">Paciente</Label>
                    <p className="font-bold text-lg">{pacienteNome}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Motivo do Encaminhamento</Label>
                    <Textarea 
                      placeholder="Por que o paciente foi encaminhado para o PTS?" 
                      value={form.motivo_encaminhamento}
                      onChange={e => setForm(p => ({ ...p, motivo_encaminhamento: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Prioridade do Caso</Label>
                    <div className="flex flex-wrap gap-2">
                      {PTS_PRIORITIES.map(p => (
                        <Button
                          key={p.value}
                          type="button"
                          variant={form.prioridade === p.value ? 'default' : 'outline'}
                          size="sm"
                          className={form.prioridade === p.value ? '' : 'text-muted-foreground'}
                          onClick={() => setForm(prev => ({ ...prev, prioridade: p.value }))}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Contextos Afetados</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {PTS_CONTEXTS.map(ctx => (
                        <label key={ctx.id} className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                          <Checkbox 
                            checked={form.contextos_afetados.includes(ctx.id)}
                            onCheckedChange={() => toggleContext(ctx.id)}
                          />
                          <span className="text-xs font-medium">{ctx.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Rede de Apoio</Label>
                    <Textarea 
                      placeholder="Família, escola, comunidade..." 
                      rows={2}
                      value={form.rede_apoio}
                      onChange={e => setForm(p => ({ ...p, rede_apoio: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold">Fatores de Risco / Vulnerabilidade</Label>
                <Textarea 
                  placeholder="Situações que podem comprometer o tratamento..." 
                  value={form.fatores_risco_vulnerabilidade}
                  onChange={e => setForm(p => ({ ...p, fatores_risco_vulnerabilidade: e.target.value }))}
                />
              </div>
            </TabsContent>

            <TabsContent value="clinico" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Diagnóstico Funcional Global *</Label>
                    <Textarea 
                      rows={4} 
                      placeholder="Descreva o estado funcional e as necessidades principais..."
                      value={form.diagnostico_funcional}
                      onChange={e => setForm(p => ({ ...p, diagnostico_funcional: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Potencialidades do Paciente</Label>
                    <Textarea 
                      rows={3} 
                      placeholder="Habilidades e pontos fortes do paciente..."
                      value={form.potencialidades}
                      onChange={e => setForm(p => ({ ...p, potencialidades: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Objetivos Terapêuticos Gerais *</Label>
                    <Textarea 
                      rows={4} 
                      placeholder="Onde queremos chegar com este PTS?"
                      value={form.objetivos_terapeuticos}
                      onChange={e => setForm(p => ({ ...p, objetivos_terapeuticos: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Barreiras e Dificuldades</Label>
                    <Textarea 
                      rows={3} 
                      placeholder="O que pode dificultar o progresso?"
                      value={form.barreiras}
                      onChange={e => setForm(p => ({ ...p, barreiras: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="metas" className="space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <h4 className="font-bold flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  Metas Estruturadas ({metas.length})
                </h4>
                <Button size="sm" onClick={addMeta} variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" /> Adicionar Meta
                </Button>
              </div>

              {metas.length === 0 ? (
                <div className="py-12 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
                  <Target className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-sm">Nenhuma meta adicionada. Selecione especialidades para receber sugestões.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {metas.map((meta, index) => (
                    <PTSMetaForm 
                      key={index} 
                      meta={meta} 
                      professionals={funcionarios}
                      onChange={(updated) => updateMeta(index, updated)}
                      onRemove={() => removeMeta(index)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="execucao" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Especialidades Envolvidas</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {SPECIALTIES.map(spec => (
                        <label key={spec} className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                          <Checkbox 
                            checked={form.especialidades_envolvidas.includes(spec)}
                            onCheckedChange={() => toggleSpec(spec)}
                          />
                          <span className="text-xs font-medium">{spec}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Tipo de Atendimento</Label>
                    <div className="flex flex-wrap gap-2">
                      {PTS_ATTENDANCE_TYPES.map(type => (
                        <label key={type.id} className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                          <Checkbox 
                            checked={form.tipo_atendimento.includes(type.id)}
                            onCheckedChange={() => toggleAttendance(type.id)}
                          />
                          <span className="text-xs font-medium">{type.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
                    <Checkbox 
                      id="interdisciplinary" 
                      checked={form.necessidade_interdisciplinar}
                      onCheckedChange={(v) => setForm(p => ({ ...p, necessidade_interdisciplinar: !!v }))}
                    />
                    <Label htmlFor="interdisciplinary" className="text-sm cursor-pointer">Necessidade de atuação interdisciplinar contínua</Label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 border rounded-lg bg-primary/5 space-y-4">
                    <Label className="text-sm font-bold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      Procedimentos SIGTAP
                    </Label>
                    
                    <div className="space-y-3">
                      <BuscaProcedimento 
                        onChange={(proc) => {
                          if (sigtapSelecionados.some(s => s.procedimento_codigo === proc.id)) {
                            toast.error("Procedimento já adicionado");
                            return;
                          }
                          setSigtapSelecionados(prev => [...prev, {
                            procedimento_codigo: proc.id,
                            procedimento_nome: proc.nome,
                            especialidade: proc.especialidade,
                          }]);
                        }}
                        placeholder="Buscar por código ou nome do procedimento..."
                      />

                      {sigtapSelecionados.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {sigtapSelecionados.map(s => (
                            <Badge key={s.procedimento_codigo} variant="secondary" className="pl-2 pr-1 py-1 gap-1 border-primary/20 bg-primary/5 text-primary">
                              <span className="text-[10px] font-mono opacity-70 mr-1">{s.procedimento_codigo}</span>
                              <span className="max-w-[200px] truncate">{s.procedimento_nome}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-4 w-4 ml-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive" 
                                onClick={() => setSigtapSelecionados(p => p.filter(x => x.procedimento_codigo !== s.procedimento_codigo))}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg bg-blue-50/30 space-y-4">
                    <Label className="text-sm font-bold flex items-center gap-2 text-blue-700">
                      <Tag className="w-4 h-4" />
                      Diagnósticos CID-10 Relacionados
                    </Label>
                    
                    <div className="space-y-3">
                      <BuscaCID 
                        onSelect={(cid) => {
                          if (cidsSelecionados.some(c => c.cid_codigo === cid.codigo)) {
                            toast.error("CID já adicionado");
                            return;
                          }
                          setCidsSelecionados(prev => [...prev, {
                            cid_codigo: cid.codigo,
                            cid_nome: cid.nome
                          }]);
                        }}
                        placeholder="Buscar por código CID ou diagnóstico..."
                      />

                      {cidsSelecionados.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {cidsSelecionados.map(c => (
                            <Badge key={c.cid_codigo} variant="secondary" className="pl-2 pr-1 py-1 gap-1 border-blue-200 bg-blue-50 text-blue-700">
                              <span className="text-[10px] font-mono opacity-70 mr-1">{c.cid_codigo}</span>
                              <span className="max-w-[200px] truncate">{c.cid_nome}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-4 w-4 ml-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive" 
                                onClick={() => setCidsSelecionados(p => p.filter(x => x.cid_codigo !== c.cid_codigo))}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Plano de Conduta</Label>
                    <Textarea 
                      rows={3} 
                      placeholder="Condutas gerais planejadas..."
                      value={form.plano_conduta}
                      onChange={e => setForm(p => ({ ...p, plano_conduta: e.target.value }))}
                    />
                  </div>
...

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Próxima Revisão</Label>
                      <Input 
                        type="date" 
                        value={form.data_proxima_revisao}
                        onChange={e => setForm(p => ({ ...p, data_proxima_revisao: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-8">
                      <Checkbox 
                        id="revisao_obrigatoria" 
                        checked={form.revisao_obrigatoria}
                        onCheckedChange={(v) => setForm(p => ({ ...p, revisao_obrigatoria: !!v }))}
                      />
                      <Label htmlFor="revisao_obrigatoria" className="text-xs cursor-pointer">Revisão Obrigatória</Label>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="p-6 border-t bg-muted/10 gap-2">
          <div className="flex-1 flex items-center gap-2">
            <Checkbox 
              id="ciencia_familia" 
              checked={form.ciencia_familia}
              onCheckedChange={(v) => setForm(p => ({ ...p, ciencia_familia: !!v }))}
            />
            <Label htmlFor="ciencia_familia" className="text-xs text-muted-foreground cursor-pointer">Família/Responsável ciente do plano terapêutico</Label>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="min-w-[150px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Criar PTS Estruturado'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
