import { supabase } from '@/integrations/supabase/client';

export interface AbsenceInfo {
  totalFaltas: number;
  consecutivas: number;
  alternadas: number;
  nivel: 'ok' | 'alerta' | 'revisao' | 'desligamento';
  mensagem: string;
  statusFalta?: string;
}

export async function getPatientAbsenceInfo(patientId: string, profissionalId?: string): Promise<AbsenceInfo> {
  // Check exemptions first
  const { data: patient } = await supabase
    .from('pacientes')
    .select('is_tfd, possui_ordem_judicial')
    .eq('id', patientId)
    .single();

  const isExempt = patient?.is_tfd || patient?.possui_ordem_judicial;

  if (isExempt) {
    return { 
      totalFaltas: 0, 
      consecutivas: 0, 
      alternadas: 0, 
      nivel: 'ok', 
      mensagem: 'Paciente possui exceção administrativa (TFD/Ordem Judicial). Agendamento permitido.',
      statusFalta: 'OK'
    };
  }

  // Get professional specific absence data
  if (profissionalId) {
    const { data: profAbsence } = await supabase
      .from('paciente_faltas_profissional')
      .select('total_faltas, faltas_consecutivas, status_falta')
      .eq('paciente_id', patientId)
      .eq('profissional_id', profissionalId)
      .maybeSingle();

    if (profAbsence) {
      const totalFaltas = profAbsence.total_faltas || 0;
      const consecutivas = profAbsence.faltas_consecutivas || 0;
      const alternadas = Math.max(0, totalFaltas - consecutivas);
      const statusFalta = profAbsence.status_falta || 'OK';

      let nivel: AbsenceInfo['nivel'] = 'ok';
      let mensagem = '';

      if (statusFalta === 'BLOQUEADO') {
        nivel = 'desligamento';
        mensagem = `⚠️ BLOQUEADO: ${totalFaltas} faltas registradas para este profissional.`;
      } else if (totalFaltas > 0) {
        nivel = 'alerta';
        mensagem = `⚠️ Atenção: ${totalFaltas} faltas registradas com este profissional.`;
      }

      return { totalFaltas, consecutivas, alternadas, nivel, mensagem, statusFalta };
    }
  }

  // Fallback to global patient status (legacy or if no professional record yet)
  const { data: p } = await supabase
    .from('pacientes')
    .select('total_faltas, faltas_consecutivas, status_falta')
    .eq('id', patientId)
    .single();

  const totalFaltas = p?.total_faltas || 0;
  const consecutivas = p?.faltas_consecutivas || 0;
  const alternadas = Math.max(0, totalFaltas - consecutivas);
  const statusFalta = p?.status_falta || 'OK';

  let nivel: AbsenceInfo['nivel'] = 'ok';
  let mensagem = '';

  if (statusFalta === 'BLOQUEADO') {
    nivel = 'desligamento';
    mensagem = `⚠️ Paciente bloqueado por excesso de faltas.`;
  }

  return { totalFaltas, consecutivas, alternadas, nivel, mensagem, statusFalta };
}
