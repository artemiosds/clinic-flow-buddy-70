import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Plus, Pencil, Trash2, Loader2, Pill, FlaskConical, Eye, Download, Upload, RotateCcw, Archive, Tag, Sparkles, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useConfiguracao } from '@/hooks/useConfiguracao';
import { auditService } from '@/services/auditService';
import { RENAME_MEDICATIONS } from '@/data/seedRenameMedications';
import { REME_MEDICATIONS } from '@/data/seedRemeMedications';
import { EXAMES_PADRAO } from '@/data/seedExamesPadrao';

type MedTipo = 'comum' | 'controlado' | 'psicotropico' | 'antibiotico';

interface Medication {
  id: string;
  nome: string;
  principio_ativo: string;
  classe_terapeutica: string;
  apresentacao: string;
  dosagem_padrao: string;
  via_padrao: string;
  concentracao: string;
  forma_farmaceutica: string;
  origem: string;
  observacoes: string;
  is_global: boolean;
  profissional_id: string | null;
  ativo: boolean;
  updated_at?: string;
  // Novos campos
  nome_comercial?: string;
  codigo_rename?: string | null;
  codigo_reme?: string | null;
  tipo?: MedTipo;
  estoque_quantidade?: number;
  estoque_minimo?: number;
  estoque_unidade?: string;
  estoque_localizacao?: string;
}

const deriveTipo = (m: { classe_terapeutica?: string; principio_ativo?: string; tipo?: MedTipo }): MedTipo => {
  if (m.tipo && m.tipo !== 'comum') return m.tipo;
  const cls = (m.classe_terapeutica || '').toLowerCase();
  const pa = (m.principio_ativo || '').toLowerCase();
  if (cls.includes('antibió')) return 'antibiotico';
  if (cls.includes('opioide') || ['morfina','codeína','codeina','tramadol','fentanil','metilfenidato'].some(p => pa.includes(p))) return 'controlado';
  if (cls.includes('psicotróp') || cls.includes('antidepress') || cls.includes('ansiolít') || cls.includes('antipsicót') || cls.includes('benzodiazep') ||
      ['diazepam','clonazepam','fluoxetina','amitriptilina','sertralina','haloperidol','carbamazepina','fenobarbital','midazolam','risperidona','olanzapina','quetiapina','lorazepam'].some(p => pa.includes(p))) return 'psicotropico';
  return 'comum';
};

const estoqueStatus = (m: Medication): 'sem_controle' | 'disponivel' | 'baixo' | 'indisponivel' => {
  const qtd = m.estoque_quantidade ?? 0;
  const min = m.estoque_minimo ?? 0;
  if (!min && !qtd) return 'sem_controle';
  if (qtd <= 0) return 'indisponivel';
  if (qtd <= min) return 'baixo';
  return 'disponivel';
};

const TipoBadge: React.FC<{ tipo?: MedTipo }> = ({ tipo }) => {
  if (!tipo || tipo === 'comum') return null;
  const map: Record<string, { label: string; cls: string }> = {
    controlado: { label: 'CONTROLADO', cls: 'bg-destructive text-destructive-foreground' },
    psicotropico: { label: 'PSICOTRÓPICO', cls: 'bg-destructive text-destructive-foreground' },
    antibiotico: { label: 'ANTIBIÓTICO', cls: 'bg-orange-500 text-white' },
  };
  const v = map[tipo];
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${v.cls}`}>{v.label}</span>;
};

const EstoqueBadge: React.FC<{ m: Medication }> = ({ m }) => {
  const st = estoqueStatus(m);
  if (st === 'sem_controle') return null;
  const map = {
    disponivel: { label: `Disponível${m.estoque_quantidade ? ` (${m.estoque_quantidade})` : ''}`, cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
    baixo: { label: `Estoque baixo (${m.estoque_quantidade})`, cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
    indisponivel: { label: 'Indisponível', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  } as const;
  const v = map[st as keyof typeof map];
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${v.cls}`}>{v.label}</span>;
};

interface ExamType {
  id: string;
  nome: string;
  codigo_sus: string;
  categoria: string;
  subcategoria: string;
  preparo: string;
  necessidade_jejum: boolean;
  tempo_jejum: string;
  observacoes: string;
  origem: string;
  is_global: boolean;
  profissional_id: string | null;
  ativo: boolean;
  updated_at?: string;
}

const PROFISSOES_PRESCRICAO = [
  { key: 'medicina', label: 'Médico / Médica' },
  { key: 'odontologia', label: 'Odontólogo / Odontóloga' },
  { key: 'fisioterapia', label: 'Fisioterapeuta' },
  { key: 'psicologia', label: 'Psicólogo / Psicóloga' },
  { key: 'fonoaudiologia', label: 'Fonoaudiólogo / Fonoaudióloga' },
  { key: 'nutricao', label: 'Nutricionista' },
  { key: 'terapia_ocupacional', label: 'Terapeuta Ocupacional' },
  { key: 'avaliacao_enfermagem', label: 'Enfermeiro / Enfermeira' },
];

const CONFIG_KEY = 'config_prescricao_perfil';

const dedupKeyMed = (m: { principio_ativo?: string; concentracao?: string; forma_farmaceutica?: string; via_padrao?: string }) =>
  `${(m.principio_ativo || '').toLowerCase().trim()}|${(m.concentracao || '').toLowerCase().trim()}|${(m.forma_farmaceutica || '').toLowerCase().trim()}|${(m.via_padrao || '').toLowerCase().trim()}`;

const dedupKeyExam = (e: { nome?: string; categoria?: string; subcategoria?: string }) =>
  `${(e.nome || '').toLowerCase().trim()}|${(e.categoria || '').toLowerCase().trim()}|${(e.subcategoria || '').toLowerCase().trim()}`;

const downloadCSV = (filename: string, rows: Record<string, any>[]) => {
  if (!rows.length) { toast.info('Nada para exportar'); return; }
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const ConfigMedicamentosExames: React.FC = () => {
  const { user } = useAuth();
  const isMaster = user?.role === 'master';

  const [meds, setMeds] = useState<Medication[]>([]);
  const [exams, setExams] = useState<ExamType[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState<'med' | 'exam' | null>(null);

  // Filters - meds
  const [search, setSearch] = useState('');
  const [filterClasse, setFilterClasse] = useState<string>('');
  const [filterForma, setFilterForma] = useState<string>('');
  const [filterVia, setFilterVia] = useState<string>('');
  const [filterOrigemMed, setFilterOrigemMed] = useState<string>('');

  // Filters - exams
  const [examSearch, setExamSearch] = useState('');
  const [filterCategoria, setFilterCategoria] = useState<string>('');
  const [filterSubcategoria, setFilterSubcategoria] = useState<string>('');
  const [filterJejum, setFilterJejum] = useState<string>('');
  const [filterOrigemExam, setFilterOrigemExam] = useState<string>('');

  const [editMed, setEditMed] = useState<Medication | null>(null);
  const [editExam, setEditExam] = useState<ExamType | null>(null);
  const [addMedDialog, setAddMedDialog] = useState(false);
  const [addExamDialog, setAddExamDialog] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{ type: 'med' | 'exam'; id: string; nome: string } | null>(null);
  const [restoreDialog, setRestoreDialog] = useState<'med' | 'exam' | null>(null);

  const blankMed = { nome: '', principio_ativo: '', classe_terapeutica: '', apresentacao: '', dosagem_padrao: '', via_padrao: 'oral', concentracao: '', forma_farmaceutica: '', observacoes: '' };
  const blankExam = { nome: '', codigo_sus: '', categoria: '', subcategoria: '', preparo: '', necessidade_jejum: false, tempo_jejum: '', observacoes: '' };
  const [newMed, setNewMed] = useState(blankMed);
  const [newExam, setNewExam] = useState(blankExam);
  const [prescricaoConfig, setPrescricaoConfig] = useState<Record<string, boolean>>({});

  const { atualizarConfiguracao, configuracoes, loading: hookLoading } = useConfiguracao();

  const loadData = useCallback(async () => {
    setLoading(true);
    const [medsRes, examsRes] = await Promise.all([
      supabase.from('medications').select('*').order('classe_terapeutica').order('nome'),
      supabase.from('exam_types').select('*').order('categoria').order('nome'),
    ]);
    if (medsRes.data) setMeds(medsRes.data as any);
    if (examsRes.data) setExams(examsRes.data as any);
    
    const cfg = configuracoes[CONFIG_KEY];
    if (cfg) setPrescricaoConfig(cfg);
    else setPrescricaoConfig({ medicina: true, odontologia: true });
    
    setLoading(false);
  }, [configuracoes]);

  useEffect(() => { if (!hookLoading) loadData(); }, [loadData, hookLoading]);

  /* ============================================================
     SEED — Carregar base padrão (RENAME / Exames padrão)
     ============================================================ */
  const seedMedications = async () => {
    setSeeding('med');
    try {
      const existingKeys = new Set(meds.map(m => dedupKeyMed(m)));
      const toInsert = RENAME_MEDICATIONS
        .filter(m => !existingKeys.has(dedupKeyMed(m)))
        .map(m => ({
          nome: m.nome,
          principio_ativo: m.principio_ativo,
          concentracao: m.concentracao,
          forma_farmaceutica: m.forma_farmaceutica,
          via_padrao: m.via_padrao,
          classe_terapeutica: m.classe_terapeutica,
          apresentacao: m.apresentacao,
          dosagem_padrao: m.dosagem_padrao || m.concentracao,
          origem: 'RENAME',
          observacoes: '',
          is_global: true,
          ativo: true,
        }));

      let inserted = 0;
      const ignored = RENAME_MEDICATIONS.length - toInsert.length;

      // Insere em lotes para não estourar limite
      const chunkSize = 50;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error } = await supabase.from('medications').insert(chunk);
        if (!error) inserted += chunk.length;
      }

      await auditService.log({
        acao: 'IMPORTAR_BASE_RENAME',
        entidade: 'medications',
        modulo: 'configuracoes',
        user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
        detalhes: { inseridos: inserted, ignorados_duplicados: ignored, total_base: RENAME_MEDICATIONS.length },
      });

      toast.success(`Base RENAME carregada: ${inserted} novos, ${ignored} já existiam`);
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar base RENAME');
    } finally {
      setSeeding(null);
      setRestoreDialog(null);
    }
  };

  const seedExames = async () => {
    setSeeding('exam');
    try {
      const existingKeys = new Set(exams.map(e => dedupKeyExam(e)));
      const toInsert = EXAMES_PADRAO
        .filter(e => !existingKeys.has(dedupKeyExam(e)))
        .map(e => ({
          nome: e.nome,
          categoria: e.categoria,
          subcategoria: e.subcategoria || '',
          codigo_sus: e.codigo_sus || '',
          preparo: e.preparo || '',
          necessidade_jejum: !!e.necessidade_jejum,
          tempo_jejum: e.tempo_jejum || '',
          observacoes: '',
          origem: 'PADRAO',
          is_global: true,
          ativo: true,
        }));

      let inserted = 0;
      const ignored = EXAMES_PADRAO.length - toInsert.length;
      const chunkSize = 50;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error } = await supabase.from('exam_types').insert(chunk);
        if (!error) inserted += chunk.length;
      }

      await auditService.log({
        acao: 'IMPORTAR_BASE_EXAMES',
        entidade: 'exam_types',
        modulo: 'configuracoes',
        user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
        detalhes: { inseridos: inserted, ignorados_duplicados: ignored, total_base: EXAMES_PADRAO.length },
      });

      toast.success(`Exames padrão carregados: ${inserted} novos, ${ignored} já existiam`);
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar exames padrão');
    } finally {
      setSeeding(null);
      setRestoreDialog(null);
    }
  };

  /* ============================================================
     Filtros derivados
     ============================================================ */
  const classesDisponiveis = useMemo(() => Array.from(new Set(meds.map(m => m.classe_terapeutica).filter(Boolean))).sort(), [meds]);
  const formasDisponiveis = useMemo(() => Array.from(new Set(meds.map(m => m.forma_farmaceutica).filter(Boolean))).sort(), [meds]);
  const viasDisponiveis = useMemo(() => Array.from(new Set(meds.map(m => m.via_padrao).filter(Boolean))).sort(), [meds]);
  const categoriasExamesDisponiveis = useMemo(() => Array.from(new Set(exams.map(e => e.categoria).filter(Boolean))).sort(), [exams]);
  const subcategoriasExamesDisponiveis = useMemo(() => Array.from(new Set(exams.map(e => e.subcategoria).filter(Boolean))).sort(), [exams]);

  const filteredMeds = useMemo(() => {
    const s = search.toLowerCase().trim();
    return meds.filter(m => {
      if (s) {
        const haystack = `${m.nome} ${m.principio_ativo} ${m.classe_terapeutica} ${m.concentracao} ${m.forma_farmaceutica}`.toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      if (filterClasse && m.classe_terapeutica !== filterClasse) return false;
      if (filterForma && m.forma_farmaceutica !== filterForma) return false;
      if (filterVia && m.via_padrao !== filterVia) return false;
      if (filterOrigemMed === 'RENAME' && m.origem !== 'RENAME') return false;
      if (filterOrigemMed === 'PERSONALIZADO' && m.origem === 'RENAME') return false;
      return true;
    });
  }, [meds, search, filterClasse, filterForma, filterVia, filterOrigemMed]);

  const filteredExams = useMemo(() => {
    const s = examSearch.toLowerCase().trim();
    return exams.filter(e => {
      if (s) {
        const haystack = `${e.nome} ${e.codigo_sus} ${e.categoria} ${e.subcategoria}`.toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      if (filterCategoria && e.categoria !== filterCategoria) return false;
      if (filterSubcategoria && e.subcategoria !== filterSubcategoria) return false;
      if (filterJejum === 'sim' && !e.necessidade_jejum) return false;
      if (filterJejum === 'nao' && e.necessidade_jejum) return false;
      if (filterOrigemExam === 'PADRAO' && e.origem !== 'PADRAO') return false;
      if (filterOrigemExam === 'PERSONALIZADO' && e.origem === 'PADRAO') return false;
      return true;
    });
  }, [exams, examSearch, filterCategoria, filterSubcategoria, filterJejum, filterOrigemExam]);

  const ativosMeds = filteredMeds.filter(m => m.ativo);
  const inativosMeds = meds.filter(m => !m.ativo);
  const ativosExams = filteredExams.filter(e => e.ativo);
  const inativosExams = exams.filter(e => !e.ativo);

  const medsByClass = useMemo(() => {
    const map = new Map<string, Medication[]>();
    ativosMeds.forEach(m => {
      const key = m.classe_terapeutica || 'Sem classificação';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [ativosMeds]);

  const examsByCategory = useMemo(() => {
    const map = new Map<string, ExamType[]>();
    ativosExams.forEach(e => {
      const key = e.categoria || 'Sem categoria';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [ativosExams]);

  const customMeds = meds.filter(m => !m.is_global && m.profissional_id);
  const customExams = exams.filter(e => !e.is_global && e.profissional_id);

  const totalCategorias = new Set([...categoriasExamesDisponiveis, ...classesDisponiveis]).size;

  /* ============================================================
     Mutations
     ============================================================ */
  const toggleMedAtivo = async (id: string) => {
    const med = meds.find(m => m.id === id);
    if (!med) return;
    const { error } = await supabase.from('medications').update({ ativo: !med.ativo }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    setMeds(prev => prev.map(m => m.id === id ? { ...m, ativo: !m.ativo } : m));
    auditService.log({
      acao: med.ativo ? 'DESATIVAR_MEDICAMENTO' : 'REATIVAR_MEDICAMENTO',
      entidade: 'medications', entidadeId: id, modulo: 'configuracoes',
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      detalhes: { nome: med.nome },
    });
    toast.success(med.ativo ? 'Medicamento desativado' : 'Medicamento reativado');
  };

  const toggleExamAtivo = async (id: string) => {
    const exam = exams.find(e => e.id === id);
    if (!exam) return;
    const { error } = await supabase.from('exam_types').update({ ativo: !exam.ativo }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    setExams(prev => prev.map(e => e.id === id ? { ...e, ativo: !e.ativo } : e));
    auditService.log({
      acao: exam.ativo ? 'DESATIVAR_EXAME' : 'REATIVAR_EXAME',
      entidade: 'exam_types', entidadeId: id, modulo: 'configuracoes',
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      detalhes: { nome: exam.nome },
    });
    toast.success(exam.ativo ? 'Exame desativado' : 'Exame reativado');
  };

  const saveEditMed = async () => {
    if (!editMed) return;
    const { error } = await supabase.from('medications').update({
      nome: editMed.nome, principio_ativo: editMed.principio_ativo,
      classe_terapeutica: editMed.classe_terapeutica, apresentacao: editMed.apresentacao,
      dosagem_padrao: editMed.dosagem_padrao, via_padrao: editMed.via_padrao,
      concentracao: editMed.concentracao, forma_farmaceutica: editMed.forma_farmaceutica,
      observacoes: editMed.observacoes, is_global: editMed.is_global,
    }).eq('id', editMed.id);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    setMeds(prev => prev.map(m => m.id === editMed.id ? editMed : m));
    auditService.log({
      acao: 'EDITAR_MEDICAMENTO', entidade: 'medications', entidadeId: editMed.id, modulo: 'configuracoes',
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      newValue: editMed as any,
    });
    setEditMed(null);
    toast.success('Medicamento atualizado');
  };

  const togglePrescricaoProfissao = async (key: string, v: boolean) => {
    const next = { ...prescricaoConfig, [key]: v };
    setPrescricaoConfig(next);
    await atualizarConfiguracao(CONFIG_KEY, next, { auditAcao: 'ALTERAR_CONFIG_PRESCRICAO' });
  };

  const saveEditExam = async () => {
    if (!editExam) return;
    const { error } = await supabase.from('exam_types').update({
      nome: editExam.nome, codigo_sus: editExam.codigo_sus,
      categoria: editExam.categoria, subcategoria: editExam.subcategoria,
      preparo: editExam.preparo, necessidade_jejum: editExam.necessidade_jejum,
      tempo_jejum: editExam.tempo_jejum, observacoes: editExam.observacoes,
      is_global: editExam.is_global,
    }).eq('id', editExam.id);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    setExams(prev => prev.map(e => e.id === editExam.id ? editExam : e));
    auditService.log({
      acao: 'EDITAR_EXAME', entidade: 'exam_types', entidadeId: editExam.id, modulo: 'configuracoes',
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      newValue: editExam as any,
    });
    setEditExam(null);
    toast.success('Exame atualizado');
  };

  const addNewMed = async () => {
    if (!newMed.nome.trim() || !newMed.principio_ativo.trim()) {
      toast.error('Nome e princípio ativo são obrigatórios');
      return;
    }
    // dedup local check
    const key = dedupKeyMed(newMed);
    if (meds.some(m => dedupKeyMed(m) === key && m.is_global)) {
      toast.error('Já existe um medicamento global com este princípio ativo, concentração, forma e via');
      return;
    }
    const { data, error } = await supabase.from('medications').insert({
      ...newMed, origem: 'PERSONALIZADO', is_global: true, ativo: true,
    } as any).select().single();
    if (error) { toast.error('Erro ao criar: ' + error.message); return; }
    if (data) setMeds(prev => [...prev, data as any]);
    auditService.log({
      acao: 'CRIAR_MEDICAMENTO', entidade: 'medications', entidadeId: (data as any)?.id, modulo: 'configuracoes',
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      newValue: newMed as any,
    });
    setAddMedDialog(false);
    setNewMed(blankMed);
    toast.success('Medicamento criado');
  };

  const addNewExam = async () => {
    if (!newExam.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    const key = dedupKeyExam(newExam);
    if (exams.some(e => dedupKeyExam(e) === key && e.is_global)) {
      toast.error('Já existe um exame global com este nome, categoria e subcategoria');
      return;
    }
    const { data, error } = await supabase.from('exam_types').insert({
      ...newExam, origem: 'PERSONALIZADO', is_global: true, ativo: true,
    } as any).select().single();
    if (error) { toast.error('Erro ao criar: ' + error.message); return; }
    if (data) setExams(prev => [...prev, data as any]);
    auditService.log({
      acao: 'CRIAR_EXAME', entidade: 'exam_types', entidadeId: (data as any)?.id, modulo: 'configuracoes',
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      newValue: newExam as any,
    });
    setAddExamDialog(false);
    setNewExam(blankExam);
    toast.success('Exame criado');
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    const table = deleteItem.type === 'med' ? 'medications' : 'exam_types';
    // Master pode excluir; demais apenas desativam
    if (isMaster) {
      const { error } = await supabase.from(table).delete().eq('id', deleteItem.id);
      if (error) {
        // fallback para desativar se houver vínculo
        await supabase.from(table).update({ ativo: false }).eq('id', deleteItem.id);
        toast.info('Item está em uso — foi desativado');
      } else {
        toast.success('Item excluído');
      }
    } else {
      await supabase.from(table).update({ ativo: false }).eq('id', deleteItem.id);
      toast.success('Item desativado');
    }
    auditService.log({
      acao: deleteItem.type === 'med' ? 'EXCLUIR_MEDICAMENTO' : 'EXCLUIR_EXAME',
      entidade: table, entidadeId: deleteItem.id, modulo: 'configuracoes',
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      detalhes: { nome: deleteItem.nome },
    });
    if (deleteItem.type === 'med') setMeds(prev => prev.filter(m => m.id !== deleteItem.id));
    else setExams(prev => prev.filter(e => e.id !== deleteItem.id));
    setDeleteItem(null);
    await loadData();
  };

  const duplicateMed = (m: Medication) => {
    setNewMed({
      nome: `${m.nome} (cópia)`,
      principio_ativo: m.principio_ativo,
      classe_terapeutica: m.classe_terapeutica,
      apresentacao: m.apresentacao,
      dosagem_padrao: m.dosagem_padrao,
      via_padrao: m.via_padrao,
      concentracao: m.concentracao,
      forma_farmaceutica: m.forma_farmaceutica,
      observacoes: m.observacoes,
    });
    setAddMedDialog(true);
  };

  const duplicateExam = (e: ExamType) => {
    setNewExam({
      nome: `${e.nome} (cópia)`,
      codigo_sus: e.codigo_sus,
      categoria: e.categoria,
      subcategoria: e.subcategoria,
      preparo: e.preparo,
      necessidade_jejum: e.necessidade_jejum,
      tempo_jejum: e.tempo_jejum,
      observacoes: e.observacoes,
    });
    setAddExamDialog(true);
  };

  const makeMedGlobal = async (id: string) => {
    await supabase.from('medications').update({ is_global: true, profissional_id: null }).eq('id', id);
    setMeds(prev => prev.map(m => m.id === id ? { ...m, is_global: true, profissional_id: null } : m));
    toast.success('Medicamento promovido a global');
  };

  const makeExamGlobal = async (id: string) => {
    await supabase.from('exam_types').update({ is_global: true, profissional_id: null }).eq('id', id);
    setExams(prev => prev.map(e => e.id === id ? { ...e, is_global: true, profissional_id: null } : e));
    toast.success('Exame promovido a global');
  };

  const savePrescricaoConfig = async (updated: Record<string, boolean>) => {
    setPrescricaoConfig(updated);
    await atualizarConfiguracao(CONFIG_KEY, updated, { auditAcao: 'ALTERAR_CONFIG_PRESCRICAO' });
  };

  /* ============================================================
     CSV import/export
     ============================================================ */
  const exportMedsCsv = () => {
    downloadCSV('medicamentos.csv', meds.map(m => ({
      nome: m.nome, principio_ativo: m.principio_ativo, concentracao: m.concentracao,
      forma_farmaceutica: m.forma_farmaceutica, via: m.via_padrao,
      classe_terapeutica: m.classe_terapeutica, origem: m.origem, ativo: m.ativo ? 'sim' : 'não',
    })));
  };

  const exportExamsCsv = () => {
    downloadCSV('exames.csv', exams.map(e => ({
      nome: e.nome, categoria: e.categoria, subcategoria: e.subcategoria,
      codigo_sus: e.codigo_sus, jejum: e.necessidade_jejum ? 'sim' : 'não',
      tempo_jejum: e.tempo_jejum, origem: e.origem, ativo: e.ativo ? 'sim' : 'não',
    })));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  /* ============================================================
     Empty state
     ============================================================ */
  const isEmpty = meds.length === 0 && exams.length === 0;

  return (
    <div className="space-y-6">
      {isEmpty && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6 text-center space-y-3">
            <Sparkles className="w-10 h-10 mx-auto text-primary" />
            <h3 className="text-lg font-semibold">Sua base está vazia</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Carregue a base padrão profissional com medicamentos da RENAME e exames mais comuns do SUS.
              Você poderá editar, desativar e personalizar tudo depois.
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button onClick={seedMedications} disabled={!!seeding}>
                {seeding === 'med' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Pill className="w-4 h-4 mr-1" />}
                Carregar medicamentos RENAME
              </Button>
              <Button onClick={seedExames} disabled={!!seeding} variant="secondary">
                {seeding === 'exam' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-1" />}
                Carregar exames padrão
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="medicamentos">
        <TabsList className="w-full flex flex-wrap h-auto">
          <TabsTrigger value="medicamentos" className="flex-1 min-w-[110px]"><Pill className="w-4 h-4 mr-1.5" />Medicamentos <Badge variant="secondary" className="ml-1.5 text-[10px]">{meds.filter(m => m.ativo).length}</Badge></TabsTrigger>
          <TabsTrigger value="exames" className="flex-1 min-w-[90px]"><FlaskConical className="w-4 h-4 mr-1.5" />Exames <Badge variant="secondary" className="ml-1.5 text-[10px]">{exams.filter(e => e.ativo).length}</Badge></TabsTrigger>
          <TabsTrigger value="categorias" className="flex-1 min-w-[100px]"><Tag className="w-4 h-4 mr-1.5" />Categorias <Badge variant="secondary" className="ml-1.5 text-[10px]">{totalCategorias}</Badge></TabsTrigger>
          <TabsTrigger value="personalizados" className="flex-1 min-w-[120px]"><FolderOpen className="w-4 h-4 mr-1.5" />Personalizados <Badge variant="secondary" className="ml-1.5 text-[10px]">{customMeds.length + customExams.length}</Badge></TabsTrigger>
          <TabsTrigger value="inativos" className="flex-1 min-w-[90px]"><Archive className="w-4 h-4 mr-1.5" />Inativos <Badge variant="secondary" className="ml-1.5 text-[10px]">{inativosMeds.length + inativosExams.length}</Badge></TabsTrigger>
          <TabsTrigger value="importacao" className="flex-1 min-w-[110px]"><Upload className="w-4 h-4 mr-1.5" />Importação</TabsTrigger>
          <TabsTrigger value="perfil" className="flex-1 min-w-[110px]"><Eye className="w-4 h-4 mr-1.5" />Permissões</TabsTrigger>
        </TabsList>

        {/* ==================== MEDICAMENTOS ==================== */}
        <TabsContent value="medicamentos" className="space-y-4 mt-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar por nome, princípio ativo, classe..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Button onClick={() => { setNewMed(blankMed); setAddMedDialog(true); }}><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={filterClasse || 'all'} onValueChange={v => setFilterClasse(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Todas as classes" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas as classes</SelectItem>{classesDisponiveis.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filterForma || 'all'} onValueChange={v => setFilterForma(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="Forma farmacêutica" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas as formas</SelectItem>{formasDisponiveis.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filterVia || 'all'} onValueChange={v => setFilterVia(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Via" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas as vias</SelectItem>{viasDisponiveis.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filterOrigemMed || 'all'} onValueChange={v => setFilterOrigemMed(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  <SelectItem value="RENAME">RENAME</SelectItem>
                  <SelectItem value="PERSONALIZADO">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {medsByClass.length === 0 && (
            <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum medicamento encontrado com os filtros atuais.
            </CardContent></Card>
          )}

          {medsByClass.map(([classe, items]) => (
            <Card key={classe} className="shadow-card border-0">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2 border-l-3 border-accent pl-2 flex items-center justify-between">
                  <span>{classe}</span>
                  <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </h4>
                <div className="space-y-1.5">
                  {items.map(m => (
                    <div key={m.id} className={`flex items-start gap-2 py-2 px-2 rounded hover:bg-muted/40 ${!m.ativo ? 'opacity-50' : ''}`}>
                      <Switch checked={m.ativo} onCheckedChange={() => toggleMedAtivo(m.id)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{m.principio_ativo || m.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.concentracao} {m.forma_farmaceutica && `— ${m.forma_farmaceutica}`} {m.via_padrao && `— via ${m.via_padrao}`}
                        </div>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          <Badge variant={m.origem === 'RENAME' ? 'default' : 'secondary'} className="text-[9px]">{m.origem || 'PERSONALIZADO'}</Badge>
                          {!m.is_global && <Badge variant="outline" className="text-[9px]">Local</Badge>}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateMed(m)} title="Duplicar"><Plus className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditMed({ ...m })} title="Editar"><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70" onClick={() => setDeleteItem({ type: 'med', id: m.id, nome: m.nome })} title="Desativar/Excluir"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ==================== EXAMES ==================== */}
        <TabsContent value="exames" className="space-y-4 mt-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar por nome, código SUS, categoria..." value={examSearch} onChange={e => setExamSearch(e.target.value)} />
              </div>
              <Button onClick={() => { setNewExam(blankExam); setAddExamDialog(true); }}><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={filterCategoria || 'all'} onValueChange={v => setFilterCategoria(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{categoriasExamesDisponiveis.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filterSubcategoria || 'all'} onValueChange={v => setFilterSubcategoria(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Subcategoria" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas as subcategorias</SelectItem>{subcategoriasExamesDisponiveis.filter(Boolean).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filterJejum || 'all'} onValueChange={v => setFilterJejum(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Jejum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Jejum (todos)</SelectItem>
                  <SelectItem value="sim">Requer jejum</SelectItem>
                  <SelectItem value="nao">Sem jejum</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterOrigemExam || 'all'} onValueChange={v => setFilterOrigemExam(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  <SelectItem value="PADRAO">Padrão</SelectItem>
                  <SelectItem value="PERSONALIZADO">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {examsByCategory.length === 0 && (
            <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum exame encontrado com os filtros atuais.
            </CardContent></Card>
          )}

          {examsByCategory.map(([cat, items]) => (
            <Card key={cat} className="shadow-card border-0">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2 border-l-3 border-success pl-2 flex items-center justify-between">
                  <span>{cat}</span>
                  <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </h4>
                <div className="space-y-1.5">
                  {items.map(e => (
                    <div key={e.id} className={`flex items-start gap-2 py-2 px-2 rounded hover:bg-muted/40 ${!e.ativo ? 'opacity-50' : ''}`}>
                      <Switch checked={e.ativo} onCheckedChange={() => toggleExamAtivo(e.id)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{e.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.subcategoria && <>Subcategoria: {e.subcategoria}</>}
                          {e.codigo_sus && <> · <span className="font-mono">{e.codigo_sus}</span></>}
                          {e.necessidade_jejum && <> · Jejum {e.tempo_jejum && `(${e.tempo_jejum})`}</>}
                        </div>
                        {e.preparo && <div className="text-[11px] text-muted-foreground mt-0.5">Preparo: {e.preparo}</div>}
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          <Badge variant={e.origem === 'PADRAO' ? 'default' : 'secondary'} className="text-[9px]">{e.origem || 'PERSONALIZADO'}</Badge>
                          {!e.is_global && <Badge variant="outline" className="text-[9px]">Local</Badge>}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateExam(e)} title="Duplicar"><Plus className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditExam({ ...e })} title="Editar"><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70" onClick={() => setDeleteItem({ type: 'exam', id: e.id, nome: e.nome })} title="Desativar/Excluir"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ==================== CATEGORIAS ==================== */}
        <TabsContent value="categorias" className="space-y-4 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3">Classes terapêuticas (Medicamentos)</h3>
              <div className="flex flex-wrap gap-2">
                {classesDisponiveis.map(c => {
                  const total = meds.filter(m => m.classe_terapeutica === c).length;
                  return <Badge key={c} variant="outline">{c} <span className="ml-1.5 text-[9px] opacity-70">{total}</span></Badge>;
                })}
                {classesDisponiveis.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma classe cadastrada.</span>}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3">Categorias de Exames</h3>
              <div className="flex flex-wrap gap-2">
                {categoriasExamesDisponiveis.map(c => {
                  const total = exams.filter(e => e.categoria === c).length;
                  return <Badge key={c} variant="outline">{c} <span className="ml-1.5 text-[9px] opacity-70">{total}</span></Badge>;
                })}
                {categoriasExamesDisponiveis.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma categoria cadastrada.</span>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== PERSONALIZADOS ==================== */}
        <TabsContent value="personalizados" className="space-y-4 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2 text-sm">Medicamentos criados por profissionais</h3>
              {customMeds.length === 0 && <p className="text-xs text-muted-foreground">Nenhum medicamento personalizado.</p>}
              {customMeds.map(m => (
                <div key={m.id} className="flex items-center gap-2 py-1.5">
                  <span className="text-sm flex-1">{m.nome}</span>
                  <Badge variant="outline" className="text-[10px]">Personalizado</Badge>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => makeMedGlobal(m.id)}>Tornar global</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setDeleteItem({ type: 'med', id: m.id, nome: m.nome })}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="shadow-card border-0">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2 text-sm">Exames criados por profissionais</h3>
              {customExams.length === 0 && <p className="text-xs text-muted-foreground">Nenhum exame personalizado.</p>}
              {customExams.map(e => (
                <div key={e.id} className="flex items-center gap-2 py-1.5">
                  <span className="text-sm flex-1">{e.nome}</span>
                  <Badge variant="outline" className="text-[10px]">Personalizado</Badge>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => makeExamGlobal(e.id)}>Tornar global</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setDeleteItem({ type: 'exam', id: e.id, nome: e.nome })}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== INATIVOS ==================== */}
        <TabsContent value="inativos" className="space-y-4 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2 text-sm">Medicamentos desativados ({inativosMeds.length})</h3>
              {inativosMeds.length === 0 && <p className="text-xs text-muted-foreground">Nenhum medicamento desativado.</p>}
              <div className="space-y-1.5">
                {inativosMeds.map(m => (
                  <div key={m.id} className="flex items-center gap-2 py-1.5 opacity-70">
                    <span className="text-sm flex-1">{m.nome}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleMedAtivo(m.id)}>Reativar</Button>
                    {isMaster && <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setDeleteItem({ type: 'med', id: m.id, nome: m.nome })}><Trash2 className="w-3 h-3" /></Button>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card border-0">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2 text-sm">Exames desativados ({inativosExams.length})</h3>
              {inativosExams.length === 0 && <p className="text-xs text-muted-foreground">Nenhum exame desativado.</p>}
              <div className="space-y-1.5">
                {inativosExams.map(e => (
                  <div key={e.id} className="flex items-center gap-2 py-1.5 opacity-70">
                    <span className="text-sm flex-1">{e.nome}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleExamAtivo(e.id)}>Reativar</Button>
                    {isMaster && <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setDeleteItem({ type: 'exam', id: e.id, nome: e.nome })}><Trash2 className="w-3 h-3" /></Button>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== IMPORTAÇÃO / RESTAURAÇÃO ==================== */}
        <TabsContent value="importacao" className="space-y-4 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Base padrão de Medicamentos (RENAME)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Carrega <strong>{RENAME_MEDICATIONS.length}</strong> medicamentos da Relação Nacional de Medicamentos Essenciais.
                  Itens já existentes (mesmo princípio ativo + concentração + forma + via) não são duplicados.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => setRestoreDialog('med')} disabled={!!seeding} variant="default">
                    {seeding === 'med' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                    Carregar / Restaurar base RENAME
                  </Button>
                  <Button onClick={exportMedsCsv} variant="outline"><Download className="w-4 h-4 mr-1" />Exportar CSV</Button>
                </div>
              </div>
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-1">Base padrão de Exames</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Carrega <strong>{EXAMES_PADRAO.length}</strong> exames comuns do SUS, organizados por categoria.
                  Itens duplicados (mesmo nome + categoria + subcategoria) são ignorados.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => setRestoreDialog('exam')} disabled={!!seeding} variant="default">
                    {seeding === 'exam' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                    Carregar / Restaurar exames padrão
                  </Button>
                  <Button onClick={exportExamsCsv} variant="outline"><Download className="w-4 h-4 mr-1" />Exportar CSV</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== PERMISSÕES ==================== */}
        <TabsContent value="perfil" className="space-y-4 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground mb-1">Prescrição de Medicamentos</h3>
              <p className="text-xs text-muted-foreground mb-3">Quais profissões podem prescrever medicamentos:</p>
              <div className="space-y-2">
                {PROFISSOES_PRESCRICAO.map(p => (
                  <div key={p.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <Checkbox checked={prescricaoConfig[p.key] ?? false} onCheckedChange={v => savePrescricaoConfig({ ...prescricaoConfig, [p.key]: !!v })} />
                    <span className="text-sm">{p.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Medication Dialog */}
      <Dialog open={!!editMed} onOpenChange={() => setEditMed(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Medicamento</DialogTitle></DialogHeader>
          {editMed && (
            <div className="space-y-3">
              <div><Label>Nome de exibição *</Label><Input value={editMed.nome} onChange={e => setEditMed({ ...editMed, nome: e.target.value })} /></div>
              <div><Label>Princípio ativo *</Label><Input value={editMed.principio_ativo} onChange={e => setEditMed({ ...editMed, principio_ativo: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Concentração</Label><Input value={editMed.concentracao} onChange={e => setEditMed({ ...editMed, concentracao: e.target.value })} placeholder="500 mg" /></div>
                <div><Label>Forma farmacêutica</Label><Input value={editMed.forma_farmaceutica} onChange={e => setEditMed({ ...editMed, forma_farmaceutica: e.target.value })} placeholder="comprimido" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Via</Label><Input value={editMed.via_padrao} onChange={e => setEditMed({ ...editMed, via_padrao: e.target.value })} placeholder="oral" /></div>
                <div><Label>Dosagem padrão</Label><Input value={editMed.dosagem_padrao} onChange={e => setEditMed({ ...editMed, dosagem_padrao: e.target.value })} /></div>
              </div>
              <div><Label>Classe terapêutica</Label><Input value={editMed.classe_terapeutica} onChange={e => setEditMed({ ...editMed, classe_terapeutica: e.target.value })} /></div>
              <div><Label>Apresentação</Label><Input value={editMed.apresentacao} onChange={e => setEditMed({ ...editMed, apresentacao: e.target.value })} /></div>
              <div><Label>Observações</Label><Input value={editMed.observacoes} onChange={e => setEditMed({ ...editMed, observacoes: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={editMed.is_global} onCheckedChange={v => setEditMed({ ...editMed, is_global: v })} /><Label>Global (visível para todos)</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMed(null)}>Cancelar</Button>
            <Button onClick={saveEditMed}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Exam Dialog */}
      <Dialog open={!!editExam} onOpenChange={() => setEditExam(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Exame</DialogTitle></DialogHeader>
          {editExam && (
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={editExam.nome} onChange={e => setEditExam({ ...editExam, nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Categoria</Label><Input value={editExam.categoria} onChange={e => setEditExam({ ...editExam, categoria: e.target.value })} /></div>
                <div><Label>Subcategoria</Label><Input value={editExam.subcategoria} onChange={e => setEditExam({ ...editExam, subcategoria: e.target.value })} /></div>
              </div>
              <div><Label>Código SUS / SIGTAP</Label><Input value={editExam.codigo_sus} onChange={e => setEditExam({ ...editExam, codigo_sus: e.target.value })} /></div>
              <div><Label>Preparo / orientação ao paciente</Label><Input value={editExam.preparo} onChange={e => setEditExam({ ...editExam, preparo: e.target.value })} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={editExam.necessidade_jejum} onCheckedChange={v => setEditExam({ ...editExam, necessidade_jejum: v })} />
                <Label>Necessita jejum</Label>
                {editExam.necessidade_jejum && <Input className="ml-2 max-w-[150px]" value={editExam.tempo_jejum} onChange={e => setEditExam({ ...editExam, tempo_jejum: e.target.value })} placeholder="ex.: 8 horas" />}
              </div>
              <div><Label>Observações</Label><Input value={editExam.observacoes} onChange={e => setEditExam({ ...editExam, observacoes: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={editExam.is_global} onCheckedChange={v => setEditExam({ ...editExam, is_global: v })} /><Label>Global</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditExam(null)}>Cancelar</Button>
            <Button onClick={saveEditExam}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Medication Dialog */}
      <Dialog open={addMedDialog} onOpenChange={setAddMedDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Medicamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome de exibição *</Label><Input value={newMed.nome} onChange={e => setNewMed(p => ({ ...p, nome: e.target.value }))} placeholder="Dipirona sódica 500 mg comprimido" /></div>
            <div><Label>Princípio ativo *</Label><Input value={newMed.principio_ativo} onChange={e => setNewMed(p => ({ ...p, principio_ativo: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Concentração</Label><Input value={newMed.concentracao} onChange={e => setNewMed(p => ({ ...p, concentracao: e.target.value }))} placeholder="500 mg" /></div>
              <div><Label>Forma farmacêutica</Label><Input value={newMed.forma_farmaceutica} onChange={e => setNewMed(p => ({ ...p, forma_farmaceutica: e.target.value }))} placeholder="comprimido" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Via</Label><Input value={newMed.via_padrao} onChange={e => setNewMed(p => ({ ...p, via_padrao: e.target.value }))} placeholder="oral" /></div>
              <div><Label>Dosagem padrão</Label><Input value={newMed.dosagem_padrao} onChange={e => setNewMed(p => ({ ...p, dosagem_padrao: e.target.value }))} /></div>
            </div>
            <div><Label>Classe terapêutica</Label><Input value={newMed.classe_terapeutica} onChange={e => setNewMed(p => ({ ...p, classe_terapeutica: e.target.value }))} /></div>
            <div><Label>Apresentação</Label><Input value={newMed.apresentacao} onChange={e => setNewMed(p => ({ ...p, apresentacao: e.target.value }))} /></div>
            <div><Label>Observações</Label><Input value={newMed.observacoes} onChange={e => setNewMed(p => ({ ...p, observacoes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMedDialog(false)}>Cancelar</Button>
            <Button onClick={addNewMed} disabled={!newMed.nome.trim() || !newMed.principio_ativo.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Exam Dialog */}
      <Dialog open={addExamDialog} onOpenChange={setAddExamDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Exame</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={newExam.nome} onChange={e => setNewExam(p => ({ ...p, nome: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Categoria</Label><Input value={newExam.categoria} onChange={e => setNewExam(p => ({ ...p, categoria: e.target.value }))} placeholder="Imagem" /></div>
              <div><Label>Subcategoria</Label><Input value={newExam.subcategoria} onChange={e => setNewExam(p => ({ ...p, subcategoria: e.target.value }))} placeholder="Ressonância Magnética" /></div>
            </div>
            <div><Label>Código SUS / SIGTAP</Label><Input value={newExam.codigo_sus} onChange={e => setNewExam(p => ({ ...p, codigo_sus: e.target.value }))} /></div>
            <div><Label>Preparo</Label><Input value={newExam.preparo} onChange={e => setNewExam(p => ({ ...p, preparo: e.target.value }))} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={newExam.necessidade_jejum} onCheckedChange={v => setNewExam(p => ({ ...p, necessidade_jejum: v }))} />
              <Label>Necessita jejum</Label>
              {newExam.necessidade_jejum && <Input className="ml-2 max-w-[150px]" value={newExam.tempo_jejum} onChange={e => setNewExam(p => ({ ...p, tempo_jejum: e.target.value }))} placeholder="ex.: 8 horas" />}
            </div>
            <div><Label>Observações</Label><Input value={newExam.observacoes} onChange={e => setNewExam(p => ({ ...p, observacoes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddExamDialog(false)}>Cancelar</Button>
            <Button onClick={addNewExam} disabled={!newExam.nome.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation */}
      <AlertDialog open={!!restoreDialog} onOpenChange={() => setRestoreDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Carregar base padrão {restoreDialog === 'med' ? 'RENAME' : 'de Exames'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Itens já existentes serão ignorados (deduplicação automática). Itens personalizados não serão afetados.
              Esta ação ficará registrada no log de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => restoreDialog === 'med' ? seedMedications() : seedExames()}>Carregar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteItem?.type === 'med' ? 'medicamento' : 'exame'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isMaster
                ? 'Master pode excluir definitivamente. Se o item estiver vinculado a registros existentes, ele será apenas desativado para preservar o histórico.'
                : 'O item será desativado (não excluído). Registros já salvos não são afetados. Apenas usuários Master podem excluir definitivamente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{isMaster ? 'Excluir' : 'Desativar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConfigMedicamentosExames;
