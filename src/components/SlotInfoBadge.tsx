import React, { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { cn, isoDayOfWeek, todayLocalStr } from '@/lib/utils';

interface SlotInfoBadgeProps {
  profissionalId: string;
  unidadeId: string;
  date: string;
  hora?: string;
  compact?: boolean;
  className?: string;
}

export const SlotInfoBadge = React.forwardRef<HTMLElement, SlotInfoBadgeProps>(({
  profissionalId, unidadeId, date, hora, compact, className,
}, ref) => {
  const { agendamentos, disponibilidades, getAvailableSlots, getTurnoInfo } = useData();

  const turnoData = useMemo(() => {
    return getTurnoInfo(profissionalId, unidadeId, date);
  }, [getTurnoInfo, profissionalId, unidadeId, date]);

  const info = useMemo(() => {
    const dayOfWeek = isoDayOfWeek(date);
    const allDisps = disponibilidades.filter(
      d => d.profissionalId === profissionalId &&
        d.unidadeId === unidadeId &&
        d.diasSemana.includes(dayOfWeek) &&
        date >= d.dataInicio && date <= d.dataFim,
    );
    if (allDisps.length === 0) return null;

    const isTurnoMode = allDisps.some(d => d.vagasPorHora === 0);
    const active = agendamentos.filter(
      a => a.profissionalId === profissionalId &&
        a.unidadeId === unidadeId &&
        a.data === date &&
        !['cancelado', 'falta'].includes(a.status),
    );

    const dayTotal = allDisps.reduce((sum, d) => sum + d.vagasPorDia, 0);
    const availableSlotOptions = getAvailableSlots(profissionalId, unidadeId, date).length;

    let hourOccupied: number | undefined;
    let hourTotal: number | undefined;
    if (hora && !isTurnoMode) {
      const disp = allDisps[0];
      const hPrefix = hora.substring(0, 3);
      hourOccupied = active.filter(a => a.hora.startsWith(hPrefix)).length;
      hourTotal = disp.vagasPorHora;
    }

    const dayOccupied = active.length;
    const dayAvailable = Math.max(0, dayTotal - dayOccupied);

    // Calc aggregated info for all turnos
    const totalVagasInternas = turnoData.reduce((s, t) => s + t.vagasInternas, 0);
    const totalInternasOcupadas = turnoData.reduce((s, t) => s + t.vagasInternasOcupadas, 0);
    const totalExternasReservadas = turnoData.reduce((s, t) => s + t.vagasExternasReservadas, 0);
    const totalExternasOcupadas = turnoData.reduce((s, t) => s + t.vagasExternasOcupadas, 0);

    return { 
      dayOccupied, dayTotal, dayAvailable, 
      hourOccupied, hourTotal, availableSlotOptions, 
      isTurnoMode,
      totalVagasInternas, totalInternasOcupadas,
      totalExternasReservadas, totalExternasOcupadas
    };
  }, [profissionalId, unidadeId, date, hora, agendamentos, disponibilidades, getAvailableSlots]);

  if (!info) return null;

  const isToday = date === todayLocalStr();
  const isFull = info.dayAvailable === 0;
  const isNearFull = info.dayAvailable <= 2 && !isFull;
  const hasAvailableSlotOptions = info.availableSlotOptions > 0;
  const hasNoRemainingSlotOptions = !isFull && !hasAvailableSlotOptions;

  if (info.isTurnoMode && turnoData.length > 0 && !compact) {
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={cn('space-y-2', className)}>
        {info.totalExternasReservadas > 0 && (
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 text-[11px] mb-2">
            <p className="font-medium flex items-center gap-1 text-primary">
              📌 {info.totalExternasReservadas} vagas reservadas para agendamento externo.
            </p>
            <p className="text-muted-foreground mt-0.5">
              Capacidade Recepção: {info.totalVagasInternas} vagas ({info.totalInternasOcupadas} usadas)
            </p>
          </div>
        )}
        
        <div className="flex flex-col gap-1.5">
          {turnoData.map((t) => {
            const pct = t.vagasTotal > 0 ? (t.vagasOcupadas / t.vagasTotal) * 100 : 0;
            return (
              <div
                key={t.turnoId}
                className={cn(
                  'flex flex-col gap-1 p-2 rounded-lg border',
                  t.lotado
                    ? 'bg-destructive/5 border-destructive/20 text-destructive'
                    : pct > 80
                      ? 'bg-warning/5 border-warning/20 text-warning'
                      : 'bg-success/5 border-success/20 text-success',
                )}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-sm">{t.nome === 'Manhã' ? '🌅' : t.nome === 'Tarde' ? '🌆' : '🌙'}</span>
                  <span className="font-bold uppercase tracking-tight">{t.nome}</span>
                  <span className="text-muted-foreground ml-auto">{t.horaInicio}–{t.horaFim}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Internas (Recepção)</span>
                    <span className="text-[11px] font-medium">
                      {t.vagasInternasOcupadas} de {t.vagasInternas} usadas
                    </span>
                  </div>
                  {t.vagasExternasReservadas > 0 && (
                    <div className="flex flex-col border-l pl-2">
                      <span className="text-[10px] text-primary/70 uppercase font-semibold">Externas (Cotas)</span>
                      <span className="text-[11px] font-medium">
                        {t.vagasExternasOcupadas} de {t.vagasExternasReservadas} usadas
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-1 pt-1 border-t border-current/10">
                   <span className="text-[10px] font-bold uppercase">Total Livres:</span>
                   <span className="text-xs font-bold">{t.vagasLivres}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (info.isTurnoMode && turnoData.length > 0 && compact) {
    const totalLivres = turnoData.reduce((s, t) => s + t.vagasLivres, 0);
    const allFull = turnoData.every(t => t.lotado);
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
          allFull && 'bg-destructive/10 text-destructive',
          !allFull && totalLivres <= 2 && 'bg-warning/10 text-warning',
          !allFull && totalLivres > 2 && 'bg-success/10 text-success',
          className,
        )}
      >
        {allFull ? '🔴 Lotado' : `${totalLivres} vaga${totalLivres !== 1 ? 's' : ''}`}
      </span>
    );
  }

  if (compact) {
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
          (isFull || hasNoRemainingSlotOptions) && 'bg-destructive/10 text-destructive',
          isNearFull && hasAvailableSlotOptions && 'bg-warning/10 text-warning',
          !isFull && !isNearFull && hasAvailableSlotOptions && 'bg-success/10 text-success',
          className,
        )}
      >
        {isFull
          ? '🔴 Lotado'
          : hasNoRemainingSlotOptions
            ? (isToday ? '⏰ Sem horários hoje' : '⏰ Sem horários livres')
            : `${info.dayAvailable} vaga${info.dayAvailable !== 1 ? 's' : ''}`}
      </span>
    );
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(
        'flex flex-wrap items-center gap-2 text-xs',
        className,
      )}
    >
      <span className={cn(
        'inline-flex items-center gap-1 font-medium px-2.5 py-1 rounded-full',
        (isFull || hasNoRemainingSlotOptions) && 'bg-destructive/10 text-destructive',
        isNearFull && hasAvailableSlotOptions && 'bg-warning/10 text-warning',
        !isFull && !isNearFull && hasAvailableSlotOptions && 'bg-success/10 text-success',
      )}>
        {isFull
          ? '🔴 Dia lotado'
          : hasNoRemainingSlotOptions
            ? (isToday ? '⏰ Sem horários restantes hoje' : '⏰ Sem horários livres nesta data')
            : `📊 ${info.dayOccupied} de ${info.dayTotal} vagas ocupadas`
        }
      </span>
      {!isFull && (
        <span className="text-muted-foreground">
          {hasNoRemainingSlotOptions
            ? `(${info.dayAvailable} vaga${info.dayAvailable !== 1 ? 's' : ''} no dia, mas sem horário livre restante)`
            : `(${info.dayAvailable} disponíve${info.dayAvailable !== 1 ? 'is' : 'l'} • ${info.availableSlotOptions} horário${info.availableSlotOptions !== 1 ? 's' : ''} livre${info.availableSlotOptions !== 1 ? 's' : ''})`}
        </span>
      )}
      {info.hourOccupied !== undefined && info.hourTotal !== undefined && (
        <span className={cn(
          'inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full',
          info.hourOccupied >= info.hourTotal
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-muted-foreground',
        )}>
          ⏰ {info.hourOccupied}/{info.hourTotal} neste horário
        </span>
      )}
    </div>
  );
});

SlotInfoBadge.displayName = 'SlotInfoBadge';
