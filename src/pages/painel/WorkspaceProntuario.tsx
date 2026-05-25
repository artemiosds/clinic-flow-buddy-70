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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { 
  History, FileText, User, Activity, ArrowLeft, Save, Printer, 
  Stethoscope, ClipboardList, Clock, Search, UserCog, Stamp, Trash2,
  Calendar, Info, AlertTriangle, FileDown
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { TIPO_REGISTRO_LABELS } from '@/utils/labels';

import PatientClinicalHeader from '@/components/pacientes/PatientClinicalHeader';
import { HistoricoClinico } from '@/components/HistoricoClinico';
import TriagemDetalhada from '@/components/TriagemDetalhada';
import { AcolhimentoView } from '@/components/prontuario/AcolhimentoView';
import DynamicProntuarioFields from '@/components/DynamicProntuarioFields';
import SoapFieldsAdaptive from '@/components/SoapFieldsAdaptive';
import PacienteDocumentos from '@/components/PacienteDocumentos';
import { AcolhimentoForm } from '@/components/prontuario/AcolhimentoForm';
import { CreatePTSModal } from '@/components/prontuario/CreatePTSModal';
import { CreateCycleModal } from '@/components/prontuario/CreateCycleModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuscaPaciente } from '@/components/BuscaPaciente';
import QuickEditPatientModal from '@/components/pacientes/QuickEditPatientModal';
import { BuscaProcedimento } from '@/components/BuscaProcedimento';
import { BuscaCID } from '@/components/BuscaCID';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { procedureService } from '@/services/procedureService';
import PrescricaoMedicamentos from '@/components/PrescricaoMedicamentos';
import SolicitacaoExames from '@/components/SolicitacaoExames';
import CamposEspecialidade from '@/components/CamposEspecialidade';
import ProntuarioAnexos from '@/components/ProntuarioAnexos';
import ResultadosExames from '@/components/ResultadosExames';
import HistoricoCompletoModal from '@/components/HistoricoCompletoModal';
import { TreatmentTab } from '@/components/prontuario/TreatmentTab';
import { openPrintDocument } from '@/lib/printLayout';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';

const calcularIdade = (dataNasc: string): string => {
  if (!dataNasc) return "—";
  const nascimento = new Date(dataNasc + "T12:00:00");
  if (isNaN(nascimento.getTime())) return "—";
  const hoje = new Date();
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  const m = hoje.getMonth() - nascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) anos--;
  return `${anos} ano(s)`;
};

const WorkspaceProntuario: React.FC = () => {
  const { user } = useAuth();
  const { pacientes, unidades, updateAgendamento } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const pacienteId = searchParams.get('pacienteId');
  const pacienteNome = searchParams.get('pacienteNome');
  const agendamentoId = searchParams.get('agendamentoId');
  const editId = searchParams.get('editId');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triagem, setTriagem] = useState<any>(null);
  const [pacienteData, setPacienteData] = useState<any>(null);
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('evolution');

  // Expanded clinical state
  const [procedimentos, setProcedimentos] = useState<any[]>([]);
  const [episodios, setEpisodios] = useState<any[]>([]);
  const [selectedProcIds, setSelectedProcIds] = useState<string[]>([]);
  const [cidsByProc, setCidsByProc] = useState<Record<string, any[]>>({});
  const [selectedCidsByProc, setSelectedCidsByProc] = useState<Record<string, string[]>>({});
  const [listaExames, setListaExames] = useState<any[]>([]);
  const [listaPrescricao, setListaPrescricao] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [profPreferences, setProfPreferences] = useState<any[]>([]);
  const [especialidadeFields, setEspecialidadeFields] = useState<Record<string, string>>({});
  const [sessaoCycle, setSessaoCycle] = useState<any>(null);
  const [sessaoPts, setSessaoPts] = useState<any>(null);
  const [sessaoDataLoading, setSessaoDataLoading] = useState(false);
  const [createPtsOpen, setCreatePtsOpen] = useState(false);
  const [createCycleOpen, setCreateCycleOpen] = useState(false);
  const [acolhimentoData, setAcolhimentoData] = useState<any>(null);
  const [acolhimentoDraft, setAcolhimentoDraft] = useState<any>({});
  const [loadingAcolhimento, setLoadingAcolhimento] = useState(false);
  const [savingAcolhimento, setSavingAcolhimento] = useState(false);
  const [hasModifiedForm, setHasModifiedForm] = useState(false);

  const [form, setForm] = useState<any>({
    tipo_registro: searchParams.get('tipo') === 'Retorno' ? 'retorno' : (searchParams.get('tipo') === 'Consulta' || searchParams.get('tipo') === 'Avaliação/TR' ? 'avaliacao_inicial' : (searchParams.get('tipo') || 'avaliacao_inicial')),
    data_atendimento: searchParams.get('data') || new Date().toISOString().split('T')[0],
    hora_atendimento: searchParams.get('horaInicio') || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    soap_subjetivo: '', soap_objetivo: '', soap_avaliacao: '', soap_plano: '',
    evolucao: '', queixa_principal: '', conduta: '',
    anamnese: '', sinais_sintomas: '', exame_fisico: '', hipotese: '',
    observacoes: '', indicacao_retorno: '', motivo_alteracao: '',
    procedimentos_texto: '', outro_procedimento: '', episodio_id: '',
    paciente_id: pacienteId || '',
    paciente_nome: pacienteNome || '',
    custom_data: {},
    agendamento_id: agendamentoId || '',
    prescricao: '',
    solicitacao_exames: '',
  });

  const handleFormChange = (updates: any) => {
    setForm((prev: any) => {
      const next = { ...prev, ...updates };
      // Se estamos mudando custom_data, garantimos o merge
      if (updates.custom_data) {
        next.custom_data = { ...prev.custom_data, ...updates.custom_data };
      }
      return next;
    });
    setHasModifiedForm(true);
  };

  const [soapEnabled, setSoapEnabled] = useState(true);

  const { getCamposForTipo, soapLabels } = useProntuarioTiposConfig();
  const soapCustom = useSoapCustomOptions(user?.id);

  // Load procedures, medications and preferences
  useEffect(() => {
    if (!user?.id) return;
    const loadCommonData = async () => {
      try {
        const [procsList, medsRes, prefsRes] = await Promise.all([
          procedureService.getActive(),
          supabase.from("medications").select("*").or(`is_global.eq.true,profissional_id.eq.${user.id}`),
          supabase.from("professional_preferences").select("tipo,item_id,desabilitado").eq("profissional_id", user.id),
        ]);
        setProcedimentos(procsList as any[]);
        if (medsRes.data) setMedications(medsRes.data);
        if (prefsRes.data) setProfPreferences(prefsRes.data);
      } catch (err) { console.error("Error loading common data:", err); }
    };
    loadCommonData();
  }, [user?.id]);

  const loadSessaoData = async (patientId: string) => {
    setSessaoDataLoading(true);
    try {
      const [cycleRes, ptsRes] = await Promise.all([
        supabase.from('treatment_cycles').select('*').eq('patient_id', patientId).in('status', ['em_andamento', 'ativo']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('pts').select('*').eq('patient_id', patientId).eq('status', 'ativo').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setSessaoCycle(cycleRes.data);
      setSessaoPts(ptsRes.data);
    } catch (err) { console.error("Error loading session data:", err); }
    setSessaoDataLoading(false);
  };

  const loadProntuarioProcedimentos = async (prontId: string) => {
    const { data: prontProc } = await supabase.from("prontuario_procedimentos").select("*").eq("prontuario_id", prontId);
    if (prontProc && prontProc.length > 0) {
      setSelectedProcIds(prontProc.map((d: any) => d.procedimento_id));
      const cidsByProcMap: Record<string, any[]> = {};
      const selectedCidsMap: Record<string, string[]> = {};
      prontProc.forEach((d: any) => {
        try {
          const parsed = d.observacao ? JSON.parse(d.observacao) : null;
          const cids: any[] = Array.isArray(parsed?.cids) ? parsed.cids : [];
          if (cids.length > 0) {
            cidsByProcMap[d.procedimento_id] = cids;
            selectedCidsMap[d.procedimento_id] = cids.map((c: any) => c.codigo);
          }
        } catch { /* ignore */ }
      });
      setCidsByProc(prev => ({ ...prev, ...cidsByProcMap }));
      setSelectedCidsByProc(prev => ({ ...prev, ...selectedCidsMap }));
    }
  };

  const loadAcolhimento = async (patientId: string) => {
    setLoadingAcolhimento(true);
    try {
      // Find the most recent mental health screening/acolhimento
      const { data } = await supabase
        .from('prontuarios')
        .select('*')
        .eq('paciente_id', patientId)
        .eq('tipo_registro', 'acolhimento_mental')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const typedData = data as any;
      if (typedData) {
        setAcolhimentoData(typedData);
        if (typedData.dados_acolhimento) {
          setAcolhimentoDraft(typedData.dados_acolhimento);
        }
      }
    } catch (err) {
      console.error("Error loading acolhimento:", err);
    } finally {
      setLoadingAcolhimento(false);
    }
  };

  const loadTriagem = async (agendamentoId: string) => {
    const { data } = await supabase.from("triage_records").select("*").eq("agendamento_id", agendamentoId).not("confirmado_em", "is", null).maybeSingle();
    if (data) setTriagem(data);
  };

  const loadEpisodios = async (pacienteId: string) => {
    const { data } = await supabase.from("episodios_clinicos").select("id,titulo,status").eq("paciente_id", pacienteId).eq("status", "ativo");
    if (data) setEpisodios(data);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const targetPacienteId = pacienteId || form.paciente_id;
        if (targetPacienteId) {
          const { data: pData } = await supabase.from('pacientes').select('*').eq('id', targetPacienteId).single();
          if (pData) setPacienteData(pData);
          loadSessaoData(targetPacienteId);
          loadEpisodios(targetPacienteId);
          loadAcolhimento(targetPacienteId);

          const processProntuario = (p: any) => {
            if (p) {
              // Only overwrite if not modified or if it's a forced refresh
              setForm(prev => {
                // Durante o carregamento inicial, sempre sobrepomos com os dados do banco
                // para garantir que o ID e o conteúdo original sejam preservados.
                return { ...prev, ...p, custom_data: { ...(prev.custom_data || {}), ...(p.custom_data || {}) } };
              });
              
              // Load specialty fields and clean observations if they were stored as JSON
              if (p.observacoes && p.observacoes.startsWith('{')) {
                try {
                  const parsedObs = JSON.parse(p.observacoes);
                  if (parsedObs.especialidade_fields) {
                    setEspecialidadeFields(parsedObs.especialidade_fields);
                  }
                  // Clean the observation text to avoid double-encoding when saving
                  if (parsedObs.texto !== undefined) {
                    setForm(prev => ({ ...prev, observacoes: parsedObs.texto || '' }));
                  }
                } catch (e) {
                  console.error("Error parsing observations for specialty fields", e);
                }
              }

              loadProntuarioProcedimentos(p.id);
              
              // Load prescriptions and exams
              try {
                if (p.prescricao) {
                  const parsedPresc = JSON.parse(p.prescricao);
                  setListaPrescricao(parsedPresc.medicamentos || parsedPresc);
                }
                if (p.solicitacao_exames) {
                  const parsedExams = JSON.parse(p.solicitacao_exames);
                  setListaExames(parsedExams.exames || parsedExams);
                }
              } catch (e) { console.error("Error parsing prescriptions/exams", e); }
              
              // Load SOAP enabled state
              if (p.custom_data?.soap_enabled !== undefined) {
                setSoapEnabled(p.custom_data.soap_enabled);
              }
            }
          };

          if (agendamentoId) {
            loadTriagem(agendamentoId);
            const { data: p } = await supabase.from('prontuarios').select('*').eq('agendamento_id', agendamentoId).maybeSingle();
            processProntuario(p);
          } else if (editId) {
            const { data: p } = await supabase.from('prontuarios').select('*').eq('id', editId).single();
            processProntuario(p);
            if (p?.agendamento_id) loadTriagem(p.agendamento_id);
          }
        }
      } finally { setLoading(false); }
    };
    loadData();
  }, [pacienteId, agendamentoId, editId, refreshTrigger]);

  const handlePrint = async () => {
    const { data: carimbo } = await supabase
      .from('profissionais_carimbo')
      .select('*')
      .eq('profissional_id', user?.id)
      .maybeSingle();

    const meta = {
      'Paciente': pacienteData?.nome || pacienteNome || '—',
      'Idade': pacienteData?.data_nascimento ? calcularIdade(pacienteData.data_nascimento) : '—',
      'CPF': pacienteData?.cpf || '—',
      'CNS': pacienteData?.cns || '—',
      'Profissional': user?.nome || '—',
      'Data': form.data_atendimento ? new Date(form.data_atendimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
      'Hora': form.hora_atendimento || '—',
      'Tipo': TIPO_REGISTRO_LABELS[form.tipo_registro as keyof typeof TIPO_REGISTRO_LABELS] || form.tipo_registro
    };

    let body = '';

    // 1. Identification Header
    body += `
      <div class="info-grid" style="margin-bottom: 2px; grid-template-columns: 2fr 1fr; border: 0.5px solid #000; padding: 2px 4px; gap: 2px;">
        <div style="line-height: 1;">
          <span class="info-label" style="font-size: 7pt; margin: 0;">Paciente</span>
          <div class="info-value" style="font-weight: 700; font-size: 9pt;">${meta.Paciente}</div>
        </div>
        <div style="line-height: 1;">
          <span class="info-label" style="font-size: 7pt; margin: 0;">Tipo de Registro</span>
          <div class="info-value" style="font-weight: 700; font-size: 9pt;">${meta.Tipo}</div>
        </div>
        <div style="line-height: 1;">
          <span class="info-label" style="font-size: 7pt; margin: 0;">Dados do Paciente</span>
          <div class="info-value" style="font-size: 8.5pt;">Idade: ${meta.Idade} | CPF: ${meta.CPF} | CNS: ${meta.CNS}</div>
        </div>
        <div style="line-height: 1;">
          <span class="info-label" style="font-size: 7pt; margin: 0;">Data e Hora</span>
          <div class="info-value" style="font-size: 8.5pt;">${meta.Data} às ${meta.Hora}</div>
        </div>
      </div>

    `;

    // 2. Acolhimento section if data exists
    const acolhimentoRaw = acolhimentoDraft && Object.keys(acolhimentoDraft).length > 0 ? acolhimentoDraft : acolhimentoData?.dados_acolhimento;
    if (acolhimentoRaw && Object.keys(acolhimentoRaw).length > 0) {
      const data = acolhimentoRaw;
      const s3 = data.secao3?.queixa ? `<div style="margin-bottom: 2px;"><strong>Queixa Principal:</strong> ${data.secao3.queixa}</div>` : '';
      const s4 = data.secao4?.sintomas?.length > 0 ? `<div style="margin-bottom: 2px;"><strong>Sintomas (30 dias):</strong> ${data.secao4.sintomas.join(', ')}</div>` : '';
      const s15 = data.secao15?.parecer ? `<div style="margin-bottom: 2px;"><strong>Parecer Profissional:</strong> ${data.secao15.parecer}</div>` : '';
      
      body += `
        <div style="border: 0.5px solid #000; padding: 2px 4px; margin-bottom: 2px; page-break-inside: avoid;">
          <div style="font-size: 8pt; font-weight: 800; text-transform: uppercase; border-bottom: 0.5px solid #000; padding-bottom: 0px; margin-bottom: 1px;">Acolhimento em Saúde Mental</div>
          <div style="font-size: 9pt; line-height: 1.1;">
            ${s3}${s4}${s15}
          </div>
        </div>
      `;

    }

    // 2.5 Treatment Plan section
    if (sessaoCycle || sessaoPts) {
      body += `
        <div class="section" style="page-break-inside: avoid; margin-bottom: 4px;">
          <div class="section-title">Plano Terapêutico Ativo</div>
          <div class="section-content" style="font-size: 9.5pt; line-height: 1.15;">
            ${sessaoCycle ? `
              <div style="margin-bottom: 4px;">
                <span style="font-weight: 700; color: #475569; font-size: 7.5pt; text-transform: uppercase;">Ciclo de Tratamento:</span>
                <div style="margin-top: 1px;">${sessaoCycle.treatment_type} (${sessaoCycle.sessions_done}/${sessaoCycle.total_sessions} sessões)</div>
              </div>` : ''}
            ${sessaoPts ? `
              <div style="margin-bottom: 4px;">
                <span style="font-weight: 700; color: #475569; font-size: 7.5pt; text-transform: uppercase;">PTS - Diagnóstico Funcional:</span>
                <div style="margin-top: 1px; text-align: justify;">${sessaoPts.diagnostico_funcional}</div>
              </div>
              <div style="margin-bottom: 4px;">
                <span style="font-weight: 700; color: #475569; font-size: 7.5pt; text-transform: uppercase;">PTS - Objetivos Terapêuticos:</span>
                <div style="margin-top: 1px; text-align: justify;">${sessaoPts.objetivos_terapeuticos}</div>
              </div>` : ''}
          </div>
        </div>
      `;
    }

    // 2. Clinical Evolution / SOAP
    body += `
      <div class="section" style="margin-bottom: 4px;">
        <div class="section-title">Evolução Clínica / SOAP</div>
        <div class="section-content" style="font-size: 10pt; line-height: 1.2;">
          ${soapEnabled ? `
            <div style="margin-bottom: 3px;"><strong>S — Subjetivo:</strong><br/>${form.soap_subjetivo ? form.soap_subjetivo.replace(/\n/g, '<br/>') : '—'}</div>
            <div style="margin-bottom: 3px;"><strong>O — Objetivo:</strong><br/>${form.soap_objetivo ? form.soap_objetivo.replace(/\n/g, '<br/>') : '—'}</div>
            <div style="margin-bottom: 3px;"><strong>A — Avaliação:</strong><br/>${form.soap_avaliacao ? form.soap_avaliacao.replace(/\n/g, '<br/>') : '—'}</div>
            <div style="margin-bottom: 3px;"><strong>P — Plano:</strong><br/>${form.soap_plano ? form.soap_plano.replace(/\n/g, '<br/>') : '—'}</div>
          ` : `<div style="white-space: pre-wrap; text-align: justify;">${form.evolucao || '—'}</div>`}
        </div>
      </div>
    `;

    // 3. Dynamic Fields & Specialty Fields
    const dynamicFields = [];
    if (form.queixa_principal) dynamicFields.push({ label: 'Queixa Principal', value: form.queixa_principal });
    if (form.anamnese) dynamicFields.push({ label: 'Anamnese', value: form.anamnese });
    if (form.sinais_sintomas) dynamicFields.push({ label: 'Sinais e Sintomas', value: form.sinais_sintomas });
    if (form.exame_fisico) dynamicFields.push({ label: 'Exame Físico', value: form.exame_fisico });
    if (form.hipotese) dynamicFields.push({ label: 'Hipótese Diagnóstica', value: form.hipotese });
    if (form.conduta) dynamicFields.push({ label: 'Conduta', value: form.conduta });
    if (form.indicacao_retorno) dynamicFields.push({ label: 'Indicação de Retorno', value: form.indicacao_retorno });

    // Specialty fields
    if (Object.keys(especialidadeFields).length > 0) {
      Object.entries(especialidadeFields).forEach(([key, val]) => {
        if (val && val !== 'false') {
          const label = key.replace('esp_', '').replace(/_/g, ' ').toUpperCase();
          dynamicFields.push({ label, value: val === 'true' ? 'Sim' : val });
        }
      });
    }

    if (dynamicFields.length > 0) {
      body += `
        <div class="section" style="margin-bottom: 4px;">
          <div class="section-title">Informações Complementares</div>
          <div class="section-content" style="font-size: 9.5pt;">
            ${dynamicFields.map(f => `
              <div style="margin-bottom: 2px;">
                <span style="font-weight: 700; color: #475569; font-size: 8pt; text-transform: uppercase;">${f.label}:</span>
                <div style="margin-top: 0.5px; text-align: justify; line-height: 1.15;">${String(f.value).replace(/\n/g, '<br/>')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 4. Procedures & CIDs
    if (selectedProcIds.length > 0) {
      body += `
        <div class="section" style="margin-bottom: 4px;">
          <div class="section-title">Procedimentos / CID</div>
          <div class="section-content">
            <ul style="padding-left: 15px; margin: 0; font-size: 9.5pt;">
              ${selectedProcIds.map(pid => {
                const proc = procedimentos.find(p => p.id === pid);
                const cids = selectedCidsByProc[pid] || [];
                return `<li style="margin-bottom: 2px; line-height: 1.15;"><strong>${proc?.nome || pid}</strong> (Cód: ${proc?.id || pid}) ${cids.length > 0 ? `<br/><span style="font-size: 8.5pt; color: #475569;">CIDs: ${cids.join(', ')}</span>` : ''}</li>`;
              }).join('')}
            </ul>
          </div>
        </div>
      `;
    }

    // 5. Prescriptions & Exams
    if (listaPrescricao.length > 0 || listaExames.length > 0) {
      body += `
        <div class="section" style="page-break-inside: avoid; margin-bottom: 4px;">
          <div class="section-title">Prescrições e Solicitações</div>
          <div class="section-content" style="font-size: 9.5pt;">
            ${listaPrescricao.length > 0 ? `
              <div style="margin-bottom: 4px;">
                <strong style="color: #475569; font-size: 8pt; text-transform: uppercase;">Medicamentos:</strong>
                <ul style="padding-left: 15px; margin-top: 2px;">
                  ${listaPrescricao.map((p: any) => `<li style="margin-bottom: 2px; line-height: 1.1;"><strong>${p.medicamento}</strong> - ${p.posologia}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${listaExames.length > 0 ? `
              <div>
                <strong style="color: #475569; font-size: 8pt; text-transform: uppercase;">Exames Solicitados:</strong>
                <ul style="padding-left: 15px; margin-top: 2px;">
                  ${listaExames.map((e: any) => `<li style="margin-bottom: 2px; line-height: 1.1;">${e.nome || e}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // 6. Signature area
    body += `
      <div class="signature" style="margin-top: 15px; page-break-inside: avoid;">
        <div class="signature-line" style="width: 250px; border-top: 0.8px solid #000; margin: 0 auto 3px;"></div>
        <div class="name" style="font-weight: 700; font-size: 11pt;">${user?.nome || '—'}</div>
        <div class="role" style="font-size: 9pt; color: #475569;">${user?.profissao || '—'}</div>
        ${carimbo ? `
          <div class="carimbo-container">
            ${carimbo.tipo === 'imagem' && carimbo.imagem_url ? `
              <img src="${carimbo.imagem_url}" alt="Carimbo" style="max-height: 80px; max-width: 220px; margin: 5px auto;" />
            ` : `
              <div class="carimbo-digital" style="margin-top: 5px; border: 1.2px solid #000; padding: 4px 10px; border-radius: 4px; display: inline-block;">
                <div class="carimbo-nome" style="font-weight: 800; text-transform: uppercase; font-size: 10pt;">${carimbo.nome || user?.nome}</div>
                <div class="carimbo-info" style="font-size: 7.5pt;">${carimbo.conselho} ${carimbo.numero_registro}-${carimbo.uf}</div>
                <div class="carimbo-info" style="font-size: 7.5pt; font-weight: 600;">${carimbo.especialidade || user?.profissao}</div>
                ${carimbo.cargo ? `<div class="carimbo-info" style="font-size: 7pt;">${carimbo.cargo}</div>` : ''}
              </div>
            `}
          </div>
        ` : ''}
      </div>
    `;

    await openPrintDocument("Prontuário Clínico", body, meta);
  };

  const handleDownloadPDF = async () => {
    // Reuses the same logic as handlePrint
    handlePrint();
    toast.info("Aguarde a janela de impressão para salvar como PDF.");
  };

  const handleToggleSoap = (enabled: boolean) => {
    setSoapEnabled(enabled);
    setForm(prev => ({
      ...prev,
      custom_data: {
        ...prev.custom_data,
        soap_enabled: enabled
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { auditService } = await import('@/services/auditService');
      const finalId = editId || form.id;
      let currentProntuario = null;
      if (finalId) {
        const { data: old } = await supabase.from('prontuarios').select('*').eq('id', finalId).maybeSingle();
        currentProntuario = old;
      }
      
      const targetPacienteId = pacienteId || form.paciente_id;

      const dbPayload: any = {
        paciente_id: form.paciente_id,
        paciente_nome: form.paciente_nome,
        profissional_id: user?.id,
        profissional_nome: user?.nome,
        unidade_id: user?.unidadeId || '',
        setor: user?.setor || '',
        agendamento_id: form.agendamento_id || null,
        data_atendimento: form.data_atendimento,
        hora_atendimento: form.hora_atendimento,
        queixa_principal: form.queixa_principal || '',
        anamnese: form.anamnese || '',
        sinais_sintomas: form.sinais_sintomas || '',
        exame_fisico: form.exame_fisico || '',
        hipotese: form.hipotese || '',
        conduta: form.conduta || '',
        prescricao: listaPrescricao.length > 0 ? JSON.stringify({ medicamentos: listaPrescricao }) : form.prescricao,
        solicitacao_exames: listaExames.length > 0 ? JSON.stringify({ exames: listaExames }) : form.solicitacao_exames,
        evolucao: form.evolucao || '',
        observacoes: Object.keys(especialidadeFields).length > 0
          ? JSON.stringify({ especialidade_fields: especialidadeFields, texto: form.observacoes || '' })
          : form.observacoes || '',
        indicacao_retorno: form.indicacao_retorno === 'no_indication' ? '' : (form.indicacao_retorno || ''),
        motivo_alteracao: finalId ? (form.motivo_alteracao || 'Alteração via Workspace') : '',
        procedimentos_texto: form.procedimentos_texto || '',
        outro_procedimento: form.outro_procedimento || '',
        tipo_registro: form.tipo_registro || 'consulta',
        soap_subjetivo: form.soap_subjetivo || '',
        soap_objetivo: form.soap_objetivo || '',
        soap_avaliacao: form.soap_avaliacao || '',
        soap_plano: form.soap_plano || '',
        dados_acolhimento: (acolhimentoDraft && Object.keys(acolhimentoDraft).length > 0) ? acolhimentoDraft : (form.dados_acolhimento || null),
        episodio_id: (form.episodio_id && form.episodio_id !== 'no_episode') ? form.episodio_id : null,
        custom_data: {
          ...form.custom_data,
          especialidade_fields: especialidadeFields,
          soap_enabled: soapEnabled,
          cycle_info: sessaoCycle ? { id: sessaoCycle.id, type: sessaoCycle.treatment_type, sessions: `${sessaoCycle.sessions_done}/${sessaoCycle.total_sessions}` } : null,
          pts_info: sessaoPts ? { id: sessaoPts.id, diagnostic: sessaoPts.diagnostico_funcional, goals: sessaoPts.objetivos_terapeuticos } : null
        }
      };

      let savedRecord;
      if (finalId) {
        // Explicit update to prevent duplication
        const { data, error } = await supabase.from('prontuarios').update(dbPayload).eq('id', finalId).select().single();
        if (error) throw error;
        savedRecord = data;
      } else {
        // Explicit insert for new record
        const { data, error } = await supabase.from('prontuarios').insert(dbPayload).select().single();
        if (error) throw error;
        savedRecord = data;
      }
      
      const data = savedRecord;
      
      // Audit
      await auditService.log({
        acao: finalId ? 'finalizar_alteracao_prontuario' : 'finalizar_prontuario',
        entidade: 'prontuario',
        entidadeId: data.id,
        entidadeNome: pacienteData?.nome || pacienteNome || 'Paciente',
        modulo: 'Prontuário',
        before: currentProntuario,
        after: data,
        pacienteId: pacienteId || form.paciente_id,
        origem: 'Workspace Prontuário'
      });

      // Save procedures
      if (selectedProcIds.length > 0) {
        await supabase.from("prontuario_procedimentos").delete().eq("prontuario_id", data.id);
        const links = selectedProcIds.map(pid => {
          const proc = procedimentos.find(p => p.id === pid);
          const codigos = selectedCidsByProc[pid] || [];
          const cidsCatalogo = cidsByProc[pid] || [];
          const cidsPayload = codigos.map(c => ({ codigo: c, descricao: cidsCatalogo.find(cc => cc.codigo === c)?.descricao || '' }));
          return {
            prontuario_id: data.id,
            procedimento_id: pid,
            paciente_id: form.paciente_id,
            agendamento_id: form.agendamento_id || null,
            profissional_id: user?.id,
            unidade_id: user?.unidadeId,
            codigo_sigtap: proc?.id || pid,
            nome_procedimento: proc?.nome || 'Procedimento',
            especialidade: proc?.especialidade || '',
            quantidade: 1,
            cid: codigos[0] || null,
            observacao: cidsPayload.length > 0 ? JSON.stringify({ cids: cidsPayload }) : '',
          };
        });
        await supabase.from("prontuario_procedimentos").insert(links);
      }

      // Update agendamento status if provided
      if (form.agendamento_id) {
        await updateAgendamento(form.agendamento_id, { status: 'concluido' });
      }

      toast.success(editId ? 'Alteração finalizada com sucesso!' : 'Prontuário finalizado com sucesso!');
      // Fecha o workspace após finalizar (novo ou alteração)
      setTimeout(() => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/painel/agenda');
      }, 300);
    } catch (e: any) { 
      console.error('[Prontuário] Erro ao salvar:', e);
      toast.error(`Erro ao salvar prontuário: ${e?.message || 'desconhecido'}`); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleSaveAcolhimento = async (dados: any) => {
    if (!pacienteId && !form.paciente_id) {
      toast.error("Selecione um paciente primeiro.");
      return;
    }
    setSavingAcolhimento(true);
    try {
      const payload: any = {
        paciente_id: pacienteId || form.paciente_id || '',
        paciente_nome: pacienteData?.nome || pacienteNome || form.paciente_nome || 'Paciente',
        profissional_id: user?.id || '',
        profissional_nome: user?.nome || 'Profissional',
        unidade_id: user?.unidadeId || '',
        tipo_registro: 'acolhimento_mental',
        data_atendimento: new Date().toISOString().split('T')[0],
        hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        dados_acolhimento: dados,
        agendamento_id: agendamentoId || null,
        custom_data: {}
      };

      let result;
      if (acolhimentoData?.id) {
        // Explicit update for existing record
        const { data, error } = await supabase
          .from('prontuarios')
          .update(payload)
          .eq('id', acolhimentoData.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        // Explicit insert for new record
        const { data, error } = await supabase
          .from('prontuarios')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
      
      const typedResult = result as any;
      setAcolhimentoData(typedResult);
      if (typedResult?.dados_acolhimento) {
        setAcolhimentoDraft(typedResult.dados_acolhimento);
      }
      toast.success("Acolhimento salvo com sucesso!");
    } catch (e: any) {
      console.error("Erro ao salvar acolhimento:", e);
      toast.error("Erro ao salvar acolhimento.");
    } finally {
      setSavingAcolhimento(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="flex items-center justify-between px-6 py-2.5 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button>
          <div className="flex items-center gap-2">
             <h1 className="text-sm font-bold">Workspace Clínico</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
            <FileDown className="w-4 h-4 mr-2" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gradient-primary">
            {saving ? 'Salvando...' : (editId ? 'Finalizar Alteração' : 'Finalizar Prontuário')}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={70}>
            <ScrollArea className="h-full p-6">
              <div className="max-w-4xl mx-auto space-y-6">
                <PatientClinicalHeader
                  onEdit={() => setEditPatientOpen(true)}
                  nome={pacienteData?.nome || pacienteNome || 'Paciente'}
                  idade={pacienteData?.data_nascimento ? calcularIdade(pacienteData.data_nascimento) : '—'}
                  sexo={pacienteData?.sexo || '—'}
                  cpf={pacienteData?.cpf || '—'}
                  cns={pacienteData?.cns || '—'}
                  profissional={user?.nome || '—'}
                  telefone={pacienteData?.telefone}
                  email={pacienteData?.email}
                  endereco={pacienteData?.endereco}
                />

                {(!pacienteId && !editId) && (
                  <Card className="p-4 space-y-4">
                    <Label>Identificar Paciente</Label>
                    <BuscaPaciente pacientes={pacientes} value={form.paciente_id} onChange={(id, nome) => setForm(p => ({...p, paciente_id: id, paciente_nome: nome}))} />
                  </Card>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-2 border-b mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <TabsList className="flex-1 justify-start h-12 bg-transparent gap-6 p-0 overflow-x-auto">
                        <TabsTrigger value="acolhimento" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">
                          Acolhimento
                          {acolhimentoData && (
                            <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700 hover:bg-green-100 border-green-200 py-0 px-1 text-[10px]">✓</Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="evolution" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold">Evolução</TabsTrigger>
                        <TabsTrigger value="prescriptions" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Prescrições/Exames</TabsTrigger>
                        <TabsTrigger value="procedures" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Procedimentos/CID</TabsTrigger>
                        <TabsTrigger value="treatments" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Tratamentos/PTS</TabsTrigger>
                        <TabsTrigger value="antecedents" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Histórico Externo</TabsTrigger>
                        <TabsTrigger value="annexes" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Anexos</TabsTrigger>
                      </TabsList>
                    </div>
                  </div>

                  <TabsContent value="acolhimento" className="mt-0 animate-in fade-in duration-300" forceMount>
                    <Card className="border-none shadow-none bg-transparent">
                      <CardContent className="p-0">
                        {loadingAcolhimento ? (
                          <div className="flex items-center justify-center p-12 text-muted-foreground text-sm">Carregando acolhimento...</div>
                        ) : (
                          <div className={cn(activeTab !== 'acolhimento' && "hidden")}>
                            <AcolhimentoForm 
                              pacienteId={pacienteId || form.paciente_id}
                              profissionalId={user?.id}
                              agendamentoId={agendamentoId || undefined}
                              initialData={acolhimentoData}
                              formData={acolhimentoDraft}
                              setFormData={setAcolhimentoDraft}
                              onSave={handleSaveAcolhimento}
                              saving={savingAcolhimento}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="evolution" className="mt-0 space-y-6" forceMount>
                    <div className={cn("space-y-6", activeTab !== 'evolution' && "hidden")}>
                      {/* View-only Acolhimento if exists and in Evolution tab */}
                      {(acolhimentoData || (acolhimentoDraft && Object.keys(acolhimentoDraft).length > 0)) && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                          <AcolhimentoView 
                            data={acolhimentoDraft && Object.keys(acolhimentoDraft).length > 0 ? acolhimentoDraft : acolhimentoData?.dados_acolhimento} 
                            isCollapsedDefault={true}
                          />
                        </div>
                      )}

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-br from-card to-muted/20 p-6 rounded-2xl border border-primary/10 shadow-md mb-8">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-primary/10 text-primary shadow-inner">
                            <History className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-foreground tracking-tight">Evolução Clínica</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Atendimento Ativo</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 bg-background/60 p-3 rounded-xl border border-border/40 backdrop-blur-sm">
                          <div className="flex flex-col gap-1">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground/80 tracking-widest ml-1">Tipo de Registro</Label>
                            <Select 
                              value={form.tipo_registro} 
                              onValueChange={(val) => handleFormChange({ tipo_registro: val })}
                            >
                              <SelectTrigger className="w-[200px] h-10 text-sm font-bold bg-background border-primary/20 hover:border-primary/40 focus:ring-primary/20 transition-all shadow-sm rounded-lg">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-primary/10 shadow-xl">
                                {[
                                  { value: 'avaliacao_inicial', label: 'Avaliação/TR', color: 'bg-green-600', icon: Stethoscope },
                                  { value: 'retorno', label: 'Retorno', color: 'bg-blue-600', icon: Clock },
                                  { value: 'sessao', label: 'Sessão', color: 'bg-amber-500', icon: Activity },
                                  { value: 'urgencia', label: 'Urgência', color: 'bg-red-600', icon: AlertTriangle },
                                  { value: 'procedimento', label: 'Procedimento', color: 'bg-purple-600', icon: ClipboardList },
                                ].map((type) => (
                                  <SelectItem key={type.value} value={type.value} className="focus:bg-primary/5 rounded-md cursor-pointer py-2.5">
                                    <div className="flex items-center gap-3">
                                      <div className={cn("w-2.5 h-2.5 rounded-full ring-2 ring-background shadow-sm", type.color)} />
                                      <span className="font-semibold">{type.label}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      
                      <SoapFieldsAdaptive
                        profissao={user?.profissao}
                        values={{
                          soap_subjetivo: form.soap_subjetivo || '',
                          soap_objetivo: form.soap_objetivo || '',
                          soap_avaliacao: form.soap_avaliacao || '',
                          soap_plano: form.soap_plano || '',
                        }}
                        onChange={(field, value) => handleFormChange({ [field]: value })}
                        soapErrors={false}
                        onClearErrors={() => {}}
                        soapEnabled={soapEnabled}
                        onToggleSoap={handleToggleSoap}
                        labels={soapLabels}
                        customOptionsForField={(field) => soapCustom.getOptionsForField(field)}
                        customOptionsWithId={(field) => soapCustom.getOptionWithId(field)}
                        onAddCustomOption={(field, option) => soapCustom.addOption(field, option, user?.profissao || '')}
                        onDeleteCustomOption={soapCustom.deleteOption}
                      />
                      
                      {!soapEnabled && (
                        <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="w-4 h-4 text-primary" />
                            <Label className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Evolução Livre</Label>
                          </div>
                          <DebouncedTextarea
                            rows={8}
                            value={form.evolucao || ''}
                            onChange={(e) => handleFormChange({ evolucao: e.target.value })}
                            placeholder="Descreva a evolução clínica do paciente detalhadamente..."
                            className="bg-card border-border/60 shadow-sm focus-visible:ring-primary/30"
                          />
                        </div>
                      )}
                      
                      <DynamicProntuarioFields
                        campos={getCamposForTipo(form.tipo_registro)}
                        formValues={form}
                        customValues={form.custom_data || {}}
                        onFormChange={(k, v) => handleFormChange({ [k]: v })}
                        onCustomChange={(k, v) => handleFormChange({ custom_data: { [k]: v } })}
                        especialidadeFields={especialidadeFields}
                        onEspecialidadeChange={(k, v) => {
                          setEspecialidadeFields(p => ({...p, [k]: v}));
                          setHasModifiedForm(true);
                        }}
                        profissao={user?.profissao}
                        profissionalId={user?.id}
                        tipoProntuario={form.tipo_registro === 'avaliacao_inicial' ? 'avaliacao' : (form.tipo_registro === 'retorno' ? 'retorno' : (form.tipo_registro === 'sessao' ? 'sessao' : (form.tipo_registro === 'urgencia' ? 'urgencia' : (form.tipo_registro === 'procedimento' ? 'procedimento' : 'avaliacao'))))}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="prescriptions" className="mt-0 space-y-6">
                    <PrescricaoMedicamentos
                      profissionalId={user?.id || ''}
                      value={listaPrescricao}
                      onChange={setListaPrescricao}
                    />
                    <SolicitacaoExames
                      profissionalId={user?.id || ''}
                      value={listaExames}
                      onChange={setListaExames}
                    />
                  </TabsContent>

                  <TabsContent value="procedures" className="mt-0 space-y-6">
                    <Card>
                      <CardContent className="p-6">
                        <div className="space-y-4">
                          <Label>Procedimentos Realizados / CID-10</Label>
                          <BuscaProcedimento 
                            profissao={user?.profissao}
                            onChange={(proc) => {
                              if (proc && !selectedProcIds.includes(proc.id)) {
                                setSelectedProcIds(prev => [...prev, proc.id]);
                                procedureService.getCidsForProcedure(proc.id).then(list => {
                                  setCidsByProc(prev => ({ ...prev, [proc.id]: list }));
                                });
                              }
                            }}
                          />
                          <div className="space-y-3 mt-4">
                            {selectedProcIds.map(pid => {
                              const proc = procedimentos.find(p => p.id === pid);
                              return (
                                <div key={pid} className="p-3 border rounded-lg bg-muted/20">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-sm">{proc?.nome || pid}</span>
                                      <span className="text-[10px] font-mono text-muted-foreground">Código: {proc?.id || pid}</span>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedProcIds(prev => prev.filter(i => i !== pid))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                  </div>
                                  <div className="mb-3">
                                    <BuscaCID 
                                      placeholder="Adicionar CID relacionado..."
                                      onSelect={(cid) => {
                                        const current = selectedCidsByProc[pid] || [];
                                        if (!current.includes(cid.codigo)) {
                                          setSelectedCidsByProc(prev => ({ ...prev, [pid]: [...current, cid.codigo] }));
                                          setCidsByProc(prev => {
                                            const existing = prev[pid] || [];
                                            if (!existing.some(x => x.codigo === cid.codigo)) {
                                              return { ...prev, [pid]: [...existing, cid] };
                                            }
                                            return prev;
                                          });
                                        }
                                      }} 
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {(cidsByProc[pid] || []).map(cid => (
                                      <Badge 
                                        key={cid.codigo} 
                                        variant={selectedCidsByProc[pid]?.includes(cid.codigo) ? "default" : "outline"}
                                        className="cursor-pointer"
                                        onClick={() => {
                                          const current = selectedCidsByProc[pid] || [];
                                          if (current.includes(cid.codigo)) {
                                            setSelectedCidsByProc(prev => ({ ...prev, [pid]: current.filter(c => c !== cid.codigo) }));
                                          } else {
                                            setSelectedCidsByProc(prev => ({ ...prev, [pid]: [...current, cid.codigo] }));
                                          }
                                        }}
                                      >
                                        {cid.codigo} - {cid.descricao}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="treatments" className="mt-0 space-y-6">
                    <TreatmentTab 
                      pacienteId={pacienteId || form.paciente_id} 
                      pacienteNome={pacienteData?.nome || pacienteNome || 'Paciente'}
                      onCycleCreated={() => setCreateCycleOpen(true)}
                      onPtsCreated={() => setCreatePtsOpen(true)}
                    />
                  </TabsContent>

                  <TabsContent value="antecedents" className="mt-0 space-y-6">
                    <TriagemDetalhada 
                      triagem={triagem} 
                    />
                    <CamposEspecialidade 
                      profissao={user?.profissao} 
                      values={especialidadeFields} 
                      onChange={(k, v) => setEspecialidadeFields(p => ({...p, [k]: v}))} 
                      profissionalId={user?.id}
                      tipoProntuario={form.tipo_registro === 'avaliacao_inicial' ? 'avaliacao' : form.tipo_registro as any}
                    />
                  </TabsContent>

                   <TabsContent value="annexes" className="mt-0 space-y-6">
                    <ProntuarioAnexos
                      prontuarioId={editId || form.id}
                      pacienteId={pacienteId || form.paciente_id}
                      agendamentoId={agendamentoId || form.agendamento_id}
                      tipoRegistro={form.tipo_registro}
                      unidadeId={user?.unidadeId}
                      uploadedBy={user?.id}
                      uploadedByNome={user?.nome}
                      showResultadosAnteriores={form.tipo_registro === 'retorno'}
                    />
                    <ResultadosExames pacienteId={pacienteId || form.paciente_id} />
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={35} minSize={25}>
            <Tabs defaultValue="history" className="flex flex-col h-full">
              <div className="px-4 py-2 border-b bg-muted/30">
                <TabsList className="w-full h-9 bg-transparent p-0 gap-4">
                  <TabsTrigger value="history" className="flex-1 h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-xs font-bold uppercase tracking-wider">Histórico Longitudinal</TabsTrigger>
                  <TabsTrigger value="files" className="flex-1 h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-xs font-bold uppercase tracking-wider">Documentos</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="history" className="flex-1 min-h-0 mt-0">
                 {(pacienteId || form.paciente_id) && (
                   <HistoricoClinico 
                     pacienteId={pacienteId || form.paciente_id} 
                     pacienteNome={pacienteNome || form.paciente_nome || ''} 
                     unidades={unidades}
                     currentProfissionalId={user?.id}
                   />
                 )}
              </TabsContent>
              <TabsContent value="files" className="flex-1 min-h-0 mt-0 overflow-y-auto p-4">
                <PacienteDocumentos pacienteId={pacienteId || form.paciente_id} />
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <QuickEditPatientModal
        open={editPatientOpen}
        onOpenChange={setEditPatientOpen}
        pacienteId={pacienteId || form.paciente_id}
        onSaved={async () => { 
          const { data: pData } = await supabase.from('pacientes').select('*').eq('id', pacienteId || form.paciente_id).single();
          if (pData) setPacienteData(pData);
          setRefreshTrigger(r => r + 1); 
          setEditPatientOpen(false); 
        }}
      />

      <CreatePTSModal 
        open={createPtsOpen}
        onOpenChange={setCreatePtsOpen}
        pacienteId={pacienteId || form.paciente_id}
        pacienteNome={pacienteData?.nome || pacienteNome || 'Paciente'}
        onSuccess={() => setRefreshTrigger(r => r + 1)}
      />

      <CreateCycleModal
        open={createCycleOpen}
        onOpenChange={setCreateCycleOpen}
        pacienteId={pacienteId || form.paciente_id}
        pacienteNome={pacienteData?.nome || pacienteNome || 'Paciente'}
        onSuccess={() => setRefreshTrigger(r => r + 1)}
      />
    </div>
  );
};

export default WorkspaceProntuario;
