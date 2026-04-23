import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, Settings2, Type,
  Hash, Calendar, CheckSquare, List, AlignLeft, ArrowUp, ArrowDown, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '@/contexts/DataContext';
import {
  useCustomFields,
  CustomFieldDef,
  CustomFieldType,
  ScreenKey,
  SCREEN_LABELS,
  ScreenConfig,
  NATIVE_FIELDS,
} from '@/hooks/useCustomFields';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

const FIELD_TYPE_LABELS: Record<CustomFieldType, { label: string; icon: React.ElementType; desc: string }> = {
  text: { label: 'Texto', icon: Type, desc: 'Campo de texto curto' },
  number: { label: 'Número', icon: Hash, desc: 'Valor numérico' },
  date: { label: 'Data', icon: Calendar, desc: 'Seletor de data' },
  checkbox: { label: 'Múltipla escolha', icon: CheckSquare, desc: 'Várias opções selecionáveis' },
  radio: { label: 'Escolha única', icon: List, desc: 'Apenas uma opção por vez' },
  select: { label: 'Seleção (dropdown)', icon: List, desc: 'Lista suspensa de opções' },
  textarea: { label: 'Texto Longo', icon: AlignLeft, desc: 'Campo de texto extenso' },
};

const generateId = () => `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// -------- Unified row type --------
type UnifiedRow =
  | { kind: 'native'; key: string; nome: string; rotuloOriginal: string }
  | { kind: 'custom'; key: string; field: CustomFieldDef };

// -------- Sortable item --------
interface SortableItemProps {
  row: UnifiedRow;
  hidden: boolean;
  effectiveLabel: string;
  isRenamed: boolean;
  onRename?: () => void;
  onToggleHidden?: () => void;
  onEditCustom?: () => void;
  onDeleteCustom?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canUp: boolean;
  canDown: boolean;
}

const SortableItem: React.FC<SortableItemProps> = ({
  row, hidden, effectiveLabel, isRenamed, onRename, onToggleHidden,
  onEditCustom, onDeleteCustom, onMoveUp, onMoveDown, canUp, canDown,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const typeInfo = row.kind === 'custom' ? FIELD_TYPE_LABELS[row.field.tipo] : undefined;
  const TypeIcon = typeInfo?.icon || (row.kind === 'native' ? Lock : Type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between gap-2 py-2 px-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors',
        hidden && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <TypeIcon className={cn('w-4 h-4 shrink-0', row.kind === 'custom' ? 'text-primary' : 'text-muted-foreground')} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'text-sm font-medium truncate',
                hidden && 'line-through text-muted-foreground',
              )}
            >
              {effectiveLabel}
            </span>
            {row.kind === 'native' && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Nativo</Badge>
            )}
            {row.kind === 'custom' && (
              <span className="text-[10px] text-muted-foreground">
                {FIELD_TYPE_LABELS[row.field.tipo]?.label}
              </span>
            )}
            {isRenamed && row.kind === 'native' && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Renomeado</Badge>
            )}
            {hidden && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Oculto</Badge>
            )}
            {row.kind === 'custom' && row.field.obrigatorio && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">Obrigatório</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} disabled={!canUp} title="Mover para cima">
          <ArrowUp className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} disabled={!canDown} title="Mover para baixo">
          <ArrowDown className="w-3.5 h-3.5" />
        </Button>
        {row.kind === 'native' ? (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRename} title="Renomear">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleHidden} title={hidden ? 'Mostrar' : 'Ocultar'}>
              {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEditCustom} title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleHidden} title={hidden ? 'Ativar' : 'Desativar'}>
              {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDeleteCustom} title="Excluir">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

// -------- Main component --------
const ConfigPersonalizarCampos: React.FC = () => {
  const { unidades } = useData();
  const { getRawScreenConfig, updateScreenConfig, loading } = useCustomFields();

  const [selectedScreen, setSelectedScreen] = useState<ScreenKey>('paciente');
  const [selectedUnit, setSelectedUnit] = useState<string>('__global__');
  const [screenConfig, setScreenConfig] = useState<ScreenConfig>({
    fields: [], hiddenNative: [], labelOverrides: {}, orderedNames: [],
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [renameModal, setRenameModal] = useState<{ nome: string; rotulo: string } | null>(null);

  const [fieldForm, setFieldForm] = useState({
    rotulo: '', tipo: 'text' as CustomFieldType, obrigatorio: false,
    opcoes: [] as string[], novaOpcao: '', valorPadrao: '', mostrarListagem: false,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!loading) {
      setScreenConfig(getRawScreenConfig(selectedScreen, selectedUnit));
    }
  }, [selectedScreen, selectedUnit, loading, getRawScreenConfig]);

  const save = useCallback(async (cfg: ScreenConfig) => {
    setScreenConfig(cfg);
    await updateScreenConfig(selectedScreen, selectedUnit, cfg);
    toast.success('Configuração salva');
  }, [selectedScreen, selectedUnit, updateScreenConfig]);

  // Build unified ordered list — uses orderedNames if present, otherwise [natives..., customs by ordem]
  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const natives = NATIVE_FIELDS[selectedScreen] || [];
    const customs = screenConfig.fields;

    const allByName = new Map<string, UnifiedRow>();
    natives.forEach((n) => {
      allByName.set(n.nome, { kind: 'native', key: `native:${n.nome}`, nome: n.nome, rotuloOriginal: n.rotulo });
    });
    customs.forEach((c) => {
      allByName.set(c.nome, { kind: 'custom', key: `custom:${c.nome}`, field: c });
    });

    const order = screenConfig.orderedNames || [];
    const result: UnifiedRow[] = [];
    const consumed = new Set<string>();

    order.forEach((n) => {
      const r = allByName.get(n);
      if (r && !consumed.has(n)) {
        result.push(r);
        consumed.add(n);
      }
    });
    // Append any new fields (not yet ordered) at the end
    natives.forEach((n) => {
      if (!consumed.has(n.nome)) {
        result.push(allByName.get(n.nome)!);
        consumed.add(n.nome);
      }
    });
    customs
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .forEach((c) => {
        if (!consumed.has(c.nome)) {
          result.push(allByName.get(c.nome)!);
          consumed.add(c.nome);
        }
      });

    return result;
  }, [selectedScreen, screenConfig]);

  const persistOrder = useCallback(async (rows: UnifiedRow[]) => {
    const orderedNames = rows.map((r) => r.kind === 'native' ? r.nome : r.field.nome);
    // Also recompute custom ordem so existing renderers sort consistently
    const newCustoms = screenConfig.fields.map((f) => {
      const idx = orderedNames.indexOf(f.nome);
      return { ...f, ordem: (idx >= 0 ? idx : orderedNames.length) * 10 };
    });
    await save({ ...screenConfig, fields: newCustoms, orderedNames });
  }, [screenConfig, save]);

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = unifiedRows.findIndex((r) => r.key === active.id);
    const newIndex = unifiedRows.findIndex((r) => r.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(unifiedRows, oldIndex, newIndex);
    await persistOrder(moved);
  }, [unifiedRows, persistOrder]);

  const moveByArrow = useCallback(async (idx: number, dir: 'up' | 'down') => {
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= unifiedRows.length) return;
    const moved = arrayMove(unifiedRows, idx, swap);
    await persistOrder(moved);
  }, [unifiedRows, persistOrder]);

  // ---------- Custom field CRUD ----------
  const openAddModal = () => {
    setEditingField(null);
    setFieldForm({ rotulo: '', tipo: 'text', obrigatorio: false, opcoes: [], novaOpcao: '', valorPadrao: '', mostrarListagem: false });
    setModalOpen(true);
  };

  const openEditModal = (field: CustomFieldDef) => {
    setEditingField(field);
    setFieldForm({
      rotulo: field.rotulo,
      tipo: field.tipo,
      obrigatorio: field.obrigatorio,
      opcoes: [...field.opcoes],
      novaOpcao: '',
      valorPadrao: field.valorPadrao,
      mostrarListagem: field.mostrarListagem,
    });
    setModalOpen(true);
  };

  const saveField = async () => {
    if (!fieldForm.rotulo.trim()) {
      toast.error('Rótulo é obrigatório');
      return;
    }
    const needsOptions = ['select', 'checkbox', 'radio'].includes(fieldForm.tipo);
    if (needsOptions && fieldForm.opcoes.filter(Boolean).length === 0) {
      toast.error('Adicione pelo menos uma opção para este tipo de campo');
      return;
    }

    const nome = editingField?.nome || fieldForm.rotulo
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    const field: CustomFieldDef = {
      id: editingField?.id || generateId(),
      nome,
      rotulo: fieldForm.rotulo.trim(),
      tipo: fieldForm.tipo,
      opcoes: ['select', 'checkbox', 'radio'].includes(fieldForm.tipo) ? fieldForm.opcoes.filter(Boolean) : [],
      obrigatorio: fieldForm.obrigatorio,
      ativo: editingField?.ativo ?? true,
      ordem: editingField?.ordem ?? (screenConfig.fields.length + 1) * 10,
      valorPadrao: fieldForm.valorPadrao,
      mostrarListagem: fieldForm.mostrarListagem,
    };

    const newFields = editingField
      ? screenConfig.fields.map((f) => (f.id === editingField.id ? field : f))
      : [...screenConfig.fields, field];

    // Append new field name to orderedNames if missing
    const order = screenConfig.orderedNames || [];
    const newOrder = order.includes(nome) ? order : [...order, nome];

    await save({ ...screenConfig, fields: newFields, orderedNames: newOrder });
    setModalOpen(false);
  };

  const deleteField = async (fieldId: string) => {
    if (!confirm('Excluir este campo personalizado? Os dados já preenchidos serão mantidos no banco.')) return;
    const target = screenConfig.fields.find((f) => f.id === fieldId);
    const newFields = screenConfig.fields.filter((f) => f.id !== fieldId);
    const newOrder = (screenConfig.orderedNames || []).filter((n) => n !== target?.nome);
    await save({ ...screenConfig, fields: newFields, orderedNames: newOrder });
  };

  const toggleCustomActive = async (fieldId: string) => {
    await save({
      ...screenConfig,
      fields: screenConfig.fields.map((f) => (f.id === fieldId ? { ...f, ativo: !f.ativo } : f)),
    });
  };

  // ---------- Native field management ----------
  const toggleNativeHidden = async (fieldName: string) => {
    const hidden = screenConfig.hiddenNative.includes(fieldName)
      ? screenConfig.hiddenNative.filter((n) => n !== fieldName)
      : [...screenConfig.hiddenNative, fieldName];
    await save({ ...screenConfig, hiddenNative: hidden });
  };

  const openRenameNative = (field: { nome: string; rotulo: string }) => {
    setRenameModal({ nome: field.nome, rotulo: screenConfig.labelOverrides[field.nome] || field.rotulo });
  };

  const saveRename = async () => {
    if (!renameModal) return;
    const overrides = { ...screenConfig.labelOverrides, [renameModal.nome]: renameModal.rotulo.trim() };
    // If user clears the rename, remove the override
    if (!renameModal.rotulo.trim()) delete overrides[renameModal.nome];
    await save({ ...screenConfig, labelOverrides: overrides });
    setRenameModal(null);
  };

  // ---------- Helpers for rendering ----------
  const isHiddenForRow = (row: UnifiedRow): boolean => {
    if (row.kind === 'native') return screenConfig.hiddenNative.includes(row.nome);
    return !row.field.ativo;
  };

  const labelForRow = (row: UnifiedRow): string => {
    if (row.kind === 'native') return screenConfig.labelOverrides[row.nome] || row.rotuloOriginal;
    return row.field.rotulo;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold font-display text-foreground">Personalizar Campos</h2>
          <p className="text-sm text-muted-foreground">
            Renomeie, reordene (com arrastar ou setas), oculte ou adicione campos. Mudanças refletem em tempo real em todo o sistema.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium">Tela</Label>
          <Select value={selectedScreen} onValueChange={(v) => setSelectedScreen(v as ScreenKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SCREEN_LABELS) as ScreenKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SCREEN_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm font-medium">Unidade</Label>
          <Select value={selectedUnit} onValueChange={setSelectedUnit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__global__">Global (Todas as unidades)</SelectItem>
              {unidades.filter((u) => u.ativo).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <h3 className="font-semibold text-foreground">Campos da Tela</h3>
              <p className="text-xs text-muted-foreground">
                Lista unificada — nativos e personalizados podem ser misturados em qualquer ordem.
              </p>
            </div>
            <Button size="sm" onClick={openAddModal}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Campo
            </Button>
          </div>

          {unifiedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum campo nessa tela.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={unifiedRows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {unifiedRows.map((row, idx) => (
                    <SortableItem
                      key={row.key}
                      row={row}
                      hidden={isHiddenForRow(row)}
                      effectiveLabel={labelForRow(row)}
                      isRenamed={row.kind === 'native' && !!screenConfig.labelOverrides[row.nome] && screenConfig.labelOverrides[row.nome] !== row.rotuloOriginal}
                      onRename={row.kind === 'native' ? () => openRenameNative({ nome: row.nome, rotulo: row.rotuloOriginal }) : undefined}
                      onToggleHidden={() => row.kind === 'native' ? toggleNativeHidden(row.nome) : toggleCustomActive(row.field.id)}
                      onEditCustom={row.kind === 'custom' ? () => openEditModal(row.field) : undefined}
                      onDeleteCustom={row.kind === 'custom' ? () => deleteField(row.field.id) : undefined}
                      onMoveUp={() => moveByArrow(idx, 'up')}
                      onMoveDown={() => moveByArrow(idx, 'down')}
                      canUp={idx > 0}
                      canDown={idx < unifiedRows.length - 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal — Premium */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{editingField ? 'Editar Campo' : 'Adicionar Campo Personalizado'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Rótulo */}
            <div>
              <Label className="font-medium">Nome do campo</Label>
              <Input
                value={fieldForm.rotulo}
                onChange={(e) => setFieldForm((p) => ({ ...p, rotulo: e.target.value }))}
                placeholder="Ex: Nome do acompanhante"
                className="mt-1.5"
              />
            </div>

            {/* Tipo — Visual cards */}
            <div>
              <Label className="font-medium mb-2 block">Tipo de campo</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => {
                  const info = FIELD_TYPE_LABELS[t];
                  const Icon = info.icon;
                  const selected = fieldForm.tipo === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFieldForm((p) => ({ ...p, tipo: t }))}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center',
                        selected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/40 hover:bg-muted/50',
                      )}
                    >
                      <Icon className={cn('w-5 h-5', selected ? 'text-primary' : 'text-muted-foreground')} />
                      <span className={cn('text-xs font-medium', selected ? 'text-primary' : 'text-foreground')}>{info.label}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{info.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Opções — para select, checkbox, radio */}
            {['select', 'checkbox', 'radio'].includes(fieldForm.tipo) && (
              <div>
                <Label className="font-medium mb-2 block">Opções</Label>
                <div className="space-y-2">
                  {fieldForm.opcoes.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const newOpcoes = [...fieldForm.opcoes];
                          newOpcoes[i] = e.target.value;
                          setFieldForm((p) => ({ ...p, opcoes: newOpcoes }));
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive shrink-0"
                        onClick={() => setFieldForm((p) => ({ ...p, opcoes: p.opcoes.filter((_, idx) => idx !== i) }))}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      value={fieldForm.novaOpcao}
                      onChange={(e) => setFieldForm((p) => ({ ...p, novaOpcao: e.target.value }))}
                      placeholder="Digite uma opção e pressione Enter"
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const v = fieldForm.novaOpcao.trim();
                          if (v && !fieldForm.opcoes.includes(v)) {
                            setFieldForm((p) => ({ ...p, opcoes: [...p.opcoes, v], novaOpcao: '' }));
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const v = fieldForm.novaOpcao.trim();
                        if (v && !fieldForm.opcoes.includes(v)) {
                          setFieldForm((p) => ({ ...p, opcoes: [...p.opcoes, v], novaOpcao: '' }));
                        }
                      }}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
                    </Button>
                  </div>
                  {fieldForm.opcoes.length === 0 && (
                    <p className="text-xs text-muted-foreground">Adicione pelo menos uma opção.</p>
                  )}
                </div>
              </div>
            )}

            {/* Valor padrão */}
            <div>
              <Label className="font-medium">Valor padrão</Label>
              <Input
                value={fieldForm.valorPadrao}
                onChange={(e) => setFieldForm((p) => ({ ...p, valorPadrao: e.target.value }))}
                placeholder="Deixe vazio se não houver"
                className="mt-1.5"
              />
            </div>

            {/* Obrigatório + Listagem */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Obrigatório</p>
                  <p className="text-[10px] text-muted-foreground">Campo deve ser preenchido</p>
                </div>
                <Switch checked={fieldForm.obrigatorio} onCheckedChange={(v) => setFieldForm((p) => ({ ...p, obrigatorio: v }))} />
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Na listagem</p>
                  <p className="text-[10px] text-muted-foreground">Exibir na tabela de dados</p>
                </div>
                <Switch checked={fieldForm.mostrarListagem} onCheckedChange={(v) => setFieldForm((p) => ({ ...p, mostrarListagem: v }))} />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveField}>{editingField ? 'Salvar Alterações' : 'Adicionar Campo'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Modal */}
      <Dialog open={!!renameModal} onOpenChange={() => setRenameModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear Campo</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Novo rótulo (deixe vazio para restaurar o original)</Label>
            <Input
              value={renameModal?.rotulo || ''}
              onChange={(e) => setRenameModal((prev) => (prev ? { ...prev, rotulo: e.target.value } : null))}
            />
            <p className="text-xs text-muted-foreground mt-2">
              O nome do campo no banco não muda — apenas o que aparece na tela.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameModal(null)}>Cancelar</Button>
            <Button onClick={saveRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfigPersonalizarCampos;
