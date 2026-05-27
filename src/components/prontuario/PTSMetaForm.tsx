import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import { GOAL_STATUSES, SPECIALTIES, PTS_PRIORITIES } from '@/data/ptsConstants';

interface PTSMeta {
  id?: string;
  titulo: string;
  descricao: string;
  categoria: string;
  especialidade: string;
  responsavel_id?: string;
  prioridade: string;
  prazo?: string;
  indicador_sucesso: string;
  status: string;
  observacoes: string;
}

interface Props {
  meta: PTSMeta;
  onChange: (updated: PTSMeta) => void;
  onRemove: () => void;
  professionals?: any[];
}

export const PTSMetaForm: React.FC<Props> = ({ meta, onChange, onRemove, professionals = [] }) => {
  return (
    <div className="p-4 border rounded-lg bg-background space-y-4 relative shadow-sm">
      <Button 
        variant="ghost" 
        size="icon" 
        className="absolute top-2 right-2 h-8 w-8 text-destructive hover:bg-destructive/10"
        onClick={onRemove}
      >
        <Trash2 className="w-4 h-4" />
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-muted-foreground">Título da Meta *</Label>
          <Input 
            value={meta.titulo} 
            onChange={e => onChange({ ...meta, titulo: e.target.value })}
            placeholder="Ex: Melhorar compreensão de comandos"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-muted-foreground">Categoria/Prazo</Label>
          <Select value={meta.categoria} onValueChange={v => onChange({ ...meta, categoria: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="curto">Curto Prazo</SelectItem>
              <SelectItem value="medio">Médio Prazo</SelectItem>
              <SelectItem value="longo">Longo Prazo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-muted-foreground">Especialidade</Label>
          <Select value={meta.especialidade} onValueChange={v => onChange({ ...meta, especialidade: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {SPECIALTIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-muted-foreground">Responsável</Label>
          <Select value={meta.responsavel_id || 'none'} onValueChange={v => onChange({ ...meta, responsavel_id: v === 'none' ? undefined : v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não definido</SelectItem>
              {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-muted-foreground">Prioridade</Label>
          <Select value={meta.prioridade} onValueChange={v => onChange({ ...meta, prioridade: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PTS_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-muted-foreground">Prazo Estimado</Label>
          <Input 
            type="date" 
            value={meta.prazo || ''} 
            onChange={e => onChange({ ...meta, prazo: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-muted-foreground">Status</Label>
          <Select value={meta.status} onValueChange={v => onChange({ ...meta, status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOAL_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase font-bold text-muted-foreground">Indicador de Sucesso</Label>
        <Input 
          value={meta.indicador_sucesso} 
          onChange={e => onChange({ ...meta, indicador_sucesso: e.target.value })}
          placeholder="Ex: Responde corretamente a 8 de 10 comandos"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase font-bold text-muted-foreground">Descrição / Observações</Label>
        <Textarea 
          rows={2} 
          value={meta.descricao} 
          onChange={e => onChange({ ...meta, descricao: e.target.value })}
          placeholder="Detalhes sobre como atingir esta meta..."
        />
      </div>
    </div>
  );
};
