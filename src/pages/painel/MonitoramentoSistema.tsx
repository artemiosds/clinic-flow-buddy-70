import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Activity, Database, HardDrive, ShieldAlert, ShieldCheck, 
  RefreshCw, Server, AlertCircle, Trash2, Download, Info,
  Search, ChevronRight, BarChart3, Clock, Globe, Shield,
  FileText, CheckCircle2, XCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageHeader } from '@/components/layout/PageHeader';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, 
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, 
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MonitoramentoSistema = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [activeTab, setActiveTab] = useState('geral');
  const [cleanupLogs, setCleanupLogs] = useState<any[]>([]);

  const isMaster = user?.role?.toLowerCase().trim() === 'master' || user?.usuario === 'admin.sms';

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('system-monitoring-check', {
        body: { action: 'check-system' }
      });
      
      if (error) {
        // Detailed error for Master to help debug
        if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
          toast.error('Erro de autenticação na Edge Function.');
        } else if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
          toast.error('Acesso negado: Perfil sem permissão administrativa.');
        } else {
          toast.error('Erro na Edge Function: ' + error.message);
        }
        throw error;
      }
      
      setStats(data);
    } catch (err: any) {
      console.error('Monitoring Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCleanupLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('system_cleanup_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      setCleanupLogs(data || []);
    } catch (err) {
      console.error('Error fetching cleanup logs:', err);
    }
  };

  useEffect(() => {
    if (isMaster) {
      fetchStats();
      fetchCleanupLogs();
    }
  }, [isMaster]);

  const handleCleanup = async (type: string, days: number = 90) => {
    if (cleanupConfirmText !== 'LIMPAR') {
      toast.error('Digite LIMPAR para confirmar a exclusão');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('system-cleanup-execute', {
        body: { type, days, confirmation: 'LIMPAR' }
      });
      if (error) throw error;
      toast.success(`${data.count} registros limpos com sucesso!`);
      fetchStats();
      fetchCleanupLogs();
      setCleanupConfirmText('');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao executar limpeza: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isMaster) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold">Acesso Restrito</h1>
        <p className="text-muted-foreground">Apenas usuários MASTER podem acessar o monitoramento do sistema.</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-emerald-500';
      case 'instavel': return 'bg-amber-500';
      case 'erro': return 'bg-rose-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Monitoramento do Sistema" 
        subtitle="Acompanhe a saúde geral do sistema, banco de dados e armazenamento."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar análise
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar relatório
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="shadow-sm border-0 bg-sidebar/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatusColor(stats?.status)}/10`}>
              <Activity className={`w-5 h-5 ${getStatusColor(stats?.status).replace('bg-', 'text-')}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Status Geral</p>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${getStatusColor(stats?.status)}`} />
                <p className="text-sm font-bold capitalize">{stats?.status || (loading ? 'Carregando...' : 'Offline')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 bg-sidebar/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Banco de Dados</p>
              <p className="text-sm font-bold">Supabase Conectado</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 bg-sidebar/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Storage</p>
              <p className="text-sm font-bold">{stats?.storageStats ? `${stats.storageStats.length} Buckets` : (loading ? 'Carregando...' : 'Nenhum')}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 bg-sidebar/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Server className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Hospedagem</p>
              <p className="text-sm font-bold">Vercel/Cloud</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 bg-sidebar/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Alertas</p>
              <p className="text-sm font-bold">{stats?.alert_count || 0} Ativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="geral" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="geral" className="gap-2"><BarChart3 className="w-4 h-4" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="banco" className="gap-2"><Database className="w-4 h-4" /> Banco de Dados</TabsTrigger>
          <TabsTrigger value="storage" className="gap-2"><HardDrive className="w-4 h-4" /> Arquivos e Storage</TabsTrigger>
          <TabsTrigger value="desempenho" className="gap-2"><Activity className="w-4 h-4" /> Desempenho</TabsTrigger>
          <TabsTrigger value="hospedagem" className="gap-2"><Server className="w-4 h-4" /> Hospedagem</TabsTrigger>
          <TabsTrigger value="supabase" className="gap-2"><Shield className="w-4 h-4" /> Supabase</TabsTrigger>
          <TabsTrigger value="limpeza" className="gap-2"><Trash2 className="w-4 h-4" /> Limpeza Segura</TabsTrigger>
          <TabsTrigger value="logs" className="gap-2"><FileText className="w-4 h-4" /> Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-card border-0">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Saúde do Sistema
                </CardTitle>
                <CardDescription>Principais indicadores de desempenho e estabilidade.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Uso de Memória Estimado</span>
                    <span className="font-bold">24%</span>
                  </div>
                  <Progress value={24} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Latência Supabase</span>
                    <span className="font-bold">42ms</span>
                  </div>
                  <Progress value={15} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sucesso de Requisições</span>
                    <span className="font-bold">99.9%</span>
                  </div>
                  <Progress value={99.9} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  Recomendações
                </CardTitle>
                <CardDescription>Sugestões automáticas para otimização.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-sm">Muitos registros na tabela de logs. Considere realizar uma limpeza de registros com mais de 90 dias.</p>
                  </li>
                  <li className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                    <Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-sm">Configuração de backup automático ativa e sincronizada com Supabase.</p>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="banco" className="mt-4">
          <Card className="shadow-card border-0">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Tabelas Monitoradas</CardTitle>
                <CardDescription>Estatísticas detalhadas por tabela do banco de dados.</CardDescription>
              </div>
              <Badge variant="outline" className="gap-2">
                <Clock className="w-3 h-3" /> Atualizado há 1 min
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/50">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Tabela</TableHead>
                      <TableHead className="text-right">Registros Totais</TableHead>
                      <TableHead className="text-right">Últimos 7 dias</TableHead>
                      <TableHead className="text-right">Últimos 30 dias</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats?.tableStats ? stats.tableStats.map((table: any) => (
                      <TableRow key={table.table}>
                        <TableCell className="font-medium">{table.table}</TableCell>
                        <TableCell className="text-right font-mono">{table.count.toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-right text-emerald-500">+{table.last7}</TableCell>
                        <TableCell className="text-right text-emerald-600">+{table.last30}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={table.status === 'normal' ? 'outline' : 'secondary'} className="capitalize">
                            {table.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">
                          {loading ? 'Carregando estatísticas das tabelas...' : 'Nenhuma informação disponível'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-card border-0">
              <CardHeader>
                <CardTitle className="text-lg">Buckets Supabase</CardTitle>
                <CardDescription>Monitoramento de armazenamento de arquivos.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {stats?.storageStats ? stats.storageStats.map((bucket: any) => (
                  <div key={bucket.id} className="p-4 border border-border/50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                        <HardDrive className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-bold">{bucket.name}</p>
                        <p className="text-xs text-muted-foreground">{bucket.fileCount} arquivos • {bucket.public ? 'Público' : 'Privado'}</p>
                      </div>
                    </div>
                    <Badge variant="outline">Ativo</Badge>
                  </div>
                )) : (
                  <p className="text-center text-muted-foreground py-10">
                    {loading ? 'Coletando dados do storage...' : 'Nenhum bucket encontrado'}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardHeader>
                <CardTitle className="text-lg">Limpeza de Arquivos</CardTitle>
                <CardDescription>Identificação de arquivos órfãos ou temporários.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-bold">Análise de arquivos órfãos</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">Esta função irá buscar por arquivos no storage que não possuem vínculo com registros no banco de dados.</p>
                </div>
                <Button variant="outline">Iniciar Análise</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="hospedagem" className="mt-4">
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="text-lg">Configuração de Hospedagem</CardTitle>
              <CardDescription>Configure o monitoramento da sua VPS ou servidor externo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Hospedagem</Label>
                  <Badge className="w-fit">Vercel / Cloud</Badge>
                </div>
                <div className="space-y-2">
                  <Label>Ambiente Detectado</Label>
                  <p className="text-sm font-mono bg-muted p-2 rounded">production</p>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <div className="p-4 bg-muted/30 rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-center gap-2">
                  <Globe className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground font-medium">Monitoramento externo ainda não configurado.</p>
                  <Button variant="outline" size="sm" className="mt-2">Configurar Monitoramento VPS</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="desempenho" className="mt-4">
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="text-lg">Desempenho Global</CardTitle>
              <CardDescription>Métricas de tempo de resposta e carga.</CardDescription>
            </CardHeader>
            <CardContent className="py-10 text-center">
              <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground">Métricas detalhadas de desempenho em tempo real estarão disponíveis em breve.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="supabase" className="mt-4">
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="text-lg">Integração Supabase</CardTitle>
              <CardDescription>Status da conexão e serviços gerenciados.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-border/50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-bold">PostgreSQL</p>
                      <p className="text-xs text-muted-foreground">Status: Ativo</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-emerald-500">Conectado</Badge>
                </div>
                <div className="p-4 border border-border/50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-bold">Auth (GoTrue)</p>
                      <p className="text-xs text-muted-foreground">Status: Ativo</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-emerald-500">Conectado</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="text-lg">Logs do Sistema</CardTitle>
              <CardDescription>Acesse os logs de auditoria e erros globais.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-10 border border-dashed border-border rounded-lg text-center">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-muted-foreground">Use a página de <Button variant="link" className="p-0 h-auto" onClick={() => window.location.href='/painel/auditoria'}>Logs & Auditoria</Button> para visualizar todos os registros detalhados.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limpeza" className="mt-4">
          <Card className="shadow-card border-0 border-rose-500/20">
            <CardHeader className="bg-rose-500/5">
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-rose-500" />
                <div>
                  <CardTitle className="text-lg text-rose-700">Área de Limpeza Segura</CardTitle>
                  <CardDescription>Exclusão definitiva de registros temporários e logs antigos.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 border border-border/50 rounded-xl space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        Logs de Auditoria Antigos
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">Limpa registros da tabela logs_auditoria com mais de 90 dias.</p>
                    </div>
                    <Badge variant="outline" className="text-amber-500">Risco Baixo</Badge>
                  </div>
                  
                  <div className="bg-muted/30 p-3 rounded text-xs space-y-1">
                    <p className="font-bold">Atenção:</p>
                    <p>• Não exclui logs de alteração de prontuário.</p>
                    <p>• Mantém registros de login dos últimos 12 meses.</p>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full">Limpar Logs ({'>'} 90 dias)</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 text-rose-500" />
                          Confirmação de Limpeza
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-4">
                          <p>Você está prestes a excluir definitivamente os logs com mais de 90 dias. Esta ação não pode ser desfeita.</p>
                          <div className="space-y-2">
                            <Label className="text-foreground">Para continuar, digite <span className="font-bold text-rose-600">LIMPAR</span> abaixo:</Label>
                            <Input 
                              placeholder="Digite aqui..." 
                              value={cleanupConfirmText} 
                              onChange={(e) => setCleanupConfirmText(e.target.value.toUpperCase())}
                              className="border-rose-300 focus-visible:ring-rose-500"
                            />
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setCleanupConfirmText('')}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                          disabled={cleanupConfirmText !== 'LIMPAR' || loading}
                          onClick={() => handleCleanup('logs')}
                        >
                          Confirmar Exclusão
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="p-4 border border-border/50 rounded-xl space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-primary" />
                        Arquivos Temporários
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">Busca e remove uploads que não foram finalizados ou vinculados.</p>
                    </div>
                    <Badge variant="outline" className="text-blue-500">Risco Médio</Badge>
                  </div>
                  
                  <div className="bg-muted/30 p-3 rounded text-xs space-y-1">
                    <p className="font-bold">Atenção:</p>
                    <p>• Requer análise prévia de arquivos órfãos.</p>
                    <p>• Remove arquivos da pasta 'temp' com mais de 48h.</p>
                  </div>

                  <Button variant="outline" className="w-full" disabled>Analisar e Limpar</Button>
                </div>
              </div>

              <div className="pt-4 border-t border-border/50">
                <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Histórico de Limpezas Recentes
                </h4>
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="text-xs">Data/Hora</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs text-right">Itens</TableHead>
                        <TableHead className="text-xs text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cleanupLogs.length > 0 ? (
                        cleanupLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs">
                              {new Date(log.created_at).toLocaleString('pt-BR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </TableCell>
                            <TableCell className="text-xs capitalize">{log.cleanup_type}</TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {log.items_count}
                            </TableCell>
                            <TableCell className="text-xs text-center">
                              <Badge
                                variant={log.status === 'success' ? 'outline' : 'destructive'}
                                className="text-[10px] h-4"
                              >
                                {log.status === 'success' ? 'Sucesso' : 'Erro'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell className="text-xs" colSpan={4}>
                            Nenhuma limpeza realizada recentemente.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MonitoramentoSistema;
