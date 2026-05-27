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
  
  // Detalhes
  const [selectedRelatorio, setSelectedRelatorio] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
        
        return {
          ...r,
          parsedObs: obs,
          isAtrasado,
          diasSemUpdate
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

  useEffect(() => {
    loadData();
  }, [user]);

  const filteredData = useMemo(() => {
    return relatorios.filter(r => {
      if (filterType !== 'all' && r.tipo_registro !== filterType) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterUnit !== 'all' && r.unidade_id !== filterUnit) return false;
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return r.paciente_nome.toLowerCase().includes(search) || 
               r.profissional_nome.toLowerCase().includes(search);
      }
      return true;
    });
  }, [relatorios, filterType, filterStatus, filterUnit, searchTerm]);

  const stats = useMemo(() => {
    return {
      total: filteredData.length,
      emitidos: filteredData.filter(r => r.status === 'emitido').length,
      pendentes: filteredData.filter(r => r.status !== 'emitido').length,
      atrasados: filteredData.filter(r => r.isAtrasado).length,
      multiprofissionais: filteredData.filter(r => r.tipo_registro === 'alta_multiprofissional').length
    };
  }, [filteredData]);

  const StatCard = ({ title, value, icon: Icon, color, subtitle }: any) => (
    <Card className="border-0 shadow-sm overflow-hidden group">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", color)}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold text-foreground">{value}</h3>
            {subtitle && <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{subtitle}</span>}
          </div>
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
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} /> Sincronizar
          </Button>
        }
      />

      {/* Indicadores Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total" value={stats.total} icon={FileText} color="bg-primary/10 text-primary" />
        <StatCard title="Emitidos" value={stats.emitidos} icon={CheckCircle} color="bg-green-100 text-green-700" />
        <StatCard title="Pendentes" value={stats.pendentes} icon={Clock} color="bg-yellow-100 text-yellow-700" />
        <StatCard title="Atrasados" value={stats.atrasados} icon={AlertTriangle} color="bg-red-100 text-red-700" critical />
        <StatCard title="Multiprof." value={stats.multiprofissionais} icon={Users2} color="bg-blue-100 text-blue-700" />
      </div>

      {/* Filtros e Busca */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Paciente ou profissional..." 
                className="pl-9 h-9" 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
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
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
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
                                style={{ width: `${(concluidoCount / profsEnvolvidos.length) * 100}%` }} 
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
                              <DropdownMenuItem className="text-xs">
                                <History className="w-3.5 h-3.5 mr-2" /> Ver Histórico Versões
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

      {/* Drawer de Detalhes Gerenciais */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="sm:max-w-xl p-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-8">
              <SheetHeader>
                <div className="flex items-center justify-between">
                   <Badge variant="outline" className={STATUS_CONFIG[selectedRelatorio?.status]?.color}>
                     {STATUS_CONFIG[selectedRelatorio?.status]?.label || selectedRelatorio?.status}
                   </Badge>
                   <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                     V{selectedRelatorio?.parsedObs?.versao || 1}
                   </span>
                </div>
                <SheetTitle className="text-xl font-bold flex items-center gap-2">
                   {selectedRelatorio?.paciente_nome}
                </SheetTitle>
                <SheetDescription>
                  Detalhes operacionais e clínicos do encerramento multiprofissional.
                </SheetDescription>
              </SheetHeader>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Responsável</p>
                  <p className="text-sm font-semibold">{selectedRelatorio?.profissional_nome}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Criado em</p>
                  <p className="text-sm font-semibold">
                    {selectedRelatorio?.criado_em && format(new Date(selectedRelatorio.criado_em), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>

              {selectedRelatorio?.tipo_registro === 'alta_multiprofissional' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <h4 className="text-sm font-bold flex items-center gap-2">
                       <Users2 className="w-4 h-4 text-primary" /> Contribuições da Equipe
                     </h4>
                     <Badge variant="secondary" className="text-[10px]">
                       {selectedRelatorio?.parsedObs?.profissionais?.filter((p: any) => p.status === 'concluido' || p.status === 'assinado').length || 0} de {selectedRelatorio?.parsedObs?.profissionais?.length || 0} concluídos
                     </Badge>
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
                   <MessageSquare className="w-4 h-4 text-primary" /> Resumo Final Consolidado
                 </h4>
                 <div className="p-4 rounded-xl bg-muted/30 border border-border/50 italic text-sm text-muted-foreground">
                   {selectedRelatorio?.parsedObs?.resumoConsolidado || selectedRelatorio?.parsedObs?.indResumoAuto || 'Resumo final ainda não gerado ou preenchido.'}
                 </div>
              </div>

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
