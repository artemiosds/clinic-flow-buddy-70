import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import { toast } from "sonner";
import {
  FileText, Users, User, ArrowLeft, Printer, FileDown, CheckCircle,
  Save, Send, ClipboardList, Stethoscope, Heart, Activity, Search
} from "lucide-react";
import { openPrintDocument } from "@/lib/printLayout";
import { fetchProfessionalCarimbo, formatCarimboBlock } from "@/lib/documentSignature";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

/* ── types ─────────────────────────────────────────── */
interface ProfSection {
  profissional_id: string;
  profissional_nome: string;
  profissao: string;
  conselho: string;
  periodo_inicio: string;
  periodo_fim: string;
  sessoes: number;
  objetivos: string;
  intervencoes: string;
  evolucao: string;
  metas_status: "totalmente" | "parcialmente" | "nao_atingidas";
  metas_justificativa: string;
  tecnologia_assistiva: string;
}

type ModoRelatorio = "selector" | "multiprofissional" | "individual";

const MODALIDADES = [
  "Reabilitação Física", "Intelectual", "Auditiva", "Visual", "Ostomia"
];

const MOTIVOS_ALTA = [
  { value: "objetivos_atingidos", label: "Alta por objetivos atingidos" },
  { value: "pedido_usuario", label: "A pedido do usuário/família" },
  { value: "infrequencia", label: "Infrequência/abandono" },
  { value: "encaminhamentos", label: "Encaminhamento para outro serviço" },
  { value: "agravamento", label: "Agravamento clínico" },
  { value: "obito", label: "Óbito" },
];

const ENCAMINHAMENTOS = [
  "APS/UBS", "CAPS", "NASF/eMulti", "Outro CAPS", "Hospital", "Serviço Social", "Escola", "Outro"
];

const NIVEIS_INDEPENDENCIA = [
  "Independente", "Independente com dispositivo", "Dependente parcial", "Dependente total"
];

const FREQUENCIAS_APS = ["Mensal", "Bimestral", "Semestral", "Anual", "Sem necessidade"];

const fmt = (d: string) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
};

const calcIdade = (dn: string) => {
  if (!dn) return "";
  try {
    const b = new Date(dn);
    const diff = Date.now() - b.getTime();
    return `${Math.floor(diff / 31557600000)} anos`;
  } catch { return ""; }
};

const RelatorioAlta: React.FC = () => {
  const { user } = useAuth();
  const { pacientes, funcionarios } = useData();
  const [modo, setModo] = useState<ModoRelatorio>("selector");

  /* ── shared patient selection ─── */
  const [pacienteId, setPacienteId] = useState("");
  const paciente = useMemo(() => pacientes.find(p => p.id === pacienteId), [pacientes, pacienteId]);

  /* ── multiprofissional state ─── */
  const [modalidades, setModalidades] = useState<string[]>([]);
  const [cid10, setCid10] = useState("");
  const [cidDesc, setCidDesc] = useState("");
  const [cifFuncoes, setCifFuncoes] = useState("");
  const [cifAtividades, setCifAtividades] = useState("");
  const [cifFatores, setCifFatores] = useState("");
  const [profSections, setProfSections] = useState<ProfSection[]>([]);
  const [motivoAlta, setMotivoAlta] = useState("");
  const [motivoDetalhe, setMotivoDetalhe] = useState("");
  const [condicaoFuncional, setCondicaoFuncional] = useState("");
  const [nivelIndep, setNivelIndep] = useState("");
  const [orientacoesUsuario, setOrientacoesUsuario] = useState("");
  const [orientacoesUbs, setOrientacoesUbs] = useState("");
  const [encaminhamentos, setEncaminhamentos] = useState<string[]>([]);
  const [freqAps, setFreqAps] = useState("");
  const [dataAlta, setDataAlta] = useState(new Date().toISOString().split("T")[0]);
  const [tabProf, setTabProf] = useState("");

  /* ── individual state ─── */
  const [indDiagCid, setIndDiagCid] = useState("");
  const [indCidDesc, setIndCidDesc] = useState("");
  const [indCif, setIndCif] = useState("");
  const [indObjetivos, setIndObjetivos] = useState("");
  const [indIntervencoes, setIndIntervencoes] = useState("");
  const [indEvolucao, setIndEvolucao] = useState("");
  const [indMetas, setIndMetas] = useState<"totalmente" | "parcialmente" | "nao_atingidas">("totalmente");
  const [indMetasJust, setIndMetasJust] = useState("");
  const [indTA, setIndTA] = useState("");
  const [indMotivo, setIndMotivo] = useState("");
  const [indMotivoDet, setIndMotivoDet] = useState("");
  const [indOrientacoes, setIndOrientacoes] = useState("");
  const [indEncaminhamento, setIndEncaminhamento] = useState("");
  const [indModalidade, setIndModalidade] = useState("");
  const [indDataAlta, setIndDataAlta] = useState(new Date().toISOString().split("T")[0]);
  const [indSessoes, setIndSessoes] = useState(0);
  const [indPeriodoInicio, setIndPeriodoInicio] = useState("");
  const [indPeriodoFim, setIndPeriodoFim] = useState("");

  /* ── CID Search state ─── */
  const [cidSearch, setCidSearch] = useState("");
  const [cidOptions, setCidOptions] = useState<{codigo: string, descricao: string}[]>([]);
  const [isSearchingCid, setIsSearchingCid] = useState(false);

  useEffect(() => {
    if (cidSearch.length < 3) {
      setCidOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingCid(true);
      const { data } = await supabase
        .from('cid10_codigos')
        .select('codigo, descricao')
        .or(`codigo.ilike.%${cidSearch}%,descricao.ilike.%${cidSearch}%`)
        .limit(10);
      if (data) setCidOptions(data);
      setIsSearchingCid(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [cidSearch]);

  /* ── auto-load professional data when patient selected ─── */
  useEffect(() => {
    if (!pacienteId || modo !== "multiprofissional") return;
    loadProfessionalsForPatient(pacienteId);
  }, [pacienteId, modo]);

  useEffect(() => {
    if (!pacienteId || modo !== "individual") return;
    loadIndividualData(pacienteId);
  }, [pacienteId, modo]);

  const loadProfessionalsForPatient = async (pid: string) => {
    // Get all professionals who created prontuarios for this patient
    const { data: pronts } = await supabase
      .from("prontuarios")
      .select("profissional_id, profissional_nome, data_atendimento")
      .eq("paciente_id", pid)
      .order("data_atendimento", { ascending: true });

    if (!pronts || pronts.length === 0) {
      setProfSections([]);
      return;
    }

    // Group by professional
    const profMap = new Map<string, { nome: string; datas: string[] }>();
    pronts.forEach(p => {
      const existing = profMap.get(p.profissional_id);
      if (existing) {
        existing.datas.push(p.data_atendimento);
      } else {
        profMap.set(p.profissional_id, { nome: p.profissional_nome, datas: [p.data_atendimento] });
      }
    });

    // Count sessions from treatment_sessions
    const { data: sessions } = await supabase
      .from("treatment_sessions")
      .select("professional_id, status")
      .eq("patient_id", pid)
      .eq("status", "realizada");

    const sessionCounts = new Map<string, number>();
    sessions?.forEach(s => {
      sessionCounts.set(s.professional_id, (sessionCounts.get(s.professional_id) || 0) + 1);
    });

    const sections: ProfSection[] = [];
    profMap.forEach((val, profId) => {
      const func = funcionarios.find(f => f.id === profId);
      const datas = val.datas.sort();
      sections.push({
        profissional_id: profId,
        profissional_nome: val.nome,
        profissao: func?.profissao || "",
        conselho: func ? `${func.tipoConselho} ${func.numeroConselho}/${func.ufConselho}` : "",
        periodo_inicio: datas[0] || "",
        periodo_fim: datas[datas.length - 1] || "",
        sessoes: sessionCounts.get(profId) || val.datas.length,
        objetivos: "",
        intervencoes: "",
        evolucao: "",
        metas_status: "totalmente",
        metas_justificativa: "",
        tecnologia_assistiva: "",
      });
    });

    setProfSections(sections);
    if (sections.length > 0) setTabProf(sections[0].profissional_id);

    // Pre-fill CID from patient
    const pat = pacientes.find(p => p.id === pid);
    if (pat?.cid) {
      setCid10(pat.cid);
      // Try to find description
      const { data } = await supabase
        .from('cid10_codigos')
        .select('descricao')
        .eq('codigo', pat.cid)
        .maybeSingle();
      if (data) setCidDesc(data.descricao);
    }
  };

  const loadIndividualData = async (pid: string) => {
    if (!user?.id) return;
    const { data: pronts } = await supabase
      .from("prontuarios")
      .select("data_atendimento")
      .eq("paciente_id", pid)
      .eq("profissional_id", user.id)
      .order("data_atendimento", { ascending: true });

    if (pronts && pronts.length > 0) {
      setIndPeriodoInicio(pronts[0].data_atendimento);
      setIndPeriodoFim(pronts[pronts.length - 1].data_atendimento);
    }

    const { data: sessions } = await supabase
      .from("treatment_sessions")
      .select("id")
      .eq("patient_id", pid)
      .eq("professional_id", user.id)
      .eq("status", "realizada");

    setIndSessoes(sessions?.length || pronts?.length || 0);

    const pat = pacientes.find(p => p.id === pid);
    if (pat?.cid) {
      setIndDiagCid(pat.cid);
      const { data } = await supabase
        .from('cid10_codigos')
        .select('descricao')
        .eq('codigo', pat.cid)
        .maybeSingle();
      if (data) setIndCidDesc(data.descricao);
    }
  };

  const updateProfSection = (profId: string, field: keyof ProfSection, value: any) => {
    setProfSections(prev =>
      prev.map(s => s.profissional_id === profId ? { ...s, [field]: value } : s)
    );
  };

  /* ── VALIDATION ─── */
  const validateMulti = (): string[] => {
    const errors: string[] = [];
    if (!pacienteId) errors.push("Selecione um paciente");
    if (!motivoAlta) errors.push("Selecione o motivo da alta");
    if (!nivelIndep) errors.push("Selecione o nível de independência");
    if (modalidades.length === 0) errors.push("Selecione pelo menos uma modalidade");
    profSections.forEach(s => {
      if (s.metas_status !== "totalmente" && !s.metas_justificativa) {
        errors.push(`Justificativa obrigatória para ${s.profissional_nome}`);
      }
    });
    return errors;
  };

  const validateInd = (): string[] => {
    const errors: string[] = [];
    if (!pacienteId) errors.push("Selecione um paciente");
    if (!indMotivo) errors.push("Selecione o motivo da alta");
    if (indMetas !== "totalmente" && !indMetasJust) errors.push("Justificativa de metas obrigatória");
    return errors;
  };

  /* ── PRINT ─── */
  const buildMultiPrintBody = (): string => {
    const p = paciente;
    if (!p) return "";

    let html = `
      <div class="info-grid">
        <div><span class="info-label">Paciente:</span> <span class="info-value">${p.nome}</span></div>
        <div><span class="info-label">CNS:</span> <span class="info-value">${p.cns || "—"}</span></div>
        <div><span class="info-label">CPF:</span> <span class="info-value">${p.cpf || "—"}</span></div>
        <div><span class="info-label">Data Nasc:</span> <span class="info-value">${fmt(p.dataNascimento)} (${calcIdade(p.dataNascimento)})</span></div>
        <div><span class="info-label">Mãe/Resp:</span> <span class="info-value">${p.nomeMae || "—"}</span></div>
        <div><span class="info-label">Data Alta:</span> <span class="info-value">${fmt(dataAlta)}</span></div>
        <div style="grid-column: span 2;"><span class="info-label">Modalidades:</span> <span class="info-value">${modalidades.join(", ") || "—"}</span></div>
      </div>

      <div class="section">
        <div class="section-title">1. Diagnóstico e Funcionalidade</div>
        <div class="field">
          <span class="field-label">CID-10:</span>
          <div class="field-value"><strong>${cid10}</strong> ${cidDesc ? ` — ${cidDesc}` : ""}</div>
        </div>
        ${cifFuncoes ? `<div class="field"><span class="field-label">CIF — Funções do Corpo:</span><div class="field-value">${cifFuncoes}</div></div>` : ""}
        ${cifAtividades ? `<div class="field"><span class="field-label">CIF — Atividades e Participação:</span><div class="field-value">${cifAtividades}</div></div>` : ""}
        ${cifFatores ? `<div class="field"><span class="field-label">CIF — Fatores Ambientais:</span><div class="field-value">${cifFatores}</div></div>` : ""}
      </div>

      <div class="section-title">2. Evolução por Área / Especialidade</div>
    `;

    profSections.forEach(s => {
      html += `
        <div style="margin-bottom: 20px; border: 1px solid #e2e8f0; padding: 12px; border-radius: 4px; page-break-inside: avoid;">
          <h3 style="color: #0369a1; font-size: 11pt; margin-top: 0; border-bottom: 1px solid #bae6fd; padding-bottom: 4px;">
            ${s.profissao || "Profissional"} — ${s.profissional_nome}
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; font-size: 9pt;">
            <div><strong>Período:</strong> ${fmt(s.periodo_inicio)} a ${fmt(s.periodo_fim)}</div>
            <div><strong>Total de Sessões:</strong> ${s.sessoes}</div>
          </div>
          
          ${s.objetivos ? `<div class="field"><span class="field-label">Objetivos Terapêuticos:</span><div class="field-value">${s.objetivos}</div></div>` : ""}
          ${s.intervencoes ? `<div class="field"><span class="field-label">Intervenções / Procedimentos:</span><div class="field-value">${s.intervencoes}</div></div>` : ""}
          ${s.evolucao ? `<div class="field"><span class="field-label">Evolução Clínica e Funcional:</span><div class="field-value">${s.evolucao}</div></div>` : ""}
          
          <div class="field">
            <span class="field-label">Metas:</span>
            <div class="field-value">
              ${s.metas_status === "totalmente" ? "Totalmente atingidas" : s.metas_status === "parcialmente" ? "Parcialmente atingidas" : "Não atingidas"}
              ${s.metas_justificativa ? `<br/><small>Justificativa: ${s.metas_justificativa}</small>` : ""}
            </div>
          </div>
          ${s.tecnologia_assistiva ? `<div class="field"><span class="field-label">Tecnologia Assistiva Concedida:</span><div class="field-value">${s.tecnologia_assistiva}</div></div>` : ""}
          
          <div class="signature" style="margin-top:15px; text-align: right;">
            <div class="signature-line" style="margin-left: auto; margin-right: 0; width: 220px;"></div>
            <div class="name" style="font-size: 9pt;">${s.profissional_nome}</div>
            <div class="role" style="font-size: 8pt;">${s.profissao} — ${s.conselho}</div>
          </div>
        </div>
      `;
    });

    const motivoLabel = MOTIVOS_ALTA.find(m => m.value === motivoAlta)?.label || motivoAlta;
    html += `
      <div class="section">
        <div class="section-title">3. Motivo da Alta e Condição Final</div>
        <div class="field">
          <span class="field-label">Motivo da Alta:</span>
          <div class="field-value">${motivoLabel}${motivoDetalhe ? ` — ${motivoDetalhe}` : ""}</div>
        </div>
        <div class="field">
          <span class="field-label">Condição Funcional na Alta:</span>
          <div class="field-value">${condicaoFuncional || "—"}</div>
        </div>
        <div class="field">
          <span class="field-label">Nível de Independência:</span>
          <div class="field-value">${nivelIndep || "—"}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">4. Orientações e Encaminhamentos</div>
        ${orientacoesUsuario ? `<div class="field"><span class="field-label">Orientações ao Usuário/Família:</span><div class="field-value">${orientacoesUsuario}</div></div>` : ""}
        ${orientacoesUbs ? `<div class="field"><span class="field-label">Orientações para UBS/ESF:</span><div class="field-value">${orientacoesUbs}</div></div>` : ""}
        ${encaminhamentos.length > 0 ? `<div class="field"><span class="field-label">Encaminhamentos Efetuados:</span><div class="field-value">${encaminhamentos.join(", ")}</div></div>` : ""}
        ${freqAps ? `<div class="field"><span class="field-label">Frequência Recomendada na APS:</span><div class="field-value">${freqAps}</div></div>` : ""}
      </div>

      <div style="margin-top: 40px; display: flex; justify-content: center; page-break-inside: avoid;">
        <div class="signature">
          <div class="signature-line" style="width: 300px;"></div>
          <div class="name">Responsável Técnico / Coordenação</div>
          <div class="role">CER II — Oriximiná-PA</div>
        </div>
      </div>
    `;

    return html;
  };

  const buildIndPrintBody = async (): Promise<string> => {
    const p = paciente;
    if (!p) return "";
    const func = funcionarios.find(f => f.id === user?.id);
    const profId = user?.id || "";
    const profNome = user?.nome || "";
    const carimbo = await fetchProfessionalCarimbo(supabase, profId);
    const carimboHtml = formatCarimboBlock(carimbo);
    const profissao = func?.profissao || user?.cargo || "";
    const conselho = func ? `${func.tipoConselho} ${func.numeroConselho}/${func.ufConselho}` : "";
    const motivoLabel = MOTIVOS_ALTA.find(m => m.value === indMotivo)?.label || indMotivo;

    return `
      <div class="info-grid">
        <div><span class="info-label">Paciente:</span> <span class="info-value">${p.nome}</span></div>
        <div><span class="info-label">CNS:</span> <span class="info-value">${p.cns || "—"}</span></div>
        <div><span class="info-label">CPF:</span> <span class="info-value">${p.cpf || "—"}</span></div>
        <div><span class="info-label">Data Nasc:</span> <span class="info-value">${fmt(p.dataNascimento)} (${calcIdade(p.dataNascimento)})</span></div>
        <div><span class="info-label">Profissional:</span> <span class="info-value">${profNome}</span></div>
        <div><span class="info-label">Conselho:</span> <span class="info-value">${conselho}</span></div>
        <div><span class="info-label">Data de Alta:</span> <span class="info-value">${fmt(indDataAlta)}</span></div>
        <div><span class="info-label">Modalidade:</span> <span class="info-value">${indModalidade || "—"}</span></div>
      </div>

      <div class="section">
        <div class="section-title">1. Diagnóstico e Atendimento</div>
        <div class="field">
          <span class="field-label">CID-10:</span>
          <div class="field-value"><strong>${indDiagCid}</strong> ${indCidDesc ? ` — ${indCidDesc}` : ""}</div>
        </div>
        ${indCif ? `<div class="field"><span class="field-label">CIF:</span><div class="field-value">${indCif}</div></div>` : ""}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
          <div><strong>Período de Acompanhamento:</strong> ${fmt(indPeriodoInicio)} a ${fmt(indPeriodoFim)}</div>
          <div><strong>Sessões Realizadas:</strong> ${indSessoes}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">2. Evolução Clínica e Funcional</div>
        ${indObjetivos ? `<div class="field"><span class="field-label">Objetivos Terapêuticos:</span><div class="field-value">${indObjetivos}</div></div>` : ""}
        ${indIntervencoes ? `<div class="field"><span class="field-label">Intervenções / Procedimentos:</span><div class="field-value">${indIntervencoes}</div></div>` : ""}
        ${indEvolucao ? `<div class="field"><span class="field-label">Evolução Clínica e Funcional:</span><div class="field-value">${indEvolucao}</div></div>` : ""}
        <div class="field">
          <span class="field-label">Metas:</span>
          <div class="field-value">
            ${indMetas === "totalmente" ? "Totalmente atingidas" : indMetas === "parcialmente" ? "Parcialmente atingidas" : "Não atingidas"}
            ${indMetasJust ? `<br/><small>Justificativa: ${indMetasJust}</small>` : ""}
          </div>
        </div>
        ${indTA ? `<div class="field"><span class="field-label">Tecnologia Assistiva:</span><div class="field-value">${indTA}</div></div>` : ""}
      </div>

      <div class="section">
        <div class="section-title">3. Conclusão e Orientações</div>
        <div class="field">
          <span class="field-label">Motivo da Alta:</span>
          <div class="field-value">${motivoLabel}${indMotivoDet ? ` — ${indMotivoDet}` : ""}</div>
        </div>
        ${indOrientacoes ? `<div class="field"><span class="field-label">Orientações:</span><div class="field-value">${indOrientacoes}</div></div>` : ""}
        ${indEncaminhamento ? `<div class="field"><span class="field-label">Encaminhamentos:</span><div class="field-value">${indEncaminhamento}</div></div>` : ""}
      </div>

      <div class="doc-sign-footer" style="margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div class="signature" style="flex: 1;">
          <div class="signature-line" style="width: 280px; border-top: 1px solid #000; margin-bottom: 5px;"></div>
          <div class="name" style="font-weight: 700;">${profNome}</div>
          <div class="role">${profissao} — ${conselho}</div>
        </div>
        <div class="carimbo-block" style="flex: 0 0 auto; text-align: right;">
          ${carimboHtml}
        </div>
      </div>
    `;
  };

  const handlePrint = (type: "multi" | "individual") => {
    if (type === "multi") {
      const errs = validateMulti();
      if (errs.length > 0) { toast.error(errs[0]); return; }
      openPrintDocument("Relatório de Alta Multiprofissional", buildMultiPrintBody(), {
        "Paciente": paciente?.nome || "",
        "Data de Alta": fmt(dataAlta)
      });
    } else {
      const errs = validateInd();
      if (errs.length > 0) { toast.error(errs[0]); return; }
      const func = funcionarios.find(f => f.id === user?.id);
      openPrintDocument(
        `Relatório de Alta — ${func?.profissao || "Individual"}`,
        buildIndPrintBody(),
        {
          "Paciente": paciente?.nome || "",
          "Data de Alta": fmt(indDataAlta)
        }
      );
    }
  };

  const handleSave = async (type: "multi" | "individual") => {
    if (!pacienteId || !user?.id) { toast.error("Selecione um paciente"); return; }

    const errs = type === "multi" ? validateMulti() : validateInd();
    if (errs.length > 0) { toast.error(errs[0]); return; }

    const unidade = user?.unidadeId || "";
    const dataAlt = type === "multi" ? dataAlta : indDataAlta;

    const dataObj = type === "multi" ? {
      modalidades, cid10, cidDesc, cifFuncoes, cifAtividades, cifFatores,
      profissionais: profSections, motivoAlta, motivoDetalhe,
      condicaoFuncional, nivelIndep, orientacoesUsuario, orientacoesUbs,
      encaminhamentos, freqAps, dataAlta,
      pacienteNome: paciente?.nome,
      pacienteCns: paciente?.cns,
      pacienteCpf: paciente?.cpf,
      dataNascimento: paciente?.dataNascimento,
    } : {
      diagCid: indDiagCid, cidDesc: indCidDesc, cif: indCif, objetivos: indObjetivos,
      intervencoes: indIntervencoes, evolucao: indEvolucao,
      metas: indMetas, metasJust: indMetasJust, ta: indTA,
      motivo: indMotivo, motivoDet: indMotivoDet,
      orientacoes: indOrientacoes, encaminhamento: indEncaminhamento,
      modalidade: indModalidade, sessoes: indSessoes,
      periodoInicio: indPeriodoInicio, periodoFim: indPeriodoFim, dataAlta: indDataAlta,
      pacienteNome: paciente?.nome,
      pacienteCns: paciente?.cns,
      pacienteCpf: paciente?.cpf,
      dataNascimento: paciente?.dataNascimento,
    };

    const record = {
      paciente_id: pacienteId,
      paciente_nome: paciente?.nome || "",
      profissional_id: user.id,
      profissional_nome: user.nome || "",
      unidade_id: unidade,
      data_atendimento: dataAlt,
      tipo_registro: type === "multi" ? "alta_multiprofissional" : "alta_individual",
      observacoes: JSON.stringify(dataObj),
      evolucao: type === "multi"
        ? `RELATÓRIO DE ALTA MULTIPROFISSIONAL: ${MOTIVOS_ALTA.find(m => m.value === motivoAlta)?.label || ""}`
        : `RELATÓRIO DE ALTA INDIVIDUAL: ${MOTIVOS_ALTA.find(m => m.value === indMotivo)?.label || ""}`,
    };

    const { error } = await supabase.from("prontuarios").insert(record);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Relatório de alta salvo no prontuário");
    }
  };

  const BuscaCIDField = ({ value, onChange, descValue, onDescChange }: { value: string, onChange: (v: string) => void, descValue: string, onDescChange: (v: string) => void }) => (
    <div className="space-y-1">
      <Label className="text-xs">CID-10</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between h-8 text-sm font-normal px-2">
            <span className="truncate">{value ? `${value} - ${descValue || '...'}` : "Buscar CID-10..."}</span>
            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Digite o código ou descrição (mín. 3 letras)..." 
              onValueChange={setCidSearch}
            />
            <CommandList>
              {isSearchingCid && <div className="p-4 text-center text-sm text-muted-foreground">Buscando...</div>}
              {!isSearchingCid && cidOptions.length === 0 && cidSearch.length >= 3 && <CommandEmpty>Nenhum CID encontrado.</CommandEmpty>}
              <CommandGroup>
                {cidOptions.map((opt) => (
                  <CommandItem
                    key={opt.codigo}
                    value={opt.codigo}
                    onSelect={() => {
                      onChange(opt.codigo);
                      onDescChange(opt.descricao);
                      setCidOptions([]);
                      setCidSearch("");
                    }}
                  >
                    <span className="font-bold mr-2">{opt.codigo}</span>
                    <span className="truncate">{opt.descricao}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );

  /* ── MODE SELECTOR ─── */
  if (modo === "selector") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Relatório de Alta — CAPS II
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Selecione o tipo de relatório que deseja gerar
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
          <Card
            className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group"
            onClick={() => setModo("multiprofissional")}
          >
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Relatório Multiprofissional</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Toda a equipe em um documento consolidado. Cada profissional preenche sua seção.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">Consolidado</Badge>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group"
            onClick={() => setModo("individual")}
          >
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <User className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Relatório Individual</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Por profissional separado, independente dos demais membros da equipe.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">Por profissional</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ═══ MULTIPROFISSIONAL ═══ */
  if (modo === "multiprofissional") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setModo("selector")}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Relatório de Alta — Multiprofissional
            </h1>
            <p className="text-xs text-muted-foreground">Documento consolidado de toda a equipe</p>
          </div>
        </div>

        {/* Patient selection */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4" /> 1. Identificação do Paciente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <BuscaPaciente
              pacientes={pacientes}
              value={pacienteId}
              onChange={setPacienteId}
            />
            {paciente && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-muted/50 rounded-lg p-3">
                <div><span className="text-muted-foreground text-xs block">Nome</span><strong>{paciente.nome}</strong></div>
                <div><span className="text-muted-foreground text-xs block">Data Nasc.</span>{fmt(paciente.dataNascimento)} ({calcIdade(paciente.dataNascimento)})</div>
                <div><span className="text-muted-foreground text-xs block">CNS</span>{paciente.cns || "—"}</div>
                <div><span className="text-muted-foreground text-xs block">CPF</span>{paciente.cpf || "—"}</div>
                <div><span className="text-muted-foreground text-xs block">Responsável</span>{paciente.nomeMae || "—"}</div>
                <div><span className="text-muted-foreground text-xs block">Admissão</span>{fmt(paciente.criadoEm || "")}</div>
                <div>
                  <Label className="text-xs">Data de Alta</Label>
                  <Input type="date" value={dataAlta} onChange={e => setDataAlta(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs font-semibold mb-2 block">Modalidades Atendidas</Label>
              <div className="flex flex-wrap gap-3">
                {MODALIDADES.map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={modalidades.includes(m)}
                      onCheckedChange={c => setModalidades(prev => c ? [...prev, m] : prev.filter(x => x !== m))}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="w-4 h-4" /> 2. Diagnóstico</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <BuscaCIDField 
              value={cid10} 
              onChange={setCid10} 
              descValue={cidDesc} 
              onDescChange={setCidDesc} 
            />
            <div>
              <Label className="text-xs">CIF — Funções do Corpo</Label>
              <Textarea value={cifFuncoes} onChange={e => setCifFuncoes(e.target.value)} rows={2} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">CIF — Atividades e Participação</Label>
              <Textarea value={cifAtividades} onChange={e => setCifAtividades(e.target.value)} rows={2} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">CIF — Fatores Ambientais</Label>
              <Textarea value={cifFatores} onChange={e => setCifFatores(e.target.value)} rows={2} className="text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Professional sections */}
        {profSections.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> 3. Seções por Profissional</CardTitle></CardHeader>
            <CardContent>
              <Tabs value={tabProf} onValueChange={setTabProf}>
                <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                  {profSections.map(s => (
                    <TabsTrigger key={s.profissional_id} value={s.profissional_id} className="text-xs">
                      {s.profissao || s.profissional_nome}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {profSections.map(s => (
                  <TabsContent key={s.profissional_id} value={s.profissional_id} className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/30 p-3 rounded-lg text-sm">
                      <div><span className="text-muted-foreground text-xs block">Profissional</span><strong>{s.profissional_nome}</strong></div>
                      <div><span className="text-muted-foreground text-xs block">Profissão</span>{s.profissao || "—"}</div>
                      <div><span className="text-muted-foreground text-xs block">Período</span>{fmt(s.periodo_inicio)} a {fmt(s.periodo_fim)}</div>
                      <div><span className="text-muted-foreground text-xs block">Sessões</span>{s.sessoes}</div>
                    </div>
                    <div>
                      <Label className="text-xs">Objetivos Terapêuticos Iniciais</Label>
                      <Textarea value={s.objetivos} onChange={e => updateProfSection(s.profissional_id, "objetivos", e.target.value)} rows={3} className="text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Intervenções/Procedimentos Realizados</Label>
                      <Textarea value={s.intervencoes} onChange={e => updateProfSection(s.profissional_id, "intervencoes", e.target.value)} rows={3} className="text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Evolução Clínica e Funcional</Label>
                      <Textarea value={s.evolucao} onChange={e => updateProfSection(s.profissional_id, "evolucao", e.target.value)} rows={3} className="text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Metas Atingidas</Label>
                      <Select value={s.metas_status} onValueChange={v => updateProfSection(s.profissional_id, "metas_status", v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="totalmente">Totalmente atingidas</SelectItem>
                          <SelectItem value="parcialmente">Parcialmente atingidas</SelectItem>
                          <SelectItem value="nao_atingidas">Não atingidas</SelectItem>
                        </SelectContent>
                      </Select>
                      {s.metas_status !== "totalmente" && (
                        <Textarea
                          value={s.metas_justificativa}
                          onChange={e => updateProfSection(s.profissional_id, "metas_justificativa", e.target.value)}
                          placeholder="Justificativa obrigatória..."
                          rows={2} className="text-sm mt-2"
                        />
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Tecnologia Assistiva Concedida</Label>
                      <Input value={s.tecnologia_assistiva} onChange={e => updateProfSection(s.profissional_id, "tecnologia_assistiva", e.target.value)} placeholder="Órteses, próteses, AASI, cadeira de rodas..." className="h-8 text-sm" />
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                      Assinatura: {s.profissional_nome} — {s.conselho}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Reason & condition */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Heart className="w-4 h-4" /> 4. Motivo da Alta e Condição Funcional</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Motivo da Alta *</Label>
                <Select value={motivoAlta} onValueChange={setMotivoAlta}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_ALTA.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(motivoAlta === "infrequencia" || motivoAlta === "encaminhamentos" || motivoAlta === "obito") && (
                  <Input value={motivoDetalhe} onChange={e => setMotivoDetalhe(e.target.value)}
                    placeholder={motivoAlta === "infrequencia" ? "Nº de faltas" : motivoAlta === "obito" ? "Data do óbito" : "Qual serviço?"}
                    className="h-8 text-sm mt-2" />
                )}
              </div>
              <div>
                <Label className="text-xs">Nível de Independência *</Label>
                <Select value={nivelIndep} onValueChange={setNivelIndep}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {NIVEIS_INDEPENDENCIA.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Condição Funcional na Alta</Label>
              <Textarea value={condicaoFuncional} onChange={e => setCondicaoFuncional(e.target.value)} rows={3} className="text-sm" placeholder="Descrição do estado funcional atual..." />
            </div>
          </CardContent>
        </Card>

        {/* Post-discharge plan */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Send className="w-4 h-4" /> 5. Plano Pós-Alta</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Orientações para Usuário e Família</Label>
              <Textarea value={orientacoesUsuario} onChange={e => setOrientacoesUsuario(e.target.value)} rows={3} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Orientações para UBS/ESF de Referência</Label>
              <Textarea value={orientacoesUbs} onChange={e => setOrientacoesUbs(e.target.value)} rows={3} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-2 block">Encaminhamentos</Label>
              <div className="flex flex-wrap gap-3">
                {ENCAMINHAMENTOS.map(e => (
                  <label key={e} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={encaminhamentos.includes(e)}
                      onCheckedChange={c => setEncaminhamentos(prev => c ? [...prev, e] : prev.filter(x => x !== e))}
                    />
                    {e}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Frequência Recomendada na APS</Label>
              <Select value={freqAps} onValueChange={setFreqAps}>
                <SelectTrigger className="h-8 text-sm w-48"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIAS_APS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 sticky bottom-0 bg-background py-3 border-t border-border">
          <Button variant="outline" onClick={() => {
            const errs = validateMulti();
            if (errs.length > 0) { errs.forEach(e => toast.error(e)); return; }
            toast.success("Todos os campos obrigatórios estão preenchidos");
          }}>
            <CheckCircle className="w-4 h-4 mr-1" /> Validar
          </Button>
          <Button variant="outline" onClick={() => handlePrint("multi")}>
            <Printer className="w-4 h-4 mr-1" /> Imprimir
          </Button>
          <Button variant="outline" onClick={() => handlePrint("multi")}>
            <FileDown className="w-4 h-4 mr-1" /> Gerar PDF
          </Button>
          <Button onClick={() => handleSave("multi")}>
            <Save className="w-4 h-4 mr-1" /> Salvar no Prontuário
          </Button>
        </div>
      </div>
    );
  }

  /* ═══ INDIVIDUAL ═══ */
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setModo("selector")}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Relatório de Alta — Individual
          </h1>
          <p className="text-xs text-muted-foreground">Relatório individual do profissional logado</p>
        </div>
      </div>

      {/* Patient + Professional info */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">1. Identificação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <BuscaPaciente pacientes={pacientes} value={pacienteId} onChange={setPacienteId} />
          {paciente && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-muted/50 rounded-lg p-3">
              <div><span className="text-muted-foreground text-xs block">Paciente</span><strong>{paciente.nome}</strong></div>
              <div><span className="text-muted-foreground text-xs block">Data Nasc.</span>{fmt(paciente.dataNascimento)} ({calcIdade(paciente.dataNascimento)})</div>
              <div><span className="text-muted-foreground text-xs block">CNS</span>{paciente.cns || "—"}</div>
              <div><span className="text-muted-foreground text-xs block">CPF</span>{paciente.cpf || "—"}</div>
              <div><span className="text-muted-foreground text-xs block">Profissional</span>{user?.nome}</div>
              <div><span className="text-muted-foreground text-xs block">Profissão</span>{funcionarios.find(f => f.id === user?.id)?.profissao || "—"}</div>
              <div><span className="text-muted-foreground text-xs block">Período</span>{fmt(indPeriodoInicio)} a {fmt(indPeriodoFim)}</div>
              <div><span className="text-muted-foreground text-xs block">Sessões</span>{indSessoes}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data de Alta</Label>
              <Input type="date" value={indDataAlta} onChange={e => setIndDataAlta(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Modalidade</Label>
              <Select value={indModalidade} onValueChange={setIndModalidade}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {MODALIDADES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diagnosis */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">2. Diagnóstico</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <BuscaCIDField 
            value={indDiagCid} 
            onChange={setIndDiagCid} 
            descValue={indCidDesc} 
            onDescChange={setIndCidDesc} 
          />
          <div>
            <Label className="text-xs">CIF</Label>
            <Textarea value={indCif} onChange={e => setIndCif(e.target.value)} rows={2} className="text-sm" />
          </div>
        </CardContent>
      </Card>

      {/* Clinical */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">3. Evolução Clínica</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Objetivos Terapêuticos Iniciais</Label>
            <Textarea value={indObjetivos} onChange={e => setIndObjetivos(e.target.value)} rows={3} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">Intervenções/Procedimentos Realizados</Label>
            <Textarea value={indIntervencoes} onChange={e => setIndIntervencoes(e.target.value)} rows={3} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">Evolução Clínica e Funcional</Label>
            <Textarea value={indEvolucao} onChange={e => setIndEvolucao(e.target.value)} rows={3} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">Metas Atingidas</Label>
            <Select value={indMetas} onValueChange={v => setIndMetas(v as any)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="totalmente">Totalmente atingidas</SelectItem>
                <SelectItem value="parcialmente">Parcialmente atingidas</SelectItem>
                <SelectItem value="nao_atingidas">Não atingidas</SelectItem>
              </SelectContent>
            </Select>
            {indMetas !== "totalmente" && (
              <Textarea value={indMetasJust} onChange={e => setIndMetasJust(e.target.value)} placeholder="Justificativa obrigatória..." rows={2} className="text-sm mt-2" />
            )}
          </div>
          <div>
            <Label className="text-xs">Tecnologia Assistiva Concedida</Label>
            <Input value={indTA} onChange={e => setIndTA(e.target.value)} placeholder="Órteses, próteses, AASI..." className="h-8 text-sm" />
          </div>
        </CardContent>
      </Card>

      {/* Discharge */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">4. Alta e Orientações</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Motivo da Alta *</Label>
            <Select value={indMotivo} onValueChange={setIndMotivo}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {MOTIVOS_ALTA.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {(indMotivo === "infrequencia" || indMotivo === "encaminhamentos" || indMotivo === "obito") && (
              <Input value={indMotivoDet} onChange={e => setIndMotivoDet(e.target.value)}
                placeholder={indMotivo === "infrequencia" ? "Nº de faltas" : indMotivo === "obito" ? "Data do óbito" : "Qual serviço?"}
                className="h-8 text-sm mt-2" />
            )}
          </div>
          <div>
            <Label className="text-xs">Orientações Específicas</Label>
            <Textarea value={indOrientacoes} onChange={e => setIndOrientacoes(e.target.value)} rows={3} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">Encaminhamentos</Label>
            <Textarea value={indEncaminhamento} onChange={e => setIndEncaminhamento(e.target.value)} rows={2} className="text-sm" placeholder="Descreva os encaminhamentos..." />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 sticky bottom-0 bg-background py-3 border-t border-border">
        <Button variant="outline" onClick={() => {
          const errs = validateInd();
          if (errs.length > 0) { errs.forEach(e => toast.error(e)); return; }
          toast.success("Todos os campos obrigatórios estão preenchidos");
        }}>
          <CheckCircle className="w-4 h-4 mr-1" /> Validar
        </Button>
        <Button variant="outline" onClick={() => handlePrint("individual")}>
          <Printer className="w-4 h-4 mr-1" /> Imprimir
        </Button>
        <Button variant="outline" onClick={() => handlePrint("individual")}>
          <FileDown className="w-4 h-4 mr-1" /> Gerar PDF
        </Button>
        <Button onClick={() => handleSave("individual")}>
          <Save className="w-4 h-4 mr-1" /> Salvar no Prontuário
        </Button>
      </div>
    </div>
  );
};

export default RelatorioAlta;
