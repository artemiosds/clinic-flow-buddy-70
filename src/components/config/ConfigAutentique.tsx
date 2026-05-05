import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ShieldCheck, ExternalLink, RefreshCw, 
  Settings, Info, Loader2, Save, History, Copy, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ConfigAutentique: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({
    ativo: false,
    ambiente: 'sandbox',
    token_api: '',
    organizacao_nome: '',
    enviar_email: true,
    enviar_whatsapp: false,
    exigir_profissional: true,
    exigir_paciente: false,
    baixar_assinado_automaticamente: true,
  });

  const webhookUrl = "https://dgebfmohtoszzrmzxefy.supabase.co/functions/v1/autentique-webhook";

  useEffect(() => {
    loadConfig();
  }, [user?.unidadeId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('assinatura_eletronica_config')
        .select('*')
        .eq('provider', 'autentique')
        .maybeSingle();

      if (data) setConfig(data);
    } catch (e: any) {
      toast.error('Erro ao carregar configurações: ' + e.message);
    }
    setLoading(false);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('documentos_assinatura_autentique')
        .select('*')
        .order('enviado_em', { ascending: false })
        .limit(50);
      if (error) throw error;
      setDocuments(data || []);
    } catch (e: any) {
      toast.error('Erro ao carregar histórico: ' + e.message);
    }
    setHistoryLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const tokenParaSalvar = (config.token_api?.includes('•') || config.token_api?.includes('*')) 
        ? null : config.token_api;

      const { error } = await supabase.rpc('salvar_configuracao_autentique', {
        p_ativo: config.ativo,
        p_ambiente: config.ambiente,
        p_token_api: tokenParaSalvar,
        p_organizacao_nome: config.organizacao_nome,
        p_enviar_email: config.enviar_email,
        p_exigir_profissional: config.exigir_profissional,
        p_baixar_assinado_automaticamente: config.baixar_assinado_automaticamente,
        p_unidade_id: user?.unidadeId || null
      });

      if (error) throw error;
      toast.success('Configurações salvas!');
      loadConfig();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    }
    setSaving(false);
  };

  const testarConexao = async () => {
    if (!config.token_api) {
      toast.error('Informe o token.');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('autentique-testar-conexao', {
        body: { token: config.token_api, ambiente: config.ambiente, saveStatus: true }
      });
      if (error) throw error;
      if (data.ok) {
        toast.success(`Conectado! Org: ${data.account?.organization || 'N/A'}`);
        loadConfig();
      } else {
        toast.error('Falha: ' + data.message);
      }
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
    setTesting(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido': return <Badge className="bg-green-100 text-green-700 border-green-200">Concluído</Badge>;
      case 'pendente': return <Badge variant="outline" className="text-amber-600 border-amber-200">Pendente</Badge>;
      case 'parcialmente_assinado': return <Badge variant="outline" className="text-blue-600 border-blue-200">Parcial</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleDownload = async (doc: any) => {
    if (!doc.storage_path_assinado) return;
    try {
      const { data, error } = await supabase.storage
        .from(doc.storage_bucket || 'documentos')
        .createSignedUrl(doc.storage_path_assinado, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (e: any) {
      toast.error('Erro ao baixar: ' + e.message);
    }
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Assinatura Eletrônica</h1>
            <p className="text-muted-foreground text-sm">Integração com Autentique</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={testarConexao} disabled={testing || !config.token_api}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Testar
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="settings" className="w-full" onValueChange={(v) => v === 'documents' && loadHistory()}>
        <TabsList>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
          <TabsTrigger value="documents">Histórico de Envios</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Credenciais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl">
                <Label className="text-base font-bold">Ativar Autentique</Label>
                <Switch checked={config.ativo} onCheckedChange={(v) => setConfig((prev: any) => ({ ...prev, ativo: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ambiente</Label>
                  <Select value={config.ambiente} onValueChange={(v) => setConfig((prev: any) => ({ ...prev, ambiente: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox</SelectItem>
                      <SelectItem value="producao">Produção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Organização</Label>
                  <Input value={config.organizacao_nome || ''} onChange={(e) => setConfig((prev: any) => ({ ...prev, organizacao_nome: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Token da API</Label>
                <Input type="password" placeholder="Token" value={config.token_api || ''} onChange={(e) => setConfig((prev: any) => ({ ...prev, token_api: e.target.value }))} />
              </div>
              <Separator />
              <div className="space-y-4">
                <Label className="text-base font-bold">Webhook</Label>
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-xs text-muted-foreground">URL para cadastrar no Autentique:</p>
                  <div className="flex gap-2">
                    <Input value={webhookUrl} readOnly />
                    <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Copiado!'); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px] w-full">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-3 text-left">Paciente</th>
                      <th className="p-3 text-left">Documento</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Data</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td className="p-3">{doc.paciente_nome || doc.paciente_id}</td>
                        <td className="p-3">{doc.titulo_documento || doc.tipo_documento}</td>
                        <td className="p-3">{getStatusBadge(doc.status)}</td>
                        <td className="p-3">{doc.enviado_em ? format(new Date(doc.enviado_em), 'dd/MM/yy') : '-'}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            {doc.url_autentique && <Button variant="ghost" size="icon" asChild><a href={doc.url_autentique} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>}
                            {doc.storage_path_assinado && <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)}><Download className="h-4 w-4" /></Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConfigAutentique;
