import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Network, Plus, Plug, Trash2, Eye, EyeOff, CheckCircle2, XCircle, Loader2, RefreshCcw, ScrollText, BarChart3, Send, Key, Copy, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SistemaIntegrado {
  id: string;
  nome: string;
  identificador_sistema: string;
  url_base: string;
  token_saida: string;
  token_entrada_hash: string;
  ativo: boolean;
  permite_enviar: boolean;
  permite_receber: boolean;
  ultima_sincronizacao: string | null;
  observacoes: string;
  created_at: string;
}

const emptyForm = {
  id: '',
  nome: '',
  identificador_sistema: '',
  url_base: '',
  token_saida: '',
  token_entrada_plain: '', // input em claro; será hasheado no save
  ativo: true,
  permite_enviar: true,
  permite_receber: true,
  observacoes: '',
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function maskToken(t: string) {
  if (!t) return '—';
  if (t.length <= 8) return '••••';
  return `${t.slice(0, 4)}••••${t.slice(-4)}`;
}

function generateSecureToken(length = 48) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    retVal += charset.charAt(values[i] % charset.length);
  }
  return retVal;
}

const ConfigSistemasIntegrados: React.FC = () => {
  const { user } = useAuth();
  const [list, setList] = useState<SistemaIntegrado[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [showOutToken, setShowOutToken] = useState(false);
  const [showInToken, setShowInToken] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [identificadorLocal, setIdentificadorLocal] = useState('');
  const [identificadorLocalLoaded, setIdentificadorLocalLoaded] = useState('');
  const [savingIdent, setSavingIdent] = useState(false);
  const [clinicaConfigId, setClinicaConfigId] = useState<string | null>(null);
  const [tokenCopiado, setTokenCopiado] = useState(false);

  // Subaba: Logs e Reenvios
  const [activeTab, setActiveTab] = useState<'sistemas' | 'logs' | 'metricas'>('sistemas');
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilters, setLogFilters] = useState({ status: '', sistema: '', desde: '', ate: '' });
  const [reenvioId, setReenvioId] = useState<string | null>(null);
  const [retryRunning, setRetryRunning] = useState(false);

  // Subaba: Métricas
  const [metricas, setMetricas] = useState<any | null>(null);
  const [metricasLoading, setMetricasLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      let q = supabase
        .from('logs_integracao')
        .select('id, created_at, tipo_acao, direcao, sistema_integrado_id, identificador_remoto, usuario_nome, status, http_status, mensagem, encaminhamento_id')
        .order('created_at', { ascending: false })
        .limit(500);
      if (logFilters.status) q = q.eq('status', logFilters.status);
      if (logFilters.sistema) q = q.eq('sistema_integrado_id', logFilters.sistema);
      if (logFilters.desde) q = q.gte('created_at', `${logFilters.desde}T00:00:00`);
      if (logFilters.ate) q = q.lte('created_at', `${logFilters.ate}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      setLogs(data ?? []);
    } catch (e: any) {
      toast.error(`Erro ao carregar logs: ${e?.message ?? ''}`);
    } finally {
      setLogsLoading(false);
    }
  }, [logFilters]);

  const handleReenviar = async (encaminhamentoId: string) => {
    setReenvioId(encaminhamentoId);
    try {
      const { data, error } = await supabase.functions.invoke('integracao-retry-envios', {
        body: { encaminhamento_id: encaminhamentoId, force: true },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success('Reenvio disparado.');
      } else {
        toast.error(`Falha: ${data?.message ?? 'desconhecida'}`);
      }
      loadLogs();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? ''}`);
    } finally {
      setReenvioId(null);
    }
  };

  const handleProcessarFilaRetry = async () => {
    setRetryRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('integracao-retry-envios', { body: {} });
      if (error) throw error;
      toast.success(`Fila processada: ${data?.processados ?? 0} item(ns).`);
      loadLogs();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? ''}`);
    } finally {
      setRetryRunning(false);
    }
  };

  const loadMetricas = useCallback(async () => {
    setMetricasLoading(true);
    try {
      const desde = new Date(); desde.setDate(desde.getDate() - 30);
      const { data, error } = await supabase
        .from('encaminhamentos_externos')
        .select('id, direcao, status, sistema_integrado_id, recebido_em, visualizado_em, aceito_em, recusado_em, agendado_em, created_at')
        .gte('created_at', desde.toISOString());
      if (error) throw error;
      const all = data ?? [];
      const diff = (a?: string | null, b?: string | null) => (a && b ? (new Date(a).getTime() - new Date(b).getTime()) / 60000 : null);
      const tempos = { visualizacao: [] as number[], aceite: [] as number[], agendamento: [] as number[] };
      const recusados: Record<string, number> = {};
      const totalPorSistema: Record<string, number> = {};
      const volumeDiario: Record<string, number> = {};
      let totalEntrada = 0, totalSaida = 0;
      for (const e of all) {
        const dia = (e.created_at || '').slice(0, 10);
        if (dia) volumeDiario[dia] = (volumeDiario[dia] || 0) + 1;
        if (e.direcao === 'entrada') totalEntrada++;
        if (e.direcao === 'saida') totalSaida++;
        const sid = e.sistema_integrado_id || 'sem-sistema';
        totalPorSistema[sid] = (totalPorSistema[sid] || 0) + 1;
        if (e.status === 'recusado') recusados[sid] = (recusados[sid] || 0) + 1;
        const tv = diff(e.visualizado_em, e.recebido_em || e.created_at); if (tv != null) tempos.visualizacao.push(tv);
        const ta = diff(e.aceito_em, e.recebido_em || e.created_at); if (ta != null) tempos.aceite.push(ta);
        const tg = diff(e.agendado_em, e.aceito_em || e.recebido_em || e.created_at); if (tg != null) tempos.agendamento.push(tg);
      }
      const avg = (arr: number[]) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
      const taxaRecusaPorSistema = Object.entries(totalPorSistema).map(([sid, total]) => ({
        sistema_id: sid,
        total,
        recusados: recusados[sid] || 0,
        taxa: total ? ((recusados[sid] || 0) / total) * 100 : 0,
      }));
      setMetricas({
        total: all.length,
        totalEntrada,
        totalSaida,
        media_visualizacao_min: avg(tempos.visualizacao),
        media_aceite_min: avg(tempos.aceite),
        media_agendamento_min: avg(tempos.agendamento),
        taxaRecusaPorSistema,
        volumeDiario: Object.entries(volumeDiario).sort(([a], [b]) => a.localeCompare(b)),
      });
    } catch (e: any) {
      toast.error(`Erro ao carregar métricas: ${e?.message ?? ''}`);
    } finally {
      setMetricasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
    if (activeTab === 'metricas') loadMetricas();
  }, [activeTab, loadLogs, loadMetricas]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, cfgRes] = await Promise.all([
      supabase.from('sistemas_integrados').select('*').order('created_at', { ascending: false }),
      supabase.from('clinica_config').select('id, identificador_local').limit(1).maybeSingle(),
    ]);
    if (error) toast.error('Erro ao carregar sistemas integrados');
    setList((data ?? []) as SistemaIntegrado[]);
    if (cfgRes?.data) {
      setClinicaConfigId((cfgRes.data as any).id);
      const v = ((cfgRes.data as any).identificador_local ?? '').toString();
      setIdentificadorLocal(v);
      setIdentificadorLocalLoaded(v);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveIdentificador = async () => {
    const v = identificadorLocal.trim();
    if (!v) { toast.error('Informe o identificador deste sistema.'); return; }
    if (!/^[a-z0-9-]+$/i.test(v)) { toast.error('Use apenas letras, números e hífen.'); return; }
    setSavingIdent(true);
    try {
      let err;
      if (clinicaConfigId) {
        ({ error: err } = await supabase.from('clinica_config').update({ identificador_local: v } as any).eq('id', clinicaConfigId));
      } else {
        ({ error: err } = await supabase.from('clinica_config').insert({ identificador_local: v, nome_clinica: '' } as any));
      }
      if (err) throw err;
      setIdentificadorLocalLoaded(v);
      toast.success('Identificador deste sistema salvo.');
      load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar');
    } finally {
      setSavingIdent(false);
    }
  };

  const openNew = () => {
    setForm({ ...emptyForm });
    setShowOutToken(false);
    setShowInToken(false);
    setOpen(true);
  };

  const openEdit = (s: SistemaIntegrado) => {
    setForm({
      id: s.id,
      nome: s.nome,
      identificador_sistema: s.identificador_sistema,
      url_base: s.url_base,
      token_saida: s.token_saida,
      token_entrada_plain: '', // não exibimos hash; deixar vazio = manter
      ativo: s.ativo,
      permite_enviar: s.permite_enviar,
      permite_receber: s.permite_receber,
      observacoes: s.observacoes ?? '',
    });
    setShowOutToken(false);
    setShowInToken(false);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.identificador_sistema.trim() || !form.url_base.trim()) {
      toast.error('Preencha nome, identificador e URL base.');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        nome: form.nome.trim(),
        identificador_sistema: form.identificador_sistema.trim(),
        url_base: form.url_base.trim().replace(/\/+$/, ''),
        token_saida: form.token_saida,
        ativo: form.ativo,
        permite_enviar: form.permite_enviar,
        permite_receber: form.permite_receber,
        observacoes: form.observacoes,
        criado_por: user?.id ?? '',
      };
      if (form.token_entrada_plain.trim()) {
        payload.token_entrada_hash = await sha256Hex(form.token_entrada_plain.trim());
      }

      let err;
      if (form.id) {
        ({ error: err } = await supabase.from('sistemas_integrados').update(payload).eq('id', form.id));
      } else {
        ({ error: err } = await supabase.from('sistemas_integrados').insert(payload));
      }
      if (err) throw err;
      toast.success(form.id ? 'Sistema atualizado' : 'Sistema integrado cadastrado');
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este sistema integrado? Encaminhamentos já recebidos não serão apagados.')) return;
    const { error } = await supabase.from('sistemas_integrados').delete().eq('id', id);
    if (error) return toast.error('Erro ao remover');
    toast.success('Removido');
    load();
  };

  const handleTest = async (s: SistemaIntegrado) => {
    setTestingId(s.id);
    try {
      const { data, error } = await supabase.functions.invoke('integracao-test-connection', {
        body: { sistema_id: s.id },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Conexão OK (${data.elapsed_ms} ms)`);
      } else {
        toast.error(`Falha: ${data?.message ?? 'desconhecida'}`);
      }
      load();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? 'falha de rede'}`);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Network className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold font-display text-foreground">Sistemas Integrados</h3>
              <p className="text-sm text-muted-foreground">
                Outras unidades/redes Lovable que podem trocar encaminhamentos com este sistema.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
            {activeTab === 'sistemas' && (
              <Button size="sm" onClick={openNew}>
                <Plus className="w-4 h-4 mr-2" /> Novo Sistema
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="sistemas"><Network className="w-4 h-4 mr-2" />Sistemas</TabsTrigger>
            <TabsTrigger value="logs"><ScrollText className="w-4 h-4 mr-2" />Logs e Reenvios</TabsTrigger>
            <TabsTrigger value="metricas"><BarChart3 className="w-4 h-4 mr-2" />Métricas</TabsTrigger>
          </TabsList>

          <TabsContent value="sistemas">

        <div className="rounded-lg border bg-muted/30 p-4 mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <Label className="text-sm font-semibold">Identificador deste sistema</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Compartilhe este texto com a unidade parceira. Ela deve cadastrá-lo como "Identificador do sistema" para nos reconhecer ao receber encaminhamentos.
              </p>
              <Input
                value={identificadorLocal}
                onChange={e => setIdentificadorLocal(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="ex.: sms-oriximina-caps"
                className="mt-2 max-w-md font-mono"
              />
            </div>
            <Button
              size="sm"
              onClick={handleSaveIdentificador}
              disabled={savingIdent || identificadorLocal.trim() === identificadorLocalLoaded.trim()}
            >
              {savingIdent ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar identificador
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="rounded-lg border bg-blue-50/50 p-4 border-blue-100">
            <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-2 mb-2">
              <Info className="w-4 h-4" /> Como conectar dois sistemas
            </h4>
            <div className="space-y-3 text-xs text-blue-800 leading-relaxed">
              <p>
                <strong>No Sistema A:</strong> Cadastre o Sistema B. No campo <strong>Token de Saída</strong>, cole o token de entrada gerado no Sistema B. Gere um <strong>Token de Entrada</strong> e copie para o Sistema B.
              </p>
              <p>
                <strong>No Sistema B:</strong> Cadastre o Sistema A. No campo <strong>Token de Saída</strong>, cole o token de entrada gerado no Sistema A. Gere um <strong>Token de Entrada</strong> e copie para o Sistema A.
              </p>
            </div>
          </div>
          <div className="rounded-lg border bg-amber-50/50 p-4 border-amber-100">
            <h4 className="text-sm font-semibold text-amber-900 flex items-center gap-2 mb-2">
              <Key className="w-4 h-4" /> Exemplo Prático
            </h4>
            <div className="space-y-2 text-xs text-amber-800 leading-relaxed">
              <p><strong>Unidade A:</strong> CER II · <strong>Unidade B:</strong> CAPS II</p>
              <p>No <strong>CER II</strong>: O token de saída deve ser o token de entrada do <strong>CAPS II</strong>.</p>
              <p>No <strong>CAPS II</strong>: O token de saída deve ser o token de entrada do <strong>CER II</strong>.</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Identificador</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Permissões</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Integração</TableHead>
                <TableHead>Última Sinc.</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
              ) : list.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  Nenhum sistema integrado cadastrado.
                </TableCell></TableRow>
              ) : list.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.nome}</TableCell>
                  <TableCell className="font-mono text-xs">{s.identificador_sistema}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={s.url_base}>{s.url_base}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {s.permite_enviar && <Badge variant="outline" className="w-fit text-[10px] h-4">Pode Enviar</Badge>}
                      {s.permite_receber && <Badge variant="outline" className="w-fit text-[10px] h-4">Pode Receber</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className="text-muted-foreground">SAÍDA:</span>
                        {s.token_saida ? <Badge variant="secondary" className="px-1 py-0 h-3 text-[9px] bg-emerald-50 text-emerald-700">OK</Badge> : <Badge variant="secondary" className="px-1 py-0 h-3 text-[9px] bg-red-50 text-red-700">Falta</Badge>}
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className="text-muted-foreground">ENTRADA:</span>
                        {s.token_entrada_hash ? <Badge variant="secondary" className="px-1 py-0 h-3 text-[9px] bg-emerald-50 text-emerald-700">OK</Badge> : <Badge variant="secondary" className="px-1 py-0 h-3 text-[9px] bg-red-50 text-red-700">Falta</Badge>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {s.ativo ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[10px] h-5">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px] h-5">
                        <XCircle className="w-3 h-3 mr-1" /> Inativo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground leading-tight">
                    {s.ultima_sincronizacao ? new Date(s.ultima_sincronizacao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleTest(s)} disabled={testingId === s.id}>
                        {testingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Editar</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

          </TabsContent>

          <TabsContent value="logs">
            <div className="flex flex-wrap items-end gap-2 mb-3">
              <div>
                <Label className="text-xs">Status</Label>
                <select
                  value={logFilters.status}
                  onChange={e => setLogFilters({ ...logFilters, status: e.target.value })}
                  className="h-9 px-2 rounded-md border bg-background text-sm block"
                >
                  <option value="">Todos</option>
                  <option value="sucesso">Sucesso</option>
                  <option value="falha">Falha</option>
                  <option value="erro">Erro</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Sistema</Label>
                <select
                  value={logFilters.sistema}
                  onChange={e => setLogFilters({ ...logFilters, sistema: e.target.value })}
                  className="h-9 px-2 rounded-md border bg-background text-sm block min-w-[180px]"
                >
                  <option value="">Todos</option>
                  {list.map(s => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" value={logFilters.desde} onChange={e => setLogFilters({ ...logFilters, desde: e.target.value })} className="h-9 w-[150px]" />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={logFilters.ate} onChange={e => setLogFilters({ ...logFilters, ate: e.target.value })} className="h-9 w-[150px]" />
              </div>
              <Button size="sm" onClick={loadLogs} disabled={logsLoading}>
                {logsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                Aplicar
              </Button>
              <Button size="sm" variant="outline" onClick={handleProcessarFilaRetry} disabled={retryRunning}>
                {retryRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Processar fila de retry
              </Button>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Direção</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhum log encontrado.</TableCell></TableRow>
                  ) : logs.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{new Date(l.created_at).toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-xs font-mono">{l.tipo_acao}</TableCell>
                      <TableCell className="text-xs">{l.direcao}</TableCell>
                      <TableCell>
                        {l.status === 'sucesso' ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">OK</Badge>
                        ) : (
                          <Badge variant="destructive">{l.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{l.http_status ?? '—'}</TableCell>
                      <TableCell className="text-xs max-w-[320px] truncate" title={l.mensagem}>{l.mensagem}</TableCell>
                      <TableCell className="text-right">
                        {l.encaminhamento_id && l.status !== 'sucesso' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleReenviar(l.encaminhamento_id)}
                            disabled={reenvioId === l.encaminhamento_id}
                          >
                            {reenvioId === l.encaminhamento_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-1" />Reenviar</>}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="metricas">
            {metricasLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : !metricas ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">Total (30d)</p>
                    <p className="text-2xl font-bold text-foreground">{metricas.total}</p>
                    <p className="text-xs text-muted-foreground mt-1">{metricas.totalEntrada} recebidos · {metricas.totalSaida} enviados</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">Tempo médio até visualização</p>
                    <p className="text-2xl font-bold text-foreground">{metricas.media_visualizacao_min.toFixed(1)} min</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">Tempo médio até aceite</p>
                    <p className="text-2xl font-bold text-foreground">{metricas.media_aceite_min.toFixed(1)} min</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">Tempo médio até agendamento</p>
                    <p className="text-2xl font-bold text-foreground">{metricas.media_agendamento_min.toFixed(1)} min</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2">Taxa de recusa por sistema parceiro</h4>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sistema</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Recusados</TableHead>
                          <TableHead>Taxa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metricas.taxaRecusaPorSistema.map((r: any) => {
                          const sis = list.find(s => s.id === r.sistema_id);
                          return (
                            <TableRow key={r.sistema_id}>
                              <TableCell className="text-sm">{sis?.nome ?? r.sistema_id}</TableCell>
                              <TableCell className="text-sm">{r.total}</TableCell>
                              <TableCell className="text-sm">{r.recusados}</TableCell>
                              <TableCell className="text-sm font-semibold">{r.taxa.toFixed(1)}%</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2">Volume diário (últimos 30 dias)</h4>
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <div className="flex items-end gap-1 h-32">
                      {metricas.volumeDiario.map(([dia, qtd]: [string, number]) => {
                        const max = Math.max(...metricas.volumeDiario.map((d: any) => d[1]), 1);
                        const h = Math.max(4, (qtd / max) * 100);
                        return (
                          <div key={dia} className="flex-1 flex flex-col items-center gap-1" title={`${dia}: ${qtd}`}>
                            <div className="w-full bg-primary/70 hover:bg-primary rounded-t" style={{ height: `${h}%` }} />
                            <span className="text-[9px] text-muted-foreground rotate-45 origin-left">{dia.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{form.id ? 'Editar Sistema Integrado' : 'Novo Sistema Integrado'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Nome da unidade externa *</Label>
                  <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="UBS Central XYZ" />
                </div>
                <div>
                  <Label>Identificador do sistema *</Label>
                  <Input
                    value={form.identificador_sistema}
                    onChange={e => setForm({ ...form, identificador_sistema: e.target.value })}
                    placeholder="cer-ii-oriximina"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Use um identificador único e igual nos dois sistemas, como cer-ii-oriximina ou caps-ii-oriximina.</p>
                </div>
              </div>

              <div>
                <Label>URL base do sistema externo *</Label>
                <Input
                  value={form.url_base}
                  onChange={e => setForm({ ...form, url_base: e.target.value })}
                  placeholder="https://abcd.supabase.co"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Informe a URL base do projeto/sistema externo. As funções de integração serão chamadas a partir desta URL.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1.5">
                    Token de SAÍDA <Badge variant="outline" className="text-[10px] font-normal px-1 py-0">Enviar</Badge>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showOutToken ? 'text' : 'password'}
                      value={form.token_saida}
                      onChange={e => setForm({ ...form, token_saida: e.target.value })}
                      placeholder="Cole o token gerado pelo outro sistema"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowOutToken(v => !v)}
                    >
                      {showOutToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                    Cole aqui o token de entrada configurado no outro sistema. Este token será enviado por este sistema ao chamar o sistema externo.
                  </p>
                </div>
                <div>
                  <Label className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      Token de ENTRADA <Badge variant="outline" className="text-[10px] font-normal px-1 py-0 bg-primary/5">Receber</Badge>
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        const token = generateSecureToken();
                        setForm({ ...form, token_entrada_plain: token });
                        setShowInToken(true);
                      }}
                    >
                      <Key className="w-3 h-3 mr-1" /> Gerar token seguro
                    </Button>
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showInToken ? 'text' : 'password'}
                        value={form.token_entrada_plain}
                        onChange={e => setForm({ ...form, token_entrada_plain: e.target.value })}
                        placeholder={form.id ? '(deixe vazio para manter)' : 'Crie um token forte'}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                        onClick={() => setShowInToken(v => !v)}
                      >
                        {showInToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {form.token_entrada_plain && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Copiar token"
                        onClick={() => {
                          navigator.clipboard.writeText(form.token_entrada_plain);
                          setTokenCopiado(true);
                          setTimeout(() => setTokenCopiado(false), 2000);
                          toast.success('Token copiado! Cadastre-o como Token de Saída no outro sistema.');
                        }}
                      >
                        {tokenCopiado ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                    Crie um token forte e compartilhe com o outro sistema. O outro sistema deve cadastrar este token como token de saída. 
                    <span className="text-amber-600 block mt-0.5">Salvo apenas como hash. Copie agora, pois não poderá ser visto depois.</span>
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Ativo</Label>
                    <p className="text-xs text-muted-foreground">Habilita a integração</p>
                  </div>
                  <Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Pode enviar</Label>
                    <p className="text-xs text-muted-foreground">Este sistema → externo</p>
                  </div>
                  <Switch checked={form.permite_enviar} onCheckedChange={v => setForm({ ...form, permite_enviar: v })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Pode receber</Label>
                    <p className="text-xs text-muted-foreground">Externo → este sistema</p>
                  </div>
                  <Switch checked={form.permite_receber} onCheckedChange={v => setForm({ ...form, permite_receber: v })} />
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>

              {form.id && (
                <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Token de saída atual: <span className="font-mono">{maskToken(form.token_saida)}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default ConfigSistemasIntegrados;
