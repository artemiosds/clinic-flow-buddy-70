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
  Save, Undo2, ChevronRight, LayoutTemplate, Database, AlertCircle, Check, Loader2,
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

// -------- Preview Component --------
const FieldPreview: React.FC<{ form: any }> = ({ form }) => {
  const info = FIELD_TYPE_LABELS[form.tipo];
  const Icon = info?.icon || Type;

  return (
    <div className="p-4 rounded-xl border border-dashed border-primary/20 bg-primary/5 flex flex-col gap-3 h-full justify-center">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">Preview no Prontuário</span>
      </div>
      
      <div className={cn(
        "bg-background p-4 rounded-lg border shadow-sm transition-all duration-300",
        form.destaque && "ring-1 ring-primary/30 bg-primary/[0.02]"
      )}>
        <Label className="text-sm font-semibold mb-2 block">
          {form.rotulo || 'Título do Campo'}
          {form.obrigatorio && <span className="text-destructive ml-1">*</span>}
          {form.ajuda && <span className="text-[10px] text-muted-foreground ml-2 font-normal">({form.ajuda})</span>}
        </Label>
        
        {['text', 'number', 'phone', 'cpf', 'cnpj', 'cep', 'email', 'url', 'currency', 'time', 'date', 'cid', 'sigtap', 'calculated'].includes(form.tipo) && (
          <div className="h-10 w-full rounded-md border border-input bg-muted/20 flex items-center px-3 text-muted-foreground text-sm italic">
            {form.placeholder || 'Entrada de dados...'}
          </div>
        )}

        {form.tipo === 'textarea' && (
          <div className="h-20 w-full rounded-md border border-input bg-muted/20 p-3 text-muted-foreground text-sm italic">
            {form.placeholder || 'Área de texto longo...'}
          </div>
        )}

        {['select', 'radio', 'checkbox', 'checklist'].includes(form.tipo) && (
          <div className="space-y-2">
            {form.opcoes.length > 0 ? (
              form.opcoes.slice(0, 3).map((opt: string, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={cn(
                    "w-4 h-4 rounded border border-muted-foreground/30",
                    form.tipo === 'radio' ? 'rounded-full' : 'rounded'
                  )} />
                  <span className="text-xs">{opt}</span>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-muted-foreground italic">Adicione opções para visualizar...</p>
            )}
            {form.opcoes.length > 3 && <p className="text-[10px] text-muted-foreground">+{form.opcoes.length - 3} mais...</p>}
          </div>
        )}

        {['scale_numeric', 'scale_eva', 'scale_functional'].includes(form.tipo) && (
          <div className="pt-2">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Mínimo</span>
              <span className="font-bold text-primary">5</span>
              <span>Máximo</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-primary/60" />
            </div>
          </div>
        )}

        {['file', 'image'].includes(form.tipo) && (
          <div className="h-24 w-full rounded-lg border border-dashed flex flex-col items-center justify-center bg-muted/5 gap-2">
            <Paperclip className="w-5 h-5 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground">Clique para anexar {form.tipo === 'image' ? 'imagem' : 'arquivo'}</span>
          </div>
        )}

        {form.tipo === 'signature' && (
          <div className="h-24 w-full rounded-lg border bg-muted/5 flex items-center justify-center">
            <PenTool className="w-6 h-6 text-muted-foreground/30" />
          </div>
        )}

        {form.tipo === 'separator' && (
          <div className="border-b pb-1 mb-2 mt-2">
            <h5 className="text-xs font-bold uppercase text-primary/70">{form.rotulo || 'Título de Seção'}</h5>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[9px] uppercase tracking-widest text-muted-foreground/60 mt-auto">
        <div className="flex items-center gap-1"><LayoutTemplate className="w-2.5 h-2.5" /> Largura: {form.largura}%</div>
        <div className="flex items-center gap-1"><Database className="w-2.5 h-2.5" /> Chave: {form.rotulo ? form.rotulo.toLowerCase().replace(/[^a-z0-9]+/g, '_') : '—'}</div>
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
  const [isSaving, setIsSaving] = useState(false);

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

  const saveField = async (addAnother = false) => {
    if (!fieldForm.rotulo.trim()) {
      toast.error('Rótulo é obrigatório');
      return;
    }
    const needsOptions = ['select', 'checkbox', 'radio', 'checklist'].includes(fieldForm.tipo);
    if (needsOptions && fieldForm.opcoes.filter(Boolean).length === 0) {
      toast.error('Adicione pelo menos uma opção para este tipo de campo');
      return;
    }

    setIsSaving(true);
    try {
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
        opcoes: needsOptions ? fieldForm.opcoes.filter(Boolean) : [],
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

      const order = screenConfig.orderedNames || [];
      const newOrder = order.includes(nome) ? order : [...order, nome];

      await save({ ...screenConfig, fields: newFields, orderedNames: newOrder });
      
      if (addAnother) {
        setFieldForm(blankForm());
        setEditingField(null);
        toast.info('Campo salvo. Você pode adicionar outro.');
      } else {
        setModalOpen(false);
      }
    } catch (error) {
      console.error('Erro ao salvar campo:', error);
      toast.error('Erro ao salvar campo');
    } finally {
      setIsSaving(false);
    }
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

      <Dialog open={modalOpen} onOpenChange={(open) => !isSaving && setModalOpen(open)}>
        <DialogContent className="max-w-6xl max-h-[95vh] p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
          <div className="flex flex-col h-[95vh] bg-background">
            {/* Header */}
            <div className="px-8 py-6 border-b bg-muted/20 flex items-center justify-between shrink-0">
              <div className="flex flex-col gap-1">
                <DialogTitle className="text-2xl font-bold font-display">
                  {editingField ? `Editar campo: ${editingField.rotulo}` : 'Adicionar Campo para Especialidade'}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">Configure como este campo será usado no prontuário clínico.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => !isSaving && setModalOpen(false)} className="rounded-full">
                <Plus className="w-6 h-6 rotate-45 text-muted-foreground hover:text-foreground" />
              </Button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 h-full">
                {/* Main Tabs Column */}
                <div className="lg:col-span-8 p-8 border-r">
                  <Tabs defaultValue="dados" className="h-full">
                    <TabsList className="grid w-full grid-cols-4 h-12 bg-muted/50 p-1 mb-8">
                      <TabsTrigger value="dados" className="text-sm font-semibold">Dados básicos</TabsTrigger>
                      <TabsTrigger value="tipo" className="text-sm font-semibold">Tipo e opções</TabsTrigger>
                      <TabsTrigger value="visibilidade" className="text-sm font-semibold">Exibição</TabsTrigger>
                      <TabsTrigger value="regras" className="text-sm font-semibold">Permissões e regras</TabsTrigger>
                    </TabsList>

                    <TabsContent value="dados" className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label className="text-sm font-semibold block mb-2">Nome do campo</Label>
                          <Input value={fieldForm.rotulo} onChange={(e) => setFieldForm(p => ({ ...p, rotulo: e.target.value }))} className="h-12 text-base" placeholder="Ex: Queixa principal" />
                        </div>
                        <div>
                          <Label className="text-sm font-semibold block mb-2">Chave interna (automática)</Label>
                          <Input value={fieldForm.rotulo.toLowerCase().replace(/[^a-z0-9]+/g, '_')} disabled className="h-12 bg-muted/30" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label className="text-sm font-semibold block mb-2">Placeholder</Label>
                          <Input value={fieldForm.placeholder} onChange={(e) => setFieldForm(p => ({ ...p, placeholder: e.target.value }))} className="h-12" />
                        </div>
                        <div>
                          <Label className="text-sm font-semibold block mb-2">Texto de ajuda</Label>
                          <Input value={fieldForm.ajuda} onChange={(e) => setFieldForm(p => ({ ...p, ajuda: e.target.value }))} className="h-12" />
                        </div>
                      </div>
                      <div className="flex items-center gap-6 p-4 rounded-xl border bg-muted/10">
                        <div className="flex items-center gap-3">
                          <Switch checked={fieldForm.obrigatorio} onCheckedChange={(v) => setFieldForm(p => ({ ...p, obrigatorio: v }))} />
                          <span className="text-sm font-medium">Obrigatório</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Switch checked={fieldForm.printSettings.visibleInProntuario} onCheckedChange={(v) => setFieldForm(p => ({ ...p, printSettings: { ...p.printSettings, visibleInProntuario: v } }))} />
                          <span className="text-sm font-medium">Ativo no Prontuário</span>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="lg:col-span-4 bg-muted/10 p-8">
                  <div className="sticky top-0 space-y-6">
                    <h3 className="font-semibold text-lg">Resumo do campo</h3>
                    <FieldPreview form={fieldForm} />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 py-5 border-t bg-muted/20 flex items-center justify-end gap-3 shrink-0">
              <Button variant="ghost" onClick={() => !isSaving && setModalOpen(false)}>Cancelar</Button>
              <Button onClick={() => saveField()} className="h-11 px-8 shadow-lg" disabled={isSaving}>
                {isSaving ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar campo
              </Button>
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
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setRenameModal(null)}>Cancelar</Button>
            <Button onClick={saveRename}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfigPersonalizarCampos;
