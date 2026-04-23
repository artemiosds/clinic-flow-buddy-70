import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Palette, Sun, Moon, Monitor, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AparenciaConfig {
  tema: string;
  corPrimaria: string;
  fonte: string;
  tamanhoFonte: string;
}

interface Props {
  value: AparenciaConfig;
  onChange: (v: AparenciaConfig) => void;
}

const temas = [
  { value: 'claro', label: 'Claro', icon: Sun, bg: 'bg-white border-slate-200', textColor: 'text-slate-900' },
  { value: 'escuro', label: 'Escuro', icon: Moon, bg: 'bg-slate-900 border-slate-700', textColor: 'text-slate-100' },
  { value: 'sistema', label: 'Sistema', icon: Monitor, bg: 'bg-gradient-to-br from-white to-slate-900 border-slate-300', textColor: 'text-slate-700' },
];

const paletaSugerida = [
  { hex: '#1B3A5C', nome: 'Azul Saúde' },
  { hex: '#2A6F97', nome: 'Azul Clínico' },
  { hex: '#0F766E', nome: 'Verde Médico' },
  { hex: '#7C3AED', nome: 'Roxo Premium' },
  { hex: '#DC2626', nome: 'Vermelho Urgência' },
  { hex: '#EA580C', nome: 'Laranja Alerta' },
];

const tamanhos = [
  { value: 'pequeno', label: 'Pequeno', pct: 80, fontSize: '12px' },
  { value: 'medio', label: 'Médio', pct: 100, fontSize: '14px' },
  { value: 'grande', label: 'Grande', pct: 120, fontSize: '17px' },
];

export const AparenciaSection: React.FC<Props> = ({ value, onChange }) => {
  const tamanhoIdx = tamanhos.findIndex(t => t.value === value.tamanhoFonte);
  const tamanhoAtual = tamanhos[tamanhoIdx >= 0 ? tamanhoIdx : 1];

  // Convert hex to RGB for display
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-primary" />
          <h3 className="font-semibold font-display text-foreground">Aparência</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Coluna esquerda: controles */}
          <div className="lg:col-span-2 space-y-5">
            {/* Tema */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tema</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {temas.map(t => {
                  const Icon = t.icon;
                  const ativo = value.tema === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => onChange({ ...value, tema: t.value })}
                      className={cn(
                        'relative rounded-xl border-2 p-3 transition-all',
                        ativo ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-border hover:border-primary/40',
                      )}
                    >
                      {ativo && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                      <div className={cn('h-12 rounded-lg border flex items-center justify-center mb-2', t.bg)}>
                        <Icon className={cn('w-5 h-5', t.textColor)} />
                      </div>
                      <p className="text-xs font-medium text-foreground">{t.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cor primária */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cor Primária Institucional</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="color"
                  value={value.corPrimaria}
                  onChange={e => onChange({ ...value, corPrimaria: e.target.value })}
                  className="w-14 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={value.corPrimaria}
                  onChange={e => onChange({ ...value, corPrimaria: e.target.value })}
                  className="h-10 font-mono text-sm uppercase"
                  maxLength={7}
                />
                <div className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                  RGB({hexToRgb(value.corPrimaria)})
                </div>
              </div>
              <div className="grid grid-cols-6 gap-1.5 mt-2">
                {paletaSugerida.map(p => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => onChange({ ...value, corPrimaria: p.hex })}
                    title={p.nome}
                    className={cn(
                      'h-8 rounded-md border-2 transition-all hover:scale-110',
                      value.corPrimaria.toUpperCase() === p.hex.toUpperCase() ? 'border-foreground shadow-md' : 'border-transparent',
                    )}
                    style={{ backgroundColor: p.hex }}
                  />
                ))}
              </div>
            </div>

            {/* Tamanho da fonte */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tamanho da Fonte — <span className="text-primary">{tamanhoAtual.pct}%</span>
              </Label>
              <div className="mt-2 px-1">
                <Slider
                  value={[tamanhoIdx >= 0 ? tamanhoIdx : 1]}
                  min={0}
                  max={2}
                  step={1}
                  onValueChange={([v]) => onChange({ ...value, tamanhoFonte: tamanhos[v].value })}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  {tamanhos.map(t => (
                    <span key={t.value} className={cn(value.tamanhoFonte === t.value && 'text-primary font-semibold')}>
                      {t.label} ({t.pct}%)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Coluna direita: preview */}
          <div className="lg:col-span-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pré-visualização</Label>
            <div className="mt-2 rounded-xl border-2 border-dashed border-border overflow-hidden bg-card">
              <div
                className="px-3 py-2 text-white text-xs font-semibold flex items-center justify-between"
                style={{ backgroundColor: value.corPrimaria }}
              >
                <span>Painel SMS</span>
                <span className="opacity-70">v2.0</span>
              </div>
              <div className="p-3 space-y-2" style={{ fontSize: tamanhoAtual.fontSize }}>
                <p className="font-semibold text-foreground" style={{ color: value.corPrimaria }}>
                  Bem-vindo
                </p>
                <p className="text-muted-foreground leading-snug">
                  Visualização em tempo real do tema, cor e tamanho de fonte aplicados.
                </p>
                <button
                  type="button"
                  className="w-full text-white py-1.5 px-3 rounded-md font-medium"
                  style={{ backgroundColor: value.corPrimaria, fontSize: tamanhoAtual.fontSize }}
                >
                  Botão de ação
                </button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
