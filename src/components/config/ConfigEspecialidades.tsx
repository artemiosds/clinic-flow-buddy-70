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
  AlertCircle, CheckCircle2, Monitor, Save, Type, Hash, Calendar, CheckSquare, List, AlignLeft, PlusCircle
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
  { id: 'text', label: 'Texto Curto', icon: Type, description: 'Respostas rápidas, nomes ou observações curtas' },
  { id: 'textarea', label: 'Texto Longo', icon: AlignLeft, description: 'Descrições detalhadas, anamnese ou evolução' },
  { id: 'number', label: 'Número', icon: Hash, description: 'Medidas, doses, idade ou valores numéricos' },
  { id: 'select', label: 'Seleção', icon: List, description: 'Escolha uma única opção de uma lista prévia' },
  { id: 'multiselect', label: 'Múltipla Escolha', icon: CheckSquare, description: 'Selecione várias opções simultaneamente' },
  { id: 'date', label: 'Data', icon: Calendar, description: 'Seleção de datas no calendário' },
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
  const [optionInput, setOptionInput] = useState('');
  
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
        opcoes: (newField.tipo === 'select' || newField.tipo === 'multiselect') ? newField.opcoes.split(',').map(o => o.trim()).filter(Boolean) : undefined,
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

      {/* Modal Adicionar Campo - Referência Visual */}
      <Dialog open={addFieldDialog} onOpenChange={(open) => {
        if (!isSaving) setAddFieldDialog(open);
      }}>
        <DialogContent 
          className="max-w-3xl p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-slate-950 rounded-[28px]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-col h-[90vh] max-h-[850px]">
            {/* Cabeçalho */}
            <div className="px-10 py-8 border-b flex items-center justify-between sticky top-0 z-20 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <PlusCircle className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
                    Novo Campo Personalizado
                  </h2>
                  <p className="text-[15px] text-slate-500 font-medium">
                    O campo configurado aparecerá automaticamente no prontuário.
                  </p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full h-10 w-10 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" 
                onClick={() => !isSaving && setAddFieldDialog(false)}
              >
                <X className="w-6 h-6 text-slate-400" />
              </Button>
            </div>

            <ScrollArea className="flex-1 px-10 py-10">
              <div className="space-y-12 pb-6">
                
                {/* 1. Nome do Campo */}
                <div className="space-y-4">
                  <Label className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400">Nome do campo</Label>
                  <Input 
                    placeholder="Ex: Histórico da Queixa Principal" 
                    className="bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-primary/20 focus:bg-white dark:focus:bg-slate-950 transition-all h-16 text-lg font-semibold rounded-2xl px-6"
                    value={newField.label} 
                    onChange={e => setNewField(p => ({ ...p, label: e.target.value }))} 
                  />
                </div>

                {/* 2. Tipo do Campo */}
                <div className="space-y-5">
                  <Label className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400">Tipo do campo</Label>
                  <div className="grid grid-cols-2 gap-4">
                    {FIELD_TYPES.map((type) => {
                      const Icon = type.icon;
                      const isSelected = newField.tipo === type.id;
                      return (
                        <div 
                          key={type.id}
                          onClick={() => setNewField(p => ({ ...p, tipo: type.id }))}
                          className={`group cursor-pointer p-5 rounded-[20px] border-2 transition-all duration-300 flex items-start gap-4 ${
                            isSelected 
                              ? 'bg-primary/5 border-primary shadow-[0_8px_20px_-10px_rgba(var(--primary),0.3)]' 
                              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className={`mt-0.5 p-3 rounded-xl transition-colors ${isSelected ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-100'}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className={`text-base font-bold transition-colors ${isSelected ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                              {type.label}
                            </p>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                              {type.description}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center animate-in zoom-in-50 duration-300">
                              <CheckCircle2 className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Opções (Condicional) */}
                {(newField.tipo === 'select' || newField.tipo === 'multiselect') && (
                  <div className="space-y-5 animate-in slide-in-from-top-4 duration-500">
                    <Label className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400">Opções de resposta</Label>
                    <div className="flex gap-3">
                      <Input 
                        placeholder="Digite uma opção e aperte Enter ou +" 
                        className="bg-slate-50 dark:bg-slate-900 border-none h-14 rounded-2xl text-base px-6 focus:ring-2 focus:ring-primary/10 transition-all"
                        value={optionInput}
                        onChange={e => setOptionInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (optionInput.trim()) {
                              const current = newField.opcoes ? newField.opcoes.split(',').map(o => o.trim()).filter(Boolean) : [];
                              if (!current.includes(optionInput.trim())) {
                                setNewField(p => ({ ...p, opcoes: [...current, optionInput.trim()].join(', ') }));
                              }
                              setOptionInput('');
                            }
                          }
                        }}
                      />
                      <Button 
                        type="button" 
                        size="icon" 
                        className="h-14 w-14 rounded-2xl shrink-0 shadow-lg shadow-primary/10 transition-transform active:scale-95"
                        onClick={() => {
                          if (optionInput.trim()) {
                            const current = newField.opcoes ? newField.opcoes.split(',').map(o => o.trim()).filter(Boolean) : [];
                            if (!current.includes(optionInput.trim())) {
                              setNewField(p => ({ ...p, opcoes: [...current, optionInput.trim()].join(', ') }));
                            }
                            setOptionInput('');
                          }
                        }}
                      >
                        <Plus className="w-6 h-6" />
                      </Button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2.5 pt-2">
                      {newField.opcoes && newField.opcoes.split(',').map(o => o.trim()).filter(Boolean).map(op => (
                        <div key={op} className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-3 group animate-in zoom-in-95 duration-200">
                          {op}
                          <button 
                            className="text-slate-300 hover:text-destructive transition-colors"
                            onClick={() => {
                              const current = newField.opcoes.split(',').map(o => o.trim()).filter(Boolean);
                              setNewField(p => ({ ...p, opcoes: current.filter(c => c !== op).join(', ') }));
                            }}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {(!newField.opcoes || !newField.opcoes.trim()) && (
                        <div className="w-full p-8 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-400">
                          <List className="w-8 h-8 mb-2 opacity-20" />
                          <p className="text-sm font-medium">Nenhuma opção adicionada ainda.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. Campo Obrigatório */}
                <div className="flex items-center justify-between p-8 rounded-[24px] border-2 border-slate-50 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/50 transition-all hover:bg-slate-50 dark:hover:bg-slate-900">
                  <div className="space-y-1.5">
                    <p className="text-[17px] font-bold text-slate-800 dark:text-slate-100">Campo Obrigatório</p>
                    <p className="text-[14px] text-slate-500 font-medium">O profissional deve preencher este campo para salvar o prontuário.</p>
                  </div>
                  <Switch 
                    checked={newField.obrigatorio} 
                    onCheckedChange={v => setNewField(p => ({ ...p, obrigatorio: v }))} 
                    className="data-[state=checked]:bg-primary h-7 w-12"
                  />
                </div>

                {/* 5. Onde aparece */}
                <div className="space-y-5">
                  <Label className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400">Aparece nos tipos</Label>
                  <div className="flex flex-wrap gap-3">
                    {TIPOS_PRONTUARIO.map(t => {
                      const isSelected = newField.tipos_prontuario.includes(t.key);
                      return (
                        <div 
                          key={t.key} 
                          onClick={() => {
                            const cur = newField.tipos_prontuario;
                            setNewField(p => ({
                              ...p,
                              tipos_prontuario: cur.includes(t.key) 
                                ? cur.filter(x => x !== t.key) 
                                : [...cur, t.key]
                            }));
                          }}
                          className={`cursor-pointer px-7 py-4 rounded-[20px] border-2 transition-all font-bold text-sm select-none shadow-sm ${
                            isSelected 
                              ? 'bg-primary border-primary text-white shadow-primary/20 scale-[1.02]' 
                              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200 dark:hover:border-slate-700 hover:scale-[1.02]'
                          }`}
                        >
                          {t.short}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </ScrollArea>

            {/* Rodapé */}
            <div className="px-10 py-8 border-t bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm flex items-center justify-between gap-5 mt-auto">
              <Button 
                variant="ghost" 
                className="font-bold text-slate-500 h-14 px-8 rounded-2xl transition-all hover:bg-slate-50 text-base"
                onClick={() => !isSaving && setAddFieldDialog(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button 
                className="bg-primary hover:bg-primary/90 text-white font-bold h-14 px-12 shadow-xl shadow-primary/25 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] min-w-[220px] text-base"
                onClick={addCampoEsp}
                disabled={!newField.label.trim() || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin mr-3" />
                    Salvando...
                  </>
                ) : (
                  'Adicionar Campo'
                )}
              </Button>
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
  const [optionInput, setOptionInput] = useState('');

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
      <DialogContent 
        className="max-w-3xl p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-slate-950 rounded-[28px]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col h-[90vh] max-h-[850px]">
          {/* Cabeçalho */}
          <div className="px-10 py-8 border-b flex items-center justify-between sticky top-0 z-20 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Pencil className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
                  Editar Campo Personalizado
                </h2>
                <p className="text-[15px] text-slate-500 font-medium">
                  Altere as configurações para este campo no prontuário.
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full h-10 w-10 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" 
              onClick={onClose}
            >
              <X className="w-6 h-6 text-slate-400" />
            </Button>
          </div>

          <ScrollArea className="flex-1 px-10 py-10">
            <div className="space-y-12 pb-6">
              
              {/* 1. Nome do Campo */}
              <div className="space-y-4">
                <Label className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400">Nome do campo</Label>
                <Input 
                  placeholder="Ex: Histórico da Queixa Principal" 
                  className="bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-primary/20 focus:bg-white dark:focus:bg-slate-950 transition-all h-16 text-lg font-semibold rounded-2xl px-6"
                  value={draft.label} 
                  onChange={e => setDraft({ ...draft, label: e.target.value })} 
                />
              </div>

              {/* 2. Tipo do Campo */}
              <div className="space-y-5">
                <Label className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400">Tipo do campo</Label>
                <div className="grid grid-cols-2 gap-4">
                  {FIELD_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isSelected = draft.tipo === type.id;
                    return (
                      <div 
                        key={type.id}
                        onClick={() => setDraft({ ...draft, tipo: type.id })}
                        className={`group cursor-pointer p-5 rounded-[20px] border-2 transition-all duration-300 flex items-start gap-4 ${
                          isSelected 
                            ? 'bg-primary/5 border-primary shadow-[0_8px_20px_-10px_rgba(var(--primary),0.3)]' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className={`mt-0.5 p-3 rounded-xl transition-colors ${isSelected ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-100'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <p className={`text-base font-bold transition-colors ${isSelected ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                            {type.label}
                          </p>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                            {type.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Opções (Condicional) */}
              {(draft.tipo === 'select' || draft.tipo === 'multiselect') && (
                <div className="space-y-5 animate-in slide-in-from-top-4 duration-500">
                  <Label className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400">Opções de resposta</Label>
                  <div className="flex gap-3">
                    <Input 
                      placeholder="Digite uma opção e aperte Enter ou +" 
                      className="bg-slate-50 dark:bg-slate-900 border-none h-14 rounded-2xl text-base px-6 focus:ring-2 focus:ring-primary/10 transition-all"
                      value={optionInput}
                      onChange={e => setOptionInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (optionInput.trim()) {
                            const current = draft.opcoes || [];
                            if (!current.includes(optionInput.trim())) {
                              setDraft({ ...draft, opcoes: [...current, optionInput.trim()] });
                            }
                            setOptionInput('');
                          }
                        }
                      }}
                    />
                    <Button 
                      type="button" 
                      size="icon" 
                      className="h-14 w-14 rounded-2xl shrink-0 shadow-lg shadow-primary/10 transition-transform active:scale-95"
                      onClick={() => {
                        if (optionInput.trim()) {
                          const current = draft.opcoes || [];
                          if (!current.includes(optionInput.trim())) {
                            setDraft({ ...draft, opcoes: [...current, optionInput.trim()] });
                          }
                          setOptionInput('');
                        }
                      }}
                    >
                      <Plus className="w-6 h-6" />
                    </Button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2.5 pt-2">
                    {(draft.opcoes || []).map(op => (
                      <div key={op} className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-3 group animate-in zoom-in-95 duration-200">
                        {op}
                        <button 
                          className="text-slate-300 hover:text-destructive transition-colors"
                          onClick={() => {
                            setDraft({ ...draft, opcoes: draft.opcoes?.filter(c => c !== op) });
                          }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Campo Obrigatório */}
              <div className="flex items-center justify-between p-8 rounded-[24px] border-2 border-slate-50 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/50 transition-all hover:bg-slate-50 dark:hover:bg-slate-900">
                <div className="space-y-1.5">
                  <p className="text-[17px] font-bold text-slate-800 dark:text-slate-100">Campo Obrigatório</p>
                  <p className="text-[14px] text-slate-500 font-medium">O profissional deve preencher este campo para salvar o prontuário.</p>
                </div>
                <Switch 
                  checked={draft.obrigatorio} 
                  onCheckedChange={(v) => setDraft({ ...draft, obrigatorio: v })} 
                  className="data-[state=checked]:bg-primary h-7 w-12"
                />
              </div>

              {/* 5. Onde aparece */}
              <div className="space-y-5">
                <Label className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400">Aparece nos tipos</Label>
                <div className="flex flex-wrap gap-3">
                  {TIPOS_PRONTUARIO.map(t => {
                    const isSelected = (draft.tipos_prontuario || []).includes(t.key);
                    return (
                      <div 
                        key={t.key} 
                        onClick={() => toggleTipo(t.key)}
                        className={`cursor-pointer px-7 py-4 rounded-[20px] border-2 transition-all font-bold text-sm select-none shadow-sm ${
                          isSelected 
                            ? 'bg-primary border-primary text-white shadow-primary/20 scale-[1.02]' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200 dark:hover:border-slate-700 hover:scale-[1.02]'
                        }`}
                      >
                        {t.short}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </ScrollArea>

          {/* Rodapé */}
          <div className="px-10 py-8 border-t bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm flex items-center justify-between gap-5 mt-auto">
            <Button 
              variant="ghost" 
              className="font-bold text-slate-500 h-14 px-8 rounded-2xl transition-all hover:bg-slate-50 text-base"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button 
              className="bg-primary hover:bg-primary/90 text-white font-bold h-14 px-12 shadow-xl shadow-primary/25 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] min-w-[220px] text-base"
              onClick={() => onSave(draft)}
              disabled={!draft.label.trim()}
            >
              <Save className="w-5 h-5 mr-3" />
              <span>Salvar Alterações</span>
            </Button>
          </div>
        </div>
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
