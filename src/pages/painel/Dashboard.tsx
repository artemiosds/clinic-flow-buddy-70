import React, { useState, useEffect, useMemo } from 'react';
import { usePacienteNomeResolver } from '@/hooks/usePacienteNomeResolver';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Users, Clock, CheckCircle, TrendingUp, XCircle, AlertTriangle, BarChart3, ArrowRight, Bell } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { cn, todayLocalStr } from '@/lib/utils';
import { getManchesterConfig } from '@/lib/manchesterProtocol';
import { DashboardSkeleton } from '@/components/skeletons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';


const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 50%)', 'hsl(0, 72%, 51%)'];

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; subtitle?: string; onClick?: () => void; critical?: boolean }> = ({ title, value, icon, color, subtitle, onClick, critical }) => (
  <Card className={cn("shadow-card border-0 transition-all", onClick && "cursor-pointer hover:ring-1 hover:ring-primary/30", critical && "ring-1 ring-destructive/40")} onClick={onClick}>
    <CardContent className="p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className={cn("text-2xl font-bold font-display", critical ? "text-destructive" : "text-foreground")}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </CardContent>
  </Card>
);

interface AtendimentoDB {
  id: string;
  profissional_nome: string;
  unidade_id: string;
  setor: string;
  data: string;
  status: string;
  duracao_minutos: number | null;
  sala_id: string;
}

const Dashboard: React.FC = () => {
  const { agendamentos, fila, funcionarios, unidades, disponibilidades, salas, pacientes } = useData();
  const resolvePaciente = usePacienteNomeResolver();
  const { user } = useAuth();
  const isGlobalAdmin = user?.usuario === 'admin.sms';
  const userUnidadeId = user?.unidadeId || '';
  const navigate = useNavigate();
  const [stats, setStats] = useState<{ hoje_total: number; fila_aguardando: number; atendimentos_30d: number; taxa_falta_30d: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await (supabase as any).rpc('get_dashboard_stats', {
          p_unidade_id: user?.unidadeId && user?.usuario !== 'admin.sms' ? user.unidadeId : null,
          p_profissional_id: user?.role === 'profissional' ? user.id : null
        });
        if (error) throw error;
        if (data) setStats(data);
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const today = new Date().toISOString().split('T')[0];

  const filteredAgendamentos = useMemo(() => {
    return agendamentos.filter(a => {
      if (user?.role === 'profissional' && a.profissionalId !== user.id) return false;
      if (user?.unidadeId && user?.usuario !== 'admin.sms' && a.unidadeId !== user.unidadeId) return false;
      return true;
    });
  }, [agendamentos, user]);

  const todayAg = filteredAgendamentos.filter(a => a.data === today);
  const confirmados = todayAg.filter(a => a.status === 'confirmado' || a.status === 'confirmado_chegada').length;
  const pendentes = todayAg.filter(a => a.status === 'pendente').length;
  const aguardando = fila.filter(f => f.status === 'aguardando').length;

  const pendenciasAgenda = useMemo(() => {
    const today = todayLocalStr();
    const nowTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const isProfissional = user?.role === 'profissional';
    
    const PENDENTE_STATUSES = new Set([
      "confirmado", "confirmada", "agendado", "confirmado_chegada", "chegada_confirmada",
      "aguardando_triagem", "triagem_concluida", "apto_atendimento", "apto",
      "apto_para_atendimento", "em_atendimento", "pendente", "aguardando_profissional",
      "aguardando_atendimento", "aguardando_enfermagem"
    ]);

    return agendamentos.filter((a) => {
      if (a.data > today) return false;
      if (a.data === today && a.hora >= nowTime) return false;
      
      const isMasterGlobal = user?.role === "master" && user?.usuario === 'admin.sms';
      const isMasterUnidade = user?.role === "master" && !isMasterGlobal;
      
      if (isProfissional && user?.id && a.profissionalId !== user.id) return false;
      if (user?.role === "recepcao" && user?.unidadeId && a.unidadeId !== user.unidadeId) return false;
      if (isMasterUnidade && user?.unidadeId && a.unidadeId !== user.unidadeId) return false;

      return PENDENTE_STATUSES.has(a.status);
    });
  }, [agendamentos, user]);

  // KPIs derived from RPC
  const kpis = useMemo(() => {
    return { 
      noShowRate: stats?.taxa_falta_30d || 0, 
      avgTime: 0, // Simplified for now as we don't have this in basic RPC
      occupancyRate: 0, 
      totalFinalizados: stats?.atendimentos_30d || 0,
      prioAguardando: 0 // Derivar da fila local se necessário
    };
  }, [stats]);

  const weekChartData = useMemo(() => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const now = new Date();
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = filteredAgendamentos.filter(a => a.data === dateStr && (a.status === 'concluido' || a.status === 'em_atendimento')).length;
      result.push({ name: days[d.getDay()], atendimentos: count });
    }
    return result;
  }, [filteredAgendamentos]);

  const profData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredAgendamentos.forEach(a => {
      if (a.profissionalNome) map[a.profissionalNome] = (map[a.profissionalNome] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [filteredAgendamentos]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Painel de Controle"
        subtitle={`Bem-vindo, ${user?.nome}. Acompanhe os indicadores da unidade em tempo real.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/painel/agenda')} className="hidden sm:flex">
            Ver Agenda Completa <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        }
      />


      {/* Main KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Consultas Hoje" value={stats?.hoje_total || 0} icon={<Calendar className="w-5 h-5 text-primary-foreground" />} color="gradient-primary" onClick={() => navigate('/painel/agenda')} />
        <StatCard 
          title="Pendências Agenda" 
          value={pendenciasAgenda.length} 
          icon={<Bell className="w-5 h-5 text-warning-foreground" />} 
          color="bg-warning" 
          subtitle={pendenciasAgenda.length > 0 ? "Ações necessárias" : "Tudo em dia"}
          onClick={() => navigate('/painel/agenda')} 
          critical={pendenciasAgenda.length > 0}
        />
        <StatCard title="Na Fila" value={stats?.fila_aguardando || 0} icon={<Clock className="w-5 h-5 text-info-foreground" />} color="bg-info" onClick={() => navigate('/painel/fila')} />
        <StatCard title="Atendimentos (30d)" value={stats?.atendimentos_30d || 0} icon={<TrendingUp className="w-5 h-5 text-success-foreground" />} color="bg-success" onClick={() => navigate('/painel/atendimentos')} />
      </div>

      {/* Executive KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Taxa No-Show (30d)" 
          value={`${kpis.noShowRate}%`} 
          icon={<XCircle className="w-5 h-5 text-destructive-foreground" />} 
          color="bg-destructive"
          subtitle={`Últimos 30 dias`}
          onClick={() => navigate('/painel/relatorios')}
          critical={kpis.noShowRate > 20}
        />
        <StatCard 
          title="Atendimentos (30d)" 
          value={`${kpis.totalFinalizados}`} 
          icon={<Clock className="w-5 h-5 text-primary-foreground" />} 
          color="gradient-primary"
          subtitle="Total realizado"
          onClick={() => navigate('/painel/relatorios')}
        />
        <StatCard 
          title="Ocupação Salas" 
          value={`${kpis.occupancyRate}%`} 
          icon={<BarChart3 className="w-5 h-5 text-info-foreground" />} 
          color="bg-info"
          subtitle="Hoje"
          onClick={() => navigate('/painel/unidades')}
        />
        <StatCard 
          title="Prioritários" 
          value={kpis.prioAguardando} 
          icon={<AlertTriangle className="w-5 h-5 text-warning-foreground" />} 
          color="bg-warning"
          subtitle="Aguardando"
          onClick={() => navigate('/painel/fila')}
          critical={kpis.prioAguardando > 5}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Atendimentos da Semana</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weekChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(215, 15%, 50%)' }} />
                <YAxis tick={{ fill: 'hsl(215, 15%, 50%)' }} />
                <Tooltip />
                <Bar dataKey="atendimentos" fill="hsl(199, 89%, 38%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Agendamentos por Profissional</h3>
            {profData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Nenhum dado disponível ainda.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={profData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}>
                    {profData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's appointments summary */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Agenda de Hoje</h3>
          <div className="space-y-2">
            {todayAg.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum agendamento para hoje.</p>
            ) : (
              todayAg.sort((a, b) => {
                // Priority ordering for Dashboard too
                const manchesterOrder: Record<string, number> = { vermelho: 1, laranja: 2, amarelo: 3, verde: 4, azul: 5 };
                const aManchester = manchesterOrder[(a as any).classificacaoRisco] ?? 6;
                const bManchester = manchesterOrder[(b as any).classificacaoRisco] ?? 6;
                if (aManchester !== bManchester) return aManchester - bManchester;
                
                const pacA = pacientes.find(p => p.id === a.pacienteId);
                const pacB = pacientes.find(p => p.id === b.pacienteId);
                const aIsAutista = pacA?.isAutista ? 0 : 1;
                const bIsAutista = pacB?.isAutista ? 0 : 1;
                if (aIsAutista !== bIsAutista) return aIsAutista - bIsAutista;

                return a.hora.localeCompare(b.hora);
              }).map(ag => {
                const tipoLabel = ag.tipo === 'Retorno' ? '🔄' : ag.tipo === 'Exame' ? '🔬' : '🩺';
                const manchesterRisco = getManchesterConfig((ag as any).classificacaoRisco);
                const pac = pacientes.find(p => p.id === ag.pacienteId);

                return (
                  <div key={ag.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-lg bg-muted/50 relative overflow-hidden">
                    {manchesterRisco && (
                      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: manchesterRisco.color }} />
                    )}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm font-mono font-medium text-foreground w-14 shrink-0">{ag.hora}</span>
                      <span className="text-sm shrink-0" title={ag.tipo}>{tipoLabel}</span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-foreground font-medium truncate">{resolvePaciente(ag.pacienteId, ag.pacienteNome)}</span>
                        <div className="flex gap-1 items-center">
                          {pac?.isAutista && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1 rounded">🧩 TEA</span>}
                          {pac?.isPne && <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1 rounded">♿ PCD</span>}
                          {manchesterRisco && (
                            <span className="text-[10px] font-bold px-1 rounded text-white" style={{ backgroundColor: manchesterRisco.color }}>
                              {manchesterRisco.subtitle}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pl-0 sm:pl-0">
                      <span className="text-xs text-muted-foreground truncate max-w-[150px]">{ag.profissionalNome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        ag.status === 'confirmado' || ag.status === 'confirmado_chegada' ? 'bg-success/10 text-success' :
                        ag.status === 'pendente' ? 'bg-warning/10 text-warning' :
                        ag.status === 'cancelado' ? 'bg-destructive/10 text-destructive' :
                        ag.status === 'em_atendimento' ? 'bg-primary/10 text-primary' :
                        ag.status === 'concluido' ? 'bg-info/10 text-info' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {ag.status === 'confirmado_chegada' ? 'Chegou' : ag.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* System status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{funcionarios.filter(f => f.role === 'profissional' && f.ativo && (isGlobalAdmin || !userUnidadeId || f.unidadeId === userUnidadeId)).length}</p>
            <p className="text-xs text-muted-foreground">Profissionais Ativos</p>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{unidades.filter(u => u.ativo).length}</p>
            <p className="text-xs text-muted-foreground">Unidades Ativas</p>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{disponibilidades.length}</p>
            <p className="text-xs text-muted-foreground">Disponibilidades Configuradas</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
