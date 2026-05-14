import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Calendar, FileText, Phone, User, Activity } from 'lucide-react';

interface PatientHeaderProps {
  nome: string;
  idade: string;
  sexo: string;
  cpf: string;
  cns: string;
  profissional: string;
  alertas?: string[];
  className?: string;
}

const PatientHeader: React.FC<PatientHeaderProps> = ({ nome, idade, sexo, cpf, cns, profissional, alertas = [], className }) => (
  <div className={cn("bg-card border rounded-xl p-4 shadow-sm flex flex-col gap-4", className)}>
    {/* Top Row: Name and Alerts */}
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
          {nome.charAt(0)}
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-foreground">{nome}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {idade}</span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {sexo}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        {alertas.map((alerta, i) => (
          <Badge key={i} variant="destructive" className="flex items-center gap-1.5 px-3 py-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {alerta}
          </Badge>
        ))}
      </div>
    </div>

    {/* Bottom Row: Metadata */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">CPF:</span>
        <span className="font-mono font-medium">{cpf || '—'}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">CNS:</span>
        <span className="font-mono font-medium">{cns || '—'}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Prof.:</span>
        <span className="font-medium truncate">{profissional}</span>
      </div>
    </div>
  </div>
);

export default PatientHeader;
