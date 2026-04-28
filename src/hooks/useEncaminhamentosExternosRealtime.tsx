// Realtime para encaminhamentos externos:
// - INSERT em direcao=entrada => toast "Novo encaminhamento recebido" + incrementa contador
// - UPDATE em direcao=saida com status novo (visualizado/aceito/recusado/agendado) => toast informativo
// Mantém um contador de "não vistos" (status=recebido na tabela de entrada) para badge no menu.
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const STATUS_LABEL: Record<string, string> = {
  visualizado: 'visualizado pelo destino',
  aceito: 'aceito pelo destino',
  recusado: 'recusado pelo destino',
  agendado: 'agendado pelo destino',
};

export function useEncaminhamentosExternosRealtime() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  const reloadCount = useCallback(async () => {
    if (!user?.id) return;
    const { count } = await supabase
      .from('encaminhamentos_externos')
      .select('id', { count: 'exact', head: true })
      .eq('direcao', 'entrada')
      .eq('status', 'recebido');
    setPendingCount(count ?? 0);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    reloadCount();

    const channel = supabase
      .channel('encaminhamentos_externos_notify')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'encaminhamentos_externos' },
        (payload) => {
          const row: any = payload.new;
          if (row.direcao !== 'entrada') return;
          toast.info('Novo encaminhamento recebido', {
            description: `${row.paciente_nome || 'Paciente'} — de ${row.origem_unidade || 'sistema externo'}`,
            action: {
              label: 'Ver',
              onClick: () => navigate('/painel/encaminhamentos-externos'),
            },
          });
          reloadCount();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'encaminhamentos_externos' },
        (payload) => {
          const oldRow: any = payload.old;
          const row: any = payload.new;
          // Saída: notifica mudança de status no destino
          if (row.direcao === 'saida' && oldRow?.status !== row.status && STATUS_LABEL[row.status]) {
            toast(`Encaminhamento ${STATUS_LABEL[row.status]}`, {
              description: `${row.paciente_nome || 'Paciente'} — ${row.destino_unidade || 'destino'}`,
              action: {
                label: 'Ver',
                onClick: () => navigate('/painel/encaminhamentos-externos'),
              },
            });
          }
          // Entrada: se mudou status, recalcula contador
          if (row.direcao === 'entrada') reloadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, navigate, reloadCount]);

  return { pendingCount, reloadCount };
}
