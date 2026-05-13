import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useConfiguracao } from '@/hooks/useConfiguracao';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Search, RotateCcw, FileDown, FileUp, CheckCircle2, AlertCircle, Activity, ChevronRight } from 'lucide-react';
import { ConfigSyncIndicator } from '@/components/ConfigSyncIndicator';
import { toast } from 'sonner';
import { InstituicaoSection } from './sistema/InstituicaoSection';
import { NotificacoesSection } from './sistema/NotificacoesSection';
import { BackupSection } from './sistema/BackupSection';
import { AparenciaSection } from './sistema/AparenciaSection';
import { LgpdSection } from './sistema/LgpdSection';

const CONFIG_KEY = 'config_sistema';
import { useNavigate } from 'react-router-dom';

export interface SistemaConfig {
  instituicao: { nome: string; cer: string; cnpj: string; endereco: string; telefone: string; email: string; logoUrl: string };
  notificacoes: {
    notificarChegada: boolean; alertarFimCiclo: boolean; alertarPtsVencer: boolean;
    notificarTriagemPendente: boolean; resumoDiario: boolean; relatorioSemanal: boolean;
    canal: string;
  };
  aparencia: { tema: string; corPrimaria: string; fonte: string; tamanhoFonte: string };
  conformidade: { lgpdTexto: string; exibirAvisoLgpd: boolean; retencaoDados: number; anonimizarApos: number };
  backup: { autoBackup: boolean; agendamento: 'diario' | 'semanal' | 'mensal'; ultimoBackup: string | null };
}

const DEFAULT: SistemaConfig = {
  instituicao: {
    nome: 'Secretaria Municipal de Saúde de Oriximiná',
    cer: 'CAPS II',
    cnpj: '', endereco: '', telefone: '', email: '', logoUrl: '',
  },
  notificacoes: {
    notificarChegada: true, alertarFimCiclo: true, alertarPtsVencer: true,
    notificarTriagemPendente: true, resumoDiario: false, relatorioSemanal: false,
    canal: 'ambos',
  },
  aparencia: { tema: 'sistema', corPrimaria: '#1B3A5C', fonte: 'Inter', tamanhoFonte: 'medio' },
  conformidade: {
    lgpdTexto: 'Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.',
    exibirAvisoLgpd: true, retencaoDados: 20, anonimizarApos: 25,
  },
  backup: { autoBackup: false, agendamento: 'semanal', ultimoBackup: null },
};

const SECTIONS = [
  { id: 'instituicao', label: 'Instituição', kw: ['nome', 'cnpj', 'logo', 'endereco', 'telefone', 'email', 'caps'] },
  { id: 'notificacoes', label: 'Notificações', kw: ['notificacao', 'canal', 'whatsapp', 'email', 'chegada', 'triagem', 'pts', 'ciclo', 'resumo'] },
  { id: 'backup', label: 'Backup', kw: ['backup', 'exportar', 'json', 'csv', 'pdf', 'restaurar', 'dados'] },
  { id: 'aparencia', label: 'Aparência', kw: ['tema', 'cor', 'fonte', 'aparencia', 'claro', 'escuro'] },
  { id: 'lgpd', label: 'LGPD', kw: ['lgpd', 'privacidade', 'retencao', 'anonimizar', 'conformidade', 'termo'] },
  { id: 'monitoramento', label: 'Monitoramento', kw: ['status', 'saude', 'banco', 'storage', 'vps', 'logs', 'limpeza'] },
];

const ConfigSistema: React.FC = () => {
  const navigate = useNavigate();
  const { atualizarConfiguracao, configuracoes, loading: hookLoading } = useConfiguracao();
  const [config, setConfig] = useState<SistemaConfig>(DEFAULT);
  const [savedConfig, setSavedConfig] = useState<SistemaConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- carregar ---------- */
  useEffect(() => {
    if (!hookLoading) {
      const cfg = configuracoes[CONFIG_KEY];
      if (cfg) {
        const merged = {
          ...DEFAULT,
          ...cfg,
          backup: { ...DEFAULT.backup, ...(cfg.backup || {}) },
        };
        setConfig(merged);
        setSavedConfig(merged);
      }
      setLoading(false);
    }
  }, [hookLoading, configuracoes]);

  /* ---------- detectar mudanças ---------- */
  const isDirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig],
  );

  /* ---------- save ---------- */
  const persist = useCallback(async (cfg: SistemaConfig) => {
    await atualizarConfiguracao(CONFIG_KEY, cfg, { auditAcao: 'ALTERAR_CONFIG_SISTEMA', silent: true });
    setSavedConfig(cfg);
  }, [atualizarConfiguracao]);

  /* ---------- update with debounced auto-save ---------- */
  const update = useCallback((partial: Partial<SistemaConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...partial };
      // Debounced auto-save (2s)
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(() => { void persist(next); }, 2000);
      return next;
    });
  }, [persist]);

  const saveNow = useCallback(async () => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    await persist(config);
    toast.success('Todas as alterações foram salvas');
  }, [config, persist]);

  const discard = useCallback(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    setConfig(savedConfig);
    toast.info('Alterações descartadas');
  }, [savedConfig]);

  const restoreDefaults = useCallback(() => {
    if (!confirm('Restaurar todas as configurações para os padrões? Esta ação não pode ser desfeita até salvar.')) return;
    setConfig(DEFAULT);
    toast.warning('Padrões carregados — clique em "Salvar tudo" para confirmar');
  }, []);

  const exportConfig = useCallback(() => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `config_sistema_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('Configurações exportadas');
  }, [config]);

  const importConfig = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result));
        setConfig({ ...DEFAULT, ...parsed, backup: { ...DEFAULT.backup, ...(parsed.backup || {}) } });
        toast.success('Configurações importadas — revise e salve');
      } catch {
        toast.error('Arquivo JSON inválido');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  /* ---------- search filter ---------- */
  const visibleSections = useMemo(() => {
    if (!search.trim()) return SECTIONS.map(s => s.id);
    const q = search.toLowerCase().trim();
    return SECTIONS.filter(s => s.label.toLowerCase().includes(q) || s.kw.some(k => k.includes(q))).map(s => s.id);
  }, [search]);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Top toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar configuração..."
            className="pl-9 h-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfigSyncIndicator />
          <Button variant="outline" size="sm" onClick={restoreDefaults}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Padrões
          </Button>
          <Button variant="outline" size="sm" onClick={exportConfig}>
            <FileDown className="w-3.5 h-3.5 mr-1" /> Exportar
          </Button>
          <label>
            <input type="file" accept="application/json" onChange={importConfig} className="hidden" />
            <Button asChild variant="outline" size="sm" className="cursor-pointer">
              <span><FileUp className="w-3.5 h-3.5 mr-1" /> Importar</span>
            </Button>
          </label>
        </div>
      </div>

      {/* Sections */}
      {visibleSections.includes('instituicao') && (
        <InstituicaoSection value={config.instituicao} onChange={v => update({ instituicao: v })} />
      )}
      {visibleSections.includes('notificacoes') && (
        <NotificacoesSection value={config.notificacoes} onChange={v => update({ notificacoes: v })} />
      )}
      {visibleSections.includes('backup') && (
        <BackupSection value={config.backup} onChange={v => update({ backup: v })} />
      )}
      {visibleSections.includes('aparencia') && (
        <AparenciaSection value={config.aparencia} onChange={v => update({ aparencia: v })} />
      )}
      {visibleSections.includes('lgpd') && (
        <LgpdSection value={config.conformidade} onChange={v => update({ conformidade: v })} />
      )}

      {visibleSections.includes('monitoramento') && (
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Monitoramento do Sistema</h3>
                  <p className="text-sm text-muted-foreground">Acompanhe a saúde do banco de dados, storage e execute limpezas seguras.</p>
                </div>
              </div>
              <Button onClick={() => navigate('/painel/monitoramento')}>
                Abrir Painel <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {visibleSections.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhuma seção encontrada para "<strong>{search}</strong>"
        </div>
      )}

      {/* Sticky save bar */}
      {isDirty && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-card shadow-2xl">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-foreground">Você tem alterações não salvas</span>
            <Button variant="ghost" size="sm" onClick={discard}>Descartar</Button>
            <Button size="sm" onClick={saveNow}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Salvar tudo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigSistema;
