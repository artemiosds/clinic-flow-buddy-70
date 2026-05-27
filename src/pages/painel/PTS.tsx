import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Search, Eye, Trash2, ClipboardList, Target, User, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PTSDetails } from '@/components/pts/PTSDetails';
import { CreatePTSModal } from '@/components/prontuario/CreatePTSModal';
import { cn } from '@/lib/utils';

const PTSPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { pacientes, logAction } = useData();
  
  const [ptsList, setPtsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const isMaster = user?.role === 'master';

  const loadPts = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('pts').select('*').order('created_at', { ascending: false });
      
      if (user?.usuario !== 'admin.sms' && user?.unidadeId) {
        query = query.eq('unit_id', user.unidadeId);
      }
      
      if (!isMaster && user?.role === 'profissional') {
        query = query.eq('professional_id', user.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setPtsList(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar lista de PTS: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [isMaster, user]);

  useEffect(() => {
    if (!id) loadPts();
  }, [id, loadPts]);

  const filtered = useMemo(() => {
    if (!search) return ptsList;
    const q = search.toLowerCase();
    return ptsList.filter(p => {
      const pac = pacientes.find(px => px.id === p.patient_id);
      return pac?.nome.toLowerCase().includes(q) || p.diagnostico_funcional.toLowerCase().includes(q);
    });
  }, [ptsList, search, pacientes]);

  const handleDelete = async (ptsId: string) => {
    if (!window.confirm("Deseja realmente excluir este PTS?")) return;

    try {
      const { error } = await supabase.from('pts').delete().eq('id', ptsId);
      if (error) throw error;

      await logAction({
        acao: 'excluir_pts',
        entidade: 'pts',
        entidadeId: ptsId,
        modulo: 'pts',
        user,
        detalhes: { pts_id: ptsId }
      });

      toast.success("PTS excluído com sucesso!");
      loadPts();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  // Se houver um ID na URL, mostra os detalhes
  if (id) {
    return <PTSDetails />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projetos Terapêuticos (PTS)</h1>
            <p className="text-sm text-muted-foreground">Gestão e acompanhamento clínico estruturado.</p>
          </div>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo PTS
        </Button>
      </div>

      <div className="flex items-center gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por paciente ou diagnóstico..." 
            className="pl-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <ClipboardList className="w-12 h-12 text-muted-foreground opacity-20" />
            <div className="space-y-1">
              <h3 className="font-bold">Nenhum PTS encontrado</h3>
              <p className="text-sm text-muted-foreground">Inicie um novo projeto terapêutico para um paciente.</p>
            </div>
            <Button variant="outline" onClick={() => setCreateModalOpen(true)}>Criar Primeiro PTS</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(pts => {
            const pac = pacientes.find(p => p.id === pts.patient_id);
            return (
              <Card key={pts.id} className="hover:shadow-md transition-shadow group border-l-4 border-l-primary/40">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-bold text-sm leading-none">{pac?.nome || 'Paciente'}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">ID: {pts.patient_id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <Badge variant={pts.status === 'ativo' ? 'default' : 'secondary'} className="text-[10px] px-2 py-0">
                      {pts.status === 'ativo' ? 'Ativo' : 'Concluído'}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[9px] uppercase font-black text-muted-foreground tracking-widest">Diagnóstico Funcional</Label>
                    <p className="text-xs line-clamp-2 text-foreground/80 leading-relaxed">
                      {pts.diagnostico_funcional}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      {pts.especialidades_envolvidas?.length || 0} Especialidades
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Rev: {pts.data_proxima_revisao ? new Date(pts.data_proxima_revisao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" className="flex-1 gap-2 h-8" onClick={() => navigate(`/painel/pts/${pts.id}`)}>
                      <Eye className="w-3.5 h-3.5" /> Detalhes
                    </Button>
                    {isMaster && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(pts.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreatePTSModal 
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        pacienteId=""
        pacienteNome=""
        onSuccess={loadPts}
      />
    </div>
  );
};

export default PTSPage;
