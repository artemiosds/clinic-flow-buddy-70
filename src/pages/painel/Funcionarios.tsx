import { PageHeader } from '@/components/layout/PageHeader';
import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Pencil, Trash2, Loader2, CalendarCheck, Eye, EyeOff, UserCog, Filter, X, Printer, Power, RotateCcw } from 'lucide-react';
import { UserRole } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import ProfissionaisExternos from './ProfissionaisExternos';
import CustomFieldsRenderer from '@/components/CustomFieldsRenderer';
import { useCustomFields } from '@/hooks/useCustomFields';
import CboAutocomplete, { CboValue } from '@/components/CboAutocomplete';
import { roleLabels, roleColors } from "@/lib/roleUtils";
import { formatCNS, normalizeCNS, isCNSValid } from '@/lib/cnsUtils';
import { openPrintDocument } from '@/lib/printLayout';

interface FuncionarioDB {
  id: string;
  auth_user_id: string | null;
  nome: string;
  usuario: string;
  email: string;
  cpf: string;
  setor: string;
  unidade_id: string;
  sala_id: string;
  cargo: string;
  role: string;
  ativo: boolean;
  criado_em: string;
  criado_por: string;
  tempo_atendimento: number;
  profissao: string;
  tipo_conselho: string;
  numero_conselho: string;
  uf_conselho: string;
  pode_agendar_retorno: boolean;
  coren: string;
  custom_data?: Record<string, any> | null;
}

type SortKey = 'nome_asc' | 'nome_desc' | 'profissao' | 'unidade' | 'recentes';

const Funcionarios: React.FC = () => {
  const { unidades, salas, refreshFuncionarios } = useData();
  const { unidadesVisiveis } = useUnidadeFilter();
  const { user, isUnitMaster } = useAuth();
  const { can } = usePermissions();
  const { resolved: customConfig } = useCustomFields('funcionario', user?.unidadeId);
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [funcionarios, setFuncionarios] = useState<FuncionarioDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showSenha, setShowSenha] = useState(false);
  const [form, setForm] = useState({
    nome: '', usuario: '', email: '', cpf: '', senha: '', setor: '', unidade_id: '', sala_id: '', cargo: '', role: '' as UserRole, tempo_atendimento: 30,
    profissao: '', tipo_conselho: '', numero_conselho: '', uf_conselho: '', pode_agendar_retorno: false, coren: '',
    ativo: true,
  });
  const [cbo, setCbo] = useState<CboValue | null>(null);
  const [cns, setCns] = useState<string>('');
  const [showCboError, setShowCboError] = useState(false);
  const [showCnsError, setShowCnsError] = useState(false);
  const canManage = can('funcionarios', 'can_edit');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnidade, setFilterUnidade] = useState<string>('__all__');
  const [filterProfissao, setFilterProfissao] = useState<string>('__all__');
  const [filterRole, setFilterRole] = useState<string>('__all__');
  const [filterStatus, setFilterStatus] = useState<string>('__all__');
  const [sortKey, setSortKey] = useState<SortKey>('nome_asc');

  // Profile drawer
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileFunc, setProfileFunc] = useState<FuncionarioDB | null>(null);

  const loadFuncionarios = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'list' },
      });
      if (data?.funcionarios) {
        setFuncionarios(data.funcionarios);
      }
    } catch (err) {
      console.error('Error loading employees:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFuncionarios();
  }, []);

  const conselhoMap: Record<string, string> = {
    'Médico': 'CRM', 'Médica': 'CRM', 'Enfermeiro': 'COREN', 'Enfermeira': 'COREN',
    'Odontólogo': 'CRO', 'Odontóloga': 'CRO', 'Dentista': 'CRO',
    'Fisioterapeuta': 'CREFITO', 'Psicólogo': 'CRP', 'Psicóloga': 'CRP',
    'Assistente Social': 'CRESS', 'Nutricionista': 'CRN', 'Farmacêutico': 'CRF', 'Farmacêutica': 'CRF',
    'Fonoaudiólogo': 'CRFa', 'Fonoaudióloga': 'CRFa', 'Terapeuta Ocupacional': 'CREFITO',
    'Biomédico': 'CRBM', 'Biomédica': 'CRBM', 'Fisio': 'CREFITO',
    'Agente Comunitário de Saúde': 'OUTROS', 'Fonoaudiologia': 'CRFa', 'Serviço Social': 'CRESS',
  };

  const openEdit = (f: FuncionarioDB) => {
    setEditId(f.id);
    setForm({
      nome: f.nome, usuario: f.usuario, email: f.email, cpf: f.cpf || '', senha: '',
      setor: f.setor || '', unidade_id: f.unidade_id || '', sala_id: f.sala_id || '',
      cargo: f.cargo || '', role: f.role as UserRole, tempo_atendimento: f.tempo_atendimento || 30,
      profissao: f.profissao || '', tipo_conselho: f.tipo_conselho || '',
      numero_conselho: f.numero_conselho || '', uf_conselho: f.uf_conselho || '',
      pode_agendar_retorno: f.pode_agendar_retorno ?? false,
      coren: f.coren || '',
      ativo: !!f.ativo,
    });
    const cd = (f.custom_data as any) || {};
    if (cd.cbo_codigo && cd.cbo_descricao) {
      setCbo({ codigo: cd.cbo_codigo, descricao: cd.cbo_descricao });
    } else {
      setCbo(null);
    }
    setCns(normalizeCNS(cd.cns || ''));
    setShowCboError(false);
    setShowCnsError(false);
    setCustomData(cd);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    const defaultUnit = isUnitMaster ? (user?.unidadeId || '') : '';
    setForm({ nome: '', usuario: '', email: '', cpf: '', senha: '', setor: '', unidade_id: defaultUnit, sala_id: '', cargo: '', role: '' as UserRole, tempo_atendimento: 30, profissao: '', tipo_conselho: '', numero_conselho: '', uf_conselho: '', pode_agendar_retorno: false, coren: '', ativo: true });
    setCbo(null);
    setCns('');
    setShowCboError(false);
    setShowCnsError(false);
    setCustomData({});
    setDialogOpen(true);
  };

  const requiresProfessionalData = (role: string) => role === 'profissional' || role === 'tecnico' || role === 'avaliacao_enfermagem';

  const handleSave = async () => {
    if (!form.nome || !form.usuario || !form.email || !form.role) {
      toast.error('Nome, usuário, e-mail e perfil são obrigatórios.');
      return;
    }
    if (requiresProfessionalData(form.role)) {
      if (!cbo?.codigo) {
        setShowCboError(true);
        toast.error('CBO é obrigatório para profissionais clínicos. Selecione no autocomplete.');
        return;
      }
      if (!form.tipo_conselho || !form.numero_conselho || !form.uf_conselho) {
        toast.error('O Conselho Profissional (Tipo, Número e UF) é obrigatório para este perfil.');
        return;
      }
      const cnsDigits = normalizeCNS(cns);
      if (!cnsDigits || cnsDigits.length !== 15) {
        setShowCnsError(true);
        toast.error('CNS do profissional é obrigatório (15 dígitos) para geração do BPA-I.');
        return;
      }
    }
    if (isUnitMaster) {
      if (editId) {
        const target = funcionarios.find(f => f.id === editId);
        if (target && isProtectedGlobalMaster(target)) {
          toast.error('Você não tem permissão para editar o administrador global.');
          return;
        }
      }
      form.unidade_id = user?.unidadeId || '';
    }

    setSaving(true);
    try {
      const extraCustom = {
        data_admissao: customData?.data_admissao || '',
        tipo_vinculo: customData?.tipo_vinculo || '',
        turno_trabalho: customData?.turno_trabalho || '',
        observacoes_internas: customData?.observacoes_internas || '',
      };

      if (editId) {
        const updateData: Record<string, any> = {
          action: 'update',
          id: editId,
          nome: form.nome,
          usuario: form.usuario,
          email: form.email,
          cpf: form.cpf,
          setor: form.setor,
          unidade_id: form.unidade_id,
          sala_id: form.sala_id,
          cargo: form.cargo,
          role: form.role,
          ativo: form.ativo,
          tempo_atendimento: form.tempo_atendimento,
          profissao: form.profissao,
          tipo_conselho: form.tipo_conselho,
          numero_conselho: form.numero_conselho,
          uf_conselho: form.uf_conselho,
          pode_agendar_retorno: form.pode_agendar_retorno,
          coren: form.coren,
          cbo_codigo: cbo?.codigo || '',
          cbo_descricao: cbo?.descricao || '',
          cns: normalizeCNS(cns),
          aceita_encaminhamento_externo: !!customData?.aceita_encaminhamento_externo,
          ...extraCustom,
        };
        if (form.senha) updateData.senha = form.senha;

        const { data, error } = await supabase.functions.invoke('manage-employee', { body: updateData });
        if (error || data?.error) {
          toast.error(data?.error || 'Erro ao atualizar funcionário.');
          setSaving(false);
          return;
        }
        toast.success('Funcionário atualizado!');
      } else {
        if (!form.senha) {
          toast.error('Senha é obrigatória para novo funcionário.');
          setSaving(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke('manage-employee', {
          body: {
            action: 'create',
            nome: form.nome, usuario: form.usuario, email: form.email, cpf: form.cpf, senha: form.senha,
            setor: form.setor, unidade_id: form.unidade_id, sala_id: form.sala_id, cargo: form.cargo, role: form.role,
            ativo: form.ativo,
            tempo_atendimento: form.tempo_atendimento,
            profissao: form.profissao, tipo_conselho: form.tipo_conselho, numero_conselho: form.numero_conselho, uf_conselho: form.uf_conselho,
            pode_agendar_retorno: form.pode_agendar_retorno, coren: form.coren,
            cbo_codigo: cbo?.codigo || '', cbo_descricao: cbo?.descricao || '',
            cns: normalizeCNS(cns),
            aceita_encaminhamento_externo: !!customData?.aceita_encaminhamento_externo,
            ...extraCustom,
            criado_por: user?.id || '',
          },
        });
        if (error || data?.error) {
          toast.error(data?.error || 'Erro ao cadastrar funcionário.');
          setSaving(false);
          return;
        }
        toast.success('Funcionário cadastrado com sucesso!');
      }

      setDialogOpen(false);
      await loadFuncionarios();
      await refreshFuncionarios();
    } catch (err) {
      toast.error('Erro ao salvar funcionário.');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const target = funcionarios.find(f => f.id === id);
    if (isUnitMaster && target && isProtectedGlobalMaster(target)) {
      toast.error('Você não tem permissão para excluir o administrador global.');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'delete', id },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao excluir.');
        return;
      }
      toast.success('Funcionário excluído!');
      await loadFuncionarios();
      await refreshFuncionarios();
    } catch {
      toast.error('Erro ao excluir funcionário.');
    }
  };

  const toggleAtivo = async (f: FuncionarioDB, ativo: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'update', id: f.id, ativo },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao alterar status.');
        return;
      }
      toast.success(ativo ? 'Funcionário reativado!' : 'Funcionário desativado!');
      await loadFuncionarios();
      await refreshFuncionarios();
      if (profileFunc?.id === f.id) {
        setProfileFunc(prev => prev ? { ...prev, ativo } : prev);
      }
    } catch {
      toast.error('Erro ao alterar status.');
    }
  };

  const isProtectedGlobalMaster = (f: FuncionarioDB) => f.usuario === 'admin.sms';

  // Base list (unit scoping)
  const baseList = useMemo(() => {
    let list = funcionarios;
    if (user?.usuario !== 'admin.sms' && user?.unidadeId) {
      list = list.filter(f => f.unidade_id === user.unidadeId || !f.unidade_id);
    }
    if (isUnitMaster) {
      list = list.filter(f => !isProtectedGlobalMaster(f));
    }
    return list;
  }, [funcionarios, user, isUnitMaster]);

  // Profissões disponíveis (para filtro)
  const profissoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    baseList.forEach(f => { if (f.profissao) set.add(f.profissao); });
    return Array.from(set).sort();
  }, [baseList]);

  const applyFiltersAndSort = (list: FuncionarioDB[]) => {
    let out = list;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      out = out.filter(f =>
        f.nome.toLowerCase().includes(term) ||
        (f.email || '').toLowerCase().includes(term) ||
        (f.cpf || '').includes(term) ||
        (f.profissao || '').toLowerCase().includes(term) ||
        (f.cargo || '').toLowerCase().includes(term)
      );
    }
    if (filterUnidade !== '__all__') out = out.filter(f => f.unidade_id === filterUnidade);
    if (filterProfissao !== '__all__') out = out.filter(f => (f.profissao || '') === filterProfissao);
    if (filterRole !== '__all__') out = out.filter(f => f.role === filterRole);
    if (filterStatus !== '__all__') out = out.filter(f => (filterStatus === 'ativo' ? f.ativo : !f.ativo));

    const sorted = [...out];
    switch (sortKey) {
      case 'nome_asc': sorted.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); break;
      case 'nome_desc': sorted.sort((a, b) => b.nome.localeCompare(a.nome, 'pt-BR')); break;
      case 'profissao': sorted.sort((a, b) => (a.profissao || '').localeCompare(b.profissao || '', 'pt-BR')); break;
      case 'unidade': {
        const nameOf = (id: string) => unidades.find(u => u.id === id)?.nome || '';
        sorted.sort((a, b) => nameOf(a.unidade_id).localeCompare(nameOf(b.unidade_id), 'pt-BR'));
        break;
      }
      case 'recentes': sorted.sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || '')); break;
    }
    return sorted;
  };

  const ativosList = useMemo(() => baseList.filter(f => f.ativo), [baseList]);
  const inativosList = useMemo(() => baseList.filter(f => !f.ativo), [baseList]);

  const filteredAtivos = useMemo(() => applyFiltersAndSort(ativosList), [ativosList, searchTerm, filterUnidade, filterProfissao, filterRole, filterStatus, sortKey, unidades]);
  const filteredInativos = useMemo(() => applyFiltersAndSort(inativosList), [inativosList, searchTerm, filterUnidade, filterProfissao, filterRole, filterStatus, sortKey, unidades]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterUnidade('__all__');
    setFilterProfissao('__all__');
    setFilterRole('__all__');
    setFilterStatus('__all__');
    setSortKey('nome_asc');
  };

  const hasActiveFilters = searchTerm || filterUnidade !== '__all__' || filterProfissao !== '__all__' || filterRole !== '__all__' || filterStatus !== '__all__' || sortKey !== 'nome_asc';

  const openProfile = (f: FuncionarioDB) => { setProfileFunc(f); setProfileOpen(true); };

  const printFicha = async (f: FuncionarioDB) => {
    const unidadeNome = unidades.find(u => u.id === f.unidade_id)?.nome || '—';
    const salaNome = salas.find(s => s.id === f.sala_id)?.nome || '—';
    const cd = (f.custom_data as any) || {};
    const row = (label: string, val: any) =>
      `<tr><td style="padding:6px 10px;color:#64748b;border-bottom:1px solid #e2e8f0;width:38%;">${label}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${val || '—'}</td></tr>`;

    const body = `
      <h2>Dados Pessoais</h2>
      <table>
        ${row('Nome', f.nome)}
        ${row('Usuário', f.usuario)}
        ${row('CPF', f.cpf)}
        ${row('E-mail', f.email)}
      </table>

      <h2>Dados Profissionais</h2>
      <table>
        ${row('Cargo', f.cargo)}
        ${row('Profissão', f.profissao)}
        ${row('Conselho', f.tipo_conselho ? `${f.tipo_conselho} ${f.numero_conselho || ''}${f.uf_conselho ? '/' + f.uf_conselho : ''}` : '')}
        ${row('CBO', cd.cbo_codigo ? `${cd.cbo_codigo} — ${cd.cbo_descricao || ''}` : '')}
        ${row('CNS', cd.cns ? formatCNS(cd.cns) : '')}
        ${row('Unidade', unidadeNome)}
        ${row('Sala', salaNome)}
        ${row('Setor', f.setor)}
        ${row('Tempo de atendimento', f.tempo_atendimento ? `${f.tempo_atendimento} min` : '')}
        ${row('Perfil de acesso', roleLabels[f.role as UserRole] || f.role)}
      </table>

      <h2>Vínculo</h2>
      <table>
        ${row('Status', f.ativo ? 'Ativo' : 'Inativo')}
        ${row('Data de admissão', cd.data_admissao ? new Date(cd.data_admissao).toLocaleDateString('pt-BR') : '')}
        ${row('Tipo de vínculo', cd.tipo_vinculo)}
        ${row('Turno', cd.turno_trabalho)}
        ${row('Cadastrado em', f.criado_em ? new Date(f.criado_em).toLocaleDateString('pt-BR') : '')}
      </table>

      ${cd.observacoes_internas ? `<h2>Observações Internas</h2><div class="section-content" style="white-space:pre-wrap;">${cd.observacoes_internas}</div>` : ''}
    `;

    try {
      await openPrintDocument(`FICHA DO FUNCIONÁRIO — ${f.nome}`, body);
    } catch (err: any) {
      if (err?.message === 'POPUP_BLOCKED') {
        toast.error('Pop-up bloqueado', { description: 'Permita pop-ups deste site e tente novamente.' });
      } else {
        toast.error('Erro ao gerar ficha', { description: err?.message ?? String(err) });
      }
    }
  };

  const renderCard = (f: FuncionarioDB, opts?: { inativo?: boolean }) => {
    const unidadeNome = unidades.find(u => u.id === f.unidade_id)?.nome || '';
    const cd = (f.custom_data as any) || {};
    return (
      <Card key={f.id} className="shadow-card border-0">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
            {f.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground truncate">{f.nome}</p>
              <Badge className={roleColors[f.role as UserRole] || 'bg-muted text-muted-foreground'}>
                {roleLabels[f.role as UserRole] || f.role}
              </Badge>
              {f.role === 'profissional' && f.pode_agendar_retorno && (
                <Badge variant="outline" className="text-xs border-success/50 text-success">
                  <CalendarCheck className="w-3 h-3 mr-1" />Retorno
                </Badge>
              )}
              {!f.ativo && <Badge variant="outline" className="text-xs">Inativo</Badge>}
            </div>
            <p className="text-sm text-muted-foreground break-words">
              {[f.profissao, f.cargo].filter(Boolean).join(' • ') || '—'}
              {f.tipo_conselho && f.numero_conselho ? ` • ${f.tipo_conselho} ${f.numero_conselho}${f.uf_conselho ? '/' + f.uf_conselho : ''}` : ''}
              {cd.cbo_codigo ? ` • CBO ${cd.cbo_codigo}` : ''}
            </p>
            <p className="text-xs text-muted-foreground break-words">
              {unidadeNome || 'Sem unidade'}{f.setor ? ` • ${f.setor}` : ''}
              {f.role === 'profissional' && f.tempo_atendimento ? ` • ${f.tempo_atendimento} min` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 self-end sm:self-center">
            <Button size="icon" variant="ghost" title="Ver perfil" onClick={() => openProfile(f)}>
              <Eye className="w-4 h-4" />
            </Button>
            {canManage && !(isUnitMaster && isProtectedGlobalMaster(f)) && (
              <>
                {!(isUnitMaster && f.unidade_id && f.unidade_id !== user?.unidadeId) && (
                  <Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(f)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
                {opts?.inativo ? (
                  <Button size="icon" variant="ghost" title="Reativar" className="text-success" onClick={() => toggleAtivo(f, true)}>
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
                        <AlertDialogDescription>Tem certeza que deseja excluir {f.nome}? Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(f.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const FilterBar = () => (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, e-mail, CPF..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        {canManage && (
          <Button onClick={openNew} className="gradient-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />Novo Funcionário
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center text-xs text-muted-foreground gap-1 mr-1">
          <Filter className="w-3.5 h-3.5" /> Filtros:
        </div>

        <Select value={filterUnidade} onValueChange={setFilterUnidade}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as unidades</SelectItem>
            {unidadesVisiveis.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterProfissao} onValueChange={setFilterProfissao}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Profissão" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as profissões</SelectItem>
            {profissoesDisponiveis.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Perfil" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os perfis</SelectItem>
            <SelectItem value="master">Master</SelectItem>
            <SelectItem value="gestao">Gestão</SelectItem>
            <SelectItem value="recepcao">Recepção</SelectItem>
            <SelectItem value="tecnico">Triagem</SelectItem>
            <SelectItem value="avaliacao_enfermagem">Enfermagem</SelectItem>
            <SelectItem value="profissional">Profissional</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Ordenar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nome_asc">Nome (A–Z)</SelectItem>
            <SelectItem value="nome_desc">Nome (Z–A)</SelectItem>
            <SelectItem value="profissao">Profissão</SelectItem>
            <SelectItem value="unidade">Unidade</SelectItem>
            <SelectItem value="recentes">Mais recentes</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
            <X className="w-3.5 h-3.5 mr-1" />Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );

  const renderList = (list: FuncionarioDB[], opts?: { inativo?: boolean; emptyMsg?: string }) => (
    <>
      <p className="text-xs text-muted-foreground">{list.length} funcionário(s) encontrado(s)</p>
      <div className="flex flex-col gap-3">
        {list.map(f => renderCard(f, opts))}
        {list.length === 0 && !loading && (
          <p className="text-muted-foreground text-sm text-center py-10">
            {opts?.emptyMsg || 'Nenhum funcionário encontrado com os filtros atuais.'}
          </p>
        )}
      </div>
    </>
  );

  const profileCd = (profileFunc?.custom_data as any) || {};
  const profileUnidade = unidades.find(u => u.id === profileFunc?.unidade_id)?.nome || '—';
  const profileSala = salas.find(s => s.id === profileFunc?.sala_id)?.nome || '—';

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Funcionários"
        subtitle="Gestão de usuários, perfis de acesso e registros profissionais."
      />

      <Tabs defaultValue="internos">
        <TabsList className="w-full">
          <TabsTrigger value="internos" className="flex-1">
            Funcionários Internos <span className="ml-2 text-xs opacity-70">({ativosList.length})</span>
          </TabsTrigger>
          <TabsTrigger value="externos" className="flex-1">
            <UserCog className="w-4 h-4 mr-1" />Profissionais Externos
          </TabsTrigger>
          <TabsTrigger value="inativos" className="flex-1">
            Inativos <span className="ml-2 text-xs opacity-70">({inativosList.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internos" className="mt-4 space-y-4">
          <FilterBar />
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : renderList(filteredAtivos, { emptyMsg: 'Nenhum funcionário ativo. Clique em "Novo Funcionário" para começar.' })}
        </TabsContent>

        <TabsContent value="externos" className="mt-4">
          <ProfissionaisExternos />
        </TabsContent>

        <TabsContent value="inativos" className="mt-4 space-y-4">
          <FilterBar />
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : renderList(filteredInativos, { inativo: true, emptyMsg: 'Nenhum funcionário inativo.' })}
        </TabsContent>
      </Tabs>

      {/* ===== Dialog Cadastrar/Editar ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editId ? 'Editar' : 'Cadastrar'} Funcionário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Usuário *</Label><Input value={form.usuario} onChange={e => setForm(p => ({ ...p, usuario: e.target.value }))} /></div>
              <div>
                <Label>{editId ? 'Nova Senha (opcional)' : 'Senha *'}</Label>
                <div className="relative">
                  <Input type={showSenha ? 'text' : 'password'} value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} className="pr-10" placeholder="Min. 6 caracteres (a-z, A-Z, 0-9)" />
                  <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.senha && (form.senha.length < 6 || !/[a-z]/.test(form.senha) || !/[A-Z]/.test(form.senha) || !/[0-9]/.test(form.senha)) && (
                  <p className="text-xs text-destructive mt-1">A senha deve ter min. 6 caracteres com letras minúsculas, maiúsculas e números.</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>E-mail *</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cargo</Label><Input value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} /></div>
              <div><Label>Perfil do Usuário *</Label>
                <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as UserRole }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="master">MASTER</SelectItem>
                    <SelectItem value="gestao">GESTÃO</SelectItem>
                    <SelectItem value="recepcao">RECEPÇÃO</SelectItem>
                    <SelectItem value="tecnico">TRIAGEM</SelectItem>
                    <SelectItem value="avaliacao_enfermagem">ENFERMAGEM</SelectItem>
                    <SelectItem value="profissional">PROFISSIONAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Setor</Label><Input value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))} /></div>
              <div><Label>Unidade {isUnitMaster ? '(fixada)' : ''}</Label>
                <Select value={form.unidade_id} onValueChange={v => setForm(p => ({ ...p, unidade_id: v }))} disabled={isUnitMaster}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{unidadesVisiveis.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sala</Label>
                <Select value={form.sala_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, sala_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Todas</SelectItem>
                    {salas.filter(s => !form.unidade_id || s.unidadeId === form.unidade_id).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.role === 'profissional' && (
                <div>
                  <Label>Tempo de Atendimento</Label>
                  <Select value={String(form.tempo_atendimento)} onValueChange={v => setForm(p => ({ ...p, tempo_atendimento: Number(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutos</SelectItem>
                      <SelectItem value="20">20 minutos</SelectItem>
                      <SelectItem value="30">30 minutos</SelectItem>
                      <SelectItem value="45">45 minutos</SelectItem>
                      <SelectItem value="60">60 minutos</SelectItem>
                      <SelectItem value="90">90 minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* ===== Vínculo e Status ===== */}
            <div className="border-t pt-3 mt-2">
              <p className="text-sm font-semibold text-foreground mb-2">Vínculo</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.ativo ? 'ativo' : 'inativo'} onValueChange={v => setForm(p => ({ ...p, ativo: v === 'ativo' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data de admissão</Label>
                <Input type="date" value={customData?.data_admissao || ''} onChange={e => setCustomData(p => ({ ...p, data_admissao: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de vínculo</Label>
                <Select value={customData?.tipo_vinculo || '__none__'} onValueChange={v => setCustomData(p => ({ ...p, tipo_vinculo: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="CLT">CLT</SelectItem>
                    <SelectItem value="Estatutário">Estatutário</SelectItem>
                    <SelectItem value="Temporário">Temporário</SelectItem>
                    <SelectItem value="Terceirizado">Terceirizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Turno de trabalho</Label>
                <Select value={customData?.turno_trabalho || '__none__'} onValueChange={v => setCustomData(p => ({ ...p, turno_trabalho: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="Manhã">Manhã</SelectItem>
                    <SelectItem value="Tarde">Tarde</SelectItem>
                    <SelectItem value="Noite">Noite</SelectItem>
                    <SelectItem value="Integral">Integral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Observações internas</Label>
              <Textarea
                rows={3}
                value={customData?.observacoes_internas || ''}
                onChange={e => setCustomData(p => ({ ...p, observacoes_internas: e.target.value }))}
                placeholder="Observações visíveis apenas para a gestão"
              />
            </div>

            {requiresProfessionalData(form.role) && (
              <>
                <div className="border-t pt-3 mt-2">
                  <p className="text-sm font-semibold text-foreground mb-2">Conselho Profissional</p>
                </div>
                <div>
                  <Label>CBO (Classificação Brasileira de Ocupações) *</Label>
                  <CboAutocomplete
                    value={cbo}
                    onChange={(v) => { setCbo(v); if (v) setShowCboError(false); }}
                    profissaoSugestao={form.profissao || form.cargo}
                    required
                    showError={showCboError}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Obrigatório para geração do BPA-I (SIA/SUS).</p>
                </div>
                <div>
                  <Label>CNS do Profissional (Cartão Nacional de Saúde) *</Label>
                  <Input
                    value={formatCNS(cns)}
                    onChange={e => {
                      const d = normalizeCNS(e.target.value);
                      setCns(d);
                      if (d.length === 15) setShowCnsError(false);
                    }}
                    placeholder="000 0000 0000 0000"
                    inputMode="numeric"
                    maxLength={18}
                    className={showCnsError && !isCNSValid(cns) ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">15 dígitos. Obrigatório para identificar o profissional no BPA-I (SIA/SUS).</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Profissão</Label>
                    <Select value={form.profissao || '__none__'} onValueChange={v => {
                      const prof = v === '__none__' ? '' : v;
                      const conselho = conselhoMap[prof] || '';
                      setForm(p => ({ ...p, profissao: prof, tipo_conselho: conselho || p.tipo_conselho }));
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Selecione</SelectItem>
                        {Object.keys(conselhoMap).sort().map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tipo de Conselho *</Label>
                    <Input value={form.tipo_conselho} onChange={e => setForm(p => ({ ...p, tipo_conselho: e.target.value }))} placeholder="CRM, COREN, CRP..." />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nº do Conselho *</Label>
                    <Input value={form.numero_conselho} onChange={e => setForm(p => ({ ...p, numero_conselho: e.target.value }))} placeholder="000000" />
                  </div>
                  <div>
                    <Label>UF do Conselho *</Label>
                    <Select value={form.uf_conselho || '__none__'} onValueChange={v => setForm(p => ({ ...p, uf_conselho: v === '__none__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(form.role === 'tecnico' || form.role === 'avaliacao_enfermagem') && (
                  <div>
                    <Label>Informação Adicional (Ex: COREN)</Label>
                    <Input value={(form as any).coren || ''} onChange={e => setForm(p => ({ ...p, coren: e.target.value } as any))} placeholder="Nº do COREN ou outro" />
                  </div>
                )}
              </>
            )}
            {form.role === 'profissional' && canManage && (
              <div className="border-t pt-3 mt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Permissão de Retorno</Label>
                    <p className="text-xs text-muted-foreground">Permitir que este profissional agende retorno de paciente</p>
                  </div>
                  <Switch checked={form.pode_agendar_retorno} onCheckedChange={v => setForm(p => ({ ...p, pode_agendar_retorno: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Aceita Encaminhamento Externo</Label>
                    <p className="text-xs text-muted-foreground">Aparecerá na lista de profissionais para sistemas integrados parceiros enviarem encaminhamentos.</p>
                  </div>
                  <Switch checked={!!customData?.aceita_encaminhamento_externo} onCheckedChange={v => setCustomData(prev => ({ ...prev, aceita_encaminhamento_externo: v }))} />
                </div>
              </div>
            )}
            {customConfig.fields.length > 0 && (
              <CustomFieldsRenderer
                fields={customConfig.fields}
                values={customData}
                onChange={(field, value) => setCustomData(prev => ({ ...prev, [field]: value }))}
              />
            )}
            <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editId ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Drawer Perfil Completo ===== */}
      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="right" className="p-0 flex flex-col" style={{ width: '95vw', maxWidth: '480px' }}>
          <SheetHeader className="p-4 pb-2 border-b">
            <SheetTitle className="font-display text-lg break-words pr-8">{profileFunc?.nome || 'Funcionário'}</SheetTitle>
            <SheetDescription className="sr-only">Detalhes do funcionário</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-5">
              {profileFunc && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold">
                      {profileFunc.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={roleColors[profileFunc.role as UserRole] || 'bg-muted text-muted-foreground'}>
                          {roleLabels[profileFunc.role as UserRole] || profileFunc.role}
                        </Badge>
                        <Badge variant={profileFunc.ativo ? 'default' : 'outline'} className={profileFunc.ativo ? 'bg-success/15 text-success border-success/30' : ''}>
                          {profileFunc.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 break-words">@{profileFunc.usuario}</p>
                    </div>
                  </div>

                  <Section title="Dados Pessoais">
                    <Row label="CPF" value={profileFunc.cpf} />
                    <Row label="E-mail" value={profileFunc.email} />
                  </Section>

                  <Separator />
                  <Section title="Dados Profissionais">
                    <Row label="Cargo" value={profileFunc.cargo} />
                    <Row label="Profissão" value={profileFunc.profissao} />
                    <Row label="Conselho" value={profileFunc.tipo_conselho ? `${profileFunc.tipo_conselho} ${profileFunc.numero_conselho || ''}${profileFunc.uf_conselho ? '/' + profileFunc.uf_conselho : ''}` : ''} />
                    <Row label="CBO" value={profileCd.cbo_codigo ? `${profileCd.cbo_codigo} — ${profileCd.cbo_descricao || ''}` : ''} />
                    <Row label="CNS" value={profileCd.cns ? formatCNS(profileCd.cns) : ''} />
                    <Row label="Unidade" value={profileUnidade} />
                    <Row label="Sala" value={profileSala} />
                    <Row label="Setor" value={profileFunc.setor} />
                    {profileFunc.role === 'profissional' && (
                      <Row label="Duração do atendimento" value={profileFunc.tempo_atendimento ? `${profileFunc.tempo_atendimento} min` : ''} />
                    )}
                  </Section>

                  <Separator />
                  <Section title="Vínculo">
                    <Row label="Status" value={profileFunc.ativo ? 'Ativo' : 'Inativo'} />
                    <Row label="Data de admissão" value={profileCd.data_admissao ? new Date(profileCd.data_admissao).toLocaleDateString('pt-BR') : ''} />
                    <Row label="Tipo de vínculo" value={profileCd.tipo_vinculo} />
                    <Row label="Turno" value={profileCd.turno_trabalho} />
                    <Row label="Cadastrado em" value={profileFunc.criado_em ? new Date(profileFunc.criado_em).toLocaleString('pt-BR') : ''} />
                  </Section>

                  {profileCd.observacoes_internas && (
                    <>
                      <Separator />
                      <Section title="Observações Internas">
                        <p className="text-sm whitespace-pre-wrap text-foreground">{profileCd.observacoes_internas}</p>
                      </Section>
                    </>
                  )}

                  <Separator />
                  <div className="flex flex-wrap gap-2 pt-2">
                    {canManage && !(isUnitMaster && isProtectedGlobalMaster(profileFunc)) && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => { setProfileOpen(false); openEdit(profileFunc); }}>
                          <Pencil className="w-4 h-4 mr-1.5" />Editar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleAtivo(profileFunc, !profileFunc.ativo)}>
                          <Power className="w-4 h-4 mr-1.5" />{profileFunc.ativo ? 'Desativar' : 'Ativar'}
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => printFicha(profileFunc)}>
                      <Printer className="w-4 h-4 mr-1.5" />Imprimir ficha
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">{title}</h3>
    <div className="space-y-1">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
  const display = value !== undefined && value !== null && value !== '' ? String(value) : '—';
  return (
    <div className="flex justify-between items-start gap-3 text-sm py-0.5">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-words min-w-0 max-w-[65%]">{display}</span>
    </div>
  );
};

export default Funcionarios;
