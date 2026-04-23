import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/* ─── Types ─────────────────────────────────────────────────────────────────── */

export type TipoProntuario = 'avaliacao' | 'retorno' | 'sessao' | 'urgencia' | 'procedimento';

export interface CondicaoVisibilidade {
  campo: string;
  operador: 'igual' | 'diferente' | 'maior' | 'menor' | 'preenchido';
  valor?: string;
}

export interface CampoEspecialidade {
  id: string;
  key: string;
  label: string;
  tipo: string; // textarea | text | number | slider | select | date | checkbox
  obrigatorio: boolean;
  habilitado: boolean;
  opcoes?: string[];
  isBuiltin: boolean;
  order: number;
  tipos_prontuario?: TipoProntuario[];
  ajuda?: string;
  valor_padrao?: string;
  condicao?: CondicaoVisibilidade;
}

export interface EspecialidadeConfig {
  key: string;
  label: string;
  ativa: boolean;
  profissoes: string[];
  campos: CampoEspecialidade[];
}

/* ─── Defaults ──────────────────────────────────────────────────────────────── */

const DEFAULT_TIPOS: TipoProntuario[] = ['avaliacao', 'retorno'];

const DEFAULT_ESPECIALIDADES: EspecialidadeConfig[] = [
  { key: 'fisioterapia', label: 'Fisioterapia', ativa: true, profissoes: ['fisioterapia'],
    campos: [
      { id: 'f1', key: 'avaliacao_funcional', label: 'Avaliação Funcional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'f2', key: 'adm', label: 'ADM (Amplitude de Movimento)', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'f3', key: 'forca_muscular', label: 'Força Muscular (MRC 0-5)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'f4', key: 'dor_eva', label: 'Dor EVA (0-10)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
      { id: 'f5', key: 'postura_marcha', label: 'Postura e Marcha', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 5 },
    ],
  },
  { key: 'psicologia', label: 'Psicologia', ativa: true, profissoes: ['psicologia'],
    campos: [
      { id: 'p1', key: 'estado_emocional', label: 'Estado Emocional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'p2', key: 'comportamento', label: 'Comportamento Observado', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'p3', key: 'relato_subjetivo', label: 'Relato Subjetivo', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'p4', key: 'risco', label: 'Risco Auto/Heteroagressão', tipo: 'select', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4, opcoes: ['Ausente', 'Baixo', 'Moderado', 'Alto'] },
    ],
  },
  { key: 'fonoaudiologia', label: 'Fonoaudiologia', ativa: true, profissoes: ['fonoaudiologia'],
    campos: [
      { id: 'fo1', key: 'comunicacao', label: 'Avaliação da Comunicação', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'fo2', key: 'linguagem', label: 'Linguagem', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'fo3', key: 'degluticao', label: 'Deglutição', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'fo4', key: 'voz', label: 'Voz', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
    ],
  },
  { key: 'nutricao', label: 'Nutrição', ativa: true, profissoes: ['nutricao'],
    campos: [
      { id: 'n1', key: 'peso', label: 'Peso (kg)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'n2', key: 'altura', label: 'Altura (m)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'n3', key: 'imc', label: 'IMC (calculado)', tipo: 'text', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'n4', key: 'avaliacao_nutricional', label: 'Avaliação Nutricional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
      { id: 'n5', key: 'habitos', label: 'Hábitos Alimentares', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 5 },
      { id: 'n6', key: 'plano_alimentar', label: 'Plano Alimentar', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 6 },
    ],
  },
  { key: 'terapia_ocupacional', label: 'Terapia Ocupacional', ativa: true, profissoes: ['terapia_ocupacional'],
    campos: [
      { id: 'to1', key: 'mif', label: 'MIF (18-126)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'to2', key: 'avd', label: 'AVD', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'to3', key: 'aivd', label: 'AIVD', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'to4', key: 'contexto', label: 'Contexto Ambiental e Social', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
    ],
  },
  { key: 'medicina', label: 'Medicina', ativa: true, profissoes: ['medicina'],
    campos: [
      { id: 'm1', key: 'exame_fisico', label: 'Exame Físico Geral', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'm2', key: 'sistemas', label: 'Sistemas Avaliados', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'm3', key: 'hipotese_cid', label: 'Hipótese Diagnóstica com CID', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'odontologia', label: 'Odontologia', ativa: true, profissoes: ['odontologia'],
    campos: [
      { id: 'o1', key: 'exame_intrabucal', label: 'Exame Intrabucal', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'o2', key: 'queixa_odonto', label: 'Queixa Odontológica', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'o3', key: 'plano_tratamento', label: 'Plano de Tratamento', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'enfermagem', label: 'Enfermagem', ativa: true, profissoes: ['enfermagem'],
    campos: [
      { id: 'e1', key: 'avaliacao_enfermagem', label: 'Avaliação de Enfermagem', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'e2', key: 'cuidados', label: 'Cuidados Realizados', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'e3', key: 'intercorrencias', label: 'Intercorrências', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'servico_social', label: 'Serviço Social', ativa: true, profissoes: ['servico_social', 'assistente_social'],
    campos: [
      { id: 'ss1', key: 'situacao_socioeconomica', label: 'Situação Socioeconômica', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'ss2', key: 'rede_apoio', label: 'Rede de Apoio', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'ss3', key: 'vulnerabilidade', label: 'Vulnerabilidade Social', tipo: 'select', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3, opcoes: ['Baixa', 'Média', 'Alta', 'Extrema'] },
      { id: 'ss4', key: 'encaminhamentos_sociais', label: 'Encaminhamentos Sociais', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
      { id: 'ss5', key: 'parecer_social', label: 'Parecer Social', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 5 },
    ],
  },
  { key: 'cirurgia_geral', label: 'Cirurgia Geral', ativa: true, profissoes: ['cirurgia_geral', 'cirurgiao'],
    campos: [
      { id: 'cg1', key: 'indicacao_cirurgica', label: 'Indicação Cirúrgica', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'cg2', key: 'avaliacao_preop', label: 'Avaliação Pré-operatória', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'cg3', key: 'descricao_procedimento', label: 'Descrição do Procedimento', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'cg4', key: 'orientacoes_posop', label: 'Orientações Pós-operatórias', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
    ],
  },
  { key: 'infectologia', label: 'Infectologia', ativa: true, profissoes: ['infectologia', 'infectologista'],
    campos: [
      { id: 'inf1', key: 'agente_infeccioso', label: 'Agente Infeccioso / Suspeita', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'inf2', key: 'exames_lab', label: 'Exames Laboratoriais', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'inf3', key: 'esquema_terapeutico', label: 'Esquema Terapêutico', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'inf4', key: 'medidas_controle', label: 'Medidas de Controle', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
    ],
  },
];

const CONFIG_KEY = 'config_especialidades_campos';
const LS_KEY = 'config_especialidades';

/* ─── Normalize ─────────────────────────────────────────────────────────────── */

const normalizeCampo = (c: CampoEspecialidade): CampoEspecialidade => ({
  ...c,
  tipos_prontuario: c.tipos_prontuario && c.tipos_prontuario.length > 0 ? c.tipos_prontuario : [...DEFAULT_TIPOS],
});

const normalizeEspecialidade = (e: EspecialidadeConfig): EspecialidadeConfig => ({
  ...e,
  campos: e.campos.map(normalizeCampo),
});

/* ─── Context ───────────────────────────────────────────────────────────────── */

interface EspecialidadesContextValue {
  especialidades: EspecialidadeConfig[];
  loading: boolean;
  /** Update full array and persist to DB + localStorage */
  setEspecialidades: (updated: EspecialidadeConfig[], silent?: boolean) => Promise<void>;
  /** Get specialty config for a given profession key */
  getEspecialidadeByProfissao: (profissao: string) => EspecialidadeConfig | undefined;
  /** Refresh version counter — components can depend on this to re-render */
  version: number;
}

const EspecialidadesContext = createContext<EspecialidadesContextValue>({
  especialidades: DEFAULT_ESPECIALIDADES,
  loading: true,
  setEspecialidades: async () => {},
  getEspecialidadeByProfissao: () => undefined,
  version: 0,
});

export const useEspecialidades = () => useContext(EspecialidadesContext);

/* ─── Provider ──────────────────────────────────────────────────────────────── */

export const EspecialidadesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [especialidades, setEspState] = useState<EspecialidadeConfig[]>(() => {
    // Load from localStorage immediately for instant UI
    try {
      const cached = localStorage.getItem(LS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as EspecialidadeConfig[];
        return parsed.map(normalizeEspecialidade);
      }
    } catch {}
    return DEFAULT_ESPECIALIDADES;
  });
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const savingRef = useRef(false);

  const loadFromDB = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'default')
        .maybeSingle();
      const cfg = data?.configuracoes as any;
      if (cfg?.[CONFIG_KEY]) {
        const stored = (cfg[CONFIG_KEY] as EspecialidadeConfig[]).map(normalizeEspecialidade);
        setEspState(stored);
        setVersion(v => v + 1);
        try { localStorage.setItem(LS_KEY, JSON.stringify(stored)); } catch {}
      }
    } catch (err) {
      console.error('Failed to load especialidades config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + Realtime subscription
  useEffect(() => {
    loadFromDB();
    const channel = supabase
      .channel('especialidades_context_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_config', filter: 'id=eq.default' },
        () => {
          if (!savingRef.current) loadFromDB();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadFromDB]);

  const setEspecialidades = useCallback(async (updated: EspecialidadeConfig[], silent = false) => {
    // Optimistic update
    setEspState(updated);
    setVersion(v => v + 1);
    try { localStorage.setItem(LS_KEY, JSON.stringify(updated)); } catch {}

    // Persist to DB
    savingRef.current = true;
    try {
      const { data: existing } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'default')
        .maybeSingle();
      const existingConfig = (existing?.configuracoes as any) || {};
      await supabase.from('system_config').upsert({
        id: 'default',
        configuracoes: { ...existingConfig, [CONFIG_KEY]: updated },
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to save especialidades config:', err);
    } finally {
      savingRef.current = false;
    }
  }, []);

  const getEspecialidadeByProfissao = useCallback((profissao: string) => {
    const p = profissao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
    return especialidades.find(e => e.ativa && (e.profissoes.includes(p) || e.key === p));
  }, [especialidades]);

  return (
    <EspecialidadesContext.Provider value={{ especialidades, loading, setEspecialidades, getEspecialidadeByProfissao, version }}>
      {children}
    </EspecialidadesContext.Provider>
  );
};

export { DEFAULT_ESPECIALIDADES, DEFAULT_TIPOS, CONFIG_KEY };
