import React, { useMemo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeProfissao } from "@/hooks/useProntuarioConfig";
import { useEspecialidades, type CampoEspecialidade, type TipoProntuario, type CondicaoVisibilidade } from "@/contexts/EspecialidadesContext";

/* ─── Key aliases for backward compat with old saved data ─────────────────── */

const KEY_ALIASES: Record<string, string> = {
  forca_muscular: 'forca_mrc',
  comportamento: 'comportamento_obs',
  risco: 'risco_agressao',
  peso: 'peso_kg',
  altura: 'altura_m',
  habitos: 'habitos_alimentares',
  mif: 'mif_score',
  contexto: 'contexto_ambiental',
  exame_fisico: 'exame_fisico_geral',
  sistemas: 'sistemas_avaliados',
  plano_tratamento: 'plano_tratamento_odonto',
  avaliacao_enfermagem: 'avaliacao_enf',
  cuidados: 'cuidados_realizados',
  intercorrencias: 'intercorrencias_enf',
  queixa_odonto: 'queixa_odonto',
};

const aliasFor = (k: string) => KEY_ALIASES[k] || k;

/* ─── Specialty icons ─────────────────────────────────────────────────────── */

const SPECIALTY_ICONS: Record<string, string> = {
  fisioterapia: '🦴', psicologia: '🧠', fonoaudiologia: '🗣️', nutricao: '🥗',
  terapia_ocupacional: '🤲', medicina: '⚕️', odontologia: '🦷', enfermagem: '💉',
  servico_social: '🤝', assistente_social: '🤝', cirurgia_geral: '🔪',
  cirurgiao: '🔪', infectologia: '🦠', infectologista: '🦠',
};

/* ─── IMC helpers (Nutrição) ──────────────────────────────────────────────── */

const classificarIMC = (imc: number) => {
  if (imc < 18.5) return { label: "Abaixo do peso", color: "text-warning" };
  if (imc < 25) return { label: "Normal", color: "text-success" };
  if (imc < 30) return { label: "Sobrepeso", color: "text-warning" };
  if (imc < 35) return { label: "Obesidade I", color: "text-destructive" };
  if (imc < 40) return { label: "Obesidade II", color: "text-destructive" };
  return { label: "Obesidade III", color: "text-destructive" };
};

const evaColor = (val: number) => {
  if (val <= 3) return "bg-green-500";
  if (val <= 6) return "bg-yellow-500";
  return "bg-red-500";
};

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface CamposEspecialidadeProps {
  profissao: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  profissionalId?: string;
  tipoProntuario?: TipoProntuario;
}

interface ProfConfig {
  campos_especialidade?: Record<string, { visivel: boolean; favorito: boolean; ordem: number }>;
  campos_especialidade_custom?: Array<{
    id: string; key: string; label: string; tipo: string;
    opcoes?: string[]; order: number;
  }>;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

const CamposEspecialidade: React.FC<CamposEspecialidadeProps> = ({
  profissao, values, onChange, profissionalId, tipoProntuario,
}) => {
  const prof = normalizeProfissao(profissao);
  const { getEspecialidadeByProfissao, version } = useEspecialidades();
  const [profConfig, setProfConfig] = useState<ProfConfig | null>(null);

  // Load professional config for custom fields
  useEffect(() => {
    if (!profissionalId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('prontuario_config')
        .select('config')
        .eq('profissional_id', profissionalId)
        .limit(1);
      if (!cancelled && data?.[0]?.config) {
        setProfConfig(data[0].config as ProfConfig);
      }
    })();
    return () => { cancelled = true; };
  }, [profissionalId]);

  // Get specialty from context (re-renders on version change)
  const masterEsp = useMemo(() => {
    return getEspecialidadeByProfissao(prof);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prof, version, getEspecialidadeByProfissao]);

  if (!masterEsp) return null;

  const icon = SPECIALTY_ICONS[prof] || '📋';
  const title = `Avaliação — ${masterEsp.label}`;

  const v = (key: string) => values[`esp_${key}`] || "";
  const set = (key: string, val: string) => onChange(`esp_${key}`, val);

  /* ─── Visibility logic ──────────────────────────────────────────────────── */

  const condicaoSatisfeita = (cond?: CondicaoVisibilidade): boolean => {
    if (!cond) return true;
    const otherKey = aliasFor(cond.campo);
    const raw = values[`esp_${otherKey}`] ?? '';
    const val = String(raw).trim();
    switch (cond.operador) {
      case 'preenchido': return val.length > 0;
      case 'igual': return val === (cond.valor ?? '');
      case 'diferente': return val !== (cond.valor ?? '');
      case 'maior': return parseFloat(val) > parseFloat(cond.valor ?? '0');
      case 'menor': return parseFloat(val) < parseFloat(cond.valor ?? '0');
      default: return true;
    }
  };

  const isFieldVisible = (campo: CampoEspecialidade) => {
    if (!campo.habilitado) return false;
    const fieldKey = aliasFor(campo.key);

    // Professional preference override
    if (profConfig?.campos_especialidade) {
      const cfg = profConfig.campos_especialidade[fieldKey];
      if (cfg && cfg.visivel === false) return false;
    }

    // Tipo prontuario filter
    const tipos = campo.tipos_prontuario && campo.tipos_prontuario.length > 0
      ? campo.tipos_prontuario
      : ['avaliacao', 'retorno'] as TipoProntuario[];
    if (tipoProntuario && !tipos.includes(tipoProntuario)) return false;

    // Conditional visibility
    if (!condicaoSatisfeita(campo.condicao)) return false;

    return true;
  };

  /* ─── Visible fields sorted by order ────────────────────────────────────── */

  const visibleFields = useMemo(() => {
    return [...masterEsp.campos]
      .sort((a, b) => a.order - b.order)
      .filter(isFieldVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterEsp, tipoProntuario, profConfig, values, version]);

  // Professional custom fields
  const profCustomFields = profConfig?.campos_especialidade_custom || [];

  if (visibleFields.length === 0 && profCustomFields.length === 0) return null;

  /* ─── Special rendering for known field types ───────────────────────────── */

  const renderSpecialField = (campo: CampoEspecialidade): React.ReactNode | null => {
    const fieldKey = aliasFor(campo.key);

    // Slider for EVA (dor)
    if (campo.key === 'dor_eva' || fieldKey === 'dor_eva') {
      const eva = parseInt(v(fieldKey) || "0");
      return (
        <div key={campo.id}>
          <Label className="flex items-center gap-2">
            {campo.label}: <Badge className={`${evaColor(eva)} text-white`}>{eva}</Badge>
          </Label>
          <Slider min={0} max={10} step={1} value={[eva]} onValueChange={([val]) => set(fieldKey, String(val))} className="mt-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span className="text-green-600">0 (Sem dor)</span><span className="text-yellow-600">5</span><span className="text-red-600">10 (Máxima)</span>
          </div>
        </div>
      );
    }

    // Slider for MRC
    if (campo.key === 'forca_muscular' || fieldKey === 'forca_mrc') {
      const mrc = parseInt(v(fieldKey) || "0");
      return (
        <div key={campo.id}>
          <Label>{campo.label}: <strong>{mrc}</strong></Label>
          <Slider min={0} max={5} step={1} value={[mrc]} onValueChange={([val]) => set(fieldKey, String(val))} className="mt-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0 (Ausente)</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5 (Normal)</span>
          </div>
        </div>
      );
    }

    // Slider for MIF
    if (campo.key === 'mif' || fieldKey === 'mif_score') {
      const mif = parseInt(v(fieldKey) || "18");
      return (
        <div key={campo.id}>
          <Label>{campo.label}: <strong>{mif}</strong></Label>
          <Slider min={18} max={126} step={1} value={[mif]} onValueChange={([val]) => set(fieldKey, String(val))} className="mt-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>18 (Dependência total)</span><span>126 (Independência)</span>
          </div>
        </div>
      );
    }

    // IMC auto-calculation
    if (campo.key === 'imc') {
      const peso = parseFloat(v('peso_kg') || v('peso') || "0");
      const altura = parseFloat(v('altura_m') || v('altura') || "0");
      const imc = peso > 0 && altura > 0 ? peso / (altura * altura) : 0;
      const imcInfo = imc > 0 ? classificarIMC(imc) : null;
      return (
        <div key={campo.id}>
          <Label>{campo.label}</Label>
          <div className="flex items-center gap-2 h-8">
            {imc > 0 ? (
              <>
                <span className="font-bold">{imc.toFixed(1)}</span>
                <Badge variant="outline" className={`text-xs ${imcInfo?.color}`}>{imcInfo?.label}</Badge>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        </div>
      );
    }

    // Risco alto warning
    if ((campo.key === 'risco' || fieldKey === 'risco_agressao') && campo.tipo === 'select') {
      return (
        <div key={campo.id}>
          <Label>{campo.label}</Label>
          <Select value={v(fieldKey) || campo.valor_padrao || ''} onValueChange={val => set(fieldKey, val)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {(campo.opcoes || []).map(op => <SelectItem key={op} value={op.toLowerCase()}>{op}</SelectItem>)}
            </SelectContent>
          </Select>
          {v(fieldKey) === 'alto' && (
            <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive font-medium">
              ⚠️ RISCO ALTO IDENTIFICADO — Acionar protocolo de segurança conforme norma institucional.
            </div>
          )}
        </div>
      );
    }

    return null; // Not a special field
  };

  /* ─── Generic field renderer ────────────────────────────────────────────── */

  const renderGenericField = (campo: CampoEspecialidade) => {
    const fieldKey = aliasFor(campo.key);
    const val = v(fieldKey);

    return (
      <div key={campo.id}>
        <Label className="flex items-center gap-2">
          {campo.label}
          {campo.obrigatorio && <span className="text-destructive">*</span>}
          {!campo.isBuiltin && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 text-primary/70 border-primary/30">
              Personalizado
            </Badge>
          )}
        </Label>

        {campo.tipo === 'textarea' && (
          <Textarea rows={2} value={val || campo.valor_padrao || ''} onChange={e => set(fieldKey, e.target.value)} />
        )}
        {campo.tipo === 'text' && (
          <Input value={val || campo.valor_padrao || ''} onChange={e => set(fieldKey, e.target.value)} />
        )}
        {campo.tipo === 'number' && (
          <Input type="number" step="any" value={val || campo.valor_padrao || ''} onChange={e => set(fieldKey, e.target.value)} className="h-8" />
        )}
        {campo.tipo === 'date' && (
          <Input type="date" value={val || campo.valor_padrao || ''} onChange={e => set(fieldKey, e.target.value)} className="h-8" />
        )}
        {campo.tipo === 'checkbox' && (
          <div className="flex items-center gap-2 mt-1">
            <Checkbox checked={val === 'true'} onCheckedChange={c => set(fieldKey, c ? 'true' : 'false')} />
            <span className="text-xs text-muted-foreground">Marcar</span>
          </div>
        )}
        {campo.tipo === 'select' && campo.opcoes && (
          <Select value={val || campo.valor_padrao || ''} onValueChange={v => set(fieldKey, v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {campo.opcoes.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {campo.tipo === 'slider' && (
          <div>
            <Slider min={0} max={10} step={1} value={[parseInt(val || campo.valor_padrao || "0")]} onValueChange={([v]) => set(fieldKey, String(v))} className="mt-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>0</span><span>10</span></div>
          </div>
        )}

        {campo.ajuda && <p className="text-[11px] text-muted-foreground italic mt-1">💡 {campo.ajuda}</p>}
      </div>
    );
  };

  /* ─── Render each visible field ─────────────────────────────────────────── */

  const renderField = (campo: CampoEspecialidade) => {
    const special = renderSpecialField(campo);
    if (special) return special;
    return renderGenericField(campo);
  };

  return (
    <Card className="border shadow-sm border-primary/20">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-primary" />
          <span>{icon} {title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="space-y-3">
          {visibleFields.map(renderField)}
        </div>

        {/* Professional custom fields */}
        {profCustomFields.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-border/40 mt-3">
            {profCustomFields.map(campo => {
              const fieldKey = campo.key;
              return (
                <div key={campo.key}>
                  <Label className="flex items-center gap-2">
                    {campo.label}
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-400 border-blue-500/30">Personalizado</Badge>
                  </Label>
                  {campo.tipo === 'textarea' && <Textarea rows={2} value={v(fieldKey)} onChange={e => set(fieldKey, e.target.value)} />}
                  {campo.tipo === 'text' && <Input value={v(fieldKey)} onChange={e => set(fieldKey, e.target.value)} />}
                  {campo.tipo === 'number' && <Input type="number" value={v(fieldKey)} onChange={e => set(fieldKey, e.target.value)} className="h-8" />}
                  {campo.tipo === 'select' && campo.opcoes && (
                    <Select value={v(fieldKey) || ''} onValueChange={val => set(fieldKey, val)}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{campo.opcoes.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {campo.tipo === 'slider' && (
                    <div>
                      <Slider min={0} max={10} step={1} value={[parseInt(v(fieldKey) || "0")]} onValueChange={([val]) => set(fieldKey, String(val))} className="mt-2" />
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>0</span><span>10</span></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CamposEspecialidade;
