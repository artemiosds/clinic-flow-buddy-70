import React from 'react';
import { Smartphone, Monitor, Repeat, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const opcoes = [
  {
    value: 'whatsapp',
    icon: Smartphone,
    label: 'WhatsApp',
    desc: 'Notificações via mensagens no WhatsApp',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600',
    preview: 'Os pacientes receberão lembretes e confirmações via WhatsApp Business.',
  },
  {
    value: 'sistema',
    icon: Monitor,
    label: 'Sistema',
    desc: 'Notificações dentro do painel',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600',
    preview: 'As notificações aparecerão apenas no painel interno da equipe.',
  },
  {
    value: 'ambos',
    icon: Repeat,
    label: 'Ambos',
    desc: 'WhatsApp + Sistema simultaneamente',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    preview: 'Cobertura máxima: pacientes recebem por WhatsApp e equipe vê no sistema.',
  },
];

export const CanalSelector: React.FC<Props> = ({ value, onChange }) => {
  const selecionado = opcoes.find(o => o.value === value) || opcoes[2];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Define por onde os pacientes receberão notificações e comunicados.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {opcoes.map(op => {
          const Icon = op.icon;
          const ativo = value === op.value;
          return (
            <button
              key={op.value}
              type="button"
              onClick={() => onChange(op.value)}
              className={cn(
                'relative p-4 rounded-xl border-2 text-left transition-all',
                'hover:border-primary/40 hover:shadow-md',
                ativo
                  ? 'border-primary shadow-lg bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border bg-card',
              )}
            >
              {ativo && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </span>
              )}
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-2', op.iconBg)}>
                <Icon className={cn('w-5 h-5', op.iconColor)} />
              </div>
              <p className="text-sm font-semibold text-foreground">{op.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{op.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-muted/40 border border-dashed rounded-lg p-3 text-xs text-muted-foreground flex items-start gap-2">
        <span className="text-primary mt-0.5">▸</span>
        <span><strong className="text-foreground">Preview:</strong> {selecionado.preview}</span>
      </div>
    </div>
  );
};
