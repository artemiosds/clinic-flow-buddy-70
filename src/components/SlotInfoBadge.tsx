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
        
        <div className="flex flex-col gap-2">
          {turnoData.map((t) => {
            const agendados = t.vagasOcupadas;
            const capacidade = t.vagasTotal;
            const disponiveis = t.vagasLivres;
            
            const excedido = agendados > capacidade;
            const lotado = agendados === capacidade;
            const quaseCheio = !lotado && !excedido && (agendados / capacidade) >= 0.8;
            
            let situacao = "Disponível";
            let situacaoColor = "text-success";
            let situacaoBg = "bg-success/5 border-success/20";
            let msgAuxiliar = "";

            if (excedido) {
              situacao = "Excedido";
              situacaoColor = "text-destructive";
              situacaoBg = "bg-destructive/10 border-destructive/20";
              msgAuxiliar = `Há ${agendados - capacidade} agendamento${(agendados - capacidade) !== 1 ? 's' : ''} acima da capacidade prevista.`;
            } else if (lotado) {
              situacao = "Lotado";
              situacaoColor = "text-primary";
              situacaoBg = "bg-primary/10 border-primary/20";
            } else if (quaseCheio) {
              situacao = "Quase cheio";
              situacaoColor = "text-warning";
              situacaoBg = "bg-warning/10 border-warning/20";
            }

            const defaultNomes = ['Manhã', 'Tarde', 'Noite'];
            const isDefaultNome = defaultNomes.includes(t.nome);
            const tituloPrincipal = t.nome;
            const subtitulo = `${isDefaultNome ? '' : (t.horaInicio < '12:00' ? 'Manhã' : t.horaInicio < '18:00' ? 'Tarde' : 'Noite') + ' • '}${t.horaInicio} às ${t.horaFim}`;

            return (
              <div
                key={t.turnoId}
                className={cn(
                  'flex flex-col gap-1.5 p-3 rounded-xl border transition-all duration-300',
                  situacaoBg
                )}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {t.horaInicio < '12:00' ? '🌅' : t.horaInicio < '18:00' ? '🌆' : '🌙'}
                    </span>
                    <span className="font-bold text-sm uppercase tracking-tight">{tituloPrincipal}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium pl-6">
                    {subtitulo}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 mt-1 pl-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Capacidade</span>
                    <span className="text-xs font-semibold">{capacidade} vagas</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Agendados</span>
                    <span className="text-xs font-semibold">{agendados} pacientes</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Disponíveis</span>
                    <span className={cn("text-xs font-semibold", excedido ? "text-destructive" : "text-foreground")}>
                      {excedido ? "0" : disponiveis} vagas
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 mt-1 pl-6 pt-2 border-t border-current/10">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Situação:</span>
                    <span className={cn("text-xs font-bold uppercase", situacaoColor)}>{situacao}</span>
                  </div>
                  {msgAuxiliar && (
                    <p className="text-[10px] font-medium leading-tight opacity-80 italic">
                      {msgAuxiliar}
                    </p>
                  )}
                </div>

                {t.vagasExternasReservadas > 0 && (
                  <div className="mt-2 pl-6 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="text-[10px] text-muted-foreground font-medium">
                        Cotas: {t.vagasExternasOcupadas} de {t.vagasExternasReservadas} externas usadas
                      </span>
                    </div>
                  </div>
                )}
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
