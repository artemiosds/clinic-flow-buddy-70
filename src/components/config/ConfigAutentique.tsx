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
  ShieldCheck, ExternalLink, RefreshCw, CheckCircle2, XCircle, 
  Settings, FileText, Info, Loader2, Save, History, Copy, Eye, Download, Search, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

      if (data) {
        setConfig(data);
      }
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
        ? null 
        : config.token_api;

      const { data, error } = await supabase.rpc('salvar_configuracao_autentique', {
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
      
      toast.success('Configurações salvas com sucesso!');
      loadConfig();
    } catch (e: any) {
      console.error('Erro ao salvar config Autentique:', e);
      toast.error('Erro ao salvar: ' + (e.message || 'Verifique suas permissões'));
    }
    setSaving(false);
  };

  const testarConexao = async () => {
    if (!config.token_api) {
      toast.error('Informe o token antes de testar.');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('autentique-testar-conexao', {
        body: { 
          token: config.token_api, 
          ambiente: config.ambiente,
          saveStatus: true
        }
      });

      if (error) throw error;
      
      if (data.ok) {
        const orgName = data.account?.organization || 'N/A';
        toast.success(`Conectado com sucesso! Organização: ${orgName}`);
        
        if (orgName !== 'N/A' && !config.organizacao_nome) {
          setConfig((prev: any) => ({ ...prev, organizacao_nome: orgName }));
        }
        loadConfig();
      } else {
        toast.error('Falha na conexão: ' + (data.message || 'Erro desconhecido'));
        loadConfig();
      }
    } catch (e: any) {
      toast.error('Erro no teste: ' + e.message);
    }
    setTesting(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência!');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Concluído</Badge>;
      case 'pendente':
        return <Badge variant="outline" className="text-amber-600 border-amber-200">Pendente</Badge>;
      case 'parcialmente_assinado':
        return <Badge variant="outline" className="text-blue-600 border-blue-200">Parcial</Badge>;
      case 'recusado':
        return <Badge variant="destructive">Recusado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display tracking-tight">Assinatura Eletrônica</h1>
            <p className="text-muted-foreground text-sm">Gerencie a integração com Autentique para documentos digitais</p>
          </div>
        </div>
        <div className="flex gap-2">
          {config.ultimo_teste_em && (
            <div className="hidden md:flex flex-col items-end justify-center mr-4 text-[10px] text-muted-foreground leading-tight">
              <span>Último teste: {format(new Date(config.ultimo_teste_em), 'dd/MM HH:mm')}</span>
              <span className={config.status_conexao === 'sucesso' ? 'text-green-600 font-medium' : 'text-amber-600'}>
                Status: {config.status_conexao === 'sucesso' ? 'Conectado' : 'Pendente/Falha'}
              </span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={testarConexao} disabled={testing || !config.token_api}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Testar Conexão
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Configurações
          </Button>
        </div>
      </div>

      <Tabs defaultValue="settings" className="w-full" onValueChange={(v) => v === 'documents' && loadHistory()}>
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="w-4 h-4" /> Configurações
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <History className="w-4 h-4" /> Histórico de Envios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2 shadow-card border-0">
              <CardHeader>
                <CardTitle className="text-lg">Credenciais e Ambiente</CardTitle>
                <CardDescription>Configure o acesso à API do Autentique</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Ativar Autentique</Label>
                    <p className="text-xs text-muted-foreground">Habilitar a opção de assinatura digital nos documentos</p>
                  </div>
                  <Switch 
                    checked={config.ativo} 
                    onCheckedChange={(v) => setConfig((prev: any) => ({ ...prev, ativo: v }))} 
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ambiente</Label>
                    <Select 
                      value={config.ambiente} 
                      onValueChange={(v) => setConfig((prev: any) => ({ ...prev, ambiente: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o ambiente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                        <SelectItem value="producao">Produção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Organização</Label>
                    <Input 
                      placeholder="Nome da organização no Autentique"
                      value={config.organizacao_nome || ''}
                      onChange={(e) => setConfig((prev: any) => ({ ...prev, organizacao_nome: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Token da API</Label>
                    <a 
                      href="https://painel.autentique.com.br/configuracoes/api" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-primary flex items-center hover:underline"
                    >
                      Obter Token <ExternalLink className="w-2.5 h-2.5 ml-1" />
                    </a>
                  </div>
                  <Input 
                    type="password"
                    placeholder={config.token_api ? "••••••••••••••••" : "Cole seu token aqui"}
                    value={config.token_api || ''}
                    autoComplete="off"
                    onChange={(e) => setConfig((prev: any) => ({ ...prev, token_api: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground">O token é armazenado de forma segura e nunca é exposto no frontend.</p>
                </div>

                <Separator className="my-4" />

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    <Label className="text-base font-bold">Webhook Autentique</Label>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg border border-muted space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Copie esta URL e cadastre no painel do Autentique em <strong>Configurações > Webhooks</strong>. 
                      Assim o sistema receberá atualizações automáticas quando documentos forem assinados.
                    </p>
                    <div className="flex gap-2">
                      <Input value={webhookUrl} readOnly className="bg-background" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="shadow-card border-0">
                <CardHeader>
                  <CardTitle className="text-lg">Preferências</CardTitle>
                  <CardDescription>Comportamento do fluxo</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">Notificar por E-mail</Label>
                        <p className="text-[10px] text-muted-foreground">Enviar aviso de assinatura por e-mail</p>
                      </div>
                      <Switch 
                        checked={config.enviar_email} 
                        onCheckedChange={(v) => setConfig((prev: any) => ({ ...prev, enviar_email: v }))} 
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">Exigir Profissional</Label>
                        <p className="text-[10px] text-muted-foreground">Sempre incluir o profissional como signatário</p>
                      </div>
                      <Switch 
                        checked={config.exigir_profissional} 
                        onCheckedChange={(v) => setConfig((prev: any) => ({ ...prev, exigir_profissional: v }))} 
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">Download Automático</Label>
                        <p className="text-[10px] text-muted-foreground">Baixar PDF assinado quando concluído</p>
                      </div>
                      <Switch 
                        checked={config.baixar_assinado_automaticamente} 
                        onCheckedChange={(v) => setConfig((prev: any) => ({ ...prev, baixar_assinado_automaticamente: v }))} 
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card border-0 bg-primary/5 border-primary/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" /> Ajuda
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Certifique-se de que o token possui as permissões necessárias para criar documentos e listar informações da conta.
                    Em caso de problemas, verifique os logs no dashboard do Autentique.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card className="shadow-card border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg">Documentos Enviados</CardTitle>
                <CardDescription>Listagem dos últimos 50 documentos vinculados ao Autentique</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadHistory} disabled={historyLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${historyLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] w-full">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
                  </div>
                ) : documents.length === 0 ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground flex-col gap-2">
                    <History className="w-12 h-12 opacity-20" />
                    <p>Nenhum documento enviado ao Autentique ainda.</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground">
                          <th className="p-3 text-left font-medium">Paciente</th>
                          <th className="p-3 text-left font-medium">Documento</th>
                          <th className="p-3 text-left font-medium">Status</th>
                          <th className="p-3 text-left font-medium">Data Envio</th>
                          <th className="p-3 text-right font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {documents.map((doc) => (
                          <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3">
                              <div className="font-medium">{doc.paciente_nome || 'Paciente Não Identificado'}</div>
                              <div className="text-[10px] text-muted-foreground">ID: {doc.paciente_id}</div>
                            </td>
                            <td className="p-3">
                              <div>{doc.titulo_documento || doc.tipo_documento}</div>
                              <div className="text-[10px] text-muted-foreground">{doc.profissional_nome && `Por: ${doc.profissional_nome}`}</div>
                            </td>
                            <td className="p-3">
                              {getStatusBadge(doc.status)}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {doc.enviado_em ? format(new Date(doc.enviado_em), 'dd/MM/yyyy HH:mm') : '-'}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-1">
                                {doc.url_autentique && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                    <a href={doc.url_autentique} target="_blank" rel="noopener noreferrer" title="Ver no Autentique">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                                {doc.storage_path_assinado && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" title="Baixar PDF Assinado">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConfigAutentique;
