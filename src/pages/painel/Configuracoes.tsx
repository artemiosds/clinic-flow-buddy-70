import React, { useEffect, useState, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import GerenciarProcedimentos from '@/components/GerenciarProcedimentos';
import VincularSigtapProcedimentos from '@/components/VincularSigtapProcedimentos';
import SigtapSyncPanel from '@/components/SigtapSyncPanel';
import { useConfiguracao } from '@/hooks/useConfiguracao';
import ConfiguracaoTriagem from '@/components/ConfiguracaoTriagem';
import { useAuth } from '@/contexts/AuthContext';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare, Calendar, QrCode, Settings as SettingsIcon, Loader2,
  CheckCircle2, XCircle, Webhook, Send, Pencil, Mail, AlertCircle,
  HeartPulse, Shield, Users, Bell, ShieldAlert, RefreshCw,
  ArrowRightLeft, User, Clock, CalendarDays, Info, FileText,
  Globe, Ban, Plus, Trash2, Building2, ClipboardList, Search,
  Stethoscope, Activity, Monitor, ShieldCheck
} from 'lucide-react';
import EditorProntuarioConfig from '@/components/EditorProntuarioConfig';
import ModelosDocumentos from '@/components/ModelosDocumentos';
import CarimboConfig from '@/components/CarimboConfig';
import { Stamp } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';
import ConfigProntuario from '@/components/config/ConfigProntuario';
import ConfigMedicamentosExames from '@/components/config/ConfigMedicamentosExames';
import ConfigImpressaoDocumentos from '@/components/config/ConfigImpressaoDocumentos';
import ConfigEspecialidades from '@/components/config/ConfigEspecialidades';
import ConfigFluxoAtendimento from '@/components/config/ConfigFluxoAtendimento';
import ConfigSistema from '@/components/config/ConfigSistema';
import ConfigPersonalizarCampos from '@/components/config/ConfigPersonalizarCampos';
import ConfigWhatsApp from '@/components/config/ConfigWhatsApp';
import ConfigSistemasIntegrados from '@/components/config/ConfigSistemasIntegrados';
import ConfigAutentique from '@/components/config/ConfigAutentique';
import { Network } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'prontuario', label: 'Prontuário', icon: FileText, globalOnly: false },
  { id: 'medicamentos', label: 'Medicamentos e Exames', icon: Stethoscope, globalOnly: false },
  { id: 'impressao', label: 'Impressão e Documentos', icon: Stamp, globalOnly: false },
  { id: 'assinatura', label: 'Assinatura Eletrônica', icon: ShieldCheck, globalOnly: false },
  { id: 'especialidades', label: 'Especialidades', icon: ClipboardList, globalOnly: false },
  { id: 'fluxo', label: 'Fluxo de Atendimento', icon: Activity, globalOnly: false },
  { id: 'campos', label: 'Personalizar Campos', icon: SettingsIcon, globalOnly: false },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, globalOnly: false },
  { id: 'usuarios', label: 'Usuários e Permissões', icon: Users, globalOnly: false },
  { id: 'unidades', label: 'Unidades e Setores', icon: Building2, globalOnly: true },
  { id: 'integracoes', label: 'Sistemas Integrados', icon: Network, globalOnly: true },
  { id: 'sistema', label: 'Sistema', icon: Monitor, globalOnly: true },
] as const;

type TabId = typeof TABS[number]['id'];

const Configuracoes: React.FC = () => {
  const { user } = useAuth();
  const { unidades, funcionarios, configuracoes: dataConfiguracoes, updateConfiguracoes } = useData();
  const { whatsapp, filaEspera, templates, webhook } = dataConfiguracoes;
  const { atualizarConfiguracao, configuracoes, loading: hookLoading } = useConfiguracao(user?.unidadeId);
  const { testGmail } = useWebhookNotify();
  
  // Webhook + Gmail (legacy unidades tab)
  const [webhookUrl, setWebhookUrl] = useState(webhook?.url || '');
  const [webhookEditing, setWebhookEditing] = useState(!webhook?.url);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [gmailTesting, setGmailTesting] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<'idle' | 'conectado' | 'erro_autenticacao' | 'erro_conexao' | 'erro_envio' | 'nao_configurado'>('idle');
  const [gmailMessage, setGmailMessage] = useState('');
  const [triageSettingId, setTriageSettingId] = useState<string | null>(null);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>('prontuario');

  // Reativar Atendimento
  const [reativarProfId, setReativarProfId] = useState('');
  const [reativarAgendamentos, setReativarAgendamentos] = useState<any[]>([]);
  const [reativarAgId, setReativarAgId] = useState('');
  const [reativarLoading, setReativarLoading] = useState(false);
  const [reativarProfSearch, setReativarProfSearch] = useState('');
  const [reativarBuscando, setReativarBuscando] = useState(false);
  const [reativarPacienteSearch, setReativarPacienteSearch] = useState('');

  // Transferência
  const [transferAgId, setTransferAgId] = useState('');
  const [transferNovoProfId, setTransferNovoProfId] = useState('');
  const [transferMotivo, setTransferMotivo] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferAgendamentos, setTransferAgendamentos] = useState<any[]>([]);
  const [transferProfOrigem, setTransferProfOrigem] = useState('');
  const [transferBuscando, setTransferBuscando] = useState(false);

  // Agendamento Online
  const [agOnline, setAgOnline] = useState({
    habilitado: false,
    antecedencia_minima_dias: 1,
    antecedencia_maxima_dias: 30,
    limite_por_dia_profissional: 5,
    mensagem_confirmacao: 'Seu agendamento foi confirmado com sucesso!',
    exigir_confirmacao_sms: false,
    profissionais_bloqueados: [] as string[],
  });
  const [agOnlineLoading, setAgOnlineLoading] = useState(true);
  const [agOnlineSaving, setAgOnlineSaving] = useState(false);

  // Cancelamentos
  const [cancelConfig, setCancelConfig] = useState({
    prazo_minimo_horas: 24,
    limite_cancelamentos_mes: 3,
    dias_bloqueio_apos_limite: 7,
    motivos: ['Compromisso pessoal', 'Problema de saúde', 'Falta de transporte', 'Horário incompatível', 'Outro'] as string[],
    notificar_profissional: true,
    liberar_vaga_automaticamente: true,
  });
  const [cancelLoading, setCancelLoading] = useState(true);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [novoMotivo, setNovoMotivo] = useState('');

  // Evolution API
  const [evolutionConfig, setEvolutionConfig] = useState({
    nome_clinica: '', logo_url: '', telefone: '',
    evolution_base_url: 'https://api.agendamento-saude-sms-oriximina.site',
    evolution_api_key: '', evolution_instance_name: '',
  });
  const [evolutionInstances, setEvolutionInstances] = useState<{ instanceName: string; state: string }[]>([]);
  const [evolutionLoading, setEvolutionLoading] = useState(true);
  const [evolutionSaving, setEvolutionSaving] = useState(false);
  const [evolutionTesting, setEvolutionTesting] = useState(false);
  const [evolutionStatus, setEvolutionStatus] = useState<'idle' | 'connected' | 'disconnected' | 'error'>('idle');

  const [triageEnabled, setTriageEnabled] = useState(false);
  const [triageLoading, setTriageLoading] = useState(true);

  // Load from centralized store
  useEffect(() => {
    if (!hookLoading) {
      const clinicaCfg = configuracoes['config_clinica'];
      if (clinicaCfg) setEvolutionConfig(prev => ({ ...prev, ...clinicaCfg }));
      
      const onlineCfg = configuracoes['config_agendamento_online'];
      if (onlineCfg) setAgOnline(prev => ({ ...prev, ...onlineCfg }));
      
      const cancelCfg = configuracoes['config_cancelamentos'];
      if (cancelCfg) setCancelConfig(prev => ({ ...prev, ...cancelCfg }));

      setTriageEnabled(configuracoes['config_triagem_enabled'] ?? false);
      
      setEvolutionLoading(false);
      setAgOnlineLoading(false);
      setCancelLoading(false);
      setTriageLoading(false);
    }
  }, [hookLoading, configuracoes]);


  const isMaster = user?.role === 'master';
  const _isGlobalMaster = user?.usuario === 'admin.sms';
  const _isUnitMaster = isMaster && !!user?.unidadeId && !_isGlobalMaster;
  const profissionaisAtivos = [...funcionarios].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  );

  const buscarTodosAgendamentosPorProfissional = async (profId: string, selectFields: string) => {
    const pageSize = 500;
    const todos: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('agendamentos')
        .select(selectFields)
        .eq('profissional_id', profId)
        .order('data', { ascending: false })
        .order('hora', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data?.length) break;
      todos.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return todos;
  };

  const buscarAgendamentosReativar = async (profId: string) => {
    if (!profId) { setReativarAgendamentos([]); return; }
    setReativarBuscando(true);
    try {
      const data = await buscarTodosAgendamentosPorProfissional(profId, 'id, paciente_nome, data, hora, status');
      setReativarAgendamentos(data);
    } catch (err: any) {
      toast.error(`Erro ao buscar agendamentos: ${err.message}`);
      setReativarAgendamentos([]);
    } finally {
      setReativarBuscando(false);
    }
  };

  const executarReativar = async () => {
    if (!reativarAgId) return;
    setReativarLoading(true);
    try {
      const { error } = await supabase
        .from('agendamentos')
        .update({ status: 'apto_atendimento', atualizado_em: new Date().toISOString() })
        .eq('id', reativarAgId);
      if (error) throw error;
      toast.success('Botão Iniciar Atendimento reativado com sucesso.');
      setReativarAgId('');
      buscarAgendamentosReativar(reativarProfId);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setReativarLoading(false);
    }
  };

  const buscarAgendamentosTransferir = async (profId: string) => {
    if (!profId) { setTransferAgendamentos([]); return; }
    setTransferBuscando(true);
    try {
      const data = await buscarTodosAgendamentosPorProfissional(profId, 'id, paciente_nome, data, hora, status, profissional_nome, observacoes');
      setTransferAgendamentos(data);
    } catch (err: any) {
      toast.error(`Erro ao buscar agendamentos: ${err.message}`);
      setTransferAgendamentos([]);
    } finally {
      setTransferBuscando(false);
    }
  };

  const executarTransferencia = async () => {
    if (!transferAgId || !transferNovoProfId || !transferMotivo.trim()) return;
    setTransferLoading(true);
    try {
      const novoProfissional = funcionarios.find(f => f.id === transferNovoProfId);
      if (!novoProfissional) throw new Error('Profissional não encontrado');
      const ag = transferAgendamentos.find(a => a.id === transferAgId);
      const obsAnterior = ag?.observacoes || '';
      const novaObs = `${obsAnterior}\n[TRANSFERÊNCIA] De ${ag?.profissional_nome || 'N/A'} para ${novoProfissional.nome}. Motivo: ${transferMotivo.trim()}`.trim();
      const { error } = await supabase
        .from('agendamentos')
        .update({
          profissional_id: novoProfissional.id,
          profissional_nome: novoProfissional.nome,
          observacoes: novaObs,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', transferAgId);
      if (error) throw error;
      toast.success(`Paciente transferido para ${novoProfissional.nome} com sucesso.`);
      setTransferAgId('');
      setTransferMotivo('');
      setTransferNovoProfId('');
      buscarAgendamentosTransferir(transferProfOrigem);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setTransferLoading(false);
    }
  };

  const saveAgOnline = async () => {
    setAgOnlineSaving(true);
    try {
      await atualizarConfiguracao('config_agendamento_online', agOnline, { auditAcao: 'ALTERAR_CONFIG_AG_ONLINE' });
      toast.success('Configurações de agendamento online salvas!');
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setAgOnlineSaving(false);
    }
  };

  const saveCancelConfig = async () => {
    setCancelSaving(true);
    try {
      await atualizarConfiguracao('config_cancelamentos', cancelConfig, { auditAcao: 'ALTERAR_CONFIG_CANCELAMENTOS' });
      toast.success('Regras de cancelamento salvas!');
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setCancelSaving(false);
    }
  };

  const handleToggleTriage = async (v: boolean) => {
    setTriageEnabled(v);
    await atualizarConfiguracao('config_triagem_enabled', v, { auditAcao: 'ALTERAR_CONFIG_TRIAGEM' });
    toast.success(v ? 'Triagem habilitada' : 'Triagem desabilitada');
  };

  // Evolution instances loading logic
  useEffect(() => {
    if (evolutionConfig.evolution_api_key) {
      (async () => {
        try {
          const resp = await fetch(`${evolutionConfig.evolution_base_url}/instance/fetchInstances`, {
            headers: { apikey: evolutionConfig.evolution_api_key },
          });
          if (resp.ok) {
            const instances = await resp.json();
            if (Array.isArray(instances)) {
              setEvolutionInstances(instances.map((i: any) => ({
                instanceName: i.instance?.instanceName || i.instanceName || '',
                state: i.instance?.state || i.state || 'unknown',
              })).filter((i: any) => i.instanceName));
            }
          }
        } catch { }
      })();
    }
  }, [evolutionConfig.evolution_api_key, evolutionConfig.evolution_base_url]);

  const testEvolutionWhatsApp = async () => {
    setEvolutionTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-evolution', {
        body: { tipo: 'teste', telefone_teste: evolutionConfig.telefone || user?.email },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success('Mensagem de teste enviada com sucesso!');
        setEvolutionStatus('connected');
      } else {
        toast.error(data?.error || 'Erro ao enviar teste');
        setEvolutionStatus('error');
      }
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
      setEvolutionStatus('error');
    } finally {
      setEvolutionTesting(false);
    }
  };




  const checkEvolutionConnection = async () => {
    if (!evolutionConfig.evolution_instance_name || !evolutionConfig.evolution_api_key) {
      toast.error('Configure a instância e API Key primeiro.');
      return;
    }
    try {
      const resp = await fetch(
        `${evolutionConfig.evolution_base_url}/instance/connectionState/${evolutionConfig.evolution_instance_name}`,
        { headers: { apikey: evolutionConfig.evolution_api_key } }
      );
      if (resp.ok) {
        const state = await resp.json();
        const connected = state?.instance?.state === 'open';
        setEvolutionStatus(connected ? 'connected' : 'disconnected');
        toast[connected ? 'success' : 'warning'](connected ? 'Instância conectada!' : 'Instância desconectada. Verifique o QR Code.');
      } else {
        setEvolutionStatus('error');
        toast.error('Erro ao verificar conexão.');
      }
    } catch {
      setEvolutionStatus('error');
      toast.error('Não foi possível conectar à Evolution API.');
    }
  };

  const updateWhatsapp = (data: Partial<typeof whatsapp>) => {
    updateConfiguracoes({ whatsapp: { ...whatsapp, ...data } });
  };

  const updateNotificacoes = (data: Partial<typeof whatsapp.notificacoes>) => {
    updateConfiguracoes({ whatsapp: { ...whatsapp, notificacoes: { ...whatsapp.notificacoes, ...data } } });
  };


  if (!isMaster) {
    return <Navigate to="/painel/dashboard" replace />;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'prontuario':
        return <ConfigProntuario />;

      case 'medicamentos':
        return <ConfigMedicamentosExames />;

      case 'impressao':
        return (
          <div className="space-y-6">
            <ConfigImpressaoDocumentos />
            <Separator />
            <ModelosDocumentos />
            <Separator />
            <CarimboConfig />
          </div>
        );

      case 'assinatura':
        return <ConfigAutentique />;

      case 'especialidades':
        return <ConfigEspecialidades />;

      case 'campos':
        return <ConfigPersonalizarCampos />;

      case 'whatsapp':
        return <ConfigWhatsApp />;

      case 'fluxo':
        return (
          <div className="space-y-6">
            <ConfigFluxoAtendimento />
            <Separator />
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <HeartPulse className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold font-display text-foreground">Triagem de Enfermagem</h3>
                    <p className="text-sm text-muted-foreground">Etapa opcional antes do atendimento</p>
                  </div>
                  {triageLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Switch
                      checked={triageEnabled}
                      onCheckedChange={async (v) => {
                        setTriageEnabled(v);
                        try {
                          const unitId = user?.unidadeId || null;
                          if (triageSettingId) {
                            const { error } = await supabase
                              .from('triage_settings')
                              .update({ enabled: v, updated_at: new Date().toISOString() })
                              .eq('id', triageSettingId);
                            if (error) throw error;
                          } else {
                            const { data: inserted, error } = await supabase
                              .from('triage_settings')
                              .insert({ enabled: v, unidade_id: unitId, profissional_id: null })
                              .select('id')
                              .single();
                            if (error) throw error;
                            if (inserted) setTriageSettingId(inserted.id);
                          }
                          toast.success(v ? 'Triagem habilitada!' : 'Triagem desabilitada.');
                        } catch (err) {
                          console.error('Erro ao salvar triagem:', err);
                          setTriageEnabled(!v);
                          toast.error('Erro ao salvar configuração de triagem.');
                        }
                      }}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando habilitada, ao confirmar a chegada do paciente na recepção, ele será encaminhado primeiro para triagem.
                </p>
                {triageEnabled && (
                  <div className="mt-3 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                    <strong className="text-foreground">Técnicos cadastrados:</strong>{' '}
                    {funcionarios.filter(f => f.role === 'tecnico' && f.ativo).length === 0
                      ? <span className="text-destructive">Nenhum técnico cadastrado.</span>
                      : funcionarios.filter(f => f.role === 'tecnico' && f.ativo).map(f => f.nome).join(', ')
                    }
                  </div>
                )}
              </CardContent>
            </Card>
            <ConfiguracaoTriagem />
            <Separator />
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <SettingsIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Fila de Espera</h3>
                    <p className="text-sm text-muted-foreground">Modo de encaixe automático</p>
                  </div>
                </div>
                <div>
                  <Label>Modo de Encaixe</Label>
                  <Select value={filaEspera.modoEncaixe} onValueChange={v => updateConfiguracoes({ filaEspera: { modoEncaixe: v as 'automatico' | 'assistido' } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assistido">Assistido — recepção confirma o encaixe</SelectItem>
                      <SelectItem value="automatico">Automático — sistema encaixa sozinho</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'usuarios':
        return (
          <div className="space-y-6">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Acesso do Paciente ao Portal</h3>
                    <p className="text-sm text-muted-foreground">Controle de acesso e envio de credenciais</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">Permitir acesso ao portal</span>
                      <p className="text-xs text-muted-foreground">Quando desativado, nenhum paciente acessa o portal</p>
                    </div>
                    <Switch
                      checked={configuracoes.portalPaciente?.permitirPortal ?? true}
                      onCheckedChange={v => updateConfiguracoes({ portalPaciente: { ...configuracoes.portalPaciente!, permitirPortal: v, enviarSenhaAutomaticamente: configuracoes.portalPaciente?.enviarSenhaAutomaticamente ?? true, enviarLinkAcesso: configuracoes.portalPaciente?.enviarLinkAcesso ?? true, pacientesBloqueados: configuracoes.portalPaciente?.pacientesBloqueados ?? [] } })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">Enviar senha automaticamente por e-mail</span>
                      <p className="text-xs text-muted-foreground">Ao cadastrar paciente, envia login e senha temporária</p>
                    </div>
                    <Switch
                      checked={configuracoes.portalPaciente?.enviarSenhaAutomaticamente ?? true}
                      onCheckedChange={v => updateConfiguracoes({ portalPaciente: { ...configuracoes.portalPaciente!, enviarSenhaAutomaticamente: v, permitirPortal: configuracoes.portalPaciente?.permitirPortal ?? true, enviarLinkAcesso: configuracoes.portalPaciente?.enviarLinkAcesso ?? true, pacientesBloqueados: configuracoes.portalPaciente?.pacientesBloqueados ?? [] } })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">Enviar link de acesso ao portal</span>
                      <p className="text-xs text-muted-foreground">Inclui link do portal no e-mail de credenciais</p>
                    </div>
                    <Switch
                      checked={configuracoes.portalPaciente?.enviarLinkAcesso ?? true}
                      onCheckedChange={v => updateConfiguracoes({ portalPaciente: { ...configuracoes.portalPaciente!, enviarLinkAcesso: v, permitirPortal: configuracoes.portalPaciente?.permitirPortal ?? true, enviarSenhaAutomaticamente: configuracoes.portalPaciente?.enviarSenhaAutomaticamente ?? true, pacientesBloqueados: configuracoes.portalPaciente?.pacientesBloqueados ?? [] } })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Separator />

            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Reativar Botão "Iniciar Atendimento"</h3>
                    <p className="text-sm text-muted-foreground">Corrige status do agendamento quando o botão foi perdido</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">Etapa 1</Badge>
                    <Label className="text-[13px] font-bold text-foreground/80">Selecionar Profissional</Label>
                  </div>
                  <Select value={reativarProfId} onValueChange={v => { setReativarProfId(v); setReativarAgId(''); buscarAgendamentosReativar(v); }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
                    <SelectContent>
                      <div className="px-2 pb-2 pt-1 sticky top-0 bg-popover z-10">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Buscar profissional..."
                            className="h-8 pl-8 text-sm"
                            value={reativarProfSearch}
                            onChange={e => setReativarProfSearch(e.target.value)}
                            onKeyDown={e => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      {profissionaisAtivos
                        .filter(p => !reativarProfSearch || p.nome.toLowerCase().includes(reativarProfSearch.toLowerCase()))
                        .map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao || p.role}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {reativarBuscando && <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</div>}
                {reativarProfId && !reativarBuscando && reativarAgendamentos.length === 0 && <p className="text-sm text-muted-foreground py-4">Nenhum agendamento encontrado.</p>}
                {reativarProfId && !reativarBuscando && reativarAgendamentos.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <Label className="text-[13px] font-bold text-foreground/80">Selecionar Agendamento</Label>
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar paciente..."
                          className="h-8 pl-8 text-sm"
                          value={reativarPacienteSearch}
                          onChange={e => setReativarPacienteSearch(e.target.value)}
                        />
                      </div>
                      <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                        <Table>
                          <TableHeader><TableRow className="bg-muted/50"><TableHead className="text-xs">Paciente</TableHead><TableHead className="text-xs w-[90px]">Data</TableHead><TableHead className="text-xs w-[70px]">Hora</TableHead><TableHead className="text-xs w-[90px]">Status</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {reativarAgendamentos.filter(ag => !reativarPacienteSearch || ag.paciente_nome?.toLowerCase().includes(reativarPacienteSearch.toLowerCase())).map(ag => (
                              <TableRow key={ag.id} className={cn("cursor-pointer hover:bg-primary/5", reativarAgId === ag.id && "bg-primary/10")} onClick={() => setReativarAgId(ag.id)}>
                                <TableCell className="text-sm py-2">{ag.paciente_nome}</TableCell>
                                <TableCell className="text-sm py-2">{ag.data ? new Date(ag.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</TableCell>
                                <TableCell className="text-sm py-2">{ag.hora?.slice(0, 5)}</TableCell>
                                <TableCell className="py-2"><Badge variant="outline" className="text-xs capitalize">{ag.status}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}
                {reativarAgId && (
                  <div className="mt-4">
                    <Button className="gradient-primary text-primary-foreground w-full" disabled={reativarLoading} onClick={executarReativar}>
                      {reativarLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      <RefreshCw className="w-4 h-4 mr-2" /> Reativar Atendimento
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ArrowRightLeft className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Transferir Paciente de Profissional</h3>
                    <p className="text-sm text-muted-foreground">Reatribui agendamento para outro profissional</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-bold text-foreground/80">Profissional de Origem</Label>
                  <Select value={transferProfOrigem} onValueChange={v => { setTransferProfOrigem(v); setTransferAgId(''); setTransferNovoProfId(''); setTransferMotivo(''); buscarAgendamentosTransferir(v); }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o profissional atual" /></SelectTrigger>
                    <SelectContent>
                      {profissionaisAtivos.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao || p.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {transferBuscando && <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</div>}
                {transferProfOrigem && !transferBuscando && transferAgendamentos.length === 0 && <p className="text-sm text-muted-foreground py-4">Nenhum agendamento encontrado.</p>}
                {transferProfOrigem && !transferBuscando && transferAgendamentos.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <Label className="text-[13px] font-bold text-foreground/80">Selecionar Agendamento</Label>
                      <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                        <Table>
                          <TableHeader><TableRow className="bg-muted/50"><TableHead className="text-xs">Paciente</TableHead><TableHead className="text-xs w-[90px]">Data</TableHead><TableHead className="text-xs w-[70px]">Hora</TableHead><TableHead className="text-xs w-[90px]">Status</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {transferAgendamentos.map(ag => (
                              <TableRow key={ag.id} className={cn("cursor-pointer hover:bg-primary/5", transferAgId === ag.id && "bg-primary/10")} onClick={() => { setTransferAgId(ag.id); setTransferNovoProfId(''); setTransferMotivo(''); }}>
                                <TableCell className="text-sm py-2">{ag.paciente_nome}</TableCell>
                                <TableCell className="text-sm py-2">{ag.data ? new Date(ag.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</TableCell>
                                <TableCell className="text-sm py-2">{ag.hora?.slice(0, 5)}</TableCell>
                                <TableCell className="py-2"><Badge variant="outline" className="text-xs capitalize">{ag.status}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}
                {transferAgId && (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[13px] font-bold text-foreground/80">Novo Profissional</Label>
                      <Select value={transferNovoProfId} onValueChange={setTransferNovoProfId}>
                        <SelectTrigger><SelectValue placeholder="Selecione o novo profissional" /></SelectTrigger>
                        <SelectContent>
                          {profissionaisAtivos.filter(p => p.id !== transferProfOrigem).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao || p.role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[13px] font-bold text-foreground/80">Motivo da transferência <span className="text-destructive">*</span></Label>
                      <Input placeholder="Ex: Profissional de férias..." value={transferMotivo} onChange={e => setTransferMotivo(e.target.value)} />
                    </div>
                    <Button className="gradient-primary text-primary-foreground w-full" disabled={!transferNovoProfId || !transferMotivo.trim() || transferLoading} onClick={executarTransferencia}>
                      {transferLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      <ArrowRightLeft className="w-4 h-4 mr-2" /> Transferir Paciente
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Separator />

            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-success" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold font-display text-foreground">Agendamento Online</h3>
                    <p className="text-sm text-muted-foreground">Regras para agendamento pelo portal</p>
                  </div>
                  {agOnlineLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <Switch checked={agOnline.habilitado} onCheckedChange={v => setAgOnline(prev => ({ ...prev, habilitado: v }))} />
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Antecedência mínima (dias)</Label>
                    <Input type="number" min={0} value={agOnline.antecedencia_minima_dias} onChange={e => setAgOnline(prev => ({ ...prev, antecedencia_minima_dias: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Antecedência máxima (dias)</Label>
                    <Input type="number" min={1} value={agOnline.antecedencia_maxima_dias} onChange={e => setAgOnline(prev => ({ ...prev, antecedencia_maxima_dias: parseInt(e.target.value) || 30 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Limite por dia por profissional</Label>
                    <Input type="number" min={1} value={agOnline.limite_por_dia_profissional} onChange={e => setAgOnline(prev => ({ ...prev, limite_por_dia_profissional: parseInt(e.target.value) || 5 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Confirmação SMS/WhatsApp</Label>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Exigir confirmação</span>
                      <Switch checked={agOnline.exigir_confirmacao_sms} onCheckedChange={v => setAgOnline(prev => ({ ...prev, exigir_confirmacao_sms: v }))} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Label className="text-[13px] font-bold text-foreground/80">Profissionais com agendamento bloqueado</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                    {profissionaisAtivos.filter(p => ['profissional', 'master', 'coordenador'].includes(p.role)).map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-sm truncate">{p.nome}</span>
                        <Switch
                          checked={!agOnline.profissionais_bloqueados.includes(p.id)}
                          onCheckedChange={v => {
                            setAgOnline(prev => ({
                              ...prev,
                              profissionais_bloqueados: v
                                ? prev.profissionais_bloqueados.filter(id => id !== p.id)
                                : [...prev.profissionais_bloqueados, p.id],
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <Button className="gradient-primary text-primary-foreground w-full mt-4" disabled={agOnlineSaving} onClick={saveAgOnline}>
                  {agOnlineSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Salvar Configurações de Agendamento Online
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Ban className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Controle de Cancelamentos</h3>
                    <p className="text-sm text-muted-foreground">Regras e penalidades</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Prazo mínimo sem penalidade (h)</Label>
                    <Input type="number" min={0} value={cancelConfig.prazo_minimo_horas} onChange={e => setCancelConfig(prev => ({ ...prev, prazo_minimo_horas: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Limite cancelamentos/mês</Label>
                    <Input type="number" min={1} value={cancelConfig.limite_cancelamentos_mes} onChange={e => setCancelConfig(prev => ({ ...prev, limite_cancelamentos_mes: parseInt(e.target.value) || 3 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Dias de bloqueio</Label>
                    <Input type="number" min={0} value={cancelConfig.dias_bloqueio_apos_limite} onChange={e => setCancelConfig(prev => ({ ...prev, dias_bloqueio_apos_limite: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-foreground">Notificar profissional</span>
                    </div>
                    <Switch checked={cancelConfig.notificar_profissional} onCheckedChange={v => setCancelConfig(prev => ({ ...prev, notificar_profissional: v }))} />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-foreground">Liberar vaga automaticamente</span>
                    </div>
                    <Switch checked={cancelConfig.liberar_vaga_automaticamente} onCheckedChange={v => setCancelConfig(prev => ({ ...prev, liberar_vaga_automaticamente: v }))} />
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="space-y-2">
                  <Label className="text-[13px] font-bold text-foreground/80">Motivos de cancelamento</Label>
                  <div className="space-y-1.5">
                    {cancelConfig.motivos.map((motivo, i) => (
                      <div key={`motivo-${motivo}-${i}`} className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2 bg-muted/50 rounded-lg text-sm">{motivo}</div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => {
                          setCancelConfig(prev => ({ ...prev, motivos: prev.motivos.filter((_, idx) => idx !== i) }));
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Novo motivo..." value={novoMotivo} onChange={e => setNovoMotivo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && novoMotivo.trim()) { setCancelConfig(prev => ({ ...prev, motivos: [...prev.motivos, novoMotivo.trim()] })); setNovoMotivo(''); } }} />
                    <Button variant="outline" size="icon" disabled={!novoMotivo.trim()} onClick={() => { setCancelConfig(prev => ({ ...prev, motivos: [...prev.motivos, novoMotivo.trim()] })); setNovoMotivo(''); }}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Button className="gradient-primary text-primary-foreground w-full mt-4" disabled={cancelSaving} onClick={saveCancelConfig}>
                  {cancelSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Salvar Regras de Cancelamento
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case 'unidades':
        return (
          <div className="space-y-6">
            <SigtapSyncPanel />
            <GerenciarProcedimentos />
            <VincularSigtapProcedimentos />
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center"><Webhook className="w-5 h-5 text-accent-foreground" /></div>
                  <div className="flex-1"><h3 className="font-semibold font-display text-foreground">Webhook Make.com</h3><p className="text-sm text-muted-foreground">Automações via webhook</p></div>
                  <Badge variant={webhook.status === 'ativo' ? 'default' : webhook.status === 'erro' ? 'destructive' : 'secondary'} className="capitalize">{webhook.status === 'ativo' ? '✅ Ativo' : webhook.status === 'erro' ? '❌ Erro' : '⏸ Inativo'}</Badge>
                </div>
                <div className="space-y-4">
                  <div><Label>URL do Webhook</Label><div className="flex gap-2 mt-1"><Input placeholder="https://hook.us2.make.com/..." value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} disabled={!webhookEditing} className="flex-1" />{!webhookEditing && <Button variant="outline" size="icon" onClick={() => setWebhookEditing(true)}><Pencil className="w-4 h-4" /></Button>}</div></div>
                  <div className="flex gap-2">
                    <Button className="gradient-primary text-primary-foreground flex-1" disabled={!webhookUrl.trim()} onClick={() => { updateConfiguracoes({ webhook: { url: webhookUrl.trim(), ativo: true, status: 'ativo' } }); setWebhookEditing(false); toast.success('Webhook salvo!'); }}>Salvar Webhook</Button>
                    <Button variant="outline" disabled={!webhook.url || webhookTesting} onClick={async () => {
                      setWebhookTesting(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('webhook-notify', { body: { evento: 'teste', paciente_nome: 'Teste do Sistema', telefone: '(00) 00000-0000', email: 'teste@teste.com', data_consulta: new Date().toLocaleDateString('pt-BR'), hora_consulta: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), unidade: 'Unidade Teste', profissional: 'Profissional Teste', tipo_atendimento: 'Teste de Webhook', status_agendamento: 'teste', id_agendamento: 'teste-' + Date.now() } });
                        if (error) throw error;
                        updateConfiguracoes({ webhook: { ...webhook, url: webhookUrl.trim(), ativo: true, status: 'ativo' } });
                        toast.success('Webhook testado com sucesso!');
                      } catch { updateConfiguracoes({ webhook: { ...webhook, status: 'erro' } }); toast.error('Erro ao testar webhook.'); } finally { setWebhookTesting(false); }
                    }}>{webhookTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}Testar</Button>
                  </div>
                  {webhook.ativo && <Button variant="ghost" className="w-full text-destructive" onClick={() => { updateConfiguracoes({ webhook: { url: '', ativo: false, status: 'inativo' } }); setWebhookUrl(''); setWebhookEditing(true); toast.info('Webhook desativado.'); }}>Desativar Webhook</Button>}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><Mail className="w-5 h-5 text-destructive" /></div>
                  <div className="flex-1"><h3 className="font-semibold font-display text-foreground">Gmail SMTP</h3><p className="text-sm text-muted-foreground">Envio de e-mails</p></div>
                  <Switch checked={configuracoes.gmail?.ativo || false} onCheckedChange={v => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, ativo: v } })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>E-mail remetente</Label><Input placeholder="seuemail@gmail.com" value={configuracoes.gmail?.email || ''} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, email: e.target.value } })} /></div>
                  <div><Label>Senha de Aplicativo</Label><Input type="password" placeholder="Senha de app do Google" value={configuracoes.gmail?.senhaApp || ''} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, senhaApp: e.target.value } })} /></div>
                  <div><Label>Servidor SMTP</Label><Input value={configuracoes.gmail?.smtpHost || 'smtp.gmail.com'} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, smtpHost: e.target.value } })} /></div>
                  <div><Label>Porta</Label><Input type="number" value={configuracoes.gmail?.smtpPort || 587} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, smtpPort: parseInt(e.target.value) || 587 } })} /></div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button className="gradient-primary text-primary-foreground flex-1" disabled={!configuracoes.gmail?.email || !configuracoes.gmail?.senhaApp} onClick={async () => {
                    const gmailData = { ...configuracoes.gmail!, ativo: true, smtpHost: configuracoes.gmail?.smtpHost || 'smtp.gmail.com', smtpPort: configuracoes.gmail?.smtpPort || 587 };
                    const currentCanal = configuracoes.canalNotificacao || 'webhook';
                    const newCanal = currentCanal === 'webhook' ? 'ambos' : currentCanal;
                    updateConfiguracoes({ gmail: gmailData, canalNotificacao: newCanal });
                    toast.success('Gmail salvo!');
                    setGmailTesting(true); setGmailMessage('');
                    const result = await testGmail();
                    setGmailStatus(result.status as any); setGmailMessage(result.message); setGmailTesting(false);
                  }}>
                    {gmailTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Salvar Gmail
                  </Button>
                  <Button variant="outline" disabled={!configuracoes.gmail?.ativo || !configuracoes.gmail?.email || !configuracoes.gmail?.senhaApp || gmailTesting} onClick={async () => {
                    setGmailTesting(true); setGmailMessage('');
                    const result = await testGmail();
                    setGmailStatus(result.status as any); setGmailMessage(result.message); setGmailTesting(false);
                    if (result.success) toast.success('E-mail de teste enviado!'); else toast.error(`Falha: ${result.message}`);
                  }}>
                    {gmailTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}Testar
                  </Button>
                </div>
                {gmailMessage && <div className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${gmailStatus === 'conectado' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{gmailStatus === 'conectado' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}<span>{gmailMessage}</span></div>}
              </CardContent>
            </Card>

            <Separator />
            <h2 className="text-lg font-semibold font-display text-foreground">Notificações</h2>
            <Card className="shadow-card border-0 ring-2 ring-primary/20">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Send className="w-5 h-5 text-primary" /></div>
                  <div><h3 className="font-semibold font-display text-foreground">Canal de Notificação ao Paciente</h3><p className="text-sm text-muted-foreground">Define como o paciente recebe notificações</p></div>
                </div>
                <Select value={configuracoes.canalNotificacao || 'webhook'} onValueChange={v => updateConfiguracoes({ canalNotificacao: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Apenas Webhook</SelectItem>
                    <SelectItem value="gmail">Apenas Gmail SMTP</SelectItem>
                    <SelectItem value="ambos">Ambos (Webhook + Gmail)</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-warning" /></div>
                  <div><h3 className="font-semibold font-display text-foreground">Templates de Mensagem</h3><p className="text-sm text-muted-foreground">Personalizar mensagens automáticas</p></div>
                </div>
                <div className="space-y-3">
                  <div><Label>Confirmação</Label><textarea className="w-full border rounded-lg p-3 text-sm bg-background text-foreground min-h-[80px] border-border" value={templates.confirmacao} onChange={e => updateConfiguracoes({ templates: { ...templates, confirmacao: e.target.value } })} /></div>
                  <div><Label>Lembrete</Label><textarea className="w-full border rounded-lg p-3 text-sm bg-background text-foreground min-h-[80px] border-border" value={templates.lembrete} onChange={e => updateConfiguracoes({ templates: { ...templates, lembrete: e.target.value } })} /></div>
                  <p className="text-xs text-muted-foreground">Variáveis: {'{nome}'}, {'{data}'}, {'{hora}'}, {'{unidade}'}, {'{endereco}'}, {'{profissional}'}, {'{setor}'}</p>
                  <Button className="gradient-primary text-primary-foreground" onClick={() => toast.success('Templates salvos!')}>Salvar Templates</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );


      case 'sistema':
        return <ConfigSistema />;

      case 'integracoes':
        return <ConfigSistemasIntegrados />;

      default:
        return null;
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" /> Configurações do Sistema — Perfil Master
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Todas as mudanças têm efeito imediato em todo o sistema.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 min-h-[70vh]">
        <nav className="lg:w-64 shrink-0">
          <div className="lg:sticky lg:top-4 space-y-1 bg-card rounded-xl border p-2">
            {TABS.filter(t => !t.globalOnly || _isGlobalMaster).map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <main className="flex-1 min-w-0">
          <ScrollArea className="h-full">
            {renderTabContent()}
          </ScrollArea>
        </main>
      </div>
    </div>
  );
};

export default Configuracoes;
