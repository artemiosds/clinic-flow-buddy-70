import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActiveCycle {
  id: string;
  treatment_type: string;
  professional_id: string;
  start_date: string;
  end_date_predicted: string | null;
  frequency: string;
  status: string;
  total_sessions: number;
  sessions_done: number;
  created_at: string;
}

export interface ActivePTS {
  id: string;
  diagnostico_funcional: string;
  objetivos_terapeuticos: string;
  metas_curto_prazo: string;
  metas_medio_prazo: string;
  metas_longo_prazo: string;
  especialidades_envolvidas: string[];
  created_at: string;
  professional_id: string;
  status: string;
}

export function usePatientTreatment(patientId: string | null) {
  const [activeCycle, setActiveCycle] = useState<ActiveCycle | null>(null);
  const [activePts, setActivePts] = useState<ActivePTS | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const [cycleRes, ptsRes] = await Promise.all([
        supabase.from('treatment_cycles')
          .select('*')
          .eq('patient_id', patientId)
          .in('status', ['em_andamento', 'ativo'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('pts')
          .select('*')
          .eq('patient_id', patientId)
          .eq('status', 'ativo')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      setActiveCycle(cycleRes.data as ActiveCycle | null);
      setActivePts(ptsRes.data as ActivePTS | null);
    } catch (err) {
      console.error('[usePatientTreatment] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) reload();
  }, [patientId]);

  return { activeCycle, activePts, loading, reload };
}
