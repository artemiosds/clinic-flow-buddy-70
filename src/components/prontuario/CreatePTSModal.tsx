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
import { Loader2, Plus, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const SPECIALTIES = [
  'Fisioterapia', 'Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional',
  'Neuropsicologia', 'Psicopedagogia', 'Nutrição', 'Serviço Social', 'Enfermagem',
];

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

interface SigtapProcedimento {
  id: string;
  codigo: string;
  nome: string;
  especialidade: string;
}

interface SigtapCid {
  cid_codigo: string;
  cid_descricao: string;
}

interface SelectedSigtap {
  procedimento_codigo: string;
  procedimento_nome: string;
  especialidade: string;
}

interface SelectedCid {
  cid_codigo: string;
  cid_descricao: string;
}

export const CreatePTSModal: React.FC<CreatePTSModalProps> = ({
  open,
  onOpenChange,
  pacienteId,
  pacienteNome,
  onSuccess
}) => {
  const { user } = useAuth();
  const { logAction } = useData();
  const [saving, setSaving] = useState(false);
  const [loadingProcs, setLoadingProcs] = useState(false);
  const [loadingCids, setLoadingCids] = useState(false);
  
  const [form, setForm] = useState({
    diagnostico_funcional: '',
    objetivos_terapeuticos: '',
    metas_curto_prazo: '',
    metas_medio_prazo: '',
    metas_longo_prazo: '',
    especialidades_envolvidas: [] as string[],
  });

  const [sigtapProcs, setSigtapProcs] = useState<SigtapProcedimento[]>([]);
  const [selectedProcCodigo, setSelectedProcCodigo] = useState('');
  const [validCids, setValidCids] = useState<SigtapCid[]>([]);
  const [cidSearch, setCidSearch] = useState('');
  const [cidWarning, setCidWarning] = useState(false);
  const [sigtapSelecionados, setSigtapSelecionados] = useState<SelectedSigtap[]>([]);
  const [cidsSelecionados, setCidsSelecionados] = useState<SelectedCid[]>([]);

  const isMaster = user?.role === 'master';
  const isFisioterapeuta = useMemo(() => {
    const prof = (user?.profissao || '').toLowerCase();
    return prof.includes('fisioterap') || prof.includes('fisio');
  }, [user]);

  // Load SIGTAP procedures based on selected specialties
  useEffect(() => {
    if (!open || (!isFisioterapeuta && !isMaster)) return;
    
    const loadProcs = async () => {
      setLoadingProcs(true);
      try {
        const sigtapKeys = form.especialidades_envolvidas.map(s => SPECIALTY_TO_SIGTAP[s]).filter(Boolean);
        let query = supabase.from('sigtap_procedimentos').select('*').eq('ativo', true);
        if (sigtapKeys.length > 0) {
          query = query.in('especialidade', sigtapKeys);
        } else {
          query = query.limit(100);
        }
        const { data } = await query.order('codigo');
        setSigtapProcs(data || []);
      } finally {
        setLoadingProcs(false);
      }
    };
    loadProcs();
  }, [open, form.especialidades_envolvidas, isFisioterapeuta, isMaster]);

  // Load CIDs when procedure is selected
  useEffect(() => {
    if (!selectedProcCodigo) { setValidCids([]); return; }
    setLoadingCids(true);
    supabase
      .from('sigtap_procedimento_cids')
      .select('cid_codigo, cid_descricao')
      .eq('procedimento_codigo', selectedProcCodigo)
      .order('cid_codigo')
      .then(({ data }) => {
        setValidCids(data || []);
        setLoadingCids(false);
      });
  }, [selectedProcCodigo]);

  const toggleSpec = (spec: string) => {
    setForm(p => {
      const newSpecs = p.especialidades_envolvidas.includes(spec)
        ? p.especialidades_envolvidas.filter(s => s !== spec)
        : [...p.especialidades_envolvidas, spec];
      return { ...p, especialidades_envolvidas: newSpecs };
    });
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

  const handleAddCid = (cid: SigtapCid) => {
    if (cidsSelecionados.some(c => c.cid_codigo === cid.cid_codigo)) return;
    setCidsSelecionados(prev => [...prev, { cid_codigo: cid.cid_codigo, cid_descricao: cid.cid_descricao }]);
    setCidSearch('');
  };

  const handleSave = async () => {
    if (!pacienteId || !form.diagnostico_funcional || !form.objetivos_terapeuticos) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      const { data: newPts, error } = await supabase.from('pts').insert({
        patient_id: pacienteId,
        professional_id: user?.id,
        unit_id: user?.unidadeId,
        diagnostico_funcional: form.diagnostico_funcional,
        objetivos_terapeuticos: form.objetivos_terapeuticos,
        metas_curto_prazo: form.metas_curto_prazo,
        metas_medio_prazo: form.metas_medio_prazo,
        metas_longo_prazo: form.metas_longo_prazo,
        especialidades_envolvidas: form.especialidades_envolvidas,
        status: 'ativo'
      }).select('id').single();

      if (error) throw error;

      // Relationships
      if (sigtapSelecionados.length > 0) {
        await supabase.from('pts_sigtap').insert(sigtapSelecionados.map(s => ({ ...s, pts_id: newPts.id })));
      }
      if (cidsSelecionados.length > 0) {
        await supabase.from('pts_cid').insert(cidsSelecionados.map(c => ({ ...c, pts_id: newPts.id })));
      }

      // Prontuario entry
      const procInfo = sigtapSelecionados.map(s => `${s.procedimento_codigo}`).join(', ');
      await supabase.from('prontuarios').insert({
        paciente_id: pacienteId,
        paciente_nome: pacienteNome,
        profissional_id: user?.id,
        profissional_nome: user?.nome,
        unidade_id: user?.unidadeId,
        data_atendimento: new Date().toISOString().split('T')[0],
        hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        tipo_registro: 'pts',
        queixa_principal: 'Projeto Terapêutico Singular',
        anamnese: form.diagnostico_funcional,
        hipotese: form.objetivos_terapeuticos,
        conduta: `Curto: ${form.metas_curto_prazo}\nMédio: ${form.metas_medio_prazo}\nLongo: ${form.metas_longo_prazo}`,
        observacoes: `SIGTAP: ${procInfo}`,
      });

      await logAction({
        acao: 'criar_pts',
        entidade: 'pts',
        entidadeId: newPts.id,
        modulo: 'pts',
        user,
        detalhes: { paciente_id: pacienteId }
      });

      toast.success('PTS criado com sucesso!');
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const filteredCids = useMemo(() => {
    if (!cidSearch.trim()) return validCids.slice(0, 10);
    const q = cidSearch.toUpperCase();
    return validCids.filter(c => c.cid_codigo.includes(q) || c.cid_descricao.toUpperCase().includes(q)).slice(0, 20);
  }, [validCids, cidSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Projeto Terapêutico Singular (PTS)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg border">
            <Label className="text-xs uppercase font-bold text-muted-foreground">Paciente</Label>
            <p className="font-semibold">{pacienteNome}</p>
          </div>

          <div className="space-y-2">
            <Label>Especialidades Envolvidas</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {SPECIALTIES.map(spec => (
                <label key={spec} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={form.especialidades_envolvidas.includes(spec)}
                    onCheckedChange={() => toggleSpec(spec)}
                  />
                  {spec}
                </label>
              ))}
            </div>
          </div>

          {(isFisioterapeuta || isMaster) && (
            <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <Label className="text-sm font-bold flex items-center gap-2">
                📋 Procedimentos SIGTAP {loadingProcs && <Loader2 className="w-3 h-3 animate-spin" />}
              </Label>
              <div className="flex gap-2">
                <Select value={selectedProcCodigo} onValueChange={setSelectedProcCodigo}>
                  <SelectTrigger className="flex-1 bg-background">
                    <SelectValue placeholder="Selecione um procedimento..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sigtapProcs.map(p => (
                      <SelectItem key={p.codigo} value={p.codigo}>
                        <span className="font-mono text-xs mr-2">{p.codigo}</span>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleAddSigtap} disabled={!selectedProcCodigo}>Adicionar</Button>
              </div>

              {sigtapSelecionados.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sigtapSelecionados.map(s => (
                    <Badge key={s.procedimento_codigo} variant="secondary" className="pr-1 gap-1">
                      {s.procedimento_codigo}
                      <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => setSigtapSelecionados(p => p.filter(x => x.procedimento_codigo !== s.procedimento_codigo))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}

              {selectedProcCodigo && (
                <div className="space-y-2 border-t pt-2 mt-2">
                  <Label className="text-xs">Buscar CID relacionado</Label>
                  <Input 
                    placeholder="Código ou nome do CID..." 
                    value={cidSearch} 
                    onChange={e => setCidSearch(e.target.value)} 
                    className="h-8 text-xs bg-background"
                  />
                  {cidSearch.trim() && (
                    <div className="border rounded bg-background max-h-32 overflow-y-auto divide-y">
                      {filteredCids.map(c => (
                        <button key={c.cid_codigo} onClick={() => handleAddCid(c)} className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent flex justify-between">
                          <span className="font-bold">{c.cid_codigo}</span>
                          <span className="truncate flex-1 ml-2 text-muted-foreground">{c.cid_descricao}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Diagnóstico Funcional Global *</Label>
            <Textarea 
              rows={3} 
              value={form.diagnostico_funcional}
              onChange={e => setForm(p => ({ ...p, diagnostico_funcional: e.target.value }))}
              placeholder="Descreva o estado funcional do paciente..."
            />
          </div>

          <div className="space-y-2">
            <Label>Objetivos Terapêuticos *</Label>
            <Textarea 
              rows={3}
              value={form.objetivos_terapeuticos}
              onChange={e => setForm(p => ({ ...p, objetivos_terapeuticos: e.target.value }))}
              placeholder="Quais os principais objetivos deste tratamento?"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Metas — Curto Prazo</Label>
              <Textarea rows={2} value={form.metas_curto_prazo} onChange={e => setForm(p => ({...p, metas_curto_prazo: e.target.value}))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Metas — Médio Prazo</Label>
              <Textarea rows={2} value={form.metas_medio_prazo} onChange={e => setForm(p => ({...p, metas_medio_prazo: e.target.value}))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Metas — Longo Prazo</Label>
              <Textarea rows={2} value={form.metas_longo_prazo} onChange={e => setForm(p => ({...p, metas_longo_prazo: e.target.value}))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Criar Projeto Terapêutico'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
