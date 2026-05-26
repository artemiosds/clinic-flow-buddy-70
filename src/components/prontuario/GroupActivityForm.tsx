import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, Users } from 'lucide-react';

interface GroupActivityFormProps {
  data: {
    tema?: string;
    tipo_atividade?: string;
    evolucao?: string;
  };
  onChange: (updates: any) => void;
  onSave?: () => void;
  saving?: boolean;
}

export const GroupActivityForm: React.FC<GroupActivityFormProps> = ({
  data,
  onChange,
  onSave,
  saving
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-6 rounded-2xl border border-indigo-500/20 shadow-md mb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 shadow-inner">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground tracking-tight">Grupo/Oficinas Terapêuticas</h3>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-0.5">Atividade Coletiva</p>
          </div>
        </div>
        
        {onSave && (
          <Button 
            onClick={onSave} 
            disabled={saving} 
            size="sm" 
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Registro do Grupo'}
          </Button>
        )}
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tema" className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Tema</Label>
              <Input
                id="tema"
                value={data.tema || ''}
                onChange={(e) => onChange({ tema: e.target.value })}
                placeholder="Ex: Autoestima, Ansiedade, Habilidades Sociais..."
                className="bg-background border-border/60 focus-visible:ring-indigo-500/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo_atividade" className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Tipo de Atividade</Label>
              <Input
                id="tipo_atividade"
                value={data.tipo_atividade || ''}
                onChange={(e) => onChange({ tipo_atividade: e.target.value })}
                placeholder="Ex: Oficina de Artes, Roda de Conversa, Dinâmica de Grupo..."
                className="bg-background border-border/60 focus-visible:ring-indigo-500/30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evolucao_grupo" className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Evolução</Label>
            <Textarea
              id="evolucao_grupo"
              rows={10}
              value={data.evolucao || ''}
              onChange={(e) => onChange({ evolucao: e.target.value })}
              placeholder="Descreva a participação do paciente e o desenvolvimento da atividade..."
              className="bg-background border-border/60 focus-visible:ring-indigo-500/30 min-h-[200px] resize-none"
            />
          </div>
        </CardContent>
      </Card>
      
      <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-3">
        <div className="p-1.5 bg-amber-100 rounded text-amber-700">
          <Users className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-amber-900">Registro de Atividade Coletiva</h4>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            Este registro é específico para atividades em grupo e oficinas. Ele será salvo separadamente da evolução clínica individual, 
            permitindo uma organização clara do histórico do paciente.
          </p>
        </div>
      </div>
    </div>
  );
};
