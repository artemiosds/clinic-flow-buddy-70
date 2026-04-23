import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CONFIG_KEY = 'config_prontuario_tipos';

export interface CampoConfig {
  id: string;
  key: string;
  label: string;
  tipo: string; // texto | textarea | numero | select | checkbox | data
  obrigatorio: boolean;
  habilitado: boolean;
  opcoes?: string[];
  isBuiltin: boolean;
  order: number;
  tiposProntuario: string[];
}

export interface ProntuarioTiposConfig {
  campos: CampoConfig[];
  soapLabels: { subjetivo: string; objetivo: string; avaliacao: string; plano: string };
  alertas: any[];
  tempoLimiteEdicao: number;
  exigirSenhaAoSalvar: boolean;
}

/** Maps prontuário tipo_registro to ConfigProntuario tipo key */
const TIPO_MAP: Record<string, string> = {
  avaliacao_inicial: 'primeira_consulta',
  retorno: 'retorno',
  sessao: 'sessao',
  urgencia: 'urgencia',
  procedimento: 'procedimento',
  // Legacy mappings
  consulta: 'primeira_consulta',
  reavaliacao: 'retorno',
};

const DEFAULT_SOAP_LABELS = { subjetivo: 'Subjetivo', objetivo: 'Objetivo', avaliacao: 'Avaliação', plano: 'Plano' };

export function useProntuarioTiposConfig() {
  const [config, setConfig] = useState<ProntuarioTiposConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('system_config')
          .select('configuracoes')
          .eq('id', 'default')
          .maybeSingle();
        const cfg = (data?.configuracoes as any)?.[CONFIG_KEY];
        if (cfg?.campos) {
          setConfig(cfg);
        }
      } catch { /* use null = no custom config */ }
      setLoading(false);
    })();
  }, []);

  /** Get enabled + ordered campos for a given tipo_registro */
  const getCamposForTipo = useCallback((tipoRegistro: string): CampoConfig[] => {
    if (!config?.campos) return [];
    const configKey = TIPO_MAP[tipoRegistro] || tipoRegistro;
    return config.campos
      .filter(c => c.habilitado && c.tiposProntuario.includes(configKey))
      .sort((a, b) => a.order - b.order);
  }, [config]);

  const soapLabels = config?.soapLabels || DEFAULT_SOAP_LABELS;

  return { config, loading, getCamposForTipo, soapLabels };
}
