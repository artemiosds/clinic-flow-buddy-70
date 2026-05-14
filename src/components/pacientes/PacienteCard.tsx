import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, Pencil, Trash2, Eye, FileText } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Paciente {
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  descricaoClinica?: string;
  cid?: string;
  [key: string]: any;
}

interface PacienteCardProps {
  p: Paciente;
  onViewDetalhe: (p: Paciente) => void;
  onViewProntuarios: (p: Paciente) => void;
  onEdit: (p: Paciente) => void;
  onDelete: (p: Paciente) => void;
  canDelete: boolean;
}

export const PacienteCard: React.FC<PacienteCardProps> = React.memo(({ p, onViewDetalhe, onViewProntuarios, onEdit, onDelete, canDelete }) => {
  return (
    <Card className="shadow-card border-0 hover:ring-1 hover:ring-primary/20 transition-all group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground truncate group-hover:text-primary transition-colors">
              {p.nome}
            </h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              ID: {p.id.slice(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => onViewDetalhe(p)}
              title="Ver Detalhes"
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => onViewProntuarios(p)}
              title="Ver Prontuários"
            >
              <FileText className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onEdit(p)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Excluir {p.nome}? Será verificado se há agendamentos ativos vinculados. Esta ação é
                      irreversível e será registrada em log.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(p)}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1 min-w-0">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{p.telefone}</span>
          </span>
          {p.email && (
            <span className="flex items-center gap-1 min-w-0">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{p.email}</span>
            </span>
          )}
        </div>
        {(p.descricaoClinica || p.cid) && (
          <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
            {p.descricaoClinica && <p>🩺 {p.descricaoClinica}</p>}
            {p.cid && <p>CID: {p.cid}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

PacienteCard.displayName = "PacienteCard";
