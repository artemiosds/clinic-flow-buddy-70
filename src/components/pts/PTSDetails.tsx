import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Loader2, ArrowLeft, Target, Activity, 
  ClipboardList, Calendar, Zap, CheckCircle2, 
  History, LogOut, Save, Plus, Trash2, Printer, Info, Search, Tag, FileText
} from 'lucide-react';
import { BuscaProcedimento } from '../BuscaProcedimento';
import { BuscaCID } from '../BuscaCID';
import { toast } from 'sonner';
import { ptsService, type PTS, type PTSMeta } from '@/services/ptsService';
import { PTSMetaForm } from '@/components/prontuario/PTSMetaForm';
import { 
  PTS_PRIORITIES, 
  PTS_CONTEXTS, 
  PTS_ATTENDANCE_TYPES, 
  SPECIALTIES,
  CLOSURE_REASONS,
  GOAL_STATUSES
} from '@/data/ptsConstants';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export const PTSDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { logAction, funcionarios, pacientes } = useData();
  
  const [pts, setPts] = useState<PTS | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('resumo');
  
  const [editForm, setEditForm] = useState<Partial<PTS>>({});
  const [editMetas, setEditMetas] = useState<PTSMeta[]>([]);
  const [editSigtap, setEditSigtap] = useState<any[]>([]);
  const [editCids, setEditCids] = useState<any[]>([]);
  
  const [revisionNotes, setRevisionNotes] = useState('');
  const [nextRevisionDate, setNextRevisionDate] = useState('');
  
  const [closureForm, setClosureForm] = useState({
    motivo_encerramento: '',
    resumo_alta_encerramento: '',
    orientacoes_finais: '',
    encaminhamentos_pos_alta: '',
    criterio_alta_atingido: false
  });

  useEffect(() => {
    const loadPTS = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('pts')
          .select(`
            *,
            metas:pts_metas(*),
            sigtap:pts_sigtap(*),
            cids:pts_cid(*)
          `)
          .eq('id', id)
          .single();

        if (error) throw error;
        setPts(data as any);
        setEditForm(data as any);
        setEditMetas(data.metas || []);
        if (data.data_proxima_revisao) setNextRevisionDate(data.data_proxima_revisao);
      } catch (err: any) {
        toast.error('Erro ao carregar PTS: ' + err.message);
        navigate('/painel/pts');
      } finally {
        setLoading(false);
      }
    };
    loadPTS();
  }, [id, navigate]);

  const paciente = pacientes.find(p => p.id === pts?.patient_id);

  const handleUpdate = async () => {
    if (!id || !pts) return;
    setSaving(true);
    try {
      await ptsService.updatePTS(id, editForm);
      
      for (const meta of editMetas) {
        if (meta.id) {
          const { id: metaId, ...cleanMeta } = meta as any;
          await supabase.from('pts_metas').update(cleanMeta).eq('id', metaId);
        } else {
          await supabase.from('pts_metas').insert({ ...meta, pts_id: id });
        }
      }

      await logAction({
        acao: 'editar_pts_detalhado',
        entidade: 'pts',
        entidadeId: id,
        modulo: 'pts',
        user,
        detalhes: { paciente_nome: paciente?.nome }
      });

      toast.success('PTS atualizado com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao atualizar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterRevision = async () => {
    if (!id || !revisionNotes) {
      toast.error('Preencha as observações da revisão.');
      return;
    }
    setSaving(true);
    try {
      await ptsService.registerRevision(id, {
        profissional_id: user?.id || '',
        alteracoes_realizadas: 'Revisão periódica registrada.',
        observacoes: revisionNotes,
        proxima_revisao: nextRevisionDate
      });

      await logAction({
        acao: 'revisar_pts',
        entidade: 'pts',
        entidadeId: id,
        modulo: 'pts',
        user,
        detalhes: { paciente_nome: paciente?.nome }
      });

      toast.success('Revisão registrada com sucesso!');
      setRevisionNotes('');
      // Reload data
      const { data } = await supabase.from('pts').select('*, metas:pts_metas(*)').eq('id', id).single();
      setPts(data as any);
    } catch (err: any) {
      toast.error('Erro ao registrar revisão: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClosePTS = async () => {
    if (!id || !closureForm.motivo_encerramento || !closureForm.resumo_alta_encerramento) {
      toast.error('Preencha os campos obrigatórios para o encerramento.');
      return;
    }
    setSaving(true);
    try {
      await ptsService.closePTS(id, closureForm);

      await logAction({
        acao: 'encerrar_pts',
        entidade: 'pts',
        entidadeId: id,
        modulo: 'pts',
        user,
        detalhes: { paciente_nome: paciente?.nome, motivo: closureForm.motivo_encerramento }
      });

      toast.success('PTS encerrado com sucesso!');
      navigate('/painel/pts');
    } catch (err: any) {
      toast.error('Erro ao encerrar PTS: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-muted-foreground animate-pulse">Carregando detalhes do Projeto Terapêutico...</p>
    </div>
  );

  if (!pts) return <div className="p-8 text-center">PTS não encontrado.</div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/painel/pts')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Detalhes do PTS</h1>
            <p className="text-sm text-muted-foreground">Paciente: {paciente?.nome || 'Não identificado'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Imprimir PTS
          </Button>
          {pts.status === 'ativo' && (
            <Button className="gap-2" onClick={handleUpdate} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Alterações
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-sm border-purple-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Status Geral</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Status</Label>
                <Badge className={cn(
                  "w-fit px-3 py-1",
                  pts.status === 'ativo' ? "bg-success/10 text-success border-success/20" : "bg-slate-100 text-slate-700"
                )}>
                  {pts.status === 'ativo' ? 'Ativo' : 'Concluído'}
                </Badge>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Prioridade</Label>
                <Badge variant="outline" className="w-fit">
                  {PTS_PRIORITIES.find(p => p.value === pts.prioridade)?.label || pts.prioridade}
                </Badge>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Criado em</Label>
                <p className="text-sm font-medium">{new Date(pts.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Próxima Revisão</Label>
                <p className="text-sm font-bold text-orange-600">
                  {pts.data_proxima_revisao ? new Date(pts.data_proxima_revisao + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não definida'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-blue-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Especialidades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {pts.especialidades_envolvidas?.map(spec => (
                  <Badge key={spec} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">{spec}</Badge>
                ))}
              </div>
              {pts.necessidade_interdisciplinar && (
                <div className="mt-4 p-2 bg-purple-50 rounded border border-purple-100 text-[10px] text-purple-700 font-medium">
                  Atuação interdisciplinar obrigatória
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start bg-transparent border-b rounded-none h-12 gap-6 p-0 mb-6">
              <TabsTrigger value="resumo" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 gap-2 font-bold">
                <ClipboardList className="w-4 h-4" /> Diagnóstico & Objetivos
              </TabsTrigger>
              <TabsTrigger value="metas" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 gap-2 font-bold">
                <Target className="w-4 h-4" /> Metas ({pts.metas?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="revisoes" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 gap-2 font-bold">
                <History className="w-4 h-4" /> Revisões
              </TabsTrigger>
              {pts.status === 'ativo' && (
                <TabsTrigger value="encerramento" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-destructive rounded-none px-0 gap-2 font-bold text-destructive">
                  <LogOut className="w-4 h-4" /> Alta / Encerramento
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="resumo" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Diagnóstico Funcional Global</Label>
                    <Textarea 
                      rows={5} 
                      value={editForm.diagnostico_funcional} 
                      onChange={e => setEditForm(p => ({ ...p, diagnostico_funcional: e.target.value }))}
                      disabled={pts.status !== 'ativo'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Potencialidades</Label>
                    <Textarea 
                      rows={3} 
                      value={editForm.potencialidades || ''} 
                      onChange={e => setEditForm(p => ({ ...p, potencialidades: e.target.value }))}
                      disabled={pts.status !== 'ativo'}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Objetivos Terapêuticos Gerais</Label>
                    <Textarea 
                      rows={5} 
                      value={editForm.objetivos_terapeuticos} 
                      onChange={e => setEditForm(p => ({ ...p, objetivos_terapeuticos: e.target.value }))}
                      disabled={pts.status !== 'ativo'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Barreiras</Label>
                    <Textarea 
                      rows={3} 
                      value={editForm.barreiras || ''} 
                      onChange={e => setEditForm(p => ({ ...p, barreiras: e.target.value }))}
                      disabled={pts.status !== 'ativo'}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold">Plano de Conduta</Label>
                <Textarea 
                  rows={4} 
                  value={editForm.plano_conduta || ''} 
                  onChange={e => setEditForm(p => ({ ...p, plano_conduta: e.target.value }))}
                  disabled={pts.status !== 'ativo'}
                  placeholder="Detalhamento das condutas interdisciplinares..."
                />
              </div>
            </TabsContent>

            <TabsContent value="metas" className="space-y-6 mt-0">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Metas Terapêuticas
                </h3>
                {pts.status === 'ativo' && (
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => {
                    setEditMetas(prev => [...prev, {
                      titulo: '',
                      descricao: '',
                      categoria: 'curto',
                      especialidade: pts.especialidades_envolvidas[0] || '',
                      prioridade: 'media',
                      status: 'nao_iniciado',
                      indicador_sucesso: '',
                      observacoes: ''
                    }]);
                  }}>
                    <Plus className="w-4 h-4" /> Adicionar Meta
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {editMetas.map((meta, index) => (
                  <div key={meta.id || index} className="relative group">
                    <PTSMetaForm 
                      meta={meta}
                      professionals={funcionarios}
                      onChange={(updated) => {
                        const next = [...editMetas];
                        next[index] = updated;
                        setEditMetas(next);
                      }}
                      onRemove={() => {
                        if (meta.id) {
                          if (window.confirm("Deseja realmente excluir esta meta permanentemente?")) {
                            supabase.from('pts_metas').delete().eq('id', meta.id).then(() => {
                              setEditMetas(prev => prev.filter((_, i) => i !== index));
                              toast.success("Meta excluída.");
                            });
                          }
                        } else {
                          setEditMetas(prev => prev.filter((_, i) => i !== index));
                        }
                      }}
                    />
                    {pts.status !== 'ativo' && (
                      <div className="absolute inset-0 bg-background/50 cursor-not-allowed rounded-lg z-10" />
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="revisoes" className="space-y-8 mt-0">
              {pts.status === 'ativo' && (
                <Card className="border-orange-100 bg-orange-50/10">
                  <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-orange-600" />
                      Registrar Nova Revisão
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-bold text-muted-foreground tracking-widest">Observações da Revisão *</Label>
                      <Textarea 
                        placeholder="O que foi avaliado nesta revisão? Houve progresso nas metas?" 
                        value={revisionNotes}
                        onChange={e => setRevisionNotes(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase font-bold text-muted-foreground tracking-widest">Próxima Revisão Prevista</Label>
                        <Input 
                          type="date" 
                          value={nextRevisionDate}
                          onChange={e => setNextRevisionDate(e.target.value)}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button className="w-full gap-2 bg-orange-600 hover:bg-orange-700" onClick={handleRegisterRevision} disabled={saving}>
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Registrar Revisão
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-4">
                <h4 className="font-bold text-sm uppercase text-muted-foreground tracking-widest">Histórico de Revisões</h4>
                <p className="text-xs text-muted-foreground italic">Histórico será exibido conforme registros de auditoria e revisão.</p>
              </div>
            </TabsContent>

            <TabsContent value="encerramento" className="space-y-6 mt-0">
              <Card className="border-destructive/20">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <LogOut className="w-5 h-5" />
                    Fluxo de Alta / Encerramento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-bold">Motivo do Encerramento *</Label>
                        <Select value={closureForm.motivo_encerramento} onValueChange={v => setClosureForm(p => ({ ...p, motivo_encerramento: v }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o motivo..." />
                          </SelectTrigger>
                          <SelectContent>
                            {CLOSURE_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                        <Checkbox 
                          id="criteria_met" 
                          checked={closureForm.criterio_alta_atingido}
                          onCheckedChange={v => setClosureForm(p => ({ ...p, criterio_alta_atingido: !!v }))}
                        />
                        <Label htmlFor="criteria_met" className="text-sm cursor-pointer">Critérios de alta terapêutica atingidos</Label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Resumo Clínico do Desfecho *</Label>
                      <Textarea 
                        rows={4} 
                        placeholder="Resumo final da evolução do paciente durante o PTS..."
                        value={closureForm.resumo_alta_encerramento}
                        onChange={e => setClosureForm(p => ({ ...p, resumo_alta_encerramento: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Orientações Finais</Label>
                      <Textarea 
                        rows={3} 
                        placeholder="Orientações para o paciente e família pós-alta..."
                        value={closureForm.orientacoes_finais}
                        onChange={e => setClosureForm(p => ({ ...p, orientacoes_finais: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Encaminhamentos</Label>
                      <Textarea 
                        rows={3} 
                        placeholder="Encaminhamentos sugeridos após o encerramento..."
                        value={closureForm.encaminhamentos_pos_alta}
                        onChange={e => setClosureForm(p => ({ ...p, encaminhamentos_pos_alta: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t flex justify-end">
                    <Button variant="destructive" className="gap-2" onClick={handleClosePTS} disabled={saving}>
                      <CheckCircle2 className="w-4 h-4" /> Finalizar Projeto Terapêutico
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
