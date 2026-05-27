import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, Users, Clock, CheckCircle, AlertTriangle, 
  Search, Filter, History, Eye, Printer, FileDown, 
  ArrowRight, Users2, User, UserCheck, Calendar, Activity,
  ChevronRight, MoreHorizontal, MessageSquare, RefreshCw,
  TrendingUp, BarChart3, AlertCircle, CheckSquare, Download,
  ArrowUpRight, ArrowDownRight, Award, Building2, Timer,
  Flag, Bell, LayoutDashboard, ListTodo, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, subDays, isAfter, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS_CONFIG: Record<string, { label: string, color: string, icon: any }> = {
  rascunho: { label: 'Rascunho', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock },
  preenchendo: { label: 'Em Preenchimento', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Activity },
  aguardando: { label: 'Aguardando Equipe', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Users2 },
  validado: { label: 'Validado', color: 'bg-green-100 text-green-700 border-green-200', icon: UserCheck },
  emitido: { label: 'Emitido', color: 'bg-primary/10 text-primary border-primary/20', icon: CheckCircle },
};

const PainelGestaoAlta: React.FC = () => {
  const { user } = useAuth();
  const { unidades, funcionarios } = useData();
  const [relatorios, setRelatorios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterUnit, setFilterUnit] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [periodo, setPeriodo] = useState('30d'); // 7d, 30d, 90d, all
  
  // Detalhes e Timeline
  const [selectedRelatorio, setSelectedRelatorio] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('prontuarios')
        .select('*')
        .in('tipo_registro', ['alta_individual', 'alta_multiprofissional'])
        .order('criado_em', { ascending: false });

      if (user?.unidadeId && user?.usuario !== 'admin.sms') {
        query = query.eq('unidade_id', user.unidadeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const processedData = (data || []).map(r => {
        let obs = {};
        try {
          obs = typeof r.observacoes === 'string' ? JSON.parse(r.observacoes) : r.observacoes;
        } catch (e) {
          console.error("Erro parse obs", e);
        }
        
        // Regra de atraso: rascunho ou aguardando há mais de 5 dias
        const diasSemUpdate = differenceInDays(new Date(), new Date(r.criado_em));
        const isAtrasado = (r.status !== 'emitido' && r.status !== 'validado') && diasSemUpdate > 5;
        
        // Versões
        const historico = (obs as any)?.historico || [];
        const isReaberto = historico.length > 0;
        
        return {
          ...r,
          parsedObs: obs,
          isAtrasado,
          diasSemUpdate,
          isReaberto,
          historicoCount: historico.length
        };
      });
      
      setRelatorios(processedData);
    } catch (err) {
      console.error('Erro ao carregar relatórios de alta:', err);
      toast.error('Não foi possível carregar o painel de gestão.');
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = async (relatorioId: string) => {
    setLoadingTimeline(true);
    try {
      const { data, error } = await supabase
        .from('action_logs')
        .select('*')
        .eq('entidade_id', relatorioId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setTimeline(data || []);
    } catch (err) {
      console.error('Erro ao carregar timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const filteredData = useMemo(() => {
    return relatorios.filter(r => {
      // Filtro de período
      if (periodo !== 'all') {
        const dias = periodo === '7d' ? 7 : periodo === '30d' ? 30 : 90;
        if (!isAfter(new Date(r.criado_em), subDays(new Date(), dias))) return false;
      }
      
      if (filterType !== 'all' && r.tipo_registro !== filterType) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'atrasado') return r.isAtrasado;
        if (filterStatus === 'reaberto') return r.isReaberto;
        if (r.status !== filterStatus) return false;
      }
      if (filterUnit !== 'all' && r.unidade_id !== filterUnit) return false;
      
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return r.paciente_nome.toLowerCase().includes(search) || 
               r.profissional_nome.toLowerCase().includes(search);
      }
      return true;
    });
  }, [relatorios, filterType, filterStatus, filterUnit, searchTerm, periodo]);

  const stats = useMemo(() => {
    const total = filteredData.length;
    const emitidos = filteredData.filter(r => r.status === 'emitido').length;
    const pendentes = filteredData.filter(r => r.status !== 'emitido').length;
    const atrasados = filteredData.filter(r => r.isAtrasado).length;
    const reabertos = filteredData.filter(r => r.isReaberto).length;
    
    // Tempo médio (aprox.)
    const emitidosComData = filteredData.filter(r => r.status === 'emitido');
    const totalDias = emitidosComData.reduce((acc, curr) => acc + differenceInDays(new Date(), new Date(curr.criado_em)), 0);
    const tempoMedio = emitidosComData.length > 0 ? Math.round(totalDias / emitidosComData.length) : 0;

    return {
      total,
      emitidos,
      pendentes,
      atrasados,
      reabertos,
      tempoMedio,
      taxaEmissao: total > 0 ? Math.round((emitidos / total) * 100) : 0,
      multiprofissionais: filteredData.filter(r => r.tipo_registro === 'alta_multiprofissional').length
    };
  }, [filteredData]);

  const exportToCSV = () => {
    const headers = ["ID", "Paciente", "Profissional", "Unidade", "Tipo", "Status", "Criado Em", "Atrasado", "Reaberto"];
    const rows = filteredData.map(r => [
      r.id,
      r.paciente_nome,
      r.profissional_nome,
      unidades.find(u => u.id === r.unidade_id)?.nome || 'N/A',
      r.tipo_registro === 'alta_multiprofissional' ? 'Multiprofissional' : 'Individual',
      STATUS_CONFIG[r.status]?.label || r.status,
      format(new Date(r.criado_em), 'dd/MM/yyyy HH:mm'),
      r.isAtrasado ? 'SIM' : 'NÃO',
      r.isReaberto ? 'SIM' : 'NÃO'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `gestao_alta_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Relatório exportado com sucesso.");
  };

  const StatCard = ({ title, value, icon: Icon, color, subtitle, trend }: any) => (
    <Card className="border-0 shadow-sm overflow-hidden group">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", color)}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold text-foreground">{value}</h3>
            {subtitle && <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{subtitle}</span>}
          </div>
          {trend && (
            <div className={cn("flex items-center gap-1 text-[10px] font-bold mt-1", trend > 0 ? "text-green-600" : "text-red-600")}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 rotate-180" />}
              {Math.abs(trend)}% vs anterior
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader 
        title="Gestão de Relatórios de Alta" 
        subtitle="Monitoramento clínico e administrativo de encerramentos e transferências."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={loading || filteredData.length === 0}>
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} /> Sincronizar
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="monitoramento" className="space-y-6">
        <TabsList className="bg-muted/50 p-1 border border-border/50">
          <TabsTrigger value="monitoramento" className="gap-2">
            <LayoutDashboard className="w-4 h-4" /> Monitoramento
          </TabsTrigger>
          <TabsTrigger value="prioridades" className="gap-2">
            <ListTodo className="w-4 h-4" /> Fila de Prioridades
            {stats.atrasados > 0 && <Badge className="ml-1 bg-red-500 text-white border-0 h-4 px-1 min-w-[16px] flex justify-center">{stats.atrasados}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="metricas" className="gap-2">
            <BarChart3 className="w-4 h-4" /> Métricas & KPIs
          </TabsTrigger>
          <TabsTrigger value="ranking" className="gap-2">
            <Award className="w-4 h-4" /> Ranking & Produtividade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitoramento" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Indicadores Principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard title="Total no Período" value={stats.total} icon={FileText} color="bg-primary/10 text-primary" />
            <StatCard title="Taxa de Emissão" value={`${stats.taxaEmissao}%`} icon={CheckCircle} color="bg-green-100 text-green-700" trend={5} />
            <StatCard title="Pendentes" value={stats.pendentes} icon={Clock} color="bg-yellow-100 text-yellow-700" />
            <StatCard title="Atrasados" value={stats.atrasados} icon={AlertTriangle} color="bg-red-100 text-red-700" />
            <StatCard title="Tempo Médio" value={stats.tempoMedio} subtitle="DIAS" icon={Timer} color="bg-blue-100 text-blue-700" />
          </div>

          {/* Filtros e Busca */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="relative md:col-span-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Paciente ou profissional..." 
                    className="pl-9 h-9" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={periodo} onValueChange={setPeriodo}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="all">Todo o histórico</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Tipo de Relatório" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    <SelectItem value="alta_individual">Individual</SelectItem>
                    <SelectItem value="alta_multiprofissional">Multiprofissional</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Status Especial" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="atrasado">Somente Atrasados</SelectItem>
                    <SelectItem value="reaberto">Somente Reabertos</SelectItem>
                    <Separator className="my-1" />
                    {Object.entries(STATUS_CONFIG).map(([val, { label }]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterUnit} onValueChange={setFilterUnit}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Unidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Unidades</SelectItem>
                    {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nomeExibicao || u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Listagem */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Tipo / Paciente</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Responsável</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Status / Progresso</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Data Registro</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredData.map(r => {
                      const StatusIcon = STATUS_CONFIG[r.status]?.icon || Clock;
                      const isMulti = r.tipo_registro === 'alta_multiprofissional';
                      const profsEnvolvidos = r.parsedObs?.profissionais || [];
                      const concluidoCount = profsEnvolvidos.filter((s: any) => s.status === 'concluido' || s.status === 'assinado').length;
                      
                      return (
                        <tr key={r.id} className={cn("hover:bg-muted/30 transition-colors", r.isAtrasado && "bg-red-50/20")}>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                isMulti ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-600"
                              )}>
                                {isMulti ? <Users2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-foreground truncate">{r.paciente_nome}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge variant="outline" className="text-[9px] h-4 uppercase font-bold py-0">
                                    {isMulti ? 'Multiprofissional' : 'Individual'}
                                  </Badge>
                                  {r.isAtrasado && (
                                    <Badge className="bg-red-100 text-red-700 border-red-200 text-[9px] h-4 animate-pulse">
                                      Parado há {r.diasSemUpdate} dias
                                    </Badge>
                                  )}
                                  {r.isReaberto && (
                                    <Badge variant="secondary" className="text-[9px] h-4 uppercase font-bold py-0">
                                      Reaberto (V{r.parsedObs?.versao || 1})
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-0.5">
                              <p className="font-medium text-foreground">{r.profissional_nome}</p>
                              <p className="text-[10px] text-muted-foreground uppercase">{unidades.find(u => u.id === r.unidade_id)?.nome || 'Unidade Geral'}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-2 min-w-[150px]">
                              <div className="flex items-center gap-2">
                                 <Badge variant="outline" className={cn("h-5 py-0 text-[10px] font-bold uppercase flex gap-1", STATUS_CONFIG[r.status]?.color)}>
                                   <StatusIcon className="w-3 h-3" />
                                   {STATUS_CONFIG[r.status]?.label || r.status}
                                 </Badge>
                                 {isMulti && (
                                   <span className="text-[10px] text-muted-foreground font-bold">
                                     {concluidoCount}/{profsEnvolvidos.length} OK
                                   </span>
                                 )}
                              </div>
                              {isMulti && (
                                <div className="w-full bg-muted rounded-full h-1">
                                  <div 
                                    className="bg-blue-600 h-1 rounded-full transition-all" 
                                    style={{ width: `${(concluidoCount / Math.max(1, profsEnvolvidos.length)) * 100}%` }} 
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs">
                            <div className="space-y-0.5">
                              <p className="text-foreground">{format(new Date(r.criado_em), 'dd/MM/yyyy', { locale: ptBR })}</p>
                              <p className="text-muted-foreground">{format(new Date(r.criado_em), 'HH:mm')}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                onClick={() => {
                                  setSelectedRelatorio(r);
                                  setDetailsOpen(true);
                                  loadTimeline(r.id);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem className="text-xs">
                                    <Printer className="w-3.5 h-3.5 mr-2" /> Imprimir Documento
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-xs">
                                    <FileDown className="w-3.5 h-3.5 mr-2" /> Gerar PDF
                                  </DropdownMenuItem>
                                  <Separator className="my-1" />
                                  <DropdownMenuItem className="text-xs" onClick={() => {
                                    setSelectedRelatorio(r);
                                    setDetailsOpen(true);
                                    loadTimeline(r.id);
                                  }}>
                                    <History className="w-3.5 h-3.5 mr-2" /> Ver Timeline & Auditoria
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredData.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <Search className="w-8 h-8 opacity-20" />
                            <p>Nenhum relatório encontrado para os filtros aplicados.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prioridades" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <Card className="border-red-100 bg-red-50/10 col-span-1 md:col-span-2">
               <CardHeader className="pb-3">
                 <CardTitle className="text-sm font-bold flex items-center gap-2 text-red-700">
                   <AlertTriangle className="w-4 h-4" /> Relatórios com Atraso Crítico
                 </CardTitle>
               </CardHeader>
               <CardContent>
                  <div className="space-y-3">
                    {relatorios.filter(r => r.isAtrasado).slice(0, 5).map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-red-100 bg-white shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                            <Timer className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold">{r.paciente_nome}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">Parado há {r.diasSemUpdate} dias • {r.profissional_nome}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase text-red-600 hover:text-red-700 hover:bg-red-50">
                          Cobrar <ArrowRight className="ml-1 w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {relatorios.filter(r => r.isAtrasado).length === 0 && (
                      <div className="py-8 text-center text-muted-foreground text-xs italic">
                        Nenhum relatório em atraso crítico. Bom trabalho!
                      </div>
                    )}
                  </div>
               </CardContent>
             </Card>

             <div className="space-y-6">
               <Card className="border-blue-100 bg-blue-50/10">
                 <CardHeader className="pb-3">
                   <CardTitle className="text-sm font-bold flex items-center gap-2 text-blue-700">
                     <Bell className="w-4 h-4" /> Notificações de Gestão
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-3">
                    <div className="p-3 rounded-lg bg-white border border-blue-100 flex gap-3">
                      <div className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <Users2 className="w-3 h-3" />
                      </div>
                      <p className="text-[11px] leading-snug">
                        <span className="font-bold text-blue-700">{relatorios.filter(r => r.tipo_registro === 'alta_multiprofissional' && r.status === 'aguardando').length} relatórios</span> aguardam contribuição da equipe.
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-blue-100 flex gap-3">
                      <div className="w-6 h-6 rounded bg-yellow-100 text-yellow-600 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-3 h-3" />
                      </div>
                      <p className="text-[11px] leading-snug">
                        <span className="font-bold text-yellow-700">{relatorios.filter(r => r.status === 'validado').length} relatórios</span> validados aguardando emissão final.
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-blue-100 flex gap-3">
                      <div className="w-6 h-6 rounded bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                        <RefreshCw className="w-3 h-3" />
                      </div>
                      <p className="text-[11px] leading-snug">
                        <span className="font-bold text-purple-700">{relatorios.filter(r => r.isReaberto).length} relatórios</span> foram reabertos e precisam de revisão.
                      </p>
                    </div>
                 </CardContent>
               </Card>

               <Card className="border-slate-100">
                 <CardHeader className="pb-3">
                   <CardTitle className="text-sm font-bold flex items-center gap-2">
                     <Building2 className="w-4 h-4" /> Pendências por Unidade
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                    {unidades.slice(0, 3).map(u => {
                      const count = relatorios.filter(r => r.unidade_id === u.id && r.status !== 'emitido').length;
                      return (
                        <div key={u.id} className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-bold uppercase">
                            <span>{u.nomeExibicao || u.nome}</span>
                            <span>{count} pendentes</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.min(100, (count / Math.max(1, stats.pendentes)) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                 </CardContent>
               </Card>
             </div>
           </div>
        </TabsContent>

        <TabsContent value="metricas" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Volume de Relatórios por Status</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Emitidos', value: stats.emitidos },
                          { name: 'Rascunho', value: filteredData.filter(r => r.status === 'rascunho').length },
                          { name: 'Equipe', value: filteredData.filter(r => r.status === 'aguardando').length },
                          { name: 'Validado', value: filteredData.filter(r => r.status === 'validado').length },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#94a3b8" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#3b82f6" />
                      </Pie>
                      <ReTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Histórico de Produção (Últimos 7 dias)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Array.from({ length: 7 }).map((_, i) => {
                      const d = subDays(new Date(), 6 - i);
                      return {
                        data: format(d, 'dd/MM'),
                        total: relatorios.filter(r => format(new Date(r.criado_em), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd')).length
                      };
                    })}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="data" fontSize={10} axisLine={false} tickLine={false} />
                      <YAxis fontSize={10} axisLine={false} tickLine={false} />
                      <ReTooltip />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
           </div>
        </TabsContent>

        <TabsContent value="ranking" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-green-600" /> Profissionais Mais Produtivos (Emissões)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                   {Array.from(new Set(relatorios.filter(r => r.status === 'emitido').map(r => r.profissional_id)))
                    .map(id => ({
                      id,
                      nome: relatorios.find(r => r.profissional_id === id)?.profissional_nome,
                      count: relatorios.filter(r => r.profissional_id === id && r.status === 'emitido').length
                    }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5)
                    .map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-muted-foreground w-4">#{idx + 1}</span>
                          <p className="text-xs font-bold">{p.nome}</p>
                        </div>
                        <Badge variant="secondary" className="font-bold">{p.count} Emitidos</Badge>
                      </div>
                    ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-red-600">
                    <Timer className="w-4 h-4" /> Profissionais com Mais Pendências
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                   {Array.from(new Set(relatorios.filter(r => r.status !== 'emitido').map(r => r.profissional_id)))
                    .map(id => ({
                      id,
                      nome: relatorios.find(r => r.profissional_id === id)?.profissional_nome,
                      count: relatorios.filter(r => r.profissional_id === id && r.status !== 'emitido').length
                    }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5)
                    .map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-muted-foreground w-4">#{idx + 1}</span>
                          <p className="text-xs font-bold">{p.nome}</p>
                        </div>
                        <Badge className="bg-red-100 text-red-700 border-red-200 font-bold">{p.count} Pendentes</Badge>
                      </div>
                    ))}
                </CardContent>
              </Card>
           </div>
        </TabsContent>
      </Tabs>

      {/* Drawer de Detalhes Gerenciais & Timeline */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="sm:max-w-2xl p-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-8">
              <SheetHeader>
                <div className="flex items-center justify-between">
                   <Badge variant="outline" className={cn("font-bold uppercase", STATUS_CONFIG[selectedRelatorio?.status]?.color)}>
                     {STATUS_CONFIG[selectedRelatorio?.status]?.label || selectedRelatorio?.status}
                   </Badge>
                   <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                     Versão {selectedRelatorio?.parsedObs?.versao || 1}
                   </span>
                </div>
                <SheetTitle className="text-xl font-bold flex items-center gap-2">
                   {selectedRelatorio?.paciente_nome}
                </SheetTitle>
                <SheetDescription>
                  Monitoramento administrativo e auditoria do encerramento.
                </SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="info">
                <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-4">
                  <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 px-0 font-bold text-xs uppercase tracking-wider">
                    Informações
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 px-0 font-bold text-xs uppercase tracking-wider">
                    Timeline & Auditoria
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="pt-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Responsável</p>
                      <p className="text-sm font-semibold">{selectedRelatorio?.profissional_nome}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Unidade</p>
                      <p className="text-sm font-semibold">{unidades.find(u => u.id === selectedRelatorio?.unidade_id)?.nome || 'Unidade Geral'}</p>
                    </div>
                  </div>

                  {selectedRelatorio?.tipo_registro === 'alta_multiprofissional' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <h4 className="text-sm font-bold flex items-center gap-2">
                           <Users2 className="w-4 h-4 text-primary" /> Contribuições da Equipe
                         </h4>
                      </div>
                      <div className="space-y-2">
                        {selectedRelatorio?.parsedObs?.profissionais?.map((p: any) => (
                          <div key={p.profissional_id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-white shadow-sm">
                            <div>
                              <p className="text-xs font-bold">{p.profissional_nome}</p>
                              <p className="text-[10px] text-muted-foreground uppercase">{p.profissao || 'Membro da Equipe'}</p>
                            </div>
                            <Badge className={cn(
                              "text-[9px] h-5 font-bold uppercase",
                              p.status === 'assinado' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                              p.status === 'concluido' ? 'bg-green-100 text-green-700 border-green-200' :
                              'bg-yellow-100 text-yellow-700 border-yellow-200'
                            )}>
                              {p.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                     <h4 className="text-sm font-bold flex items-center gap-2">
                       <MessageSquare className="w-4 h-4 text-primary" /> Resumo Consolidado
                     </h4>
                     <div className="p-4 rounded-xl bg-muted/30 border border-border/50 italic text-sm text-muted-foreground">
                       {selectedRelatorio?.parsedObs?.resumoConsolidado || selectedRelatorio?.parsedObs?.indResumoAuto || 'Resumo final ainda não gerado ou preenchido.'}
                     </div>
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="pt-6">
                  {loadingTimeline ? (
                    <div className="py-20 text-center">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto opacity-20" />
                      <p className="text-xs text-muted-foreground mt-2">Carregando rastro de auditoria...</p>
                    </div>
                  ) : timeline.length > 0 ? (
                    <div className="space-y-6">
                      {timeline.map((log, idx) => (
                        <div key={log.id} className="relative pl-6 pb-6 border-l border-muted-foreground/20 last:border-0 last:pb-0">
                          <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-background" />
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold uppercase tracking-wide text-foreground">{log.acao}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</p>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Por: <span className="font-bold">{log.user_nome}</span> ({log.role})</p>
                            {log.detalhes?.motivo && (
                              <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-100 text-[10px] text-amber-800 italic">
                                Motivo: {log.detalhes.motivo}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-20 text-center space-y-3">
                       <History className="w-10 h-10 mx-auto opacity-10" />
                       <p className="text-xs text-muted-foreground italic">Nenhum evento detalhado registrado nesta timeline ainda.</p>
                       <div className="p-4 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-700 max-w-xs mx-auto text-left flex gap-3">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>A timeline será preenchida automaticamente a cada nova ação realizada no relatório (assinatura, conclusão, reabertura, etc).</span>
                       </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <Separator />

              <div className="flex flex-col gap-3">
                <Button className="w-full justify-between" onClick={() => window.open(`/painel/alta?id=${selectedRelatorio?.id}`)}>
                  Abrir Relatório Completo <ChevronRight className="w-4 h-4" />
                </Button>
                <div className="grid grid-cols-2 gap-3">
                   <Button variant="outline" className="gap-2">
                     <Printer className="w-4 h-4" /> Imprimir
                   </Button>
                   <Button variant="outline" className="gap-2">
                     <FileDown className="w-4 h-4" /> Gerar PDF
                   </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PainelGestaoAlta;
    </div>
  );
};

export default PainelGestaoAlta;
