import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AcolhimentoViewProps {
  data: any;
  isCollapsedDefault?: boolean;
}

export const AcolhimentoView: React.FC<AcolhimentoViewProps> = ({ data, isCollapsedDefault = false }) => {
  const [isCollapsed, setIsCollapsed] = useState(isCollapsedDefault);

  if (!data) return null;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
    if (!children) return null;
    return (
      <div className="space-y-2 py-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary/70">{title}</h3>
        <div className="text-sm space-y-1">{children}</div>
      </div>
    );
  };

  const Field = ({ label, value }: { label: string; value: any }) => {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{label}</span>
        <span className="text-sm font-medium whitespace-pre-wrap">
          {Array.isArray(value) ? value.join(', ') : String(value === 'sim' ? 'Sim' : value === 'nao' ? 'Não' : value)}
        </span>
      </div>
    );
  };

  return (
    <div className={cn(
      "space-y-4 bg-muted/30 p-4 rounded-xl border border-border/50 transition-all duration-300",
      isCollapsed ? "py-3" : "pb-6"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-bold flex items-center gap-1.5 py-1">
            <FileText className="w-3.5 h-3.5" />
            ACOLHIMENTO EM SAÚDE MENTAL
          </Badge>
          {isCollapsed && (
            <span className="text-[10px] text-muted-foreground font-medium italic animate-in fade-in duration-500">
              {data.secao3?.queixa ? data.secao3.queixa.substring(0, 60) + '...' : 'Clique para ver detalhes'}
            </span>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8 p-0 rounded-full hover:bg-primary/5 text-primary"
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="grid grid-cols-1 gap-4 animate-in slide-in-from-top-2 duration-300">
          {/* SEÇÃO III */}
          <Section title="Motivo da Procura">
            <Field label="Queixa Principal, Sintomas e Evolução" value={data.secao3?.queixa} />
            <Field label="Outros" value={data.secao3?.outros} />
          </Section>

          {/* SEÇÃO IV */}
          <Section title="Sintomas (últimos 30 dias)">
            <Field label="Sintomas Observados" value={data.secao4?.sintomas} />
          </Section>

          {/* SEÇÃO V */}
          <Section title="Antecedentes Pessoais">
            <Field label="Antecedentes" value={data.secao5?.antecedentes} />
            <Field label="Uso de Psicofármacos" value={data.secao5?.uso_psicofarmacos} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Medicação Anterior" value={data.secao5?.medicacao_anterior} />
              <Field label="Medicação Atual" value={data.secao5?.medicacao_atual} />
            </div>
          </Section>

          {/* SEÇÃO VI */}
          <Section title="Uso de Substâncias">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 border-l-2 border-muted pl-2">
                <Field label="Bebida Alcoólica" value={data.secao6?.uso_alcool} />
                <Field label="Qual / Frequência" value={data.secao6?.alcool_qual || data.secao6?.alcool_frequencia ? `${data.secao6.alcool_qual || ''} ${data.secao6.alcool_frequencia ? `(${data.secao6.alcool_frequencia})` : ''}` : null} />
              </div>
              <div className="space-y-2 border-l-2 border-muted pl-2">
                <Field label="Droga Psicoativa" value={data.secao6?.uso_droga} />
                <Field label="Qual / Frequência" value={data.secao6?.droga_qual || data.secao6?.droga_frequencia ? `${data.secao6.droga_qual || ''} ${data.secao6.droga_frequencia ? `(${data.secao6.droga_frequencia})` : ''}` : null} />
              </div>
            </div>
            <Field label="Tabagismo" value={data.secao6?.habito_fumar} />
          </Section>

          {/* SEÇÃO VII */}
          <Section title="Histórico e Risco de Suicídio">
            <Field label="Tratamento de Suicídio" value={data.secao7?.tratamento_suicidio} />
            <Field label="Ideação Suicida" value={data.secao7?.ideacao_suicida} />
            <Field label="Tentativa nos últimos 6 meses" value={data.secao7?.tentativa_suicidio_6meses} />
            <div className="grid grid-cols-3 gap-2">
              <Field label="Acomp. Psiquiatra" value={data.secao7?.acompanhamento_psiquiatra} />
              <Field label="Prob. Saúde Mental" value={data.secao7?.problemas_saude_mental} />
              <Field label="Avaliado Equipe" value={data.secao7?.avaliado_equipe_mental} />
            </div>
          </Section>

          {/* SEÇÃO X & XI */}
          <Section title="Histórico Pessoal e Familiar">
            <Field label="Características Observadas" value={data.secao10?.caracteristicas_gerais} />
            <Field label="Situação Sociofamiliar" value={data.secao11?.situacao_sociofamiliar} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Moradia" value={data.secao11?.historia_moradia} />
              <Field label="Renda Familiar" value={data.secao11?.renda_familiar} />
            </div>
          </Section>

          {/* SEÇÃO XV */}
          <Section title="Parecer e Conduta">
            <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
              <Field label="Parecer do Profissional" value={data.secao15?.parecer} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
};
