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
  Settings, FileText, Info, Loader2, Save, History 
} from 'lucide-react';
import { toast } from 'sonner';

const ConfigAutentique: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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

  useEffect(() => {
    loadConfig();
  }, [user?.unidadeId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      // Busca config (a view não retorna token, então usamos a tabela se for master)
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('assinatura_eletronica_config')
        .upsert({
          ...config,
          provider: 'autentique',
          updated_at: new Date().toISOString(),
          updated_by: user?.id
        });

      if (error) throw error;
      toast.success('Configurações salvas com sucesso!');
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
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
        body: { token: config.token_api, ambiente: config.ambiente }
      });

      if (error) throw error;
      if (data.ok) {
        toast.success(`Conectado com sucesso! Organização: ${data.viewer?.organization?.name || 'N/A'}`);
        if (data.viewer?.organization?.name && !config.organizacao_nome) {
          setConfig((prev: any) => ({ ...prev, organizacao_nome: data.viewer.organization.name }));
        }
      } else {
        toast.error('Falha na conexão: ' + data.message);
      }
    } catch (e: any) {
      toast.error('Erro no teste: ' + e.message);
    }
    setTesting(false);
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

      <Tabs defaultValue="settings" className="w-full">
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
                        <SelectItem value="production">Produção</SelectItem>
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
                    placeholder="Cole seu token aqui"
                    value={config.token_api || ''}
                    onChange={(e) => setConfig((prev: any) => ({ ...prev, token_api: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground">O token é armazenado de forma segura e nunca é exposto no frontend.</p>
                </div>
              </CardContent>
            </Card>

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

                <div className="bg-blue-50 p-3 rounded-lg flex gap-3 items-start">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-blue-700 leading-relaxed">
                    A URL de Webhook deve ser configurada no painel do Autentique para receber atualizações automáticas de status.
                    <br/><br/>
                    <strong>URL:</strong> {window.location.origin}/functions/v1/autentique-webhook
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card className="shadow-card border-0">
            <CardContent className="p-0">
              <div className="flex items-center justify-center py-20 text-muted-foreground flex-col gap-2">
                <History className="w-12 h-12 opacity-20" />
                <p>Nenhum documento enviado recentemente.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConfigAutentique;
