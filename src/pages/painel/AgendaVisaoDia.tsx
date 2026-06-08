import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Clock, CheckCircle2, XCircle, AlertCircle, Calendar, CalendarRange, UserPlus } from "lucide-react";
import { cn, todayLocalStr, localDateStr } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface AgendaVisaoDiaProps {
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
  onNewAgendamento?: () => void;
}

export const AgendaVisaoDia: React.FC<AgendaVisaoDiaProps> = ({
  selectedDate,
  agendamentos,
  bloqueios,
  disponibilidades,
  filterProf,
  filterUnit,
  profissionais,
  getAvailableSlots,
  onNewAgendamento,
}) => {
  const stats = useMemo(() => {
    const dayAgs = agendamentos.filter(a => a.data === selectedDate);
    
    const profs = filterProf !== "all" 
      ? profissionais.filter(p => p.id === filterProf)
      : profissionais.filter(p => filterUnit === "all" || p.unidadeId === filterUnit);

    let totalCapacity = 0;
    const today = todayLocalStr();
    const isPast = selectedDate < today;

    const useDetailedSlots = filterProf !== "all" && profs.length === 1;

    profs.forEach(p => {
      const pUnit = filterUnit !== "all" ? filterUnit : p.unidadeId;
      if (!pUnit) return;

      const blocked = bloqueios.some(b => {
        if (selectedDate < b.dataInicio || selectedDate > b.dataFim) return false;
        if (!b.diaInteiro) return false;
        const isGlobal = !b.unidadeId && !b.profissionalId;
        const isUnit = b.unidadeId === pUnit && !b.profissionalId;
        const isProf = b.profissionalId === p.id;
        return isGlobal || isUnit || isProf;
      });

      if (blocked) return;

      const count = dayAgs.filter(a => a.profissionalId === p.id && a.status !== "cancelado").length;
      if (useDetailedSlots && !isPast) {
        const slots = getAvailableSlots(p.id, pUnit, selectedDate);
        totalCapacity += (slots.length + count);
      } else {
        const dayOfWeek = new Date(selectedDate + "T12:00:00").getDay();
        const disp = disponibilidades.find(d => 
          d.profissionalId === p.id && 
          d.unidadeId === pUnit && 
          selectedDate >= d.dataInicio && 
          selectedDate <= d.dataFim && 
          d.diasSemana.includes(dayOfWeek)
        );
        totalCapacity += (disp?.vagasPorDia || count || 0);
      }
    });

    const activeAgs = dayAgs.filter(a => a.status !== "cancelado" && a.status !== "falta");
    const occupancyPercent = totalCapacity > 0 ? Math.min(100, Math.round((activeAgs.length / totalCapacity) * 100)) : 0;

    return {
      total: dayAgs.length,
      confirmed: dayAgs.filter(a => ["confirmado", "confirmado_chegada", "agendado"].includes(a.status)).length,
      pending: dayAgs.filter(a => ["pendente", "aguardando_triagem"].includes(a.status)).length,
      absent: dayAgs.filter(a => a.status === "falta").length,
      canceled: dayAgs.filter(a => a.status === "cancelado").length,
      inService: dayAgs.filter(a => a.status === "em_atendimento").length,
      finished: dayAgs.filter(a => a.status === "concluido").length,
      capacity: totalCapacity,
      occupancy: occupancyPercent,
      vacancies: Math.max(0, totalCapacity - activeAgs.length)
    };
  }, [selectedDate, agendamentos, bloqueios, disponibilidades, filterProf, filterUnit, profissionais, getAvailableSlots]);

  const displayDate = new Date(selectedDate + "T12:00:00").toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-3xl border shadow-sm ring-1 ring-border/50">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-primary/10 rounded-2xl text-primary shadow-sm border border-primary/20">
            <Calendar className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-2xl font-black font-display tracking-tight text-foreground capitalize">
              {displayDate}
            </h3>
            <p className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> 
              Resumo operacional do dia
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onNewAgendamento && stats.total === 0 && (
            <button 
              onClick={onNewAgendamento}
              className="h-9 px-4 rounded-xl text-xs font-black uppercase bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> Novo Agendamento
            </button>
          )}
          <Badge variant="outline" className="h-9 px-4 rounded-xl text-xs font-black uppercase bg-background border-primary/20 text-primary">
            {stats.occupancy}% Ocupado
          </Badge>
          <Badge variant="outline" className="h-9 px-4 rounded-xl text-xs font-black uppercase bg-emerald-500/10 border-emerald-500/20 text-emerald-600">
            {stats.vacancies} Vagas Disponíveis
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { label: "Total", value: stats.total, icon: Users, color: "text-foreground", bg: "bg-muted/30" },
          { label: "Confirmados", value: stats.confirmed, icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
          { label: "Pendentes", value: stats.pending, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
          { label: "Faltou", value: stats.absent, icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
          { label: "Cancelados", value: stats.canceled, icon: AlertCircle, color: "text-muted-foreground", bg: "bg-muted/50" },
          { label: "Em Atend.", value: stats.inService, icon: CalendarRange, color: "text-primary", bg: "bg-primary/10" },
          { label: "Concluídos", value: stats.finished, icon: UserPlus, color: "text-info", bg: "bg-info/10" },
        ].map((item, i) => (
          <Card key={i} className={cn("border shadow-sm hover:shadow-md transition-all rounded-2xl overflow-hidden", item.bg)}>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
              <item.icon className={cn("w-5 h-5", item.color)} />
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{item.label}</p>
                <p className="text-2xl font-black tracking-tighter">{item.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-card p-6 rounded-3xl border shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-1">
            <h4 className="text-lg font-bold flex items-center gap-2">
              Capacidade do Dia
            </h4>
            <p className="text-xs font-medium text-muted-foreground">Progresso baseado nas vagas configuradas vs. ocupação real</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black tracking-tighter text-primary">{stats.occupancy}%</p>
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Utilização</p>
          </div>
        </div>
        <Progress value={stats.occupancy} className="h-4 rounded-full bg-muted border border-border" />
        <div className="mt-4 flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          <span>0%</span>
          <span>50%</span>
          <span>100% (Capacidade Máxima: {stats.capacity})</span>
        </div>
      </div>
    </div>
  );
};
