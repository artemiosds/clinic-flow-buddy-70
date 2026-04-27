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
import { toast } from 'sonner';
import { Network, Plus, Plug, Trash2, Eye, EyeOff, CheckCircle2, XCircle, Loader2, RefreshCcw } from 'lucide-react';
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

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sistemas_integrados')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar sistemas integrados');
    setList((data ?? []) as SistemaIntegrado[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" /> Novo Sistema
            </Button>
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
                <TableHead>Status</TableHead>
                <TableHead>Última sincronização</TableHead>
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
                      {s.permite_enviar && <Badge variant="outline" className="w-fit text-xs">Enviar</Badge>}
                      {s.permite_receber && <Badge variant="outline" className="w-fit text-xs">Receber</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {s.ativo ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <XCircle className="w-3 h-3 mr-1" /> Inativo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.ultima_sincronizacao ? new Date(s.ultima_sincronizacao).toLocaleString('pt-BR') : '—'}
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
                    placeholder="sms-oriximina-cer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Texto único usado por ambos os sistemas para se identificar.</p>
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
                  URL do projeto Supabase do outro sistema. As funções <span className="font-mono">/functions/v1/...</span> são adicionadas automaticamente.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Token de SAÍDA (enviar para o outro sistema)</Label>
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
                </div>
                <div>
                  <Label>Token de ENTRADA (que o outro sistema enviará)</Label>
                  <div className="relative">
                    <Input
                      type={showInToken ? 'text' : 'password'}
                      value={form.token_entrada_plain}
                      onChange={e => setForm({ ...form, token_entrada_plain: e.target.value })}
                      placeholder={form.id ? '(deixe vazio para manter o atual)' : 'Defina um token forte e compartilhe com o outro sistema'}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowInToken(v => !v)}
                    >
                      {showInToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Salvo apenas como hash. Não poderá ser visualizado depois.</p>
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
