import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Inbox, RefreshCcw, CheckCircle2, XCircle, UserPlus, Link2, Loader2, Eye, Send, Paperclip, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Encaminhamento {
  id: string;
  direcao: string;
  status: string;
  origem_unidade: string;
  origem_profissional_nome: string;
  origem_especialidade: string;
  destino_unidade: string;
  destino_profissional_nome: string;
  destino_especialidade: string;
  paciente_id_origem: string;
  paciente_id_destino: string;
  paciente_nome: string;
  paciente_cpf: string;
  paciente_cns: string;
  paciente_data_nascimento: string;
  paciente_telefone: string;
  paciente_dados: any;
  motivo: string;
  resumo_clinico: string;
  cid: string;
  documento_texto: string;
  recebido_em: string;
  visualizado_em: string | null;
  aceito_em: string | null;
  recusado_em: string | null;
  justificativa_recusa: string;
  created_at: string;
  ultimo_erro: string;
}

const statusBadge = (s: string) => {
  switch (s) {
    case 'recebido': return <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/30">Recebido</Badge>;
    case 'visualizado': return <Badge variant="outline">Visualizado</Badge>;
    case 'aceito': return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Aceito</Badge>;
    case 'recusado': return <Badge variant="destructive">Recusado</Badge>;
    case 'agendado': return <Badge className="bg-violet-500/10 text-violet-700 border-violet-500/30">Agendado</Badge>;
    case 'pendente_envio': return <Badge variant="outline">Pendente envio</Badge>;
    case 'enviado': return <Badge className="bg-emerald-500/10 text-emerald-700">Enviado</Badge>;
    case 'falha_envio': return <Badge variant="destructive">Falha envio</Badge>;
    default: return <Badge variant="outline">{s}</Badge>;
  }
};

const EncaminhamentosRecebidos: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<'entrada' | 'saida'>('entrada');
  const [list, setList] = useState<Encaminhamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selected, setSelected] = useState<Encaminhamento | null>(null);
  const [actionOpen, setActionOpen] = useState<'aceitar' | 'recusar' | 'vincular' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [vinculoBusca, setVinculoBusca] = useState('');
  const [vinculoResultados, setVinculoResultados] = useState<any[]>([]);
  const [anexos, setAnexos] = useState<Array<{ id: string; nome_arquivo: string; mime_type: string; tamanho_bytes: number; storage_path: string; url_remota: string; direcao: string }>>([]);
  const [anexosLoading, setAnexosLoading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('encaminhamentos_externos')
      .select('*')
      .eq('direcao', tab)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) toast.error('Erro ao carregar encaminhamentos');
    setList((data ?? []) as any);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return list.filter(e => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (!t) return true;
      return (
        (e.paciente_nome || '').toLowerCase().includes(t) ||
        (e.paciente_cpf || '').includes(t) ||
        (e.paciente_cns || '').includes(t) ||
        (e.origem_unidade || '').toLowerCase().includes(t) ||
        (e.destino_unidade || '').toLowerCase().includes(t) ||
        (e.motivo || '').toLowerCase().includes(t)
      );
    });
  }, [list, search, statusFilter]);

  const notificarOrigem = async (encId: string, status: string, extra: Record<string, any> = {}) => {
    try {
      await supabase.functions.invoke('integracao-callback-status', {
        body: { encaminhamento_id: encId, status, ...extra },
      });
    } catch (e) {
      console.warn('[callback-status] falha ao notificar origem:', e);
    }
  };

  const openDetalhe = async (e: Encaminhamento) => {
    setSelected(e);
    setAnexos([]);
    setSignedUrls({});
    setAnexosLoading(true);
    try {
      const { data: ax } = await supabase
        .from('encaminhamentos_anexos')
        .select('id, nome_arquivo, mime_type, tamanho_bytes, storage_path, url_remota, direcao')
        .eq('encaminhamento_id', e.id)
        .order('created_at', { ascending: true });
      const lista = (ax ?? []) as any[];
      setAnexos(lista);
      // gerar signed URLs em paralelo apenas para arquivos no storage local
      const entries = await Promise.all(
        lista
          .filter(a => a.storage_path)
          .map(async (a) => {
            const { data } = await supabase.storage.from('encaminhamentos').createSignedUrl(a.storage_path, 3600);
            return [a.id, data?.signedUrl || ''] as const;
          })
      );
      setSignedUrls(Object.fromEntries(entries));
    } catch (err) {
      console.warn('[anexos] erro:', err);
    } finally {
      setAnexosLoading(false);
    }
    if (e.direcao === 'entrada' && e.status === 'recebido' && !e.visualizado_em) {
      await supabase.from('encaminhamentos_externos').update({
        status: 'visualizado',
        visualizado_em: new Date().toISOString(),
      }).eq('id', e.id);
      notificarOrigem(e.id, 'visualizado');
      load();
    }
  };

  const handleRecusar = async () => {
    if (!selected) return;
    if (!justificativa.trim() || justificativa.trim().length < 10) {
      toast.error('Informe uma justificativa (mín. 10 caracteres).');
      return;
    }
    setActionLoading(true);
    const { error } = await supabase.from('encaminhamentos_externos').update({
      status: 'recusado',
      recusado_em: new Date().toISOString(),
      justificativa_recusa: justificativa.trim(),
    }).eq('id', selected.id);
    setActionLoading(false);
    if (error) return toast.error('Erro ao recusar');
    await notificarOrigem(selected.id, 'recusado', { justificativa_recusa: justificativa.trim() });
    toast.success('Encaminhamento recusado e origem notificada');
    setActionOpen(null); setSelected(null); setJustificativa('');
    load();
  };

  const handleAceitar = async () => {
    if (!selected) return;
    setActionLoading(true);
    const { error } = await supabase.from('encaminhamentos_externos').update({
      status: 'aceito',
      aceito_em: new Date().toISOString(),
    }).eq('id', selected.id);
    setActionLoading(false);
    if (error) return toast.error('Erro ao aceitar');
    await notificarOrigem(selected.id, 'aceito');
    toast.success('Encaminhamento aceito. Origem notificada. Vincule ou cadastre o paciente para agendar.');
    setActionOpen(null);
    load();
  };

  const buscarPaciente = async () => {
    const t = vinculoBusca.trim();
    if (!t) return;
    const cleaned = t.replace(/\D/g, '');
    const orParts = [`nome.ilike.%${t}%`];
    if (cleaned) {
      orParts.push(`cpf.ilike.%${cleaned}%`);
      orParts.push(`cns.ilike.%${cleaned}%`);
    }
    const { data } = await supabase
      .from('pacientes')
      .select('id, nome, cpf, cns, data_nascimento, telefone')
      .or(orParts.join(','))
      .limit(20);
    setVinculoResultados(data ?? []);
  };

  const handleVincular = async (pacienteId: string, pacienteNome: string) => {
    if (!selected) return;
    setActionLoading(true);
    const { error } = await supabase.from('encaminhamentos_externos').update({
      paciente_id_destino: pacienteId,
    }).eq('id', selected.id);
    setActionLoading(false);
    if (error) return toast.error('Erro ao vincular');
    toast.success(`Vinculado a ${pacienteNome}`);
    setActionOpen(null); setVinculoBusca(''); setVinculoResultados([]);
    load();
  };

  const handleCriarPaciente = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const novoId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const dados = selected.paciente_dados ?? {};
      const { error } = await supabase.from('pacientes').insert({
        id: novoId,
        nome: selected.paciente_nome,
        cpf: selected.paciente_cpf || '',
        cns: selected.paciente_cns || '',
        data_nascimento: selected.paciente_data_nascimento || '',
        telefone: selected.paciente_telefone || '',
        endereco: dados.endereco || '',
        municipio: dados.municipio || '',
        cid: selected.cid || '',
        observacoes: `Cadastrado a partir de encaminhamento externo de ${selected.origem_unidade}.`,
        unidade_id: user?.unidadeId || '',
      } as any);
      if (error) throw error;
      await supabase.from('encaminhamentos_externos').update({
        paciente_id_destino: novoId,
      }).eq('id', selected.id);
      toast.success('Paciente cadastrado e vinculado.');
      setActionOpen(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao cadastrar paciente');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Inbox className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">Encaminhamentos Externos</h1>
            <p className="text-sm text-muted-foreground">Recebidos e enviados entre sistemas integrados.</p>
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="entrada"><Inbox className="w-4 h-4 mr-2" />Recebidos</TabsTrigger>
          <TabsTrigger value="saida"><Send className="w-4 h-4 mr-2" />Enviados</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <div className="flex gap-2 mb-3 flex-wrap">
            <Input
              placeholder="Buscar por paciente, CPF, CNS, unidade..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-md"
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-md border bg-background text-sm"
            >
              <option value="">Todos status</option>
              {tab === 'entrada' ? (
                <>
                  <option value="recebido">Recebido</option>
                  <option value="visualizado">Visualizado</option>
                  <option value="aceito">Aceito</option>
                  <option value="recusado">Recusado</option>
                  <option value="agendado">Agendado</option>
                </>
              ) : (
                <>
                  <option value="pendente_envio">Pendente envio</option>
                  <option value="enviado">Enviado</option>
                  <option value="falha_envio">Falha envio</option>
                  <option value="aceito">Aceito (no destino)</option>
                  <option value="recusado">Recusado (no destino)</option>
                </>
              )}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed"><CardContent className="text-center text-muted-foreground py-10">
              Nenhum encaminhamento {tab === 'entrada' ? 'recebido' : 'enviado'} encontrado.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(e => (
                <Card key={e.id} className="shadow-card border-0 hover:shadow-md transition">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-[260px]">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-foreground">{e.paciente_nome || '—'}</span>
                          {statusBadge(e.status)}
                          {e.cid && <Badge variant="outline" className="text-xs">CID {e.cid}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {e.paciente_cpf && `CPF ${e.paciente_cpf}`}{e.paciente_cns ? ` • CNS ${e.paciente_cns}` : ''}{e.paciente_data_nascimento ? ` • Nasc. ${e.paciente_data_nascimento}` : ''}
                        </p>
                        <p className="text-sm mt-2">
                          {tab === 'entrada' ? (
                            <>De: <span className="font-medium">{e.origem_unidade || '—'}</span> ({e.origem_profissional_nome || '—'} • {e.origem_especialidade || '—'})</>
                          ) : (
                            <>Para: <span className="font-medium">{e.destino_unidade || '—'}</span> ({e.destino_profissional_nome || 'A definir'} • {e.destino_especialidade || '—'})</>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{e.motivo}</p>
                        {e.ultimo_erro && tab === 'saida' && (
                          <p className="text-xs text-destructive mt-1">Erro: {e.ultimo_erro}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="outline" onClick={() => openDetalhe(e)}>
                          <Eye className="w-4 h-4 mr-1" /> Detalhes
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detalhes */}
      <Dialog open={!!selected && !actionOpen} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Encaminhamento</DialogTitle>
            <DialogDescription>
              {selected && new Date(selected.created_at).toLocaleString('pt-BR')} — {selected && statusBadge(selected.status)}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3 bg-muted/30">
                <p className="font-semibold">{selected.paciente_nome}</p>
                <p className="text-xs text-muted-foreground">
                  CPF {selected.paciente_cpf || '—'} • CNS {selected.paciente_cns || '—'} • Nasc. {selected.paciente_data_nascimento || '—'}
                </p>
                {selected.paciente_telefone && <p className="text-xs">Tel.: {selected.paciente_telefone}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><b>Origem:</b> {selected.origem_unidade}<br/>{selected.origem_profissional_nome} — {selected.origem_especialidade}</div>
                <div><b>Destino:</b> {selected.destino_unidade}<br/>{selected.destino_profissional_nome || 'A definir'} — {selected.destino_especialidade}</div>
              </div>
              {selected.cid && <p><b>CID:</b> {selected.cid}</p>}
              <div>
                <b>Motivo:</b>
                <p className="whitespace-pre-wrap mt-1">{selected.motivo}</p>
              </div>
              {selected.resumo_clinico && (
                <div>
                  <b>Resumo Clínico:</b>
                  <p className="whitespace-pre-wrap mt-1">{selected.resumo_clinico}</p>
                </div>
              )}
              {selected.justificativa_recusa && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <b>Justificativa de recusa:</b>
                  <p className="mt-1 whitespace-pre-wrap">{selected.justificativa_recusa}</p>
                </div>
              )}
              {selected.paciente_id_destino && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                  <Link2 className="w-3 h-3 inline mr-1" /> Vinculado ao paciente local <span className="font-mono">{selected.paciente_id_destino}</span>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="w-4 h-4 text-primary" />
                  <b>Anexos clínicos</b>
                  {anexosLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  {!anexosLoading && <span className="text-xs text-muted-foreground">({anexos.length})</span>}
                </div>
                {!anexosLoading && anexos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum anexo enviado junto com este encaminhamento.</p>
                ) : (
                  <ul className="space-y-1">
                    {anexos.map(a => {
                      const href = signedUrls[a.id] || a.url_remota || '';
                      const isImg = (a.mime_type || '').startsWith('image/');
                      return (
                        <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            {isImg && href ? (
                              <img src={href} alt={a.nome_arquivo} className="w-8 h-8 object-cover rounded" />
                            ) : (
                              <FileText className="w-4 h-4 text-primary shrink-0" />
                            )}
                            <span className="truncate" title={a.nome_arquivo}>{a.nome_arquivo}</span>
                            <span className="text-muted-foreground shrink-0">
                              ({((a.tamanho_bytes || 0) / 1024).toFixed(0)} KB)
                            </span>
                          </div>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1 shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" /> abrir
                            </a>
                          ) : (
                            <span className="text-muted-foreground shrink-0">indisponível</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
          {selected?.direcao === 'entrada' && (
            <DialogFooter className="gap-2 flex-wrap">
              {(selected.status === 'recebido' || selected.status === 'visualizado') && (
                <>
                  <Button variant="destructive" onClick={() => setActionOpen('recusar')}>
                    <XCircle className="w-4 h-4 mr-2" /> Recusar
                  </Button>
                  <Button onClick={() => setActionOpen('aceitar')}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Aceitar
                  </Button>
                </>
              )}
              {(selected.status === 'aceito') && !selected.paciente_id_destino && (
                <Button onClick={() => setActionOpen('vincular')}>
                  <Link2 className="w-4 h-4 mr-2" /> Vincular ou Cadastrar Paciente
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Aceitar */}
      <Dialog open={actionOpen === 'aceitar'} onOpenChange={(o) => { if (!o) setActionOpen(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aceitar encaminhamento</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Após aceitar, vincule o paciente a um cadastro existente ou crie um novo. O paciente entrará em fila para agendamento.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionOpen(null)}>Cancelar</Button>
            <Button onClick={handleAceitar} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Aceitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recusar */}
      <Dialog open={actionOpen === 'recusar'} onOpenChange={(o) => { if (!o) { setActionOpen(null); setJustificativa(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar encaminhamento</DialogTitle></DialogHeader>
          <Label className="text-sm">Justificativa *</Label>
          <Textarea rows={4} value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Explique o motivo da recusa..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionOpen(null); setJustificativa(''); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRecusar} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vincular */}
      <Dialog open={actionOpen === 'vincular'} onOpenChange={(o) => { if (!o) { setActionOpen(null); setVinculoBusca(''); setVinculoResultados([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular paciente</DialogTitle>
            <DialogDescription>Procure por nome, CPF ou CNS, ou cadastre um novo paciente com os dados recebidos.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={vinculoBusca} onChange={e => setVinculoBusca(e.target.value)} placeholder="Nome, CPF ou CNS..." />
            <Button onClick={buscarPaciente}>Buscar</Button>
          </div>
          {vinculoResultados.length > 0 && (
            <div className="max-h-72 overflow-y-auto space-y-1 border rounded-md p-2">
              {vinculoResultados.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 hover:bg-muted/40 rounded">
                  <div>
                    <p className="font-medium text-sm">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">CPF {p.cpf || '—'} • CNS {p.cns || '—'}</p>
                  </div>
                  <Button size="sm" onClick={() => handleVincular(p.id, p.nome)} disabled={actionLoading}>
                    Vincular
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-md border p-3 bg-muted/30 text-sm">
            <p className="font-semibold mb-1">Cadastrar novo paciente</p>
            <p className="text-xs text-muted-foreground mb-2">
              Cria <b>{selected?.paciente_nome}</b> em sua unidade com os dados recebidos.
            </p>
            <Button size="sm" onClick={handleCriarPaciente} disabled={actionLoading}>
              <UserPlus className="w-4 h-4 mr-2" /> Cadastrar e vincular
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EncaminhamentosRecebidos;
