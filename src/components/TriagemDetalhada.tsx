import React from "react";
import { Activity, AlertTriangle, Heart, Pill, Stethoscope, Thermometer, User as UserIcon, Wind, Droplet, Scale, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TriagemData {
  peso?: number;
  altura?: number;
  imc?: number;
  pressao_arterial?: string;
  temperatura?: number;
  frequencia_cardiaca?: number;
  saturacao_oxigenio?: number;
  glicemia?: number;
  alergias?: string[];
  medicamentos?: string[];
  queixa?: string;
  observacoes?: string;
  classificacao_risco?: string;
  confirmado_em?: string;
  tecnico_nome?: string;
  tecnico_coren?: string;
}

const RISCO_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  nao_urgente: { label: "Não urgente", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  pouco_urgente: { label: "Pouco urgente", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  urgente: { label: "Urgente", bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  muito_urgente: { label: "Muito urgente", bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  emergencia: { label: "Emergência", bg: "bg-red-100", text: "text-red-800", border: "border-red-300", dot: "bg-red-600" },
};

const classificarIMC = (imc: number): string => {
  if (imc < 18.5) return "Abaixo do peso";
  if (imc < 25) return "Normal";
  if (imc < 30) return "Sobrepeso";
  if (imc < 35) return "Obesidade I";
  if (imc < 40) return "Obesidade II";
  return "Obesidade III";
};

interface VitalProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  unit?: string;
  alert?: boolean;
  hint?: string;
}

const VitalCard: React.FC<VitalProps> = ({ icon, label, value, unit, alert, hint }) => (
  <div className={`rounded-lg border px-3 py-2.5 ${alert ? "bg-destructive/5 border-destructive/30" : "bg-card border-border/50"}`}>
    <div className="flex items-center gap-1.5 mb-1">
      <span className={`${alert ? "text-destructive" : "text-muted-foreground"}`}>{icon}</span>
      <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{label}</p>
    </div>
    <p className={`text-base font-bold font-mono ${alert ? "text-destructive" : "text-foreground"}`}>
      {value}
      {unit && <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span>}
    </p>
    {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
  </div>
);

interface TriagemDetalhadaProps {
  triagem: TriagemData | null;
  showEmpty?: boolean;
}

const TriagemDetalhada: React.FC<TriagemDetalhadaProps> = ({ triagem, showEmpty }) => {
  if (!triagem) {
    if (!showEmpty) return null;
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-center">
        <Stethoscope className="w-5 h-5 text-muted-foreground/60 mx-auto mb-1.5" />
        <p className="text-xs text-muted-foreground italic">Triagem não realizada para este atendimento.</p>
      </div>
    );
  }

  const risco = triagem.classificacao_risco ? RISCO_CONFIG[triagem.classificacao_risco] : null;
  const hasVitals = triagem.pressao_arterial || triagem.temperatura || triagem.frequencia_cardiaca || triagem.saturacao_oxigenio || triagem.glicemia;
  const hasAntropometria = triagem.peso || triagem.altura || triagem.imc;

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-muted/40 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Stethoscope className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-wide">Triagem Clínica</h3>
            <p className="text-[10px] text-muted-foreground">
              {triagem.tecnico_nome ? <>Realizada por <strong className="text-foreground/80">{triagem.tecnico_nome}</strong></> : "Triagem registrada"}
              {triagem.tecnico_coren && ` · COREN ${triagem.tecnico_coren}`}
              {triagem.confirmado_em && ` · ${new Date(triagem.confirmado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
            </p>
          </div>
        </div>
        {risco && (
          <Badge variant="outline" className={`${risco.bg} ${risco.text} ${risco.border} text-[11px] font-medium px-2.5 py-1 h-6 rounded-full`}>
            <span className={`w-2 h-2 rounded-full ${risco.dot} mr-1.5 inline-block animate-pulse`} />
            {risco.label}
          </Badge>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* ALERGIAS — destaque */}
        {triagem.alergias && triagem.alergias.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg bg-destructive/8 border-l-4 border-destructive px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-destructive mb-0.5">Alergias</p>
              <p className="text-sm font-semibold text-foreground">{triagem.alergias.join(" · ")}</p>
            </div>
          </div>
        )}

        {/* SINAIS VITAIS */}
        {hasVitals && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sinais Vitais</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {triagem.pressao_arterial && (
                <VitalCard icon={<Activity className="w-3 h-3" />} label="Pressão" value={triagem.pressao_arterial} unit="mmHg" />
              )}
              {triagem.temperatura !== undefined && triagem.temperatura !== null && (
                <VitalCard
                  icon={<Thermometer className="w-3 h-3" />}
                  label="Temperatura"
                  value={triagem.temperatura}
                  unit="°C"
                  alert={triagem.temperatura >= 37.8}
                />
              )}
              {triagem.frequencia_cardiaca && (
                <VitalCard
                  icon={<Heart className="w-3 h-3" />}
                  label="FC"
                  value={triagem.frequencia_cardiaca}
                  unit="bpm"
                  alert={triagem.frequencia_cardiaca > 100 || triagem.frequencia_cardiaca < 60}
                />
              )}
              {triagem.saturacao_oxigenio && (
                <VitalCard
                  icon={<Wind className="w-3 h-3" />}
                  label="SatO₂"
                  value={triagem.saturacao_oxigenio}
                  unit="%"
                  alert={triagem.saturacao_oxigenio < 95}
                />
              )}
              {triagem.glicemia && (
                <VitalCard
                  icon={<Droplet className="w-3 h-3" />}
                  label="Glicemia"
                  value={triagem.glicemia}
                  unit="mg/dL"
                  alert={triagem.glicemia >= 200 || triagem.glicemia < 70}
                />
              )}
            </div>
          </div>
        )}

        {/* ANTROPOMETRIA */}
        {hasAntropometria && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <UserIcon className="w-3.5 h-3.5 text-blue-500" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Antropometria</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {triagem.peso && <VitalCard icon={<Scale className="w-3 h-3" />} label="Peso" value={triagem.peso} unit="kg" />}
              {triagem.altura && <VitalCard icon={<Ruler className="w-3 h-3" />} label="Altura" value={triagem.altura} unit="cm" />}
              {triagem.imc && (
                <VitalCard
                  icon={<Activity className="w-3 h-3" />}
                  label="IMC"
                  value={triagem.imc.toFixed(1)}
                  hint={classificarIMC(triagem.imc)}
                  alert={triagem.imc < 18.5 || triagem.imc >= 30}
                />
              )}
            </div>
          </div>
        )}

        {/* MEDICAMENTOS EM USO */}
        {triagem.medicamentos && triagem.medicamentos.length > 0 && (
          <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Pill className="w-3.5 h-3.5 text-violet-500" />
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Medicamentos em uso</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {triagem.medicamentos.map((m, i) => (
                <Badge key={i} variant="secondary" className="text-[11px] font-normal">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* QUEIXA E OBSERVAÇÕES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {triagem.queixa && (
            <div className="rounded-lg bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 mb-1">Queixa principal (triagem)</p>
              <p className="text-sm text-foreground leading-snug">{triagem.queixa}</p>
            </div>
          )}
          {triagem.observacoes && (
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Observações da triagem</p>
              <p className="text-sm text-foreground leading-snug whitespace-pre-wrap">{triagem.observacoes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TriagemDetalhada;
