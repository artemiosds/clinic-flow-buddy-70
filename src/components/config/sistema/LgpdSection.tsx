import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, AlertTriangle, Eye, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConformidadeConfig {
  lgpdTexto: string;
  exibirAvisoLgpd: boolean;
  retencaoDados: number;
  anonimizarApos: number;
}

interface Props {
  value: ConformidadeConfig;
  onChange: (v: ConformidadeConfig) => void;
}

const CFM_PADRAO = 20;
const MAX_ANOS = 50;

export const LgpdSection: React.FC<Props> = ({ value, onChange }) => {
  const [previewOpen, setPreviewOpen] = useState(false);

  const retencaoDias = value.retencaoDados * 365;
  const ultrapassaCfm = value.retencaoDados > CFM_PADRAO;
  const pctRetencao = (value.retencaoDados / MAX_ANOS) * 100;
  const charCount = value.lgpdTexto.length;

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-semibold font-display text-foreground">Termos e Conformidade (LGPD)</h3>
        </div>

        <div className="space-y-5">
          {/* Toggle aviso */}
          <div className={cn(
            'flex items-center justify-between p-4 rounded-xl border-2 transition-all',
            value.exibirAvisoLgpd ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20',
          )}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Exibir aviso LGPD no primeiro acesso</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pacientes e usuários verão o consentimento ao entrar pela primeira vez.
                </p>
              </div>
            </div>
            <Switch
              checked={value.exibirAvisoLgpd}
              onCheckedChange={v => onChange({ ...value, exibirAvisoLgpd: v })}
            />
          </div>

          {/* Sliders de retenção */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Retenção de Dados
                </Label>
                {ultrapassaCfm && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
                    <AlertTriangle className="w-3 h-3" /> Acima do padrão CFM
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={MAX_ANOS}
                  value={value.retencaoDados}
                  onChange={e => onChange({ ...value, retencaoDados: Math.min(MAX_ANOS, Math.max(1, parseInt(e.target.value) || 1)) })}
                  className="h-9 w-20 text-center font-semibold"
                />
                <span className="text-sm text-muted-foreground">anos</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  ≈ {retencaoDias.toLocaleString('pt-BR')} dias
                </span>
              </div>
              <Slider
                value={[value.retencaoDados]}
                min={1}
                max={MAX_ANOS}
                step={1}
                onValueChange={([v]) => onChange({ ...value, retencaoDados: v })}
              />
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full transition-all', ultrapassaCfm ? 'bg-amber-500' : 'bg-primary')}
                  style={{ width: `${pctRetencao}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Padrão CFM: 20 anos · Limite máximo: {MAX_ANOS} anos
              </p>
            </div>

            <div className="p-4 rounded-xl border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Anonimizar Após Inatividade
                </Label>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                  <Info className="w-3 h-3" /> Recomendado: 25 anos
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={MAX_ANOS}
                  value={value.anonimizarApos}
                  onChange={e => onChange({ ...value, anonimizarApos: Math.min(MAX_ANOS, Math.max(1, parseInt(e.target.value) || 1)) })}
                  className="h-9 w-20 text-center font-semibold"
                />
                <span className="text-sm text-muted-foreground">anos</span>
              </div>
              <Slider
                value={[value.anonimizarApos]}
                min={1}
                max={MAX_ANOS}
                step={1}
                onValueChange={([v]) => onChange({ ...value, anonimizarApos: v })}
              />
              <p className="text-[10px] text-muted-foreground">
                Após este período sem atividade, os dados do paciente serão anonimizados.
              </p>
            </div>
          </div>

          {/* Editor política */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Texto da Política de Privacidade</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                className="h-7 text-xs"
              >
                <Eye className="w-3.5 h-3.5 mr-1" /> Visualizar como paciente
              </Button>
            </div>
            <Textarea
              value={value.lgpdTexto}
              onChange={e => onChange({ ...value, lgpdTexto: e.target.value })}
              className="min-h-[140px] font-mono text-xs"
              maxLength={5000}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-muted-foreground">
                Use linguagem clara e acessível ao paciente.
              </p>
              <p className={cn('text-[10px] font-mono', charCount > 4500 ? 'text-amber-600' : 'text-muted-foreground')}>
                {charCount.toLocaleString('pt-BR')} / 5.000
              </p>
            </div>
          </div>
        </div>

        {/* Preview modal */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" /> Aviso de Privacidade — Visão do Paciente
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/20 p-4 max-h-[400px] overflow-y-auto">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {value.lgpdTexto || 'Defina o texto da política acima.'}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm">Recusar</Button>
                <Button size="sm">Aceito os termos</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
