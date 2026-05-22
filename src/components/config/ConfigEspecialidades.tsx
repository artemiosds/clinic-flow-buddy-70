import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { 
  Plus, Pencil, Trash2, Loader2, ChevronUp, ChevronDown, Eye, Copy, 
  GripVertical, Sparkles, X, Layout, Settings2, HelpCircle, 
  AlertCircle, CheckCircle2, Monitor, Save, Type, Hash, Calendar, CheckSquare, List, AlignLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { TIPO_REGISTRO_LABELS } from '@/utils/labels';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useEspecialidades,
  type EspecialidadeConfig,
  type CampoEspecialidade,
  type TipoProntuario,
  type CondicaoVisibilidade,
  DEFAULT_TIPOS,
} from '@/contexts/EspecialidadesContext';

const TIPOS_PRONTUARIO: { key: TipoProntuario; label: string; short: string }[] = [
  { key: 'avaliacao', label: TIPO_REGISTRO_LABELS.avaliacao_inicial, short: '1ª Consulta' },
  { key: 'retorno', label: TIPO_REGISTRO_LABELS.retorno, short: 'Retorno' },
  { key: 'sessao', label: TIPO_REGISTRO_LABELS.sessao, short: 'Sessão' },
  { key: 'urgencia', label: TIPO_REGISTRO_LABELS.urgencia, short: 'Urgência' },
  { key: 'procedimento', label: TIPO_REGISTRO_LABELS.procedimento, short: 'Procedimento' },
];

const FIELD_TYPES = [
  { id: 'text', label: 'Texto Curto', icon: Type, description: 'Nomes, observações breves' },
  { id: 'textarea', label: 'Texto Longo', icon: AlignLeft, description: 'Anamnese, evolução, descrições' },
  { id: 'number', label: 'Número', icon: Hash, description: 'Medidas, idade, doses' },
  { id: 'date', label: 'Data', icon: Calendar, description: 'Eventos, nascimento, prazos' },
  { id: 'select', label: 'Seleção', icon: List, description: 'Lista de opções pré-definidas' },
  { id: 'checkbox', label: 'Checkbox', icon: CheckSquare, description: 'Sim/Não ou seleção única' },
  { id: 'slider', label: 'Escala (0-10)', icon: Settings2, description: 'Intensidade, nível de dor' },
];

const PROFISSOES = ['fisioterapia', 'psicologia', 'fonoaudiologia', 'nutricao', 'terapia_ocupacional', 'medicina', 'odontologia', 'avaliacao_enfermagem', 'servico_social', 'assistente_social', 'cirurgia_geral', 'cirurgiao', 'infectologia', 'infectologista'];

// ---------- Sortable item ----------
interface SortableCampoProps {
  campo: CampoEspecialidade;
  onToggleHabilitado: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const SortableCampo: React.FC<SortableCampoProps> = ({
  campo, onToggleHabilitado, onEdit, onDelete, onCopy, onMoveUp, onMoveDown, isFirst, isLast,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: campo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const tipos = campo.tipos_prontuario || DEFAULT_TIPOS;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 p-3 rounded-lg border ${campo.habilitado ? 'bg-background border-border' : 'bg-muted/50 border-border/50 opacity-60'}`}
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mt-1"
        {...attributes}
        {...listeners}
        aria-label="Arrastar"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="flex flex-col gap-0.5">
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onMoveUp} disabled={isFirst} aria-label="Subir">
          <ChevronUp className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onMoveDown} disabled={isLast} aria-label="Descer">
          <ChevronDown className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{campo.label}</div>
        <div className="flex flex-wrap items-center gap-1 mt-1">
          <span className="text-[10px] text-muted-foreground capitalize">{campo.tipo}</span>
          {campo.obrigatorio && <Badge variant="outline" className="text-[9px] h-4 px-1">Obrigatório</Badge>}
          {campo.condicao && <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/40 text-amber-600">Condicional</Badge>}
          {tipos.map(t => (
            <Badge key={t} variant="secondary" className="text-[9px] h-4 px-1">
              {TIPOS_PRONTUARIO.find(x => x.key === t)?.short || t}
            </Badge>
          ))}
        </div>
        {campo.ajuda && (
          <p className="text-[10px] text-muted-foreground italic mt-1 truncate">💡 {campo.ajuda}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Editar">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCopy} title="Copiar para outra especialidade">
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Switch checked={campo.habilitado} onCheckedChange={onToggleHabilitado} />
        {!campo.isBuiltin && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70" onClick={onDelete} title="Excluir">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

// ---------- Main component ----------
const ConfigEspecialidades: React.FC = () => {
  const { especialidades, loading, setEspecialidades: saveEspecialidades } = useEspecialidades();
  const [selected, setSelected] = useState('fisioterapia');
  const [addFieldDialog, setAddFieldDialog] = useState(false);
  const [addEspDialog, setAddEspDialog] = useState(false);
  const [editingCampo, setEditingCampo] = useState<CampoEspecialidade | null>(null);
  const [copyDialog, setCopyDialog] = useState<{ campo: CampoEspecialidade; targets: string[] } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTipo, setPreviewTipo] = useState<TipoProntuario>('avaliacao');
  const [isSaving, setIsSaving] = useState(false);
  
  const [newField, setNewField] = useState({ 
    label: '', 
    tipo: 'textarea', 
    obrigatorio: false, 
    opcoes: '',
    ajuda: '',
    valor_padrao: '',
    tipos_prontuario: [...DEFAULT_TIPOS]
  });
  
  const [newEsp, setNewEsp] = useState({ label: '', profissoes: [] as string[] });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = async (updated: EspecialidadeConfig[], silent = false) => {
    await saveEspecialidades(updated, silent);
    if (!silent) toast.success('Configuração salva');
  };

  const esp = especialidades.find(e => e.key === selected);
  const camposOrdenados = useMemo(
    () => esp ? [...esp.campos].sort((a, b) => a.order - b.order) : [],
    [esp],
  );

  const updateEsp = (mutator: (e: EspecialidadeConfig) => EspecialidadeConfig) => {
    const updated = especialidades.map(e => e.key === selected ? mutator(e) : e);
    save(updated);
  };

  const toggleCampo = (campoId: string) => {
    updateEsp(e => ({ ...e, campos: e.campos.map(c => c.id === campoId ? { ...c, habilitado: !c.habilitado } : c) }));
  };

  const reorderCampos = (newOrderIds: string[]) => {
    if (!esp) return;
    const map = new Map(esp.campos.map(c => [c.id, c]));
    const reordered = newOrderIds
      .map((id, idx) => { const c = map.get(id); return c ? { ...c, order: idx + 1 } : null; })
      .filter(Boolean) as CampoEspecialidade[];
    updateEsp(e => ({ ...e, campos: reordered }));
  };

  const moveCampo = (campoId: string, direction: -1 | 1) => {
    const ids = camposOrdenados.map(c => c.id);
    const idx = ids.indexOf(campoId);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= ids.length) return;
    const reordered = arrayMove(ids, idx, newIdx);
    reorderCampos(reordered);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = camposOrdenados.map(c => c.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    reorderCampos(arrayMove(ids, oldIdx, newIdx));
  };

  const saveEditedCampo = async (updated: CampoEspecialidade) => {
    setIsSaving(true);
    try {
      updateEsp(e => ({ ...e, campos: e.campos.map(c => c.id === updated.id ? updated : c) }));
      setEditingCampo(null);
      toast.success('Campo atualizado');
    } catch (error) {
      toast.error('Erro ao atualizar campo');
    } finally {
      setIsSaving(false);
    }
  };

  const addCampoEsp = async () => {
    if (!newField.label.trim() || !esp || isSaving) return;
    
    setIsSaving(true);
    try {
      const campo: CampoEspecialidade = {
        id: `custom_${Date.now()}`,
        key: `custom_${Date.now()}`,
        label: newField.label.trim(),
        tipo: newField.tipo,
        obrigatorio: newField.obrigatorio,
        habilitado: true,
        isBuiltin: false,
        order: esp.campos.length + 1,
        tipos_prontuario: newField.tipos_prontuario.length > 0 ? newField.tipos_prontuario : [...DEFAULT_TIPOS],
        ajuda: newField.ajuda.trim() || undefined,
        valor_padrao: newField.valor_padrao.trim() || undefined,
        opcoes: newField.tipo === 'select' ? newField.opcoes.split(',').map(o => o.trim()).filter(Boolean) : undefined,
      };
      
      const updated = especialidades.map(e => e.key === selected ? { ...e, campos: [...e.campos, campo] } : e);
      await save(updated);
      
      setAddFieldDialog(false);
      setNewField({ 
        label: '', 
        tipo: 'textarea', 
        obrigatorio: false, 
        opcoes: '',
        ajuda: '',
        valor_padrao: '',
        tipos_prontuario: [...DEFAULT_TIPOS]
      });
      toast.success('Campo adicionado com sucesso');
    } catch (error) {
      console.error('Erro ao adicionar campo:', error);
      toast.error('Erro ao salvar o campo');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCampo = (campoId: string) => {
    const campo = esp?.campos.find(c => c.id === campoId);
    if (!campo || campo.isBuiltin) return;
    updateEsp(e => ({ ...e, campos: e.campos.filter(c => c.id !== campoId) }));
  };

  const copyCampoToEspecialidades = (campo: CampoEspecialidade, targets: string[]) => {
    if (targets.length === 0) return;
    const updated = especialidades.map(e => {
      if (!targets.includes(e.key)) return e;
      const newId = `copy_${campo.key}_${Date.now()}`;
      const novo: CampoEspecialidade = {
        ...campo,
        id: newId,
        key: newId,
        isBuiltin: false,
        order: e.campos.length + 1,
      };
      return { ...e, campos: [...e.campos, novo] };
    });
    save(updated);
    setCopyDialog(null);
    toast.success(`Campo copiado para ${targets.length} especialidade(s)`);
  };

  const addNovaEspecialidade = () => {
    if (!newEsp.label.trim()) return;
    const key = newEsp.label.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nova: EspecialidadeConfig = {
      key, label: newEsp.label.trim(), ativa: true,
      profissoes: newEsp.profissoes, campos: [],
    };
    save([...especialidades, nova]);
    setSelected(key);
    setAddEspDialog(false);
    setNewEsp({ label: '', profissoes: [] });
  };

  const toggleEspAtiva = (key: string) => {
    const updated = especialidades.map(e => e.key === key ? { ...e, ativa: !e.ativa } : e);
    save(updated);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-semibold font-display text-foreground">Campos por Especialidade</h3>
            <div className="flex gap-2">
              {esp && (
                <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                  <Eye className="w-4 h-4 mr-1" /> Visualizar Prontuário
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setAddEspDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> Nova Especialidade
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {especialidades.map(e => (
              <Button
                key={e.key}
                variant={selected === e.key ? 'default' : 'outline'}
                size="sm"
                className={`text-xs ${!e.ativa ? 'opacity-50' : ''}`}
                onClick={() => setSelected(e.key)}
              >
                {e.label}
                {!e.ativa && <span className="ml-1 text-[9px]">(inativa)</span>}
              </Button>
            ))}
          </div>

          {esp && (
            <>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-4 flex-wrap gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{esp.label}</span>
                  <p className="text-[10px] text-muted-foreground truncate">Profissões: {esp.profissoes.join(', ')}</p>
                </div>
                <Switch checked={esp.ativa} onCheckedChange={() => toggleEspAtiva(esp.key)} />
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={camposOrdenados.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {camposOrdenados.map((campo, idx) => (
                      <SortableCampo
                        key={campo.id}
                        campo={campo}
                        onToggleHabilitado={() => toggleCampo(campo.id)}
                        onEdit={() => setEditingCampo(campo)}
                        onDelete={() => deleteCampo(campo.id)}
                        onCopy={() => setCopyDialog({ campo, targets: [] })}
                        onMoveUp={() => moveCampo(campo.id, -1)}
                        onMoveDown={() => moveCampo(campo.id, 1)}
                        isFirst={idx === 0}
                        isLast={idx === camposOrdenados.length - 1}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <Button variant="outline" className="w-full mt-3" onClick={() => setAddFieldDialog(true)}>
                <Plus className="w-4 h-4 mr-2" /> Adicionar Campo
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Novo Modal Adicionar Campo (UX Avançada) */}
      <Dialog open={addFieldDialog} onOpenChange={(open) => {
        if (!isSaving) setAddFieldDialog(open);
      }}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden border-none shadow-2xl bg-background rounded-xl">
          <div className="flex h-[85vh] max-h-[700px] overflow-hidden">
            {/* Sidebar de Configuração */}
            <div className="w-1/2 flex flex-col border-r bg-muted/5">
              <div className="p-6 border-b bg-background/50 backdrop-blur-sm flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold font-display tracking-tight flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                    Novo Campo
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Configuração avançada para {esp?.label}</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full h-8 w-8 hover:bg-muted" 
                  onClick={() => !isSaving && setAddFieldDialog(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <ScrollArea className="flex-1 p-6">
                <Tabs defaultValue="geral" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted/50 p-1">
                    <TabsTrigger value="geral" className="text-xs flex items-center gap-2 py-2">
                      <Layout className="w-3.5 h-3.5" /> Geral
                    </TabsTrigger>
                    <TabsTrigger value="avancado" className="text-xs flex items-center gap-2 py-2">
                      <Settings2 className="w-3.5 h-3.5" /> Avançado
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="geral" className="space-y-5 mt-0 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        Nome do Campo
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3 h-3 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">O nome que aparecerá no prontuário</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Input 
                        placeholder="Ex: Histórico da Doença Atual" 
                        className="bg-background border-border/60 focus:ring-primary/20 transition-all h-10"
                        value={newField.label} 
                        onChange={e => setNewField(p => ({ ...p, label: e.target.value }))} 
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo de Entrada</Label>
                        <Select value={newField.tipo} onValueChange={v => setNewField(p => ({ ...p, tipo: v }))}>
                          <SelectTrigger className="bg-background border-border/60 h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="textarea">Texto longo</SelectItem>
                            <SelectItem value="text">Texto curto</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="slider">Escala (0-10)</SelectItem>
                            <SelectItem value="select">Seleção fixa</SelectItem>
                            <SelectItem value="date">Data</SelectItem>
                            <SelectItem value="checkbox">Caixa de seleção</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col justify-end space-y-3 pb-2">
                        <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/30">
                          <Label className="text-xs font-medium cursor-pointer" htmlFor="obrigatorio">Obrigatório</Label>
                          <Switch 
                            id="obrigatorio"
                            checked={newField.obrigatorio} 
                            onCheckedChange={v => setNewField(p => ({ ...p, obrigatorio: v }))} 
                          />
                        </div>
                      </div>
                    </div>

                    {newField.tipo === 'select' && (
                      <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opções de Seleção</Label>
                        <Textarea 
                          placeholder="Opção 1, Opção 2, Opção 3..." 
                          className="min-h-[80px] bg-background border-border/60 text-sm"
                          value={newField.opcoes} 
                          onChange={e => setNewField(p => ({ ...p, opcoes: e.target.value }))} 
                        />
                        <p className="text-[10px] text-muted-foreground">Separe cada opção por vírgula.</p>
                      </div>
                    )}

                    <div className="space-y-2 pt-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Onde este campo aparece?</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {TIPOS_PRONTUARIO.map(t => (
                          <div 
                            key={t.key} 
                            className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-pointer ${
                              newField.tipos_prontuario.includes(t.key) 
                                ? 'bg-primary/5 border-primary/30' 
                                : 'bg-background border-border/40 hover:border-border/80'
                            }`}
                            onClick={() => {
                              const cur = newField.tipos_prontuario;
                              setNewField(p => ({
                                ...p,
                                tipos_prontuario: cur.includes(t.key) 
                                  ? cur.filter(x => x !== t.key) 
                                  : [...cur, t.key]
                              }));
                            }}
                          >
                            <Checkbox 
                              checked={newField.tipos_prontuario.includes(t.key)} 
                              onCheckedChange={() => {}} // Handle on parent div for better UX
                            />
                            <span className="text-xs font-medium">{t.short}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="avancado" className="space-y-5 mt-0 animate-in fade-in slide-in-from-right-2 duration-300">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Texto de Ajuda / Placeholder</Label>
                      <Input 
                        placeholder="Ex: Descreva detalhadamente..." 
                        className="bg-background border-border/60 h-10"
                        value={newField.ajuda} 
                        onChange={e => setNewField(p => ({ ...p, ajuda: e.target.value }))} 
                      />
                      <p className="text-[10px] text-muted-foreground">Dicas para o profissional ao preencher este campo.</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor Padrão</Label>
                      <Input 
                        placeholder="Valor inicial do campo" 
                        className="bg-background border-border/60 h-10"
                        value={newField.valor_padrao} 
                        onChange={e => setNewField(p => ({ ...p, valor_padrao: e.target.value }))} 
                      />
                    </div>

                    <div className="p-4 rounded-xl border border-dashed border-primary/20 bg-primary/5 space-y-2">
                      <div className="flex items-center gap-2 text-primary">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">Informação Importante</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Campos personalizados são vinculados à especialidade <strong>{esp?.label}</strong>. 
                        Qualquer alteração feita aqui refletirá instantaneamente para todos os profissionais desta especialidade.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </ScrollArea>

              <div className="p-6 border-t bg-background/50 backdrop-blur-sm flex items-center justify-between gap-4">
                <Button 
                  variant="ghost" 
                  className="flex-1 font-medium h-11"
                  onClick={() => !isSaving && setAddFieldDialog(false)}
                  disabled={isSaving}
                >
                  Descartar
                </Button>
                <Button 
                  className="flex-[2] h-11 shadow-lg shadow-primary/20 font-bold transition-all hover:scale-[1.02] active:scale-95"
                  onClick={addCampoEsp}
                  disabled={!newField.label.trim() || isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {isSaving ? 'Salvando...' : 'Salvar Campo'}
                </Button>
              </div>
            </div>

            {/* Preview Panel - Visual Feedback em Tempo Real */}
            <div className="w-1/2 bg-muted/30 flex flex-col relative overflow-hidden">
              {/* Background decorative elements */}
              <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-0"></div>
              <div className="absolute bottom-[-10%] left-[-10%] w-48 h-48 bg-primary/10 rounded-full blur-3xl -z-0"></div>

              <div className="p-6 border-b bg-background/30 flex items-center gap-2 z-10">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <Monitor className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm font-bold tracking-tight">Preview do Prontuário</h3>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Live</span>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center p-8 z-10">
                <div className="w-full max-w-sm bg-background rounded-2xl shadow-xl border border-border/60 overflow-hidden transform transition-all duration-500 hover:shadow-2xl">
                  {/* Mock UI do Prontuário */}
                  <div className="p-3 border-b bg-muted/10 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-destructive/40"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400/40"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/40"></div>
                    <div className="ml-auto w-16 h-1.5 bg-muted-foreground/20 rounded-full"></div>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="space-y-3">
                      <div className="h-4 w-32 bg-muted-foreground/10 rounded animate-pulse"></div>
                      <div className="h-10 w-full border border-dashed border-border/60 rounded-lg flex items-center px-3">
                        <span className="text-[10px] text-muted-foreground/40 italic">Campo existente...</span>
                      </div>
                    </div>

                    <Separator className="opacity-40" />

                    {/* New Field Preview */}
                    <div className={`space-y-3 p-4 rounded-xl border-2 border-dashed transition-all duration-300 ${newField.label ? 'border-primary/40 bg-primary/5 scale-[1.02]' : 'border-border/40 bg-transparent'}`}>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground/80 flex items-center gap-1.5">
                          {newField.label || 'Nome do seu campo'}
                          {newField.obrigatorio && <span className="text-destructive font-bold">*</span>}
                        </Label>
                        <Badge variant="secondary" className="text-[8px] h-3.5 px-1 uppercase tracking-tighter bg-primary/10 text-primary border-none">
                          {newField.tipo}
                        </Badge>
                      </div>

                      <div className="transition-all duration-300">
                        {newField.tipo === 'textarea' && (
                          <div className="h-20 w-full bg-background border border-border/60 rounded-lg p-2 text-[11px] text-muted-foreground/60 italic overflow-hidden">
                            {newField.ajuda || 'Visualização do campo de texto longo...'}
                          </div>
                        )}
                        {newField.tipo === 'text' && (
                          <div className="h-10 w-full bg-background border border-border/60 rounded-lg flex items-center px-3 text-[11px] text-muted-foreground/60 italic">
                            {newField.ajuda || 'Texto curto...'}
                          </div>
                        )}
                        {newField.tipo === 'number' && (
                          <div className="h-10 w-24 bg-background border border-border/60 rounded-lg flex items-center px-3 text-[11px] text-muted-foreground/60">
                            0.00
                          </div>
                        )}
                        {newField.tipo === 'date' && (
                          <div className="h-10 w-full bg-background border border-border/60 rounded-lg flex items-center px-3 text-[11px] text-muted-foreground/60">
                            -- / -- / ----
                          </div>
                        )}
                        {newField.tipo === 'slider' && (
                          <div className="py-4 space-y-2">
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div className="h-full w-1/2 bg-primary"></div>
                            </div>
                            <div className="flex justify-between text-[8px] font-bold text-muted-foreground px-1">
                              <span>0</span>
                              <span>5</span>
                              <span>10</span>
                            </div>
                          </div>
                        )}
                        {newField.tipo === 'checkbox' && (
                          <div className="flex items-center gap-2 pt-1">
                            <div className="w-4 h-4 rounded border border-border/60"></div>
                            <span className="text-[11px] text-muted-foreground">Opção habilitada</span>
                          </div>
                        )}
                        {newField.tipo === 'select' && (
                          <div className="h-10 w-full bg-background border border-border/60 rounded-lg flex items-center justify-between px-3 text-[11px] text-muted-foreground/60">
                            <span>{newField.opcoes.split(',')[0]?.trim() || 'Selecione uma opção...'}</span>
                            <ChevronDown className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                      
                      {newField.ajuda && (
                        <p className="text-[9px] text-muted-foreground/70 italic flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" />
                          {newField.ajuda}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-muted/5 border-t flex justify-end gap-2">
                    <div className="w-12 h-6 bg-muted rounded animate-pulse"></div>
                    <div className="w-16 h-6 bg-primary/20 rounded animate-pulse"></div>
                  </div>
                </div>

                <div className="mt-8 text-center space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Fluxo de Aprovação</p>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Settings2 className="w-4 h-4" />
                      </div>
                      <span className="text-[8px] font-medium text-muted-foreground">Configurar</span>
                    </div>
                    <div className="w-8 h-[1px] bg-border/60"></div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full bg-background border border-border/60 flex items-center justify-center text-muted-foreground/40">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <span className="text-[8px] font-medium text-muted-foreground/40">Publicar</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit field dialog */}
      <EditCampoDialog
        campo={editingCampo}
        outrosCampos={esp?.campos.filter(c => c.id !== editingCampo?.id) || []}
        onClose={() => setEditingCampo(null)}
        onSave={saveEditedCampo}
      />

      {/* Copy field dialog */}
      <Dialog open={!!copyDialog} onOpenChange={(o) => !o && setCopyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar campo para outras especialidades</DialogTitle>
            <DialogDescription>Selecione as especialidades que devem receber uma cópia de "{copyDialog?.campo.label}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {especialidades.filter(e => e.key !== selected).map(e => (
              <div key={e.key} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50">
                <Checkbox
                  checked={copyDialog?.targets.includes(e.key) || false}
                  onCheckedChange={(v) => {
                    if (!copyDialog) return;
                    setCopyDialog({
                      ...copyDialog,
                      targets: v ? [...copyDialog.targets, e.key] : copyDialog.targets.filter(x => x !== e.key),
                    });
                  }}
                />
                <span className="text-sm">{e.label}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialog(null)}>Cancelar</Button>
            <Button
              disabled={!copyDialog?.targets.length}
              onClick={() => copyDialog && copyCampoToEspecialidades(copyDialog.campo, copyDialog.targets)}
            >
              Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Preview — {esp?.label}</DialogTitle>
            <DialogDescription>Como ficará o prontuário para esta especialidade no tipo selecionado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TIPOS_PRONTUARIO.map(t => (
                <Button
                  key={t.key}
                  size="sm"
                  variant={previewTipo === t.key ? 'default' : 'outline'}
                  onClick={() => setPreviewTipo(t.key)}
                >
                  {t.short}
                </Button>
              ))}
            </div>
            <PreviewCampos campos={camposOrdenados} tipo={previewTipo} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Add especialidade dialog */}
      <Dialog open={addEspDialog} onOpenChange={setAddEspDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Especialidade</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={newEsp.label} onChange={e => setNewEsp(p => ({ ...p, label: e.target.value }))} /></div>
            <div>
              <Label>Profissões vinculadas</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {PROFISSOES.map(p => (
                  <div key={p} className="flex items-center gap-2">
                    <Checkbox checked={newEsp.profissoes.includes(p)} onCheckedChange={v => setNewEsp(prev => ({
                      ...prev, profissoes: v ? [...prev.profissoes, p] : prev.profissoes.filter(x => x !== p)
                    }))} />
                    <span className="text-sm capitalize">{p.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEspDialog(false)}>Cancelar</Button>
            <Button onClick={addNovaEspecialidade} disabled={!newEsp.label.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ---------- Edit dialog ----------
interface EditCampoDialogProps {
  campo: CampoEspecialidade | null;
  outrosCampos: CampoEspecialidade[];
  onClose: () => void;
  onSave: (c: CampoEspecialidade) => void;
}

const EditCampoDialog: React.FC<EditCampoDialogProps> = ({ campo, outrosCampos, onClose, onSave }) => {
  const [draft, setDraft] = useState<CampoEspecialidade | null>(null);

  useEffect(() => {
    if (campo) setDraft({ ...campo, tipos_prontuario: campo.tipos_prontuario || [...DEFAULT_TIPOS] });
    else setDraft(null);
  }, [campo]);

  if (!draft) return null;

  const toggleTipo = (t: TipoProntuario) => {
    const cur = draft.tipos_prontuario || [];
    setDraft({
      ...draft,
      tipos_prontuario: cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t],
    });
  };

  const setCondicao = (cond: CondicaoVisibilidade | undefined) => {
    setDraft({ ...draft, condicao: cond });
  };

  return (
    <Dialog open={!!campo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar campo</DialogTitle>
          <DialogDescription>Altere as propriedades deste campo. Mudanças refletem em tempo real no prontuário.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Label exibido no prontuário</Label>
            <Input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={draft.tipo} onValueChange={(v) => setDraft({ ...draft, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="textarea">Texto longo</SelectItem>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="slider">Slider (0-10)</SelectItem>
                  <SelectItem value="select">Seleção</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={draft.obrigatorio} onCheckedChange={(v) => setDraft({ ...draft, obrigatorio: v })} />
              <Label>Obrigatório</Label>
            </div>
          </div>

          {draft.tipo === 'select' && (
            <div>
              <Label>Opções (vírgula)</Label>
              <Input
                value={(draft.opcoes || []).join(', ')}
                onChange={e => setDraft({ ...draft, opcoes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              />
            </div>
          )}

          <div>
            <Label>Valor padrão (opcional)</Label>
            <Input value={draft.valor_padrao || ''} onChange={e => setDraft({ ...draft, valor_padrao: e.target.value })} />
          </div>

          <div>
            <Label>Texto de ajuda (aparece abaixo do campo)</Label>
            <Textarea
              rows={2}
              value={draft.ajuda || ''}
              onChange={e => setDraft({ ...draft, ajuda: e.target.value })}
              placeholder="Ex: Use a escala MRC de 0 a 5."
            />
          </div>

          <div>
            <Label className="mb-1 block">Aparece em quais tipos de prontuário</Label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_PRONTUARIO.map(t => (
                <label key={t.key} className="flex items-center gap-2 p-2 rounded border bg-muted/30 cursor-pointer">
                  <Checkbox
                    checked={(draft.tipos_prontuario || []).includes(t.key)}
                    onCheckedChange={() => toggleTipo(t.key)}
                  />
                  <span className="text-sm">{t.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Por padrão: 1ª Consulta e Retorno.
            </p>
          </div>

          {/* Campo condicional */}
          <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Visibilidade condicional (opcional)</Label>
              <Switch
                checked={!!draft.condicao}
                onCheckedChange={(v) => setCondicao(v ? { campo: outrosCampos[0]?.key || '', operador: 'preenchido' } : undefined)}
              />
            </div>
            {draft.condicao && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">Mostrar este campo apenas se:</p>
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={draft.condicao.campo}
                    onValueChange={(v) => setCondicao({ ...draft.condicao!, campo: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Campo" /></SelectTrigger>
                    <SelectContent>
                      {outrosCampos.map(c => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={draft.condicao.operador}
                    onValueChange={(v: any) => setCondicao({ ...draft.condicao!, operador: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preenchido">estiver preenchido</SelectItem>
                      <SelectItem value="igual">for igual a</SelectItem>
                      <SelectItem value="diferente">for diferente de</SelectItem>
                      <SelectItem value="maior">for maior que</SelectItem>
                      <SelectItem value="menor">for menor que</SelectItem>
                    </SelectContent>
                  </Select>
                  {draft.condicao.operador !== 'preenchido' && (
                    <Input
                      placeholder="Valor"
                      value={draft.condicao.valor || ''}
                      onChange={e => setCondicao({ ...draft.condicao!, valor: e.target.value })}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(draft)} disabled={!draft.label.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Preview ----------
const PreviewCampos: React.FC<{ campos: CampoEspecialidade[]; tipo: TipoProntuario }> = ({ campos, tipo }) => {
  const visiveis = campos
    .filter(c => c.habilitado && (c.tipos_prontuario || DEFAULT_TIPOS).includes(tipo))
    .sort((a, b) => a.order - b.order);

  if (visiveis.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic p-6 text-center border border-dashed rounded-lg">
        Nenhum campo habilitado para este tipo de prontuário.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 rounded-lg border bg-background">
      {visiveis.map(c => (
        <div key={c.id} className="space-y-1">
          <Label>
            {c.label}
            {c.obrigatorio && <span className="text-destructive ml-1">*</span>}
          </Label>
          {c.tipo === 'textarea' && <Textarea rows={2} disabled placeholder={c.valor_padrao} />}
          {c.tipo === 'text' && <Input disabled placeholder={c.valor_padrao} />}
          {c.tipo === 'number' && <Input type="number" disabled placeholder={c.valor_padrao} />}
          {c.tipo === 'date' && <Input type="date" disabled />}
          {c.tipo === 'slider' && <Slider disabled value={[0]} min={0} max={10} step={1} />}
          {c.tipo === 'checkbox' && <Checkbox disabled />}
          {c.tipo === 'select' && (
            <Select disabled>
              <SelectTrigger><SelectValue placeholder={c.valor_padrao || 'Selecione...'} /></SelectTrigger>
              <SelectContent>{(c.opcoes || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {c.ajuda && <p className="text-[11px] text-muted-foreground italic">💡 {c.ajuda}</p>}
          {c.condicao && (
            <p className="text-[10px] text-amber-600">↳ visível só se "{c.condicao.campo}" {c.condicao.operador} {c.condicao.valor || ''}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default ConfigEspecialidades;
