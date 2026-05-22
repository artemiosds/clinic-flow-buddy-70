import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, Settings2, Type,
  Hash, Calendar, CheckSquare, List, AlignLeft, ArrowUp, ArrowDown, Lock,
  Phone, IdCard, Building2, MapPin, Mail, Link as LinkIcon, Clock, DollarSign, Paperclip,
  CheckCircle, Sliders, Activity, Info, FileText, Image, PenTool, Table, Calculator, Layout,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '@/contexts/DataContext';
import { useEspecialidades } from '@/contexts/EspecialidadesContext';
import { useConfiguracao } from '@/hooks/useConfiguracao';
import {
  CustomFieldDef,
  CustomFieldType,
  CustomFieldCondition,
  CustomFieldValidation,
  ConditionalOperator,
  ScreenKey,
  SCREEN_LABELS,
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
  text: { label: 'Texto', icon: Type, desc: 'Texto curto' },
  textarea: { label: 'Texto Longo', icon: AlignLeft, desc: 'Múltiplas linhas' },
  number: { label: 'Número', icon: Hash, desc: 'Valor numérico' },
  date: { label: 'Data', icon: Calendar, desc: 'Seletor de data' },
  time: { label: 'Hora', icon: Clock, desc: 'Hora HH:MM' },
  select: { label: 'Seleção', icon: List, desc: 'Dropdown' },
  radio: { label: 'Escolha única', icon: List, desc: 'Uma opção' },
  checkbox: { label: 'Múltipla escolha', icon: CheckSquare, desc: 'Várias opções' },
  phone: { label: 'Telefone', icon: Phone, desc: 'Máscara BR' },
  cpf: { label: 'CPF', icon: IdCard, desc: '999.999.999-99' },
  cnpj: { label: 'CNPJ', icon: Building2, desc: '99.999.999/0001-99' },
  cep: { label: 'CEP', icon: MapPin, desc: '99999-999' },
  email: { label: 'E-mail', icon: Mail, desc: 'Validação automática' },
  url: { label: 'URL', icon: LinkIcon, desc: 'Link externo' },
  currency: { label: 'Moeda', icon: DollarSign, desc: 'R$ 0,00' },
  file: { label: 'Arquivo', icon: Paperclip, desc: 'Upload' },
  checklist: { label: 'Checklist', icon: CheckCircle, desc: 'Lista de tarefas' },
  scale_numeric: { label: 'Escala Numérica', icon: Sliders, desc: 'Seletor 0-10' },
  scale_eva: { label: 'Escala EVA', icon: Activity, desc: 'Escala de Dor' },
  scale_functional: { label: 'Escala Funcional', icon: Sliders, desc: 'Avaliação Funcional' },
  cid: { label: 'CID', icon: Info, desc: 'Busca CID-10' },
  sigtap: { label: 'SIGTAP', icon: FileText, desc: 'Procedimentos SUS' },
  image: { label: 'Imagem/Foto', icon: Image, desc: 'Upload de foto' },
  signature: { label: 'Assinatura', icon: PenTool, desc: 'Desenho manual' },
  table: { label: 'Tabela Simples', icon: Table, desc: 'Colunas e linhas' },
  calculated: { label: 'Calculado', icon: Calculator, desc: 'Fórmula automática' },
  separator: { label: 'Separador', icon: Layout, desc: 'Título de seção' },
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
            {row.kind === 'custom' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter border-l pl-1.5 ml-0.5">
                  {FIELD_TYPE_LABELS[row.field.tipo]?.label}
                </span>
                {row.field.secao && (
                  <Badge variant="outline" className="text-[9px] h-3.5 px-1 bg-muted/20 font-normal">
                    Seção: {row.field.secao}
                  </Badge>
                )}
                {row.field.largura && row.field.largura < 100 && (
                  <Badge variant="outline" className="text-[9px] h-3.5 px-1 bg-primary/5 text-primary border-primary/20">
                    {row.field.largura}%
                  </Badge>
                )}
                {row.field.printSettings?.restricted && (
                  <Lock className="w-2.5 h-2.5 text-destructive/70" />
                )}
              </div>
            )}
            {isRenamed && row.kind === 'native' && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Renomeado</Badge>
            )}
            {hidden && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Oculto</Badge>
            )}
            {row.kind === 'custom' && row.field.obrigatorio && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shadow-sm shadow-destructive/20">Obrigatório</Badge>
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
  const [selectedScreen, setSelectedScreen] = useState<ScreenKey>('paciente');
  const [selectedUnit, setSelectedUnit] = useState<string>('__global__');

  const { atualizarConfiguracao, configuracoes, loading: hookLoading } = useConfiguracao();

  const screenConfig = useMemo(() => {
    const all = (configuracoes['custom_fields_config'] || {}) as Record<string, any>;
    return (all[selectedScreen]?.[selectedUnit] || {
      fields: [], hiddenNative: [], labelOverrides: {}, orderedNames: [],
    }) as {
      fields: CustomFieldDef[];
      hiddenNative: string[];
      labelOverrides: Record<string, string>;
      orderedNames?: string[];
    };
  }, [configuracoes, selectedScreen, selectedUnit]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [renameModal, setRenameModal] = useState<{ nome: string; rotulo: string } | null>(null);

  const [fieldForm, setFieldForm] = useState({
    rotulo: '', tipo: 'text' as CustomFieldType, obrigatorio: false,
    opcoes: [] as string[], novaOpcao: '', valorPadrao: '', mostrarListagem: false,
    secao: '', placeholder: '', ajuda: '',
    especialidades: [] as string[], tiposProntuario: [] as string[],
    validacao: {} as CustomFieldValidation,
    condicional: [] as CustomFieldCondition[],
    destaque: false,
    largura: 100 as 25 | 50 | 75 | 100,
    displayMode: 'block' as 'inline' | 'block',
    rules: {
      onlyFirstConsult: false,
      onlyReturn: false,
      onlyChild: false,
      onlyElderly: false,
      profiles: [] as string[],
      unidades: [] as string[],
    },
    printSettings: {
      visibleInProntuario: true,
      editableInProntuario: true,
      visibleInPrint: true,
      restricted: false,
    },
  });
  const { especialidades } = useEspecialidades();
  const TIPOS_PRONTUARIO = ['avaliacao_inicial', 'retorno', 'sessao', 'urgencia', 'procedimento'];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = useCallback(async (newScreenCfg: any) => {
    const all = { ...(configuracoes['custom_fields_config'] || {}) } as Record<string, any>;
    if (!all[selectedScreen]) all[selectedScreen] = {};
    all[selectedScreen][selectedUnit] = newScreenCfg;
    
    await atualizarConfiguracao('custom_fields_config', all, { auditAcao: 'ALTERAR_CAMPOS_CUSTOM' });
    toast.success('Configuração salva');
  }, [selectedScreen, selectedUnit, configuracoes, atualizarConfiguracao]);

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
  const blankForm = () => ({
    rotulo: '', tipo: 'text' as CustomFieldType, obrigatorio: false,
    opcoes: [] as string[], novaOpcao: '', valorPadrao: '', mostrarListagem: false,
    secao: '', placeholder: '', ajuda: '',
    especialidades: [] as string[], tiposProntuario: [] as string[],
    validacao: {} as CustomFieldValidation,
    condicional: [] as CustomFieldCondition[],
    destaque: false,
    largura: 100 as 25 | 50 | 75 | 100,
    displayMode: 'block' as 'inline' | 'block',
    rules: {
      onlyFirstConsult: false,
      onlyReturn: false,
      onlyChild: false,
      onlyElderly: false,
      profiles: [] as string[],
      unidades: [] as string[],
    },
    printSettings: {
      visibleInProntuario: true,
      editableInProntuario: true,
      visibleInPrint: true,
      restricted: false,
    },
  });

  const openAddModal = () => {
    setEditingField(null);
    setFieldForm(blankForm());
    setModalOpen(true);
  };

  const openEditModal = (field: CustomFieldDef) => {
    setEditingField(field);
    setFieldForm({
      ...blankForm(),
      rotulo: field.rotulo,
      tipo: field.tipo,
      obrigatorio: field.obrigatorio,
      opcoes: [...field.opcoes],
      valorPadrao: field.valorPadrao,
      mostrarListagem: field.mostrarListagem,
      secao: field.secao || '',
      placeholder: field.placeholder || '',
      ajuda: field.ajuda || '',
      especialidades: field.especialidades || [],
      tiposProntuario: field.tiposProntuario || [],
      validacao: field.validacao || {},
      condicional: field.condicional || [],
      destaque: !!field.destaque,
      largura: field.largura || 100,
      displayMode: field.displayMode || 'block',
      rules: field.rules ? {
        onlyFirstConsult: !!field.rules.onlyFirstConsult,
        onlyReturn: !!field.rules.onlyReturn,
        onlyChild: !!field.rules.onlyChild,
        onlyElderly: !!field.rules.onlyElderly,
        profiles: field.rules.profiles || [],
        unidades: field.rules.unidades || [],
      } : blankForm().rules,
      printSettings: field.printSettings ? {
        visibleInProntuario: !!field.printSettings.visibleInProntuario,
        editableInProntuario: !!field.printSettings.editableInProntuario,
        visibleInPrint: !!field.printSettings.visibleInPrint,
        restricted: !!field.printSettings.restricted,
      } : blankForm().printSettings,
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
      opcoes: ['select', 'checkbox', 'radio', 'checklist'].includes(fieldForm.tipo) ? fieldForm.opcoes.filter(Boolean) : [],
      obrigatorio: fieldForm.obrigatorio,
      ativo: editingField?.ativo ?? true,
      ordem: editingField?.ordem ?? (screenConfig.fields.length + 1) * 10,
      valorPadrao: fieldForm.valorPadrao,
      mostrarListagem: fieldForm.mostrarListagem,
      secao: fieldForm.secao.trim() || undefined,
      placeholder: fieldForm.placeholder.trim() || undefined,
      ajuda: fieldForm.ajuda.trim() || undefined,
      especialidades: fieldForm.especialidades.length ? fieldForm.especialidades : undefined,
      tiposProntuario: fieldForm.tiposProntuario.length ? fieldForm.tiposProntuario : undefined,
      validacao: Object.keys(fieldForm.validacao).length ? fieldForm.validacao : undefined,
      condicional: fieldForm.condicional.length ? fieldForm.condicional : undefined,
      destaque: fieldForm.destaque || undefined,
      legacyNames: editingField?.legacyNames,
      largura: fieldForm.largura,
      displayMode: fieldForm.displayMode,
      rules: {
        onlyFirstConsult: !!fieldForm.rules.onlyFirstConsult,
        onlyReturn: !!fieldForm.rules.onlyReturn,
        onlyChild: !!fieldForm.rules.onlyChild,
        onlyElderly: !!fieldForm.rules.onlyElderly,
        profiles: fieldForm.rules.profiles || [],
        unidades: fieldForm.rules.unidades || [],
      },
      printSettings: {
        visibleInProntuario: !!fieldForm.printSettings.visibleInProntuario,
        editableInProntuario: !!fieldForm.printSettings.editableInProntuario,
        visibleInPrint: !!fieldForm.printSettings.visibleInPrint,
        restricted: !!fieldForm.printSettings.restricted,
      },
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
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-1 min-w-[300px]">
              <div className="relative flex-1">
                <Input placeholder="Buscar campo..." className="pl-9 h-9" />
                <Plus className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground rotate-45" />
              </div>
              <Button variant="outline" size="sm" className="h-9">
                <Plus className="w-4 h-4 mr-1 shadow-sm" /> Aplicar Modelo
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-9 shadow-md" onClick={openAddModal}>
                <Plus className="w-4 h-4 mr-1" /> Novo Campo
              </Button>
            </div>
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden border-none shadow-2xl">
          <div className="flex flex-col h-[90vh] bg-background">
            <div className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between shrink-0">
              <DialogHeader className="space-y-0.5">
                <DialogTitle className="text-xl font-display font-bold">
                  {editingField ? 'Editar Campo Profissional' : 'Novo Campo Personalizado'}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">Configure os dados, regras e visibilidade do campo clínico.</p>
              </DialogHeader>
              <Button variant="ghost" size="icon" onClick={() => setModalOpen(false)} className="rounded-full">
                <Plus className="w-5 h-5 rotate-45" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm uppercase tracking-wider">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      Dados Básicos
                    </div>
                    
                    <div>
                      <Label className="text-sm font-semibold mb-1.5 block">Nome do campo (Rótulo)</Label>
                      <Input
                        value={fieldForm.rotulo}
                        onChange={(e) => setFieldForm((p) => ({ ...p, rotulo: e.target.value }))}
                        placeholder="Ex: Escala de Dor, Motivo da Consulta"
                        className="h-10"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-semibold mb-1.5 block">Obrigatório</Label>
                        <div className="flex items-center gap-3 h-10 px-3 rounded-lg border bg-muted/10">
                          <Switch checked={fieldForm.obrigatorio} onCheckedChange={(v) => setFieldForm((p) => ({ ...p, obrigatorio: v }))} />
                          <span className="text-sm text-muted-foreground">{fieldForm.obrigatorio ? 'Sim' : 'Não'}</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold mb-1.5 block">Destaque Visual</Label>
                        <div className="flex items-center gap-3 h-10 px-3 rounded-lg border bg-muted/10">
                          <Switch checked={fieldForm.destaque} onCheckedChange={(v) => setFieldForm(p => ({ ...p, destaque: v }))} />
                          <span className="text-sm text-muted-foreground">{fieldForm.destaque ? 'Ativo' : 'Inativo'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm uppercase tracking-wider">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      Tipo de Campo
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
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
                              'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center group',
                              selected ? 'border-primary bg-primary/10 ring-2 ring-primary/20 shadow-md' : 'border-border hover:border-primary/40 hover:bg-muted/50',
                            )}
                          >
                            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', selected ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className={cn('text-[11px] font-bold leading-tight', selected ? 'text-primary' : 'text-foreground')}>{info.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {['select', 'checkbox', 'radio', 'checklist'].includes(fieldForm.tipo) && (
                    <div className="space-y-4 p-4 rounded-xl border-2 border-dashed border-primary/20 bg-primary/5">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-bold flex items-center gap-2"><List className="w-4 h-4" /> Opções Disponíveis</Label>
                        <Badge variant="outline" className="bg-background">{fieldForm.opcoes.length} itens</Badge>
                      </div>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                        {fieldForm.opcoes.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2 group">
                            <Input
                              value={opt}
                              onChange={(e) => {
                                const newOpcoes = [...fieldForm.opcoes];
                                newOpcoes[i] = e.target.value;
                                setFieldForm((p) => ({ ...p, opcoes: newOpcoes }));
                              }}
                              className="h-8 flex-1 bg-background"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setFieldForm((p) => ({ ...p, opcoes: p.opcoes.filter((_, idx) => idx !== i) }))}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <Input
                          value={fieldForm.novaOpcao}
                          onChange={(e) => setFieldForm((p) => ({ ...p, novaOpcao: e.target.value }))}
                          placeholder="Nova opção..."
                          className="h-9 bg-background"
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
                        <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => {
                          const v = fieldForm.novaOpcao.trim();
                          if (v && !fieldForm.opcoes.includes(v)) {
                            setFieldForm((p) => ({ ...p, opcoes: [...p.opcoes, v], novaOpcao: '' }));
                          }
                        }}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm uppercase tracking-wider">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      Visibilidade & Regras
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <Label className="text-xs font-bold text-muted-foreground mb-2 block uppercase">Especialidades</Label>
                        <div className="flex flex-wrap gap-1.5 p-3 rounded-xl border bg-muted/10">
                          {especialidades.filter(e => e.ativa).map(e => {
                            const sel = fieldForm.especialidades.includes(e.key);
                            return (
                              <button
                                key={e.key}
                                type="button"
                                onClick={() => setFieldForm(p => ({
                                  ...p,
                                  especialidades: sel ? p.especialidades.filter(k => k !== e.key) : [...p.especialidades, e.key],
                                }))}
                                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all', sel ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background hover:bg-muted text-muted-foreground')}
                              >
                                {e.label}
                              </button>
                            );
                          })}
                          {fieldForm.especialidades.length === 0 && <Badge variant="secondary" className="text-[10px]">Todas</Badge>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-3 p-3 rounded-xl border bg-muted/5">
                          <Label className="text-[10px] font-bold uppercase text-muted-foreground">Regras Inteligentes</Label>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span>Só 1ª Consulta</span>
                              <Switch checked={fieldForm.rules.onlyFirstConsult} onCheckedChange={(v) => setFieldForm(p => ({ ...p, rules: { ...p.rules, onlyFirstConsult: v } }))} className="scale-75" />
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span>Só Retorno</span>
                              <Switch checked={fieldForm.rules.onlyReturn} onCheckedChange={(v) => setFieldForm(p => ({ ...p, rules: { ...p.rules, onlyReturn: v } }))} className="scale-75" />
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span>Só Crianças</span>
                              <Switch checked={fieldForm.rules.onlyChild} onCheckedChange={(v) => setFieldForm(p => ({ ...p, rules: { ...p.rules, onlyChild: v } }))} className="scale-75" />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3 p-3 rounded-xl border bg-muted/5">
                          <Label className="text-[10px] font-bold uppercase text-muted-foreground">Config. Saída</Label>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span>Ver no PDF</span>
                              <Switch checked={fieldForm.printSettings.visibleInPrint} onCheckedChange={(v) => setFieldForm(p => ({ ...p, printSettings: { ...p.printSettings, visibleInPrint: v } }))} className="scale-75" />
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span>Restrito</span>
                              <Switch checked={fieldForm.printSettings.restricted} onCheckedChange={(v) => setFieldForm(p => ({ ...p, printSettings: { ...p.printSettings, restricted: v } }))} className="scale-75" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm uppercase tracking-wider">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      Aparência
                    </div>
                    <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border bg-muted/5">
                      <div>
                        <Label className="text-xs font-bold mb-2 block uppercase">Largura</Label>
                        <Select value={fieldForm.largura.toString()} onValueChange={(v) => setFieldForm(p => ({ ...p, largura: parseInt(v) as any }))}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="25">25%</SelectItem>
                            <SelectItem value="50">50%</SelectItem>
                            <SelectItem value="100">100%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-bold mb-2 block uppercase">Seção / Bloco</Label>
                        <Input value={fieldForm.secao} onChange={(e) => setFieldForm(p => ({ ...p, secao: e.target.value }))} placeholder="Ex: Anamnese" className="h-9" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-muted/20 space-y-4">
                <div className="flex items-center gap-2 font-bold text-xs uppercase text-muted-foreground border-b pb-2">
                  <Activity className="w-3.5 h-3.5" /> Validação e Condicionais
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold">Máscara</Label>
                    <Select
                      value={fieldForm.validacao.mascara || '__none__'}
                      onValueChange={(v) => setFieldForm(p => ({ ...p, validacao: { ...p.validacao, mascara: v === '__none__' ? undefined : v as any } }))}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        <SelectItem value="cpf">CPF</SelectItem>
                        <SelectItem value="telefone">Telefone</SelectItem>
                        <SelectItem value="data">Data</SelectItem>
                        <SelectItem value="hora">Hora</SelectItem>
                        <SelectItem value="currency">Moeda</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold">Mín. Caracteres</Label>
                    <Input type="number" className="h-9" value={fieldForm.validacao.minLength ?? ''} onChange={e => setFieldForm(p => ({ ...p, validacao: { ...p.validacao, minLength: e.target.value ? Number(e.target.value) : undefined } }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold">Máx. Caracteres</Label>
                    <Input type="number" className="h-9" value={fieldForm.validacao.maxLength ?? ''} onChange={e => setFieldForm(p => ({ ...p, validacao: { ...p.validacao, maxLength: e.target.value ? Number(e.target.value) : undefined } }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold">Valor Mín/Máx</Label>
                    <div className="flex gap-1">
                      <Input type="number" placeholder="Mín" className="h-9" value={fieldForm.validacao.min ?? ''} onChange={e => setFieldForm(p => ({ ...p, validacao: { ...p.validacao, min: e.target.value ? Number(e.target.value) : undefined } }))} />
                      <Input type="number" placeholder="Máx" className="h-9" value={fieldForm.validacao.max ?? ''} onChange={e => setFieldForm(p => ({ ...p, validacao: { ...p.validacao, max: e.target.value ? Number(e.target.value) : undefined } }))} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-muted-foreground/10">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2"><Sliders className="w-3.5 h-3.5" /> Exibição Condicional Avançada</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setFieldForm(p => ({ ...p, condicional: [...p.condicional, { campo: '', operador: 'eq', valor: '' }] }))}>
                      <Plus className="w-3 h-3 mr-1" /> Adicionar Condição
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {fieldForm.condicional.map((rule, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-background animate-in fade-in duration-200">
                        <Input placeholder="Campo" className="h-8 flex-1" value={rule.campo} onChange={e => setFieldForm(p => { const c = [...p.condicional]; c[idx] = { ...c[idx], campo: e.target.value }; return { ...p, condicional: c }; })} />
                        <Select value={rule.operador} onValueChange={(v) => setFieldForm(p => { const c = [...p.condicional]; c[idx] = { ...c[idx], operador: v as any }; return { ...p, condicional: c }; })}>
                          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="eq">=</SelectItem>
                            <SelectItem value="neq">≠</SelectItem>
                            <SelectItem value="filled">Preenchido</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input placeholder="Valor" className="h-8 flex-1" value={rule.valor ?? ''} onChange={e => setFieldForm(p => { const c = [...p.condicional]; c[idx] = { ...c[idx], valor: e.target.value }; return { ...p, condicional: c }; })} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setFieldForm(p => ({ ...p, condicional: p.condicional.filter((_, i) => i !== idx) }))}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between shrink-0">
              <p className="text-[10px] text-muted-foreground">O campo será salvo exclusivamente para a unidade selecionada.</p>
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button onClick={saveField} className="px-8 shadow-lg shadow-primary/20">Salvar Campo</Button>
              </div>
            </div>
          </div>
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
