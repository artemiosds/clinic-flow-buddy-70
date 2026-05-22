import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  FREQUENCY_OPTIONS_NEW, 
  WEEKDAY_LABELS, 
  getMaxWeekdays, 
  isWeekdayFrequency, 
  generateSessionDates,
  calculateTotalSessions,
  buildBlockedRanges
} from '@/lib/treatmentSessionGenerator';

interface CreateCycleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteId: string;
  pacienteNome: string;
  onSuccess?: () => void;
}

export const CreateCycleModal: React.FC<CreateCycleModalProps> = ({
  open,
  onOpenChange,
  pacienteId,
  pacienteNome,
  onSuccess
}) => {
  const { user } = useAuth();
  const { funcionarios, logAction, bloqueios } = useData();
  const [saving, setSaving] = useState(false);
  const [ptsList, setPtsList] = useState<any[]>([]);

  const isProfissional = user?.role === 'profissional';

  const [form, setForm] = useState({
    professional_id: isProfissional ? (user?.id || '') : '',
    unit_id: user?.unidadeId || '',
    specialty: isProfissional ? (user?.profissao || '') : '',
    treatment_type: '',
    frequency: '1x_semana',
    start_date: new Date().toISOString().split('T')[0],
    clinical_notes: '',
    pts_id: '',
    weekdays: [] as number[],
    duration_months: 3,
  });

  // Load PTS for patient to allow linking
  useEffect(() => {
    if (!open || !pacienteId) return;
    const loadPts = async () => {
      const { data } = await supabase
        .from('pts')
        .select('*')
        .eq('patient_id', pacienteId)
        .eq('status', 'ativo')
        .order('created_at', { ascending: false });
      if (data) setPtsList(data);
    };
    loadPts();
  }, [open, pacienteId]);

  const handleSave = async () => {
    if (!form.professional_id || !form.treatment_type || !form.frequency) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    if (isWeekdayFrequency(form.frequency) && form.weekdays.length !== getMaxWeekdays(form.frequency)) {
      toast.error(`Selecione exatamente ${getMaxWeekdays(form.frequency)} dias da semana.`);
      return;
    }

    setSaving(true);
    try {
      const totalSessions = calculateTotalSessions(form.frequency, form.duration_months, form.weekdays);
      const blockedRanges = buildBlockedRanges(bloqueios, form.professional_id, form.unit_id);
      
      const sessions = generateSessionDates(
        form.start_date,
        form.frequency,
        form.weekdays,
        totalSessions,
        blockedRanges
      );

      if (sessions.length === 0) throw new Error('Não foi possível gerar as sessões.');

      const cyclePayload = {
        patient_id: pacienteId,
        professional_id: form.professional_id,
        unit_id: form.unit_id,
        specialty: form.specialty,
        treatment_type: form.treatment_type,
        start_date: form.start_date,
        total_sessions: sessions.length,
        frequency: form.frequency,
        clinical_notes: form.clinical_notes,
        pts_id: form.pts_id || null,
        status: 'em_andamento',
        created_by: user?.id
      };

      const { data: newCycle, error: cycleErr } = await supabase
        .from('treatment_cycles')
        .insert(cyclePayload)
        .select('id')
        .single();

      if (cycleErr) throw cycleErr;

      // Insert sessions
      const sessionPayloads = sessions.map((date, idx) => ({
        cycle_id: newCycle.id,
        patient_id: pacienteId,
        professional_id: form.professional_id,
        session_number: idx + 1,
        total_sessions: sessions.length,
        scheduled_date: date,
        status: 'pendente_agendamento'
      }));

      const { error: sessErr } = await supabase.from('treatment_sessions').insert(sessionPayloads);
      if (sessErr) throw sessErr;

      await logAction({
        acao: 'criar_ciclo_tratamento',
        entidade: 'treatment_cycle',
        entidadeId: newCycle.id,
        modulo: 'tratamentos',
        user,
        detalhes: { paciente_id: pacienteId, tipo: form.treatment_type }
      });

      toast.success('Ciclo de tratamento iniciado!');
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao iniciar ciclo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Ciclo de Tratamento</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 py-2 pr-4">
            <div className="p-3 bg-muted rounded-lg border">
              <Label className="text-xs uppercase font-bold text-muted-foreground">Paciente</Label>
              <p className="font-semibold">{pacienteNome}</p>
            </div>

            {!isProfissional && (
              <div>
                <Label>Profissional Responsável *</Label>
                <Select value={form.professional_id} onValueChange={(v) => {
                  const prof = funcionarios.find(f => f.id === v);
                  setForm(p => ({ ...p, professional_id: v, specialty: prof?.profissao || '', unit_id: prof?.unidadeId || p.unit_id }));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {funcionarios.filter(f => f.tipo === 'profissional' || f.role === 'profissional').map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.nome} — {f.profissao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Tipo de Tratamento *</Label>
              <Input 
                value={form.treatment_type}
                onChange={e => setForm(p => ({ ...p, treatment_type: e.target.value }))}
                placeholder="Ex: Reabilitação Cognitiva"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Frequência *</Label>
                <Select value={form.frequency} onValueChange={v => setForm(p => ({ ...p, frequency: v, weekdays: [] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS_NEW.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duração Estimada (meses)</Label>
                <Input 
                  type="number" 
                  value={form.duration_months} 
                  onChange={e => setForm(p => ({ ...p, duration_months: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>

            {isWeekdayFrequency(form.frequency) && (
              <div className="space-y-2">
                <Label>Dias da Semana ({getMaxWeekdays(form.frequency)})</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map(day => (
                    <label key={day.value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm ${form.weekdays.includes(day.value) ? 'bg-primary/10 border-primary text-primary' : 'hover:bg-accent'}`}>
                      <Checkbox 
                        checked={form.weekdays.includes(day.value)}
                        onCheckedChange={() => {
                          const current = form.weekdays;
                          if (current.includes(day.value)) {
                            setForm(p => ({ ...p, weekdays: current.filter(d => d !== day.value) }));
                          } else if (current.length < getMaxWeekdays(form.frequency)) {
                            setForm(p => ({ ...p, weekdays: [...current, day.value] }));
                          }
                        }}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Data de Início *</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
            </div>

            {ptsList.length > 0 && (
              <div>
                <Label>Vincular PTS (Opcional)</Label>
                <Select value={form.pts_id} onValueChange={v => setForm(p => ({ ...p, pts_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um PTS ativo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ptsList.map(pts => (
                      <SelectItem key={pts.id} value={pts.id}>{pts.diagnostico_funcional.substring(0, 40)}...</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Observações Clínicas</Label>
              <Textarea 
                value={form.clinical_notes}
                onChange={e => setForm(p => ({ ...p, clinical_notes: e.target.value }))}
                placeholder="Detalhes adicionais sobre o ciclo..."
              />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Iniciar Ciclo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
