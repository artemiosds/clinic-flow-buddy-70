import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Users, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn, dateStrToUtcDate, localDateStr, todayLocalStr, isoDayOfWeek } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AgendaVisaoSemanaProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  agendamentos: any[];
  bloqueios: any[];
  disponibilidades: any[];
  filterProf: string;
  filterUnit: string;
  profissionais: any[];
  getAvailableSlots: (profId: string, unidadeId: string, date: string) => string[];
  unidades: any[];
}

export const AgendaVisaoSemana: React.FC<AgendaVisaoSemanaProps> = ({
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
  const weekDays = useMemo(() => {
    const current = new Date(selectedDate + "T12:00:00");
    const day = current.getDay();
    const diff = current.getDate() - day;
    const startOfWeek = new Date(current.setDate(diff));
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  }, [selectedDate]);

  const agendamentosByDate = useMemo(() => {
    const map = new Map<string, { count: number; types: Set<string>; statusSet: Set<string> }>();
    agendamentos.forEach(a => {
      if (a.status === "cancelado") return;
      let entry = map.get(a.data);
      if (!entry) {
        entry = { count: 0, types: new Set(), statusSet: new Set() };
        map.set(a.data, entry);
      }
      entry.count++;
      if (a.tipo) entry.types.add(a.tipo);
      if (a.status) entry.statusSet.add(a.status);
    });
    return map;
  }, [agendamentos]);

  const dayInfo = useMemo(() => {
    const todayStr = todayLocalStr();
    return weekDays.map(day => {
      const dateStr = localDateStr(day);
      const dayOfWeek = day.getDay();
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;
      const isPast = dateStr < todayStr;

      const profs = filterProf !== "all" 
        ? profissionais.filter(p => p.id === filterProf)
        : profissionais.filter(p => filterUnit === "all" || p.unidadeId === filterUnit);

      let totalVagas = 0;
      let agendamentosCount = 0;
      let hasDisponibilidade = false;
      let isBlocked = profs.length > 0;

      const dateEntry = agendamentosByDate.get(dateStr);

      const useDetailedSlots = filterProf !== "all" && profs.length === 1;

      profs.forEach(p => {
        const pUnit = filterUnit !== "all" ? filterUnit : p.unidadeId;
        if (!pUnit) return;

        const blocked = bloqueios.some(b => {
          if (dateStr < b.dataInicio || dateStr > b.dataFim) return false;
          if (!b.diaInteiro) return false;
          const isGlobal = !b.unidadeId && !b.profissionalId;
          const isUnit = b.unidadeId === pUnit && !b.profissionalId;
          const isProf = b.profissionalId === p.id;
          return isGlobal || isUnit || isProf;
        });

        isBlocked = isBlocked && blocked;

        const disp = disponibilidades.find(d => 
          d.profissionalId === p.id && 
          d.unidadeId === pUnit && 
          dateStr >= d.dataInicio && 
          dateStr <= d.dataFim && 
          d.diasSemana.includes(dayOfWeek)
        );

        if (disp) hasDisponibilidade = true;

        if (!blocked) {
          const count = agendamentos.filter(a => a.data === dateStr && a.profissionalId === p.id && a.status !== "cancelado").length;
          agendamentosCount += count;
          
          if (useDetailedSlots && !isPast) {
            const slots = getAvailableSlots(p.id, pUnit, dateStr);
            totalVagas += (slots.length + count);
          } else {
            // For past days or multiple profs, use vacancies from availability if exists
            totalVagas += (disp?.vagasPorDia || count || 0);
          }
        }
      });

      const occupancyPercent = totalVagas > 0 ? Math.min(100, Math.round((agendamentosCount / totalVagas) * 100)) : 0;
      
      let status: "full" | "almostFull" | "available" | "blocked" | "past" | "empty" = "available";
      if (isBlocked) status = "blocked";
      else if (totalVagas > 0) {
        if (occupancyPercent >= 100) status = "full";
        else if (occupancyPercent >= 70) status = "almostFull";
        else status = "available";
      } else if (isPast) status = "past";
      else if (hasDisponibilidade) status = "full";
      else status = "empty";

      return {
        date: dateStr,
        dayName: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][dayOfWeek],
        displayDate: day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        isToday,
        isSelected,
        status,
        agendamentosCount,
        totalVagas,
        occupancyPercent,
        hasPendencias: dateEntry?.statusSet.has("pendente") || dateEntry?.statusSet.has("pendente_revisao") || false,
      };
    });
  }, [weekDays, selectedDate, agendamentos, bloqueios, disponibilidades, filterProf, filterUnit, profissionais, getAvailableSlots, agendamentosByDate]);

  const navigateWeek = (direction: number) => {
    const current = new Date(selectedDate + "T12:00:00");
    current.setDate(current.getDate() + (direction * 7));
    onDateChange(localDateStr(current));
  };

  const goToToday = () => {
    onDateChange(todayLocalStr());
  };

  const getStatusVisuals = (status: string) => {
    switch (status) {
      case "blocked": return { label: "Bloqueado", color: "bg-slate-100 text-slate-500 border-slate-200", barColor: "bg-slate-300" };
      case "past": return { label: "Passado", color: "bg-slate-50 text-slate-400 border-slate-100", barColor: "bg-slate-200" };
      case "full": return { label: "Lotado", color: "bg-blue-100 text-blue-700 border-blue-200", barColor: "bg-blue-500" };
      case "almostFull": return { label: "Quase cheio", color: "bg-orange-100 text-orange-700 border-orange-200", barColor: "bg-orange-500" };
      case "available": return { label: "Com vagas", color: "bg-emerald-100 text-emerald-700 border-emerald-200", barColor: "bg-emerald-500" };
      default: return { label: "Sem vagas", color: "bg-slate-100 text-slate-500 border-slate-200", barColor: "bg-slate-300" };
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 w-full max-w-6xl mx-auto">
        <div className="flex items-center justify-between bg-card p-4 rounded-xl border shadow-sm">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold font-display text-foreground">
              Semana de {dayInfo[0].displayDate} a {dayInfo[6].displayDate}
            </h3>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => navigateWeek(-1)} className="h-8 w-8">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday} className="h-8 text-xs font-bold px-3">
                Hoje
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigateWeek(1)} className="h-8 w-8">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
          
          <div className="hidden md:flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /><span>Com vagas</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-orange-500" /><span>Quase cheio</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /><span>Lotado</span></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {dayInfo.map((info, idx) => {
            const visuals = getStatusVisuals(info.status);
            const isSelected = info.isSelected;
            
            return (
              <button
                key={idx}
                onClick={() => onDateChange(info.date)}
                className={cn(
                  "flex flex-col p-4 rounded-2xl border transition-all text-left relative overflow-hidden group min-h-[160px]",
                  isSelected ? "bg-primary/5 border-primary shadow-md ring-1 ring-primary/20" : "bg-card border-border hover:border-primary/50 hover:shadow-sm",
                  info.status === "blocked" && "opacity-60 grayscale cursor-not-allowed"
                )}
              >
                <div className="flex flex-col gap-1 mb-3">
                  <span className={cn("text-xs font-bold uppercase tracking-widest", info.isToday ? "text-primary" : "text-muted-foreground")}>
                    {info.dayName}
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black tracking-tighter text-foreground">{info.displayDate.split('/')[0]}</span>
                    {info.isToday && <span className="bg-primary text-primary-foreground text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">Hoje</span>}
                  </div>
                </div>

                <div className="mt-auto space-y-3">
                  <div className={cn("text-[10px] font-black uppercase tracking-tight px-2 py-0.5 rounded-md border inline-block", visuals.color)}>
                    {visuals.label}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-muted-foreground uppercase">Capacidade</span>
                      <span className="text-foreground">{info.occupancyPercent}%</span>
                    </div>
                    <Progress value={info.occupancyPercent} className="h-1.5" />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      <span>{info.agendamentosCount}</span>
                    </div>
                    {info.hasPendencias && (
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertCircle className="w-3.5 h-3.5 text-warning" />
                        </TooltipTrigger>
                        <TooltipContent>Existem pendências para este dia</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
                
                {isSelected && <div className="absolute top-0 right-0 p-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /></div>}
              </button>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
};
