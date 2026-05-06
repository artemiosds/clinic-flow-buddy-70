import { UserRole } from "@/types";

export const roleLabels: Record<UserRole, string> = {
  master: 'Master',
  coordenador: 'Coordenador',
  recepcao: 'Recepção',
  profissional: 'Profissional de Saúde',
  gestao: 'Gestão',
  tecnico: 'Triagem',
  avaliacao_enfermagem: 'Enfermagem',
};

export const roleColors: Record<UserRole, string> = {
  master: 'bg-destructive/10 text-destructive',
  coordenador: 'bg-warning/10 text-warning',
  recepcao: 'bg-info/10 text-info',
  profissional: 'bg-success/10 text-success',
  gestao: 'bg-accent text-accent-foreground',
  tecnico: 'bg-primary/10 text-primary',
  avaliacao_enfermagem: 'bg-purple-100 text-purple-700',
};
