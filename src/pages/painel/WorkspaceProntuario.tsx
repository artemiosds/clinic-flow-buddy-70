import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useProntuarioStructure } from '@/hooks/useProntuarioStructure';
import { useProntuarioTiposConfig } from '@/hooks/useProntuarioTiposConfig';
import { useProntuarioConfig } from '@/hooks/useProntuarioConfig';
import { useSoapCustomOptions } from '@/hooks/useSoapCustomOptions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Components
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  History, 
  FileText, 
  User, 
  Activity, 
  ArrowLeft, 
  Save, 
  Printer, 
  Download,
  AlertTriangle,
  ChevronRight,
  Stethoscope,
  ClipboardList,
  Info,
  MapPin,
  Clock,
  LayoutDashboard
} from 'lucide-react';

import PatientClinicalHeader from '@/components/pacientes/PatientClinicalHeader';
import { HistoricoClinico } from '@/components/HistoricoClinico';
import TriagemDetalhada from '@/components/TriagemDetalhada';
import DynamicProntuarioFields from '@/components/DynamicProntuarioFields';
import SoapFieldsAdaptive from '@/components/SoapFieldsAdaptive';
import { isMedico } from '@/data/soapOptionsByProfession';
import PacienteDocumentos from '@/components/PacienteDocumentos';

// Services
import { treatmentService, normalizeSoapPayload } from '@/services/treatmentService';

const calcularIdade = (dataNasc: string): string => {
  if (!dataNasc) return "—";
  const nascimento = new Date(dataNasc + "T12:00:00");
  if (isNaN(nascimento.getTime())) return "—";
  const hoje = new Date();
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  const m = hoje.getMonth() - nascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) anos--;
  if (anos < 1) {
    let meses = (hoje.getFullYear() - nascimento.getFullYear()) * 12 + (hoje.getMonth() - nascimento.getMonth());
    if (hoje.getDate() < nascimento.getDate()) meses--;
    return meses <= 0 ? "< 1 mês" : `${meses} mes(es)`;
  }
  return `${anos} ano(s)`;
};

const WorkspaceProntuario: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { funcionarios, unidades } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const pacienteId = searchParams.get('pacienteId');
  const pacienteNome = searchParams.get('pacienteNome');
  const agendamentoId = searchParams.get('agendamentoId');
  const editId = searchParams.get('editId');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triagem, setTriagem] = useState<any>(null);
  const [form, setForm] = useState<any>({
    tipo_registro: 'consulta',
    data_atendimento: new Date().toISOString().split('T')[0],
    hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    soap_subjetivo: '',
    soap_objetivo: '',
    soap_avaliacao: '',
    soap_plano: '',
    evolucao: '',
    queixa_principal: '',
    conduta: '',
    paciente_id: pacienteId || '',
    paciente_nome: pacienteNome || '',
  });

  const { getEnabledFields } = useProntuarioStructure();
  const { getCamposForTipo } = useProntuarioTiposConfig();
  const { config: profConfig } = useProntuarioConfig(user?.id, form.tipo_registro);
  const soapCustom = useSoapCustomOptions(user?.id);

  const [pacienteData, setPacienteData] = useState<any>(null);

  // Load patient clinical data
  useEffect(() => {
    if (!pacienteId) {
      toast.error('Paciente não identificado');
      navigate('/painel/prontuario');
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        // Load basic patient data
        const { data: pData } = await supabase
          .from('pacientes')
          .select('*')
          .eq('id', pacienteId)
          .single();
        
        if (pData) {
          setPacienteData(pData);
        }

        // Load triage if agendamentoId is present
        if (agendamentoId) {
          const { data: triagemData } = await supabase
            .from('triage_records')
            .select('*')
            .eq('agendamento_id', agendamentoId)
            .maybeSingle();
          
          if (triagemData) {
            setTriagem(triagemData);
          }
        }

        const existingForAgendamento = await supabase
          .from('prontuarios')
          .select('*')
          .eq('agendamento_id', agendamentoId)
          .maybeSingle();

        if (existingForAgendamento.data) {
          const p = existingForAgendamento.data;
          setForm({
            paciente_id: p.paciente_id,
            paciente_nome: p.paciente_nome,
            agendamento_id: p.agendamento_id || "",
            data_atendimento: p.data_atendimento,
            hora_atendimento: p.hora_atendimento || "",
            tipo_registro: (p as any).tipo_registro || "consulta",
            queixa_principal: p.queixa_principal || "",
            anamnese: p.anamnese || "",
            sinais_sintomas: p.sinais_sintomas || "",
            exame_fisico: p.exame_fisico || "",
            hipotese: p.hipotese || "",
            conduta: p.conduta || "",
            prescricao: p.prescricao || "",
            solicitacao_exames: p.solicitacao_exames || "",
            evolucao: p.evolucao || "",
            observacoes: p.observacoes || "",
            indicacao_retorno: p.indicacao_retorno || "",
            procedimentos_texto: p.procedimentos_texto || "",
            outro_procedimento: p.outro_procedimento || "",
            episodio_id: p.episodio_id || "",
            soap_subjetivo: (p as any).soap_subjetivo || "",
            soap_objetivo: (p as any).soap_objetivo || "",
            soap_avaliacao: (p as any).soap_avaliacao || "",
            soap_plano: (p as any).soap_plano || "",
          });
        } else if (editId) {
          const { data: record } = await supabase
            .from('prontuarios')
            .select('*')
            .eq('id', editId)
            .single();
          
          if (record) {
            const p = record;
            setForm({
              paciente_id: p.paciente_id,
              paciente_nome: p.paciente_nome,
              agendamento_id: p.agendamento_id || "",
              data_atendimento: p.data_atendimento,
              hora_atendimento: p.hora_atendimento || "",
              tipo_registro: (p as any).tipo_registro || "consulta",
              queixa_principal: p.queixa_principal || "",
              anamnese: p.anamnese || "",
              sinais_sintomas: p.sinais_sintomas || "",
              exame_fisico: p.exame_fisico || "",
              hipotese: p.hipotese || "",
              conduta: p.conduta || "",
              prescricao: p.prescricao || "",
              solicitacao_exames: p.solicitacao_exames || "",
              evolucao: p.evolucao || "",
              observacoes: p.observacoes || "",
              indicacao_retorno: p.indicacao_retorno || "",
              procedimentos_texto: p.procedimentos_texto || "",
              outro_procedimento: p.outro_procedimento || "",
              episodio_id: p.episodio_id || "",
              soap_subjetivo: (p as any).soap_subjetivo || "",
              soap_objetivo: (p as any).soap_objetivo || "",
              soap_avaliacao: (p as any).soap_avaliacao || "",
              soap_plano: (p as any).soap_plano || "",
            });
          }
        }
      } catch (error) {
        console.error('Error loading prontuario data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [pacienteId, agendamentoId, editId, navigate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('prontuarios')
        .upsert({
          ...form,
          id: editId || undefined,
          agendamento_id: agendamentoId,
          paciente_id: pacienteId,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Prontuário salvo com sucesso!');
      if (!editId) {
        navigate(`/painel/prontuario?pacienteId=${pacienteId}&pacienteNome=${pacienteNome}&editId=${data.id}`);
      }
    } catch (error) {
      console.error('Error saving prontuário:', error);
      toast.error('Erro ao salvar prontuário');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Clinician Header Bar - Professional, High-Density */}
      <header className="flex items-center justify-between px-6 py-2.5 border-b bg-card shrink-0 z-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 h-9 px-3">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar</span>
          </Button>
          <div className="h-6 w-px bg-border mx-1" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Stethoscope className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display leading-none">Workspace Clínico</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 font-semibold">
                {editId ? 'Edição de Prontuário' : 'Novo Atendimento'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 h-9">
            <Printer className="w-4 h-4" />
            <span className="hidden md:inline">Imprimir</span>
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2 h-9 px-4 gradient-primary shadow-sm shadow-primary/20">
            <Save className="w-4 h-4" />
            <span>{saving ? 'Salvando...' : 'Finalizar Atendimento'}</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Content Area: High-focus Clinical Editor */}
        <main className="flex-1 flex flex-col min-w-0 bg-muted/10 relative overflow-hidden">
          <ScrollArea className="flex-1 h-full">
            <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 pb-24">
              
              {/* Clinical Patient Header - Compact & Intelligent */}
              <PatientClinicalHeader
                nome={pacienteData?.nome || pacienteNome || 'Paciente não identificado'}
                idade={pacienteData?.data_nascimento ? calcularIdade(pacienteData.data_nascimento) : '—'}
                sexo={(() => {
                  const s = pacienteData?.custom_data?.sexo || pacienteData?.sexo;
                  if (!s) return "—";
                  const val = String(s).toUpperCase();
                  if (val === 'M' || val === 'MASCULINO') return 'Masculino';
                  if (val === 'F' || val === 'FEMININO') return 'Feminino';
                  if (val === 'I' || val === 'IGNORADO') return 'Ignorado';
                  return s;
                })()}
                cpf={pacienteData?.cpf || '—'}
                cns={pacienteData?.cns || '—'}
                profissional={user?.nome || '—'}
                alertas={triagem?.alergias?.length > 0 ? ['Alergias Detectadas'] : []}
              />

              {/* Patient Meta & Quick Info (Horizontal Bar) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
                <Card className="p-3 border-none bg-primary/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Município</p>
                    <p className="text-xs font-semibold truncate">{pacienteData?.municipio || '—'}</p>
                  </div>
                </Card>
                <Card className="p-3 border-none bg-amber-500/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Último Atend.</p>
                    <p className="text-xs font-semibold truncate">Há 2 dias</p>
                  </div>
                </Card>
                <Card className="p-3 border-none bg-emerald-500/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Frequência</p>
                    <p className="text-xs font-semibold truncate">Semanal</p>
                  </div>
                </Card>
                <Card className="p-3 border-none bg-indigo-500/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Tratamento</p>
                    <p className="text-xs font-semibold truncate">Fisioterapia</p>
                  </div>
                </Card>
              </div>

              {/* Triage summary if available - High Clinical Alert Style */}
              {triagem && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                  <TriagemDetalhada triagem={triagem} showEmpty={false} />
                </div>
              )}

              {/* Evolution Workspace - Maximum Area for Writing */}
              <Card className="border-none shadow-md overflow-hidden ring-1 ring-border">
                <div className="bg-card border-b px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/5 flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground">Evolução Atual</h2>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                         <span className="flex items-center gap-1"><History className="w-3.5 h-3.5" /> {form.data_atendimento} às {form.hora_atendimento}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <CardContent className="p-6 md:p-8 space-y-8 bg-card">
                  {/* SOAP Editor - Adaptive & Professional */}
                  <div className="space-y-6">
                    <SoapFieldsAdaptive
                      profissao={user?.profissao}
                      values={{
                        soap_subjetivo: form.soap_subjetivo || '',
                        soap_objetivo: form.soap_objetivo || '',
                        soap_avaliacao: form.soap_avaliacao || '',
                        soap_plano: form.soap_plano || '',
                      }}
                      onChange={(field, value) => setForm(prev => ({ ...prev, [field]: value }))}
                      soapErrors={false}
                      onClearErrors={() => {}}
                      soapEnabled={true}
                      onToggleSoap={() => {}}
                      customOptionsForField={(field) => soapCustom.getOptionsForField(field)}
                      onAddCustomOption={(field, option) => soapCustom.addOption(field, option, user?.profissao || '')}
                      onDeleteCustomOption={soapCustom.deleteOption}
                    />
                  </div>

                  <Separator className="opacity-50" />

                  {/* Complementary Sections */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                       <Activity className="w-4 h-4 text-primary" />
                       <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Conduta e Complementos</h3>
                    </div>
                    <DynamicProntuarioFields
                      campos={getCamposForTipo(form.tipo_registro)}
                      formValues={form}
                      customValues={{}}
                      onFormChange={(key, val) => setForm(prev => ({ ...prev, [key]: val }))}
                      onCustomChange={() => {}}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </main>

        {/* Longitudinal History Panel - Intelligent Sidebar */}
        <aside className="w-[420px] shrink-0 bg-background border-l flex flex-col hidden xl:flex z-10 shadow-2xl overflow-hidden">
          <Tabs defaultValue="history" className="flex flex-col h-full">
            <div className="px-4 py-3 bg-card border-b">
              <TabsList className="grid grid-cols-2 w-full h-11 p-1 bg-muted/50 rounded-lg">
                <TabsTrigger value="history" className="gap-2 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <History className="w-4 h-4" />
                  Registro Longitudinal
                </TabsTrigger>
                <TabsTrigger value="documents" className="gap-2 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <FileText className="w-4 h-4" />
                  Documentos
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="history" className="flex-1 overflow-hidden m-0 relative">
              <div className="flex flex-col h-full bg-muted/5">
                <div className="p-4 py-3 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Histórico Clínico Completo</h3>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-bold tracking-tighter uppercase px-1.5 h-5 border-primary/20 text-primary bg-primary/5">Timeline</Badge>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 pb-12">
                    <HistoricoClinico
                      pacienteId={pacienteId!}
                      pacienteNome={pacienteNome || ''}
                      currentProfissionalId={user?.id}
                      unidades={unidades}
                    />
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="flex-1 overflow-hidden m-0">
               <div className="flex flex-col h-full bg-muted/5">
                 <div className="p-4 py-3 border-b bg-card flex items-center gap-2">
                   <FileText className="w-4 h-4 text-primary" />
                   <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Arquivos e Anexos</h3>
                 </div>
                 <ScrollArea className="flex-1">
                   <div className="p-4 pb-12">
                     <PacienteDocumentos pacienteId={pacienteId!} />
                   </div>
                 </ScrollArea>
               </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
};

export default WorkspaceProntuario;
