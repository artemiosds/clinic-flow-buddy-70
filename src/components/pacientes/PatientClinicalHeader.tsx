import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Calendar, User, Activity, UserCog, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PatientHeaderProps {
  nome: string;
  idade: string;
  sexo: string;
  cpf: string;
  cns: string;
  profissional: string;
  dataNasc?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  numeroProntuario?: string;
  alertas?: string[];
  risco?: 'baixo' | 'medio' | 'alto';
  statusFalta?: 'REGULAR' | 'FALTOSO' | 'BLOQUEADO' | string;
  totalFaltas?: number;
  className?: string;
  onEdit?: () => void;
}

const PatientHeader: React.FC<PatientHeaderProps> = ({ 
  nome, idade, sexo, cpf, cns, profissional, dataNasc, telefone, email, endereco, numeroProntuario, alertas = [], risco = 'baixo', statusFalta, totalFaltas, className, onEdit 
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const riskStyles = {
    baixo: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    medio: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    alto: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  };

  return (
    <div className={cn("bg-card border-none shadow-sm rounded-xl overflow-hidden ring-1 ring-border/50", className)}>
      <div className="flex flex-col md:flex-row">
        {/* Left: Identity */}
        <div className="flex-1 p-4 flex items-center gap-4 border-b md:border-b-0 md:border-r">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl shadow-inner">
              {nome.charAt(0)}
            </div>
            <div className={cn("absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card", 
              risco === 'baixo' ? 'bg-emerald-500' : risco === 'medio' ? 'bg-amber-500' : 'bg-rose-500'
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2 overflow-hidden">
                <h2 className="text-lg font-bold font-display text-foreground truncate">{nome}</h2>
                <Badge variant="outline" className={cn("text-[10px] uppercase font-bold px-1.5 h-4.5 shrink-0", riskStyles[risco])}>
                  Risco {risco}
                </Badge>
              </div>
              {onEdit && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary shrink-0" 
                  onClick={onEdit}
                  title="Editar dados do paciente"
                >
                  <UserCog className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {idade} ({dataNasc || '—'})</span>
              <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {sexo}</span>
              <span className="flex items-center gap-1 text-primary/80 font-mono">ID: {numeroProntuario || '—'}</span>
            </div>
          </div>
        </div>

        {/* Right: Clinical Metadata & Alerts */}
        <div className="flex-[0.8] p-4 bg-muted/5">
          <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 mb-3">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider leading-none mb-1">CPF</span>
              <span className="text-xs font-mono font-semibold">{cpf || '—'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider leading-none mb-1">Cartão SUS (CNS)</span>
              <span className="text-xs font-mono font-semibold">{cns || '—'}</span>
            </div>
            <div className="flex flex-col col-span-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider leading-none mb-1">Profissional Responsável</span>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                   <Activity className="w-2.5 h-2.5 text-primary" />
                </div>
                <span className="text-xs font-semibold truncate">{profissional}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1.5">
            {alertas.length > 0 ? alertas.map((alerta, i) => (
              <Badge key={i} variant="destructive" className="text-[9px] font-bold uppercase py-0 px-1.5 h-5 bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20">
                <AlertCircle className="w-3 h-3 mr-1" />
                {alerta}
              </Badge>
            )) : (
              <Badge variant="secondary" className="text-[9px] font-bold uppercase py-0 px-1.5 h-5 bg-emerald-500/5 text-emerald-600/70 border-emerald-500/10">
                Sem Alertas Críticos
              </Badge>
            )}
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 border-t bg-muted/20 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Contatos</span>
            <div className="text-sm font-medium">
              <p>{telefone || 'Telefone não informado'}</p>
              <p className="text-muted-foreground text-xs">{email || 'E-mail não informado'}</p>
            </div>
          </div>
          <div className="space-y-1 md:col-span-2">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Endereço Completo</span>
            <p className="text-sm font-medium">{endereco || 'Endereço não informado'}</p>
          </div>
        </div>
      )}

      <div className="bg-muted/30 border-t flex justify-center py-1 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setExpanded(!expanded)}>
        <Badge variant="outline" className="text-[9px] uppercase font-bold gap-1 text-muted-foreground border-none">
          {expanded ? 'Ver menos' : 'Ver detalhes do cadastro'}
        </Badge>
      </div>
    </div>
    </div>
  );
};

export default PatientHeader;