import React, { useState, useEffect } from 'react';
import { usePacienteNomeResolver } from '@/hooks/usePacienteNomeResolver';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, Clock, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AtendimentoDB {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_nome: string;
  unidade_id: string;
  setor: string;
  procedimento: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  duracao_minutos: number | null;
  status: string;
}

const Atendimentos: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { unidades, logAction } = useData();
  const resolvePaciente = usePacienteNomeResolver();
  const [atendimentos, setAtendimentos] = useState<AtendimentoDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;
  const canDelete = can('atendimentos', 'can_delete');

  const load = async (pageNum = 0, append = false) => {
    if (pageNum === 0) setLoading(true);
    else setLoadingMore(true);
    
    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = (supabase as any)
        .from('atendimentos')
        .select('*')
        .order('data', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .range(from, to);

      if (user?.role === 'profissional') query = query.eq('profissional_id', user.id);
      if (user?.unidadeId && user?.usuario !== 'admin.sms') query = query.eq('unidade_id', user.unidadeId);
      
      const { data, error } = await query;
      
      if (error) throw error;

      if (data) {
        if (append) {
          setAtendimentos(prev => [...prev, ...data]);
        } else {
          setAtendimentos(data);
        }
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error('Error loading atendimentos:', err);
      toast.error('Erro ao carregar atendimentos.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      setPage(0);
      load(0, false);
    }
  }, [user?.id, user?.unidadeId]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    load(nextPage, true);
  };

  const handleDelete = async (at: AtendimentoDB) => {
    try {
      await (supabase as any).from('atendimentos').delete().eq('id', at.id);
      await logAction({
        acao: 'excluir', entidade: 'atendimentos', entidadeId: at.id,
        detalhes: { paciente: at.paciente_nome, profissional: at.profissional_nome },
        user,
      });
      setAtendimentos(prev => prev.filter(a => a.id !== at.id));
      toast.success('Atendimento excluído!');
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Erro ao excluir atendimento.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Atendimentos</h1>
        <p className="text-muted-foreground text-sm">{atendimentos.length} registros</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : atendimentos.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">Nenhum atendimento registrado.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {atendimentos.map(at => {
            const unidadeNome = unidades.find(u => u.id === at.unidade_id)?.nome || '';
            return (
              <Card key={at.id} className="shadow-card border-0">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <span className="text-sm font-mono font-medium text-primary w-24 shrink-0">
                    {at.data} {at.hora_inicio}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{resolvePaciente(at.paciente_id, at.paciente_nome)}</p>
                    <p className="text-sm text-muted-foreground">{at.profissional_nome} • {at.procedimento}</p>
                    {unidadeNome && <p className="text-xs text-muted-foreground">{unidadeNome}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs px-2 py-1 rounded-full font-medium",
                      at.status === 'finalizado' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                    )}>
                      {at.status === 'finalizado' ? 'Finalizado' : 'Em Atendimento'}
                    </span>
                    {at.duracao_minutos && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />{at.duracao_minutos}min
                      </span>
                    )}
                    {canDelete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir atendimento?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Excluir o atendimento de {resolvePaciente(at.paciente_id, at.paciente_nome)}? Esta ação será registrada em log.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(at)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          {hasMore && (
            <div className="flex justify-center pt-4 pb-8">
              <Button 
                variant="outline" 
                onClick={handleLoadMore} 
                disabled={loadingMore}
                className="w-full max-w-xs"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  'Carregar mais'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Atendimentos;
