import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Info, AlertCircle, CheckCircle2, Users, Stethoscope } from "lucide-react";
import { cn, dateStrToUtcDate, isoDayOfWeek, localDateStr, todayLocalStr } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";

interface DiaInfo {
  date: string;
  dayNumber: number;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  status: "blocked" | "past" | "full" | "almostFull" | "available" | "empty" | "exceeded";
  agendamentosCount: number;
  totalVagas: number;
  occupancyPercent: number;
  profissionaisDisponiveis: string[];
  tiposAtendimento: string[];
  hasPendencias: boolean;
}

interface CalendarioAgendaProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  agendamentos: any[];
  bloqueios: any[];
  disponibilidades: any[];
  filterProf: string;
  filterUnit: string;
  profissionais: any[];
  getAvailableSlots: (profId: string, unidadeId: string, date: string) => string[];
  getAvailableDates: (profId: string, unidadeId: string) => string[];
  unidades: any[];
}

export const CalendarioAgenda: React.FC<CalendarioAgendaProps> = ({
  selectedDate,
  onDateChange,
  agendamentos,
  bloqueios,
  disponibilidades,
  filterProf,
  filterUnit,
  profissionais,
  getAvailableSlots,
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => dateStrToUtcDate(selectedDate));

  useEffect(() => {
    setCurrentMonth(dateStrToUtcDate(selectedDate));
  }, [selectedDate]);

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getUTCFullYear();
    const month = currentMonth.getUTCMonth();
    const firstDay = new Date(Date.UTC(year, month, 1, 12, 0, 0));
    const lastDay = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));

    const days: Date[] = [];
    for (let day = 1; day <= lastDay.getUTCDate(); day++) {
      days.push(new Date(Date.UTC(year, month, day, 12, 0, 0)));
    }

    const startWeekday = firstDay.getUTCDay();
    const prevDays: Date[] = [];
    for (let i = startWeekday; i > 0; i--) {
      prevDays.push(new Date(Date.UTC(year, month, 1 - i, 12, 0, 0)));
    }

    const endWeekday = lastDay.getUTCDay();
    const nextDays: Date[] = [];
    for (let i = 1; i < 7 - endWeekday; i++) {
      nextDays.push(new Date(Date.UTC(year, month + 1, i, 12, 0, 0)));
    }

    return [...prevDays, ...days, ...nextDays];
  }, [currentMonth]);

  // Pre-index agendamentos by date for O(1) lookup instead of filtering per day
  const agendamentosByDate = useMemo(() => {
    const map = new Map<string, { counts: Map<string, number>, types: Set<string>, statusSet: Set<string> }>();
    for (const a of agendamentos) {
      // Don't count cancellations as occupancy, but keep them for historical view if needed
      // Actually, we'll exclude cancellations from the occupancy count to avoid >100% on re-bookings
      if (a.status === "cancelado") continue;
      
      let entry = map.get(a.data);
      if (!entry) {
        entry = { counts: new Map(), types: new Set(), statusSet: new Set() };
        map.set(a.data, entry);
      }
      
      const profKey = a.profissionalId;
      entry.counts.set(profKey, (entry.counts.get(profKey) || 0) + 1);
      if (a.tipo) entry.types.add(a.tipo);
      if (a.status) entry.statusSet.add(a.status);
    }
    return map;
  }, [agendamentos]);

  // Pre-index disponibilidades for fast lookup
  const dispIndex = useMemo(() => {
    const arr = disponibilidades.map((d: any) => ({
      profissionalId: d.profissionalId,
      unidadeId: d.unidadeId,
      dataInicio: d.dataInicio,
      dataFim: d.dataFim,
      diasSemana: d.diasSemana || [],
      vagasPorDia: d.vagasPorDia || 25,
    }));
    return arr;
  }, [disponibilidades]);

  const dayInfoMap = useMemo(() => {
    const map = new Map<string, DiaInfo>();
    const todayStr = todayLocalStr();
    const currentYear = currentMonth.getUTCFullYear();
    const currentMonthNum = currentMonth.getUTCMonth();

    const profissionaisFiltrados = filterProf !== "all"
      ? profissionais.filter((prof) => prof.id === filterProf)
      : profissionais.filter((prof) => {
          if (filterUnit !== "all" && prof.unidadeId !== filterUnit) return false;
          return true;
        });

    const matchesBlock = (bloqueio: any, profissionalId: string, unidadeId: string) => {
      if (!bloqueio.diaInteiro) return false;
      const isGlobal = (!bloqueio.unidadeId || bloqueio.unidadeId === "") && (!bloqueio.profissionalId || bloqueio.profissionalId === "");
      const isUnitLevel = unidadeId && bloqueio.unidadeId === unidadeId && (!bloqueio.profissionalId || bloqueio.profissionalId === "");
      const isProfLevel = profissionalId && bloqueio.profissionalId === profissionalId;
      return isGlobal || isUnitLevel || isProfLevel;
    };

    // Only call getAvailableSlots when a specific professional is selected
    // For "all" mode, use a fast heuristic based on availability counts
    const useDetailedSlots = filterProf !== "all" && profissionaisFiltrados.length === 1;

    for (const day of daysInMonth) {
      const dateStr = localDateStr(day);
      const dayOfWeek = day.getUTCDay();
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;
      const isPast = dateStr < todayStr;

      let agendamentosConfirmados = 0;
      let totalVagas = 0;
      let hasDisponibilidade = false;
      let allBlocked = profissionaisFiltrados.length > 0;
      const profissionaisDisponiveis: string[] = [];


      const dateEntry = agendamentosByDate.get(dateStr);
      const isCurrentMonth = day.getUTCMonth() === currentMonthNum && day.getUTCFullYear() === currentYear;

      if (useDetailedSlots) {
        // Single professional — use detailed slot calculation (fast for 1 prof)
        const prof = profissionaisFiltrados[0];
        if (prof) {
          const profUnit = filterUnit !== "all" ? filterUnit : prof.unidadeId;
          const isBlocked = bloqueios.some((bloqueio: any) => {
            if (dateStr < bloqueio.dataInicio || dateStr > bloqueio.dataFim) return false;
            return matchesBlock(bloqueio, prof.id, profUnit);
          });
          allBlocked = isBlocked;
          const profHasDisponibilidade = dispIndex.some((disp) => (
            disp.profissionalId === prof.id &&
            disp.unidadeId === profUnit &&
            dateStr >= disp.dataInicio &&
            dateStr <= disp.dataFim &&
            disp.diasSemana.includes(dayOfWeek)
          ));
          hasDisponibilidade = profHasDisponibilidade;

          if (!isBlocked && profUnit) {
            agendamentosConfirmados = dateEntry?.counts.get(prof.id) || 0;
            if (!isPast) {
              const slots = getAvailableSlots(prof.id, profUnit, dateStr);
              totalVagas = slots.length + agendamentosConfirmados;
            } else {
              // For past days, we use the estimated capacity from disponibilidade or at least show the count
              const profDisp = dispIndex.find((disp) => (
                disp.profissionalId === prof.id &&
                disp.unidadeId === profUnit &&
                dateStr >= disp.dataInicio &&
                dateStr <= disp.dataFim &&
                disp.diasSemana.includes(dayOfWeek)
              ));
              totalVagas = profDisp?.vagasPorDia || agendamentosConfirmados || 1;
            }
            if (profHasDisponibilidade) {
              profissionaisDisponiveis.push(prof.nome);
            }
          }
        }
      } else {
        // Multiple professionals — use fast heuristic (no getAvailableSlots per prof)
        for (const prof of profissionaisFiltrados) {
          const profUnit = filterUnit !== "all" ? filterUnit : prof.unidadeId;
          const isBlocked = bloqueios.some((bloqueio: any) => {
            if (dateStr < bloqueio.dataInicio || dateStr > bloqueio.dataFim) return false;
            return matchesBlock(bloqueio, prof.id, profUnit);
          });
          
          const profHasDisponibilidade = dispIndex.some((disp) => (
            disp.profissionalId === prof.id &&
            disp.unidadeId === profUnit &&
            dateStr >= disp.dataInicio &&
            dateStr <= disp.dataFim &&
            disp.diasSemana.includes(dayOfWeek)
          ));
          
          allBlocked = allBlocked && isBlocked;
          hasDisponibilidade = hasDisponibilidade || profHasDisponibilidade;

          if (isBlocked || !profUnit) continue;

          const profAgCount = dateEntry?.counts.get(prof.id) || 0;
          agendamentosConfirmados += profAgCount;

          if (profHasDisponibilidade) {
            profissionaisDisponiveis.push(prof.nome);
          }

          // Use vagasPorDia from disponibilidade as totalVagas estimate
          const profDisp = dispIndex.find((disp) => (
            disp.profissionalId === prof.id &&
            disp.unidadeId === profUnit &&
            dateStr >= disp.dataInicio &&
            dateStr <= disp.dataFim &&
            disp.diasSemana.includes(dayOfWeek)
          ));
          if (profDisp) {
            totalVagas += profDisp.vagasPorDia;
          }
        }
      }

      let status: DiaInfo["status"] = "empty";
      let occupancyPercent = 0;

      if (totalVagas > 0) {
        occupancyPercent = Math.min(100, Math.round((agendamentosConfirmados / totalVagas) * 100));
      }

      if (allBlocked) {
        status = "blocked";
      } else if (totalVagas > 0) {
        if (agendamentosConfirmados > totalVagas) status = "exceeded";
        else if (agendamentosConfirmados === totalVagas) status = "full";
        else if (occupancyPercent >= 70) status = "almostFull";
        else status = "available";
      } else if (isPast) {
        status = "past";
      } else if (hasDisponibilidade) {
        status = "full";
      }

      const hasPendencias = dateEntry?.statusSet.has("pendente") || dateEntry?.statusSet.has("pendente_revisao") || false;

      map.set(dateStr, {
        date: dateStr,
        dayNumber: day.getUTCDate(),
        isToday,
        isSelected,
        isCurrentMonth,
        status,
        agendamentosCount: agendamentosConfirmados,
        totalVagas,
        occupancyPercent,
        profissionaisDisponiveis,
        tiposAtendimento: Array.from(dateEntry?.types || []),
        hasPendencias,
      });
    }

    return map;
  }, [
    agendamentosByDate,
    bloqueios,
    daysInMonth,
    dispIndex,
    filterProf,
    filterUnit,
    getAvailableSlots,
    profissionais,
    selectedDate,
    currentMonth,
  ]);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];

  const goToPrevMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setUTCMonth(newDate.getUTCMonth() - 1);
    setCurrentMonth(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setUTCMonth(newDate.getUTCMonth() + 1);
    setCurrentMonth(newDate);
  };

  const getStatusVisuals = (info: DiaInfo) => {
    if (info.status === "blocked") return {
      label: "Bloqueado",
      color: "bg-slate-100 text-slate-500 border-slate-200",
      barColor: "bg-slate-300"
    };
    if (info.status === "past") return {
      label: "Passado",
      color: "bg-slate-50 text-slate-400 border-slate-100",
      barColor: "bg-slate-200"
    };
    if (info.status === "exceeded") return {
      label: "Excedido",
      color: "bg-red-100 text-red-700 border-red-200",
      barColor: "bg-red-500"
    };
    if (info.status === "full") return {
      label: "Lotado",
      color: "bg-blue-100 text-blue-700 border-blue-200",
      barColor: "bg-blue-500"
    };
    if (info.status === "almostFull") return {
      label: "Quase cheio",
      color: "bg-orange-100 text-orange-700 border-orange-200",
      barColor: "bg-orange-500"
    };
    if (info.status === "available" || info.status === "empty") return {
      label: "Com vagas",
      color: "bg-emerald-100 text-emerald-700 border-emerald-200",
      barColor: "bg-emerald-500"
    };
    return {
      label: "Sem vagas",
      color: "bg-slate-100 text-slate-500 border-slate-200",
      barColor: "bg-slate-300"
    };
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 w-full max-w-5xl mx-auto">
        <div className="flex items-center justify-between bg-card p-4 rounded-xl border shadow-sm">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold font-display text-foreground">
              {monthNames[currentMonth.getUTCMonth()]} {currentMonth.getUTCFullYear()}
            </h3>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={goToPrevMonth} className="h-8 w-8">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  const today = new Date();
                  setCurrentMonth(new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1, 12, 0, 0)));
                  onDateChange(todayLocalStr());
                }} 
                className="h-8 text-xs font-bold px-3"
              >
                Hoje
              </Button>
              <Button variant="ghost" size="icon" onClick={goToNextMonth} className="h-8 w-8">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                <span>Com vagas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-orange-500" />
                <span>Quase cheio</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-blue-500" />
                <span>Lotado</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500" />
                <span>Excedido</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-slate-300" />
                <span>Bloqueado</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border shadow-md overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day, index) => (
              <div key={index} className="py-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground border-r last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 grid-rows-5 auto-rows-fr">
            {daysInMonth.map((day, index) => {
              const dateStr = localDateStr(day);
              const info = dayInfoMap.get(dateStr);
              if (!info) return null;

              const visuals = getStatusVisuals(info);
              const isDisabled = info.status === "blocked";

              return (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => !isDisabled && onDateChange(info.date)}
                      className={cn(
                        'group relative flex flex-col items-start p-3 min-h-[100px] transition-all border-r border-b hover:z-10 text-left',
                        !info.isCurrentMonth && 'bg-muted/10 opacity-40',
                        info.isSelected ? 'ring-2 ring-primary ring-inset bg-primary/10 z-20 shadow-md border-primary/30' : 'hover:bg-muted/50',
                        isDisabled && 'cursor-not-allowed bg-slate-50/50',
                        index % 7 === 6 && 'border-r-0'
                      )}
                    >
                      <div className="flex justify-between items-start w-full mb-2">
                        <span className={cn(
                          "text-lg font-bold leading-none",
                          info.isToday ? "text-primary flex items-center gap-1" : "text-foreground",
                          !info.isCurrentMonth && "text-muted-foreground"
                        )}>
                          {info.dayNumber}
                          {info.isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        </span>
                        
                        {info.agendamentosCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {info.agendamentosCount} ATEND.
                          </span>
                        )}
                      </div>

                      {!isDisabled && info.totalVagas > 0 && (
                        <div className="mt-auto w-full space-y-1.5">
                          <div className={cn(
                            "text-[10px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-sm inline-block border",
                            visuals.color
                          )}>
                            {visuals.label}
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase">
                              <span>Ocupação</span>
                              <span>{info.occupancyPercent}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div 
                                className={cn("h-full transition-all duration-500", visuals.barColor)} 
                                style={{ width: `${info.occupancyPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {info.hasPendencias && (
                        <div className="absolute top-2 right-2">
                          <AlertCircle className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="p-4 w-64 space-y-3 z-50 shadow-xl border-primary/20">
                    <div className="space-y-1 border-b pb-2">
                      <p className="font-bold text-sm">Resumo do Dia</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(info.date + "T12:00:00").toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Agend.</p>
                        <p className="text-sm font-bold">{info.agendamentosCount}</p>
                      </div>
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Vagas Livres</p>
                        <p className="text-sm font-bold text-success">{Math.max(0, info.totalVagas - info.agendamentosCount)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1 flex items-center gap-1">
                          <Stethoscope className="w-3 h-3" /> Profissionais Ativos
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {info.profissionaisDisponiveis.length > 0 ? (
                            info.profissionaisDisponiveis.map((p, i) => (
                              <span key={i} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{p}</span>
                            ))
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Nenhum profissional com agenda</span>
                          )}
                        </div>
                      </div>

                      {info.tiposAtendimento.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Tipos de Atendimento</p>
                          <div className="flex flex-wrap gap-1">
                            {info.tiposAtendimento.map((t, i) => (
                              <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {info.hasPendencias && (
                        <div className="pt-1 border-t flex items-center gap-1.5 text-orange-600 font-bold text-[10px] uppercase">
                          <AlertCircle className="w-3 h-3" /> Possui pendências de revisão
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};