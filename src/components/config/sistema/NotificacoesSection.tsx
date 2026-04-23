import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Bell, UserCheck, Clock, FileText, ClipboardList, Mail, BarChart3 } from 'lucide-react';
import { CanalSelector } from './CanalSelector';
import { cn } from '@/lib/utils';

interface NotificacoesConfig {
  notificarChegada: boolean;
  alertarFimCiclo: boolean;
  alertarPtsVencer: boolean;
  notificarTriagemPendente: boolean;
  resumoDiario: boolean;
  relatorioSemanal: boolean;
  canal: string;
}

interface Props {
  value: NotificacoesConfig;
  onChange: (v: NotificacoesConfig) => void;
}

const items = [
  { key: 'notificarChegada', icon: UserCheck, label: 'Chegada do paciente', desc: 'Avisa o profissional quando o paciente é confirmado na recepção', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  { key: 'alertarFimCiclo', icon: Clock, label: 'Fim de ciclo de tratamento', desc: 'Alerta quando a sessão está próxima do fim do ciclo previsto', color: 'text-amber-600', bg: 'bg-amber-500/10' },
  { key: 'alertarPtsVencer', icon: FileText, label: 'PTS próximo do vencimento', desc: 'Avisa quando o Projeto Terapêutico Singular precisa ser revisado', color: 'text-purple-600', bg: 'bg-purple-500/10' },
  { key: 'notificarTriagemPendente', icon: ClipboardList, label: 'Triagem pendente', desc: 'Notifica antes do atendimento se houver triagem em aberto', color: 'text-blue-600', bg: 'bg-blue-500/10' },
  { key: 'resumoDiario', icon: Mail, label: 'Resumo diário por e-mail', desc: 'Envia diariamente um resumo dos atendimentos realizados', color: 'text-indigo-600', bg: 'bg-indigo-500/10' },
  { key: 'relatorioSemanal', icon: BarChart3, label: 'Relatório semanal automático', desc: 'Envia toda segunda-feira um relatório consolidado da semana anterior', color: 'text-rose-600', bg: 'bg-rose-500/10' },
] as const;

export const NotificacoesSection: React.FC<Props> = ({ value, onChange }) => {
  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-primary" />
          <h3 className="font-semibold font-display text-foreground">Notificações do Sistema</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map(item => {
            const Icon = item.icon;
            const ativo = (value as any)[item.key];
            return (
              <div
                key={item.key}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border transition-all',
                  ativo ? 'border-primary/30 bg-primary/5' : 'border-border bg-card hover:border-primary/20',
                )}
              >
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', item.bg)}>
                  <Icon className={cn('w-4 h-4', item.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground leading-tight">{item.label}</p>
                    <Switch
                      checked={ativo}
                      onCheckedChange={v => onChange({ ...value, [item.key]: v })}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 pt-4 border-t">
          <p className="text-sm font-medium text-foreground mb-2">Canal de Envio</p>
          <CanalSelector value={value.canal} onChange={canal => onChange({ ...value, canal })} />
        </div>
      </CardContent>
    </Card>
  );
};
