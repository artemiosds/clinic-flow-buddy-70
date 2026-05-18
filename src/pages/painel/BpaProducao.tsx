import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from '@/components/ui/table';
import {
  AlertCircle, CheckCircle2, Download, FileText, Loader2, RefreshCw, FileSpreadsheet, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { 
  BpaLine, 
  normalizeBpaData, 
  validateBpaLine, 
  exportBpaToXlsx, 
  isProfissionalMedico,

  generateBpaTxt,
  LinhaBPA,
  ProntuarioRow,
  ValidationFlags
} from '@/services/bpaService';



// Os tipos e utilitários foram movidos para @/services/bpaService

const currentCompetencia = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Resolve o range de datas para uma competência AAAAMM
 */
export const resolveCompetenciaRange = (competencia: string) => {
  const comp = String(competencia || '').replace(/\D/g, '');
  if (comp.length !== 6) return null;
  
  const ano = parseInt(comp.slice(0, 4));
  const mes = parseInt(comp.slice(4, 6));
  
  if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) return null;

  // Início do mês (00:00:00 local)
  const dataInicio = new Date(ano, mes - 1, 1);
  dataInicio.setHours(0, 0, 0, 0);
  
  // Fim do mês (23:59:59 local)
  const dataFim = new Date(ano, mes, 0); // último dia do mês mes-1
  dataFim.setHours(23, 59, 59, 999);

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    inicio: formatDate(dataInicio),
    fim: formatDate(dataFim),
    dataInicio,
    dataFim
  };
};

// ─── Filtros: fonte única de verdade ─────────────────────────────────────────
interface BpaFilters {
  competencia: string;
  unidadeId: string;       // 'all' | id
  profissionalId: string;  // 'all' | id
  origem: string;          // 'all' | 'prontuario' | 'pts' | 'paciente' | 'outro_prontuario_mesmo_paciente'
  status: string;          // 'all' | 'ok' | 'pendente'
  sigtap: string;          // texto livre
  paciente: string;        // texto livre (nome)
}

const BpaProducao: React.FC = () => {
  const { user } = useAuth();
  const { unidades } = useData();
  const [linhas, setLinhas] = useState<LinhaBPA[]>([]);
  const [pacMap, setPacMap] = useState<Record<string, { cns: string; cpf: string; nome: string; data_nascimento: string; raca_cor: string; nacionalidade: string }>>({});
  const [profMap, setProfMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<BpaFilters>({
    competencia: currentCompetencia(),
    unidadeId: user?.unidadeId || 'all',
    profissionalId: 'all',
    origem: 'all',
    status: 'all',
    sigtap: '',
    paciente: '',
  });
  const setFilter = <K extends keyof BpaFilters>(key: K, value: BpaFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const { competencia, unidadeId: unidadeFiltro } = filters;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalCompetencia, setModalCompetencia] = useState<string>(currentCompetencia());
  const [modalUnidade, setModalUnidade] = useState<string>(user?.unidadeId || '');
  const [modalCnes, setModalCnes] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const ano = competencia.slice(0, 4);
  const mes = competencia.slice(4, 6);

  const load = async () => {
    const range = resolveCompetenciaRange(competencia);
    if (!range) return;
    setLoading(true);
    try {
      const { inicio, fim } = range;
      console.log("[BPA] carregando competencia", { competencia, inicio, fim });

      // 1. Prontuários do período
      let q = (supabase as any)
        .from('prontuarios')
        .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, data_atendimento, unidade_id, custom_data, cid')
        .gte('data_atendimento', inicio)
        .lte('data_atendimento', fim)
        .order('data_atendimento', { ascending: false });
      
      if (unidadeFiltro && unidadeFiltro !== 'all') q = q.eq('unidade_id', unidadeFiltro);

      const { data: prontuarios, error } = await q;
      if (error) throw error;
      
      const statusFinalizados = ['finalizado', 'concluido', 'concluído', 'realizado', 'atendido', 'atendimento_finalizado', 'prontuario_finalizado', 'fechado'];
      
      const prots = (prontuarios || []).filter((p: any) => {
        const status = (p.custom_data?.status || '').toLowerCase();
        return !status || statusFinalizados.includes(status);
      }) as (ProntuarioRow & { cid?: string })[];

      const pacIds = [...new Set(prots.map(p => p.paciente_id).filter(Boolean))];

      // 2. Auxiliares (Pacientes, Profissionais, PTS)
      const uniquePacIds = [...new Set(prots.map((p) => p.paciente_id).filter(Boolean))];
      const profIds = [...new Set(prots.map((p) => p.profissional_id).filter(Boolean))];

      let ptsData: any[] = [];
      let pacsData: any[] = [];
      let profsData: any[] = [];

      if (uniquePacIds.length > 0) {
        const [ptsRes, pacsRes] = await Promise.all([
          (supabase as any)
            .from('pts')
            .select('id, patient_id, status, pts_cid(cid_codigo), pts_sigtap(procedimento_codigo, procedimento_nome)')
            .in('patient_id', uniquePacIds)
            .in('status', ['ativo', 'em_andamento', 'finalizado', 'concluido', 'concluído']),
          (supabase as any)
            .from('pacientes')
            .select('id, nome, cpf, cns, data_nascimento, custom_data')
            .in('id', uniquePacIds)
        ]);
        ptsData = ptsRes.data || [];
        pacsData = pacsRes.data || [];
      }

      if (profIds.length > 0) {
        const { data: profs } = await (supabase as any)
          .from('funcionarios')
          .select('id, custom_data, profissao, cargo')
          .in('id', profIds);
        profsData = profs || [];
      }

      // Mapeamento de auxiliares
      const pm: Record<string, any> = {};
      pacsData.forEach((p: any) => {
        const cd = p.custom_data || {};
        pm[p.id] = {
          cns: p.cns || '',
          cpf: p.cpf || '',
          nome: p.nome || '',
          data_nascimento: p.data_nascimento || '',
          raca_cor: cd.raca_cor || cd.racaCor || '',
          nacionalidade: cd.nacionalidade || '',
          custom_data: cd
        };
      });
      setPacMap(pm);

      const profM: any = {};
      profsData.forEach((f: any) => {
        profM[f.id] = { 
          cbo: (f.custom_data || {}).cbo_codigo || '',
          profissao: f.profissao || '',
          cargo: f.cargo || '',
          custom_data: f.custom_data || {}
        };
      });
      setProfMap(profM);

      const ptsByPac = new Map();
      ptsData.forEach(p => {
        if (!ptsByPac.has(p.patient_id)) ptsByPac.set(p.patient_id, []);
        ptsByPac.get(p.patient_id).push(p);
      });

      // 3. Procedimentos dos Prontuários
      const prontIds = prots.map((p) => p.id);
      const { data: vincs } = await (supabase as any)
        .from('prontuario_procedimentos')
        .select('prontuario_id, procedimento_id, nome_procedimento, codigo_sigtap, cid')
        .in('prontuario_id', prontIds);

      const finalResult: LinhaBPA[] = [];
      const protsComProc = new Set();

      // 4. Herança entre prontuários do mesmo paciente na competência
      const herancaPac = new Map<string, { sigtap: string; nome: string; cid: string; fonte_sigtap: string; fonte_cid: string }>();

      // Primeiro passamos para identificar quem tem dados completos
      (vincs || []).forEach((v: any) => {
        const pront = prots.find(p => p.id === v.prontuario_id);
        if (!pront) return;
        const pacId = pront.paciente_id;
        const sigtapValido = (v.codigo_sigtap || '').replace(/\D/g, '').length === 10;
        const cidValido = !!(v.cid || pront.cid);

        if (!herancaPac.has(pacId)) {
          if (sigtapValido || cidValido) {
            herancaPac.set(pacId, {
              sigtap: sigtapValido ? v.codigo_sigtap : '',
              nome: sigtapValido ? v.nome_procedimento : '',
              cid: cidValido ? (v.cid || pront.cid) : '',
              fonte_sigtap: sigtapValido ? 'outro_prontuario_mesmo_paciente' : '',
              fonte_cid: cidValido ? 'outro_prontuario_mesmo_paciente' : ''
            });
          }
        } else {
          const current = herancaPac.get(pacId)!;
          if (sigtapValido && !current.sigtap) {
            current.sigtap = v.codigo_sigtap;
            current.nome = v.nome_procedimento;
            current.fonte_sigtap = 'outro_prontuario_mesmo_paciente';
          }
          if (cidValido && !current.cid) {
            current.cid = v.cid || pront.cid;
            current.fonte_cid = 'outro_prontuario_mesmo_paciente';
          }
        }
      });

      // Se ainda faltar algo na herança, buscar no PTS ou Paciente (como fallback de herança para quem não tem nada)
      uniquePacIds.forEach(pacId => {
        const pac = pm[pacId];
        const pacPts = ptsByPac.get(pacId) || [];
        const existing = herancaPac.get(pacId);

        let herancaSigtap = existing?.sigtap || '';
        let herancaNome = existing?.nome || '';
        let herancaCid = existing?.cid || '';
        let herancaFonteSigtap = existing?.fonte_sigtap || '';
        let herancaFonteCid = existing?.fonte_cid || '';

        // Tentar PTS
        if (!herancaSigtap) {
          const ptsWithProc = pacPts.find((p: any) => p.pts_sigtap && p.pts_sigtap.length > 0);
          if (ptsWithProc) {
            herancaSigtap = ptsWithProc.pts_sigtap[0].procedimento_codigo;
            herancaNome = ptsWithProc.pts_sigtap[0].procedimento_nome;
            herancaFonteSigtap = 'pts';
          }
        }
        if (!herancaCid) {
          const ptsWithCid = pacPts.find((p: any) => p.pts_cid && p.pts_cid.length > 0);
          if (ptsWithCid) {
            herancaCid = ptsWithCid.pts_cid[0].cid_codigo;
            herancaFonteCid = 'pts';
          }
        }

        // Tentar Paciente
        if (!herancaSigtap && pac?.custom_data?.codigo_sigtap) {
          herancaSigtap = pac.custom_data.codigo_sigtap;
          herancaNome = pac.custom_data.nome_procedimento || 'Procedimento Vinculado ao Paciente';
          herancaFonteSigtap = 'paciente';
        }
        if (!herancaCid && pac?.custom_data?.cid) {
          herancaCid = pac.custom_data.cid;
          herancaFonteCid = 'paciente';
        }

        if (herancaSigtap || herancaCid) {
          herancaPac.set(pacId, {
            sigtap: herancaSigtap,
            nome: herancaNome,
            cid: herancaCid,
            fonte_sigtap: herancaFonteSigtap,
            fonte_cid: herancaFonteCid
          });
        }
      });

      // Usando finalResult e protsComProc já declarados acima


      // Função para resolver Procedimento e CID por prioridade
      const resolveBpaRow = (pront: any, procVinc?: any): LinhaBPA[] => {
        const rows: LinhaBPA[] = [];
        const pacId = pront.paciente_id;
        const pac = pm[pacId];
        const hPac = herancaPac.get(pacId);

        // Identifica se é médico
        const prof = profM[pront.profissional_id];
        const isMed = isProfissionalMedico(prof);

        if (procVinc) {
          // Caso 1: Procedimento diretamente no prontuário
          let finalCid = procVinc.cid || pront.cid;
          let fonteCid: LinhaBPA["fonte_cid"] = procVinc.cid ? "prontuario" : (pront.cid ? "atendimento" : undefined);

          // Se faltar CID, herança
          if (!finalCid && hPac?.cid) {
            finalCid = hPac.cid;
            fonteCid = hPac.fonte_cid as any;
          }

          rows.push({
            key: `${pront.id}_vinc_${procVinc.procedimento_id || procVinc.codigo_sigtap || Math.random()}`,
            prontuario_id: pront.id,
            paciente_id: pront.paciente_id,
            paciente_nome: pront.paciente_nome,
            profissional_id: pront.profissional_id,
            profissional_nome: pront.profissional_nome,
            unidade_id: pront.unidade_id,
            data: pront.data_atendimento,
            procedimento_nome: procVinc.nome_procedimento || '—',
            codigo_sigtap: (procVinc.codigo_sigtap || '').replace(/\D/g, '').length === 10 ? procVinc.codigo_sigtap : '',
            cid: finalCid,
            fonte_procedimento: "prontuario",
            fonte_cid: fonteCid
          });
        } else {
          // Caso Prontuário sem procedimento vinculado
          let finalProc = '';
          let finalProcNome = '';
          let fonteProc: LinhaBPA["fonte_procedimento"] = "prontuario";

          let finalCid = pront.cid;
          let fonteCid: LinhaBPA["fonte_cid"] = pront.cid ? "atendimento" : undefined;

          // Herança por prioridade
          if (hPac?.sigtap) {
            finalProc = hPac.sigtap;
            finalProcNome = hPac.nome;
            fonteProc = hPac.fonte_sigtap as any;
          }

          if (!finalCid && hPac?.cid) {
            finalCid = hPac.cid;
            fonteCid = hPac.fonte_cid as any;
          }

          rows.push({
            key: `${pront.id}_complementar`,
            prontuario_id: pront.id,
            paciente_id: pront.paciente_id,
            paciente_nome: pront.paciente_nome,
            profissional_id: pront.profissional_id,
            profissional_nome: pront.profissional_nome,
            unidade_id: pront.unidade_id,
            data: pront.data_atendimento,
            procedimento_nome: finalProcNome || (isMed ? 'Consulta Médica' : '— sem procedimento (Herança/PTS/Paciente) —'),
            codigo_sigtap: (finalProc || '').replace(/\D/g, '').length === 10 ? finalProc : '',
            cid: finalCid,
            fonte_procedimento: fonteProc,
            fonte_cid: fonteCid
          });
        }
        return rows;
      };

      // Processar
      (vincs || []).forEach((v: any) => {
        const pront = prots.find(p => p.id === v.prontuario_id);
        if (!pront) return;
        protsComProc.add(pront.id);
        finalResult.push(...resolveBpaRow(pront, v));
      });

      prots.forEach((pront) => {
        if (!protsComProc.has(pront.id)) {
          finalResult.push(...resolveBpaRow(pront));
        }
      });

      setLinhas(finalResult);

      console.log("[BPA] resumo da resolucao", {
        competencia,
        totalProntuarios: prots.length,
        totalVinculos: (vincs || []).length,
        totalLinhas: finalResult.length
      });

    } catch (err: any) {
      console.error("[BPA] erro na resolucao", {
        competencia,
        errorMessage: err?.message,
      });
      toast.error('Erro ao carregar produção BPA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [competencia, unidadeFiltro]);

  // Helper compartilhado: normaliza uma LinhaBPA usando os maps em memória
  const toBpaLine = (l: LinhaBPA): BpaLine => {
    const pac = pacMap[l.paciente_id];
    const prof = profMap[l.profissional_id];
    const uni = unidades.find(u => u.id === l.unidade_id);
    return normalizeBpaData({
      ...l,
      paciente_custom: (pac as any)?.custom_data || {},
      paciente_sexo: (pac as any)?.sexo || '',
      paciente_nascimento: pac?.data_nascimento || '',
      paciente_cns: pac?.cns || '',
      paciente_cpf: pac?.cpf || '',
      profissional_custom: prof,
      unidade_custom: (uni as any)?.custom_data || {},
      unidade_nome: uni?.nome || '',
    });
  };

  const validateRow = (l: LinhaBPA): { isValid: boolean; errors: string[] } => {
    const v = validateBpaLine(toBpaLine(l));
    return { isValid: v.isValid, errors: v.errors };
  };

  // ─── FONTE ÚNICA: aplica filtros em memória a partir de `linhas` ──────────
  const linhasFiltradas = useMemo(() => {
    const { profissionalId, origem, status, sigtap, paciente } = filters;
    const sigtapNorm = sigtap.replace(/\D/g, '');
    const pacNorm = paciente.trim().toLowerCase();

    return linhas.filter((l) => {
      if (profissionalId !== 'all' && l.profissional_id !== profissionalId) return false;
      if (origem !== 'all' && (l.fonte_procedimento || '') !== origem) return false;
      if (sigtapNorm && !(l.codigo_sigtap || '').includes(sigtapNorm)) return false;
      if (pacNorm && !(l.paciente_nome || '').toLowerCase().includes(pacNorm)) return false;
      if (status !== 'all') {
        const ok = validateRow(l).isValid;
        if (status === 'ok' && !ok) return false;
        if (status === 'pendente' && ok) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, filters, pacMap, profMap, unidades]);

  // Profissionais disponíveis no dataset carregado (para o select)
  const profissionaisOpts = useMemo(() => {
    const map = new Map<string, string>();
    linhas.forEach((l) => {
      if (l.profissional_id && !map.has(l.profissional_id)) {
        map.set(l.profissional_id, l.profissional_nome || '—');
      }
    });
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [linhas]);

  // Cabeçalho BPA-I dinâmico (derivado dos filtros e maps atuais)
  const headerBpa = useMemo(() => {
    const profSel = filters.profissionalId !== 'all' ? profMap[filters.profissionalId] : null;
    const uniId = filters.unidadeId !== 'all'
      ? filters.unidadeId
      : (profissionaisOpts.length === 1
          ? linhas.find(l => l.profissional_id === profissionaisOpts[0].id)?.unidade_id
          : '') || '';
    const uni = uniId ? unidades.find(u => u.id === uniId) : null;
    const uniCustom: any = (uni as any)?.custom_data || {};
    const profCustom: any = profSel?.custom_data || {};
    const nomeProf = filters.profissionalId !== 'all'
      ? (profissionaisOpts.find(p => p.id === filters.profissionalId)?.nome || '—')
      : null;
    return {
      profissionalId: filters.profissionalId !== 'all' ? filters.profissionalId : '',
      profissionalNome: nomeProf,
      cns: String(profCustom.cns || profSel?.cns || '').replace(/\D/g, '').slice(0, 15),
      cbo: String(profCustom.cbo_codigo || profSel?.cbo || '').replace(/\D/g, '').slice(0, 6),
      profissao: profSel?.profissao || profCustom.profissao || '',
      unidadeId: uniId,
      unidadeNome: uni?.nome || (filters.unidadeId === 'all' ? 'Todas as unidades' : '—'),
      cnes: String(uniCustom.cnes || '').replace(/\D/g, '').slice(0, 7),
    };
  }, [filters.profissionalId, filters.unidadeId, profMap, unidades, profissionaisOpts, linhas]);

  const stats = useMemo(() => {
    let validos = 0, pendentes = 0;
    linhasFiltradas.forEach((l) => {
      const v = validateRow(l);
      if (v.isValid) validos++; else pendentes++;
    });
    return { total: linhasFiltradas.length, validos, pendentes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasFiltradas, pacMap, profMap, unidades]);

  const getCnesFromUnidade = (uniId: string): string => {
    if (!uniId) return '';
    const uni = unidades.find((u: any) => u.id === uniId);
    const cd = (uni as any)?.custom_data || {};
    return String(cd.cnes || '').replace(/\D/g, '').slice(0, 7);
  };

  const openGenerateModal = () => {
    const uniSelecionada = unidadeFiltro !== 'all' ? unidadeFiltro : (headerBpa.unidadeId || user?.unidadeId || '');
    setModalCompetencia(competencia);
    setModalUnidade(uniSelecionada);
    setModalCnes(getCnesFromUnidade(uniSelecionada) || headerBpa.cnes || '');
    setModalOpen(true);
  };

  // Atualiza CNES sugerido sempre que a unidade do modal muda
  useEffect(() => {
    if (!modalOpen) return;
    const sugerido = getCnesFromUnidade(modalUnidade);
    if (sugerido) setModalCnes(sugerido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalUnidade, modalOpen]);

  // Preview do modal: usa EXATAMENTE o mesmo conjunto filtrado da tela
  const modalPreview = useMemo(() => {
    if (!modalOpen) return { validos: 0, pendentes: 0, total: 0 };
    const filtroComp = modalCompetencia;
    let validos = 0, pendentes = 0, total = 0;
    linhasFiltradas.forEach((l) => {
      const lComp = (l.data || '').replace(/-/g, '').slice(0, 6);
      if (filtroComp && lComp !== filtroComp) return;
      if (modalUnidade && l.unidade_id !== modalUnidade) return;
      total += 1;
      const v = validateRow(l);
      if (v.isValid) validos++; else pendentes++;
    });
    return { validos, pendentes, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, modalUnidade, modalCompetencia, linhas, pacMap, profMap, unidades]);

  const handleGenerate = async () => {
    if (modalCompetencia.length !== 6) {
      toast.error('Competência inválida (use AAAAMM, ex: 202504)');
      return;
    }
    if (!modalCnes || modalCnes.length !== 7) {
      toast.error('CNES obrigatório (7 dígitos). Cadastre o CNES da unidade ou informe manualmente.');
      return;
    }
    if (modalPreview.total > 0 && modalPreview.validos === 0) {
      toast.error('Nenhum atendimento válido neste período. Corrija as pendências antes de gerar.');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke('generate-bpa', {
        body: {
          competencia: modalCompetencia,
          unidade_id: modalUnidade || '',
          cnes: modalCnes || '',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (!data.conteudo || data.conteudo.trim().length === 0) {
        throw new Error("O arquivo TXT BPA-I não pôde ser gerado porque não há linhas válidas ou houve erro estrutural.");
      }

      const blob = new Blob([data.conteudo], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `BPA_${modalCompetencia}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log("[BPA] geracao txt", {
        competencia: modalCompetencia,
        totalLinhasValidas: data.total_exportados,
        arquivoGerado: data.filename,
        tamanhoBytes: data.conteudo.length
      });

      toast.success(
        `BPA gerado com sucesso. ${data.total_exportados} procedimento(s) exportado(s).`,
        {
          description: data.total_pendentes > 0
            ? `${data.total_pendentes} registro(s) pendente(s) foram pulados.`
            : undefined,
          duration: 6000,
        },
      );
      setModalOpen(false);
    } catch (err: any) {
      console.error("[BPA] erro na geracao BPA-I", {
        competencia: modalCompetencia,
        errorMessage: err?.message,
      });
      toast.error('Erro ao gerar BPA: ' + (err?.message || 'desconhecido'));
    } finally {
      setGenerating(false);
    }
  };

  const unidadesOptions = unidades.filter(u => u.ativo !== false);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            BPA-Produção
          </h1>
          <p className="text-muted-foreground text-sm">
            Gerado a partir dos prontuários finalizados (TXT compatível com BPAMag/DATASUS)
          </p>
        </div>
        <Button onClick={openGenerateModal} className="bg-primary text-primary-foreground gap-2">
          <Download className="w-4 h-4" />
          Gerar BPA do mês
        </Button>
      </div>

      {/* Filtros — fonte única de verdade */}
      <Card className="shadow-card border-0">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Competência (AAAAMM)</Label>
            <Input
              value={competencia}
              onChange={(e) => setFilter('competencia', e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              placeholder="202504"
            />
          </div>
          <div>
            <Label className="text-xs">Unidade</Label>
            <Select value={filters.unidadeId} onValueChange={(v) => setFilter('unidadeId', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {unidadesOptions.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Profissional</Label>
            <Select value={filters.profissionalId} onValueChange={(v) => setFilter('profissionalId', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os profissionais</SelectItem>
                {profissionaisOpts.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filters.status} onValueChange={(v) => setFilter('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ok">Válidos (OK)</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origem do procedimento</Label>
            <Select value={filters.origem} onValueChange={(v) => setFilter('origem', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                <SelectItem value="prontuario">Prontuário</SelectItem>
                <SelectItem value="pts">PTS</SelectItem>
                <SelectItem value="paciente">Paciente</SelectItem>
                <SelectItem value="outro_prontuario_mesmo_paciente">Herança (outro prontuário)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">SIGTAP</Label>
            <Input
              value={filters.sigtap}
              onChange={(e) => setFilter('sigtap', e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Código SIGTAP"
            />
          </div>
          <div>
            <Label className="text-xs">Paciente</Label>
            <Input
              value={filters.paciente}
              onChange={(e) => setFilter('paciente', e.target.value)}
              placeholder="Nome do paciente"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const bpaLines: BpaLine[] = linhasFiltradas.map(toBpaLine);
                if (bpaLines.length === 0) {
                  toast.error('Não há dados para exportar com os filtros atuais.');
                  return;
                }
                exportBpaToXlsx(bpaLines, competencia);
                toast.success(`XLSX gerado (${bpaLines.length} linha(s) filtradas).`);
              }}
              className="gap-2 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 w-full"
              disabled={linhasFiltradas.length === 0}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Conferência (XLSX)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cabeçalho BPA-I — derivado da seleção */}
      <Card className="shadow-card border-0 border-l-4 border-l-primary">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cabeçalho BPA-I</p>
            <Badge variant="outline" className="text-[10px]">
              {filters.profissionalId === 'all' ? 'Visão geral' : 'Profissional selecionado'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Profissional</p>
              <p className="font-medium truncate">{headerBpa.profissionalNome || <span className="italic text-muted-foreground">— selecione —</span>}</p>
              {headerBpa.profissao && <p className="text-[10px] text-muted-foreground">{headerBpa.profissao}</p>}
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">CNS do profissional</p>
              <p className={cn("font-mono", !headerBpa.cns && headerBpa.profissionalNome && "text-destructive")}>{headerBpa.cns || (headerBpa.profissionalNome ? 'faltando' : '—')}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">CBO</p>
              <p className={cn("font-mono", !headerBpa.cbo && headerBpa.profissionalNome && "text-destructive")}>{headerBpa.cbo || (headerBpa.profissionalNome ? 'faltando' : '—')}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Unidade</p>
              <p className="font-medium truncate">{headerBpa.unidadeNome}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">CNES</p>
              <p className={cn("font-mono", !headerBpa.cnes && filters.unidadeId !== 'all' && "text-destructive")}>{headerBpa.cnes || (filters.unidadeId !== 'all' ? 'faltando' : '—')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats — usam EXATAMENTE o mesmo conjunto filtrado */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-card border-0">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total (filtrado)</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            {linhas.length !== stats.total && (
              <p className="text-[10px] text-muted-foreground mt-0.5">de {linhas.length} no período</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4">
            <p className="text-xs text-success">Válidos</p>
            <p className="text-2xl font-bold text-success">{stats.validos}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4">
            <p className="text-xs text-destructive">Pendentes</p>
            <p className="text-2xl font-bold text-destructive">
              {stats.pendentes}
              <span className="text-[10px] ml-1 font-normal">(não exportáveis)</span>
            </p>
          </CardContent>
        </Card>
      </div>


      {/* Grade */}
      <Card className="shadow-card border-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Linhas BPA-I do período</CardTitle>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : linhasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {linhas.length === 0
                ? 'Nenhum prontuário neste período.'
                : 'Nenhuma linha corresponde aos filtros aplicados.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>CNS / CPF</TableHead>
                    <TableHead>Nasc.</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>CBO</TableHead>
                    <TableHead>Procedimento</TableHead>
                    <TableHead>SIGTAP</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasFiltradas.map((l) => {
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>CNS / CPF</TableHead>
                    <TableHead>Nasc.</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>CBO</TableHead>
                    <TableHead>Procedimento</TableHead>
                    <TableHead>SIGTAP</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const pac = pacMap[l.paciente_id];
                    const prof = profMap[l.profissional_id];
                    const v = validateRow(l);
                    const ok = v.isValid;
                    const isMed = isProfissionalMedico(prof);
                    return (
                      <TableRow key={l.key} className={cn(!ok && "bg-destructive/5")}>
                        <TableCell>
                          {ok
                            ? <CheckCircle2 className="w-4 h-4 text-success" />
                            : <AlertCircle className="w-4 h-4 text-destructive" />}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{l.data}</TableCell>
                        <TableCell className={cn("font-medium", !ok && v.errors.some(e => e.includes('Nome')) && "text-destructive")}>
                          {l.paciente_nome || <span className="italic">faltando</span>}
                        </TableCell>
                        <TableCell className={cn("text-xs font-mono", !ok && v.errors.some(e => e.includes('CNS') || e.includes('CPF')) && "text-destructive")}>
                          <div className="flex flex-col">
                            <span>{pac?.cns || <span className="italic opacity-50">sem cns</span>}</span>
                            <span className="text-[10px] opacity-70">{pac?.cpf || <span className="italic opacity-50">sem cpf</span>}</span>
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-xs", !ok && v.errors.some(e => e.includes('nascimento')) && "text-destructive italic")}>
                          {pac?.data_nascimento ? new Date(pac.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : 'faltando'}
                        </TableCell>
                        <TableCell className="text-xs">{l.profissional_nome}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !ok && v.errors.some(e => e.includes('CBO')) && "text-destructive")}>
                          {prof?.cbo || <span className="italic">faltando</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col">
                            <span>{l.procedimento_nome}</span>
                            {l.fonte_procedimento && l.fonte_procedimento !== 'prontuario' && (
                              <Badge variant="outline" className="text-[8px] h-3 px-1 w-fit bg-amber-50 text-amber-700 border-amber-200 mt-0.5 uppercase">
                                Herança: {l.fonte_procedimento.replace(/_/g, ' ')}
                              </Badge>
                            )}
                            {isMed && !l.codigo_sigtap && (
                              <Badge className="mt-0.5 bg-primary/10 text-primary border-0 text-[9px] w-fit">consulta</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-xs font-mono", !ok && v.errors.some(e => e.includes('SIGTAP')) && "text-destructive")}>
                          <div className="flex flex-col">
                            <span>{l.codigo_sigtap || (isMed ? <Badge variant="outline" className="text-primary border-primary/20 text-[9px] font-normal uppercase">Opcional Médico</Badge> : <span className="italic text-destructive">faltando</span>)}</span>
                            {l.cid && (
                              <span className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <span className="font-semibold text-primary/70">CID:</span> {l.cid}
                                {l.fonte_cid && l.fonte_cid !== 'atendimento' && l.fonte_cid !== 'prontuario' && (
                                  <span className="text-[8px] px-1 bg-amber-50 text-amber-600 border border-amber-100 rounded">
                                    H: {l.fonte_cid.replace(/_/g, ' ')}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </TableCell>


                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {ok ? (
                              <Badge className="bg-success/10 text-success border-0 text-[10px] w-fit">OK</Badge>
                            ) : (
                              <>
                                <Badge className="bg-destructive/10 text-destructive border-0 text-[10px] w-fit">PENDENTE</Badge>
                                <div className="text-[9px] text-destructive leading-tight max-w-[150px]">
                                  {v.errors.map((err, i) => (
                                    <div key={i} className="flex gap-1">
                                      <span>•</span>
                                      <span>{err}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de geração */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar arquivo BPA-I</DialogTitle>
            <DialogDescription>
              Geração de arquivo TXT oficial para importação no BPAMag. Linhas com Nome, CNS/CPF, CBO, CNES ou Data Nasc. ausentes serão marcadas como pendentes. Profissionais médicos possuem dispensa de Procedimento e CID obrigatórios.
            </DialogDescription>

          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Competência (AAAAMM)</Label>
              <Input
                value={modalCompetencia}
                onChange={(e) => setModalCompetencia(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                placeholder="202504"
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={modalUnidade} onValueChange={setModalUnidade}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {unidadesOptions.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CNES da Unidade (7 dígitos) <span className="text-destructive">*</span></Label>
              <Input
                value={modalCnes}
                onChange={(e) => setModalCnes(e.target.value.replace(/\D/g, '').slice(0, 7))}
                maxLength={7}
                placeholder="0000000"
                className={cn(modalCnes.length !== 7 && "border-destructive/50")}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {getCnesFromUnidade(modalUnidade)
                  ? '✓ CNES preenchido automaticamente da unidade'
                  : 'Informe manualmente — a unidade não possui CNES cadastrado'}
              </p>
            </div>

            {/* Preview de validação */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-xs font-medium text-foreground mb-2">Resumo da exportação</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                  <p className="text-lg font-bold">{modalPreview.total}</p>
                </div>
                <div>
                  <p className="text-[10px] text-success">Serão exportados</p>
                  <p className="text-lg font-bold text-success">{modalPreview.validos}</p>
                </div>
                <div>
                  <p className="text-[10px] text-destructive">Pendentes (pulados)</p>
                  <p className="text-lg font-bold text-destructive">{modalPreview.pendentes}</p>
                </div>
              </div>
              {modalPreview.pendentes > 0 && (
                <p className="text-[11px] text-destructive flex flex-col gap-0.5 pt-1">
                  <span className="flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    {modalPreview.pendentes} registro(s) possuem pendências obrigatórias e serão ignorados.
                  </span>
                  <span className="text-[10px] opacity-80 pl-4">
                    Campos obrigatórios: Nome, CNS/CPF, CBO, CNES, SIGTAP (exceto médicos), CID (exceto médicos), Sexo e Município.
                  </span>

                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={generating}>
              Cancelar
            </Button>
            <Button onClick={handleGenerate} disabled={generating} className="bg-primary text-primary-foreground gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Gerar Arquivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BpaProducao;
