import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, FileText, ChevronDown, ChevronUp, Activity, AlertTriangle, RefreshCw, Eye, FileSignature, History, MoreVertical, Printer, Download, Link2, FileDown, Paperclip, Calendar, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import PacienteDocumentos from "./PacienteDocumentos";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import HistoricoCompletoModal from "@/components/HistoricoCompletoModal";
import GerarDocumentoModal from "@/components/GerarDocumentoModal";
import { buildInstitutionalCSS, openPrintDocument, docHeader, docFooter } from "@/lib/printLayout";
import { AcolhimentoView } from "./prontuario/AcolhimentoView";

interface ProntuarioItem {
  id: string;
  data_atendimento: string;
  hora_atendimento: string;
  profissional_nome: string;
  profissional_id: string;
  queixa_principal: string;
  evolucao: string;
  conduta: string;
  indicacao_retorno: string;
  procedimentos_texto: string;
  outro_procedimento: string;
  unidade_id: string;
  episodio_id: string | null;
  tipo_registro: string;
  observacoes: string;
  dados_acolhimento?: any;
  custom_data?: any;
  soap_subjetivo?: string;
  soap_objetivo?: string;
  soap_avaliacao?: string;
  soap_plano?: string;
  prescricao?: string;
  solicitacao_exames?: string;
}

interface EpisodioItem {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  data_inicio: string;
  data_fim: string | null;
  profissional_nome: string;
  descricao: string;
}

interface Props {
  pacienteId: string;
  pacienteNome: string;
  currentProfissionalId?: string;
  unidades: { id: string; nome: string }[];
}

function formatDateBR(isoDate: string): string {
  if (!isoDate) return "—";
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("pt-BR");
}

const Section: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="mb-4">
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">{label}</p>
    <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed border-l-2 border-primary/30 pl-3 py-2 bg-muted/40 rounded-r-lg ring-1 ring-border/50 shadow-sm">
      {value || "—"}
    </div>
  </div>
);

const renderContent = (item: ProntuarioItem) => {
  if (item.tipo_registro === "alta_individual" || item.tipo_registro === "alta_multiprofissional") {
    try {
      const data = JSON.parse(item.observacoes);
      if (item.tipo_registro === "alta_individual") {
        return (
          <div className="space-y-4">
            <Badge variant="outline" className="mb-2 bg-primary/10 text-primary border-primary/20">RELATÓRIO DE ALTA INDIVIDUAL</Badge>
            <div className="grid grid-cols-2 gap-4 text-xs bg-muted/30 p-3 rounded-lg">
              <div><span className="text-muted-foreground block uppercase font-bold text-[10px]">CID-10</span>{data.diagCid} {data.cidDesc && `- ${data.cidDesc}`}</div>
              <div><span className="text-muted-foreground block uppercase font-bold text-[10px]">Período</span>{formatDateBR(data.periodoInicio)} a {formatDateBR(data.periodoFim)}</div>
              <div><span className="text-muted-foreground block uppercase font-bold text-[10px]">Sessões</span>{data.sessoes}</div>
              <div><span className="text-muted-foreground block uppercase font-bold text-[10px]">Modalidade</span>{data.modalidade}</div>
            </div>
            {data.objetivos && <Section label="Objetivos Terapêuticos" value={data.objetivos} />}
            {data.intervencoes && <Section label="Intervenções / Procedimentos" value={data.intervencoes} />}
            {data.evolucao && <Section label="Evolução Clínica e Funcional" value={data.evolucao} />}
            <div className="grid grid-cols-2 gap-4">
              <Section label="Metas" value={data.metas === "totalmente" ? "Totalmente atingidas" : data.metas === "parcialmente" ? "Parcialmente atingidas" : "Não atingidas"} />
              {data.ta && <Section label="Tecnologia Assistiva" value={data.ta} />}
            </div>
            <Section label="Motivo da Alta" value={data.motivo} />
            {data.orientacoes && <Section label="Orientações" value={data.orientacoes} />}
          </div>
        );
      } else {
        return (
          <div className="space-y-4">
            <Badge variant="outline" className="mb-2 bg-primary/10 text-primary border-primary/20">RELATÓRIO DE ALTA MULTIPROFISSIONAL</Badge>
            <div className="grid grid-cols-2 gap-4 text-xs bg-muted/30 p-3 rounded-lg">
              <div><span className="text-muted-foreground block uppercase font-bold text-[10px]">CID-10</span>{data.cid10} {data.cidDesc && `- ${data.cidDesc}`}</div>
              <div><span className="text-muted-foreground block uppercase font-bold text-[10px]">Modalidades</span>{data.modalidades?.join(', ')}</div>
              <div><span className="text-muted-foreground block uppercase font-bold text-[10px]">Nível Independência</span>{data.nivelIndep}</div>
              <div><span className="text-muted-foreground block uppercase font-bold text-[10px]">Motivo Alta</span>{data.motivoAlta}</div>
            </div>
            
            <div className="space-y-4 mt-4">
              <h4 className="text-xs font-bold uppercase border-b pb-1">Seções Profissionais</h4>
              {data.profissionais?.map((prof: any) => (
                <div key={prof.profissional_id} className="border rounded-md p-3 space-y-2 bg-background/50">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-sm text-primary">{prof.profissional_nome}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{prof.profissao} — {prof.conselho}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{prof.sessoes} sessões</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground"><strong>Evolução:</strong> {prof.evolucao}</p>
                </div>
              ))}
            </div>

            {data.condicaoFuncional && <Section label="Condição Funcional" value={data.condicaoFuncional} />}
            {data.orientacoesUsuario && <Section label="Orientações ao Usuário/Família" value={data.orientacoesUsuario} />}
          </div>
        );
      }
    } catch (e) {
      console.error("Erro ao processar JSON de relatório de alta:", e);
      return <div className="p-4 bg-destructive/10 text-destructive rounded-md">Erro ao carregar dados estruturados do relatório.</div>;
    }
  }

  if (item.tipo_registro === "oficina_terapeutica") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 uppercase font-bold text-[10px] tracking-widest px-2 py-0.5">
            Grupo / Oficina Terapêutica
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-indigo-50/30 p-3 rounded-lg border border-indigo-100/50">
          <div>
            <span className="text-muted-foreground block uppercase font-bold text-[9px] tracking-wider mb-0.5">Tema</span>
            <span className="text-sm font-semibold text-indigo-900">{item.custom_data?.tema || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block uppercase font-bold text-[9px] tracking-wider mb-0.5">Tipo de Atividade</span>
            <span className="text-sm font-semibold text-indigo-900">{item.custom_data?.tipo_atividade || "—"}</span>
          </div>
        </div>
        {item.evolucao && (
          <div className="space-y-1">
            <span className="text-muted-foreground block uppercase font-bold text-[9px] tracking-wider px-1">Evolução do Paciente no Grupo</span>
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed border-l-2 border-indigo-400/50 pl-3 py-2 bg-white/50 rounded-r-lg ring-1 ring-indigo-100 shadow-sm italic">
              {item.evolucao}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {item.dados_acolhimento && <AcolhimentoView data={item.dados_acolhimento} />}
      {item.queixa_principal && <Section label="Queixa principal" value={item.queixa_principal} />}
      {item.soap_subjetivo && <Section label="S — Subjetivo" value={item.soap_subjetivo} />}
      {item.soap_objetivo && <Section label="O — Objetivo" value={item.soap_objetivo} />}
      {item.soap_avaliacao && <Section label="A — Avaliação" value={item.soap_avaliacao} />}
      {item.soap_plano && <Section label="P — Plano" value={item.soap_plano} />}
      {item.evolucao && !item.soap_subjetivo && <Section label="Evolução" value={item.evolucao} />}
      {item.conduta && <Section label="Conduta" value={item.conduta} />}
      {item.procedimentos_texto && <Section label="Procedimentos" value={item.procedimentos_texto} />}
      {item.outro_procedimento && <Section label="Outro procedimento" value={item.outro_procedimento} />}
      {item.prescricao && (
        <div className="mb-4">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">Prescrição / Medicamentos</p>
          <div className="text-sm border-l-2 border-primary/30 pl-3 py-2 bg-muted/40 rounded-r-lg ring-1 ring-border/50 shadow-sm space-y-1.5">
            {(() => {
              try {
                const parsed = JSON.parse(item.prescricao);
                const meds = parsed.medicamentos || (Array.isArray(parsed) ? parsed : null);
                if (Array.isArray(meds)) {
                  return meds.map((m: any, i: number) => (
                    <div key={i} className="text-xs">
                      <span className="font-bold text-primary">{m.nome}</span> {m.dosagem ? `— ${m.dosagem}` : ''} {m.posologia ? `| ${m.posologia}` : ''}
                    </div>
                  ));
                }
              } catch (e) {}
              return <div className="text-sm whitespace-pre-wrap">{item.prescricao}</div>;
            })()}
          </div>
        </div>
      )}
      {item.solicitacao_exames && (
        <div className="mb-4">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">Exames Solicitados</p>
          <div className="text-sm border-l-2 border-primary/30 pl-3 py-2 bg-muted/40 rounded-r-lg ring-1 ring-border/50 shadow-sm space-y-1.5">
            {(() => {
              try {
                const parsed = JSON.parse(item.solicitacao_exames);
                const exames = parsed.exames || (Array.isArray(parsed) ? parsed : null);
                if (Array.isArray(exames)) {
                  return exames.map((ex: any, i: number) => (
                    <div key={i} className="text-xs">
                      <span className="font-bold text-primary">{ex.nome}</span> {ex.codigo_sus ? `(${ex.codigo_sus})` : ''} {ex.indicacao ? `— ${ex.indicacao}` : ''}
                    </div>
                  ));
                }
              } catch (e) {}
              return <div className="text-sm whitespace-pre-wrap">{item.solicitacao_exames}</div>;
            })()}
          </div>
        </div>
      )}
      {item.indicacao_retorno && <Section label="Indicação de retorno" value={item.indicacao_retorno} />}
      
      {/* Campos dinâmicos em custom_data */}
      {(item as any).custom_data && Object.keys((item as any).custom_data).length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Campos Adicionais</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries((item as any).custom_data).map(([k, v]) => {
              if (!v || k === 'soap_enabled' || k === 'acolhimento_mental') return null;
              return (
                <div key={k} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">{k.replace(/_/g, " ")}</span>
                  <span className="text-sm font-medium">{String(v === true ? 'Sim' : v === false ? 'Não' : v)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const HistoricoClinico: React.FC<Props> = ({ pacienteId, pacienteNome, currentProfissionalId, unidades }) => {
  const [prontuarios, setProntuarios] = useState<ProntuarioItem[]>([]);
  const [episodios, setEpisodios] = useState<EpisodioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 10;
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewerItem, setViewerItem] = useState<ProntuarioItem | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const cancelledRef = useRef(false);

  const loadData = useCallback(async (pageNum = 0, append = false) => {
    if (!pacienteId) {
      setProntuarios([]);
      setEpisodios([]);
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    if (pageNum === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // 1. Load Prontuarios with range/pagination
      const { data: pData, error: pError } = await supabase
        .from("prontuarios")
        .select(
          "id,data_atendimento,hora_atendimento,profissional_nome,profissional_id,queixa_principal,evolucao,conduta,indicacao_retorno,procedimentos_texto,outro_procedimento,unidade_id,episodio_id,tipo_registro,observacoes,dados_acolhimento,custom_data,soap_subjetivo,soap_objetivo,soap_avaliacao,soap_plano,prescricao,solicitacao_exames",
        )
        .eq("paciente_id", pacienteId)
        .eq("status", "finalizado")
        .order("data_atendimento", { ascending: false })
        .order("hora_atendimento", { ascending: false })
        .range(from, to);

      // 2. Load Episodios (usually few enough to load all, or could also paginate)
      let eData = [];
      if (pageNum === 0) {
        const { data: episodes, error: eError } = await supabase
          .from("episodios_clinicos")
          .select("*")
          .eq("paciente_id", pacienteId)
          .order("data_inicio", { ascending: false });
        if (eError) throw eError;
        eData = episodes || [];
      }

      if (cancelledRef.current) return;
      if (pError) throw pError;

      if (append) {
        setProntuarios(prev => {
          const newItems = pData || [];
          const existingIds = new Set(prev.map(p => p.id));
          const filteredNew = newItems.filter(p => !existingIds.has(p.id));
          return [...prev, ...filteredNew];
        });
      } else {
        setProntuarios(pData || []);
        setEpisodios(eData);
      }
      setHasMore((pData || []).length === PAGE_SIZE);
    } catch (err) {
      console.error("[Historico] Erro inesperado:", err);
      if (!cancelledRef.current) {
        setError("Erro ao carregar histórico. Tente novamente.");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [pacienteId]);

  // Realtime subscription for automatic updates
  useRealtimeSubscription({
    tables: ["prontuarios", "episodios_clinicos"],
    filter: pacienteId ? `paciente_id=eq.${pacienteId}` : undefined,
    enabled: !!pacienteId,
    onchange: () => {
      console.log("[HistoricoClinico] Realtime change detected, refreshing...");
      loadData(0, false);
    }
  });

  useEffect(() => {
    setPage(0);
    loadData(0, false);
    return () => {
      cancelledRef.current = true;
    };
  }, [pacienteId, loadData]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadData(nextPage, true);
  };

  const unidadeMap = useMemo(() => new Map(unidades.map((u) => [u.id, u.nome])), [unidades]);
  const episodioMap = useMemo(() => new Map(episodios.map((e) => [e.id, e])), [episodios]);

  const timeline = useMemo(() => {
    return prontuarios.map((p) => ({
      ...p,
      unidadeNome: unidadeMap.get(p.unidade_id) || "",
      episodioTitulo: episodioMap.get(p.episodio_id || "")?.titulo || "",
    }));
  }, [prontuarios, unidadeMap, episodioMap]);

  const handlePrint = async (item: ProntuarioItem) => {
    const isRelatorio = item.tipo_registro === "alta_individual" || item.tipo_registro === "alta_multiprofissional";
    const title = item.tipo_registro === "alta_individual" 
      ? "RELATÓRIO DE ALTA INDIVIDUAL" 
      : item.tipo_registro === "alta_multiprofissional" 
        ? "RELATÓRIO DE ALTA MULTIPROFISSIONAL" 
        : "Prontuário Clínico";
    
    let body = '';
    
    if (isRelatorio) {
      try {
        const data = JSON.parse(item.observacoes);
        if (item.tipo_registro === "alta_individual") {
          const motivoLabel = data.motivo === "objetivos_atingidos" ? "Alta por objetivos atingidos" : 
                             data.motivo === "abandono" ? "Abandono" : 
                             data.motivo === "encaminhamento" ? "Encaminhamento" : 
                             data.motivo === "transferencia" ? "Transferência" : 
                             data.motivo === "outros" ? "Outros" : data.motivo;

          const metasLabel = data.metas === "totalmente" ? "Totalmente atingidas" : 
                            data.metas === "parcialmente" ? "Parcialmente atingidas" : 
                            data.metas === "nao_atingidas" ? "Não atingidas" : data.metas;

          body = `
            <div class="info-grid" style="grid-template-columns: 2fr 1fr; border-color: #000; border-width: 0.8px; margin-bottom: 10px;">
              <div>
                <span class="info-label">Paciente:</span> <span class="info-value" style="font-weight:700;">${pacienteNome}</span><br/>
                <span class="info-label">CNS:</span> <span class="info-value">${data.pacienteCns || "—"}</span> | 
                <span class="info-label">Nasc:</span> <span class="info-value">${data.dataNascimento ? formatDateBR(data.dataNascimento) : "—"}</span>
              </div>
              <div style="text-align: right;">
                <span class="info-label">ID:</span> <span class="info-value">${item.id.slice(0, 8)}</span><br/>
                <span class="info-label">Data Alta:</span> <span class="info-value" style="font-weight:700;">${data.dataAlta ? formatDateBR(data.dataAlta) : formatDateBR(item.data_atendimento)}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Informações do Atendimento</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 9pt;">
                <div><strong>Profissional:</strong> ${item.profissional_nome}</div>
                <div><strong>Modalidade:</strong> ${data.modalidade || "—"}</div>
                <div><strong>Período:</strong> ${data.periodoInicio ? formatDateBR(data.periodoInicio) : "—"} a ${data.periodoFim ? formatDateBR(data.periodoFim) : "—"}</div>
                <div><strong>Sessões Realizadas:</strong> ${data.sessoes || "0"}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Diagnóstico e Objetivos</div>
              <div style="margin-bottom: 5px;"><strong>CID-10:</strong> ${data.diagCid || "—"} ${data.cidDesc ? ` - ${data.cidDesc}` : ""}</div>
              ${data.cif ? `<div style="margin-bottom: 5px;"><strong>CIF:</strong> ${data.cif}</div>` : ""}
              <div style="margin-bottom: 5px;"><strong>Objetivos:</strong> ${data.objetivos || "—"}</div>
            </div>

            <div class="section">
              <div class="section-title">5. INTERVENÇÕES / PROCEDIMENTOS REALIZADOS</div>
              <div class="field-value">${data.intervencoes || "—"}</div>
            </div>

            <div class="section">
              <div class="section-title">6. EVOLUÇÃO CLÍNICA E FUNCIONAL</div>
              <div class="field-value">${data.evolucao || "—"}</div>
            </div>

            <div class="section">
              <div class="section-title">7. METAS ATINGIDAS</div>
              <div class="field-value">${metasLabel || "—"}</div>
            </div>

            <div class="section">
              <div class="section-title">8. MOTIVO DA ALTA</div>
              <div class="field-value">${motivoLabel || "—"}</div>
            </div>

            <div class="section">
              <div class="section-title">9. ORIENTAÇÕES E ENCAMINHAMENTOS</div>
              <div class="field-value">${data.orientacoes || data.encaminhamento || "—"}</div>
            </div>

            <div class="signature" style="margin-top:40px">
              <div class="signature-line" style="width: 250px;"></div>
              <div class="name">${item.profissional_nome}</div>
            </div>
          `;
        } else {
          body = `
            <div class="info-grid" style="grid-template-columns: 2fr 1fr; border-color: #000; border-width: 0.8px; margin-bottom: 10px;">
              <div>
                <span class="info-label">Paciente:</span> <span class="info-value" style="font-weight:700;">${pacienteNome}</span><br/>
                <span class="info-label">Data da Alta:</span> <span class="info-value" style="font-weight:700;">${data.dataAlta ? formatDateBR(data.dataAlta) : formatDateBR(item.data_atendimento)}</span>
              </div>
              <div style="text-align: right;">
                 <span class="info-label">Modalidades:</span> <span class="info-value">${data.modalidades?.join(', ') || "—"}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Informações Clínicas</div>
              <div style="margin-bottom: 5px;"><strong>CID-10:</strong> ${data.cid10 || "—"} ${data.cidDesc ? ` - ${data.cidDesc}` : ""}</div>
            </div>

            <div class="section">
              <div class="section-title">3. SEÇÕES PROFISSIONAIS</div>
              ${data.profissionais?.map((p: any) => `
                <div style="margin-bottom: 12px; border-bottom: 0.5px solid #e2e8f0; padding-bottom: 8px; page-break-inside: avoid;">
                  <div style="font-size: 8.5pt; font-weight: 800; text-transform: uppercase; color: #475569;">${p.profissional_nome} (${p.profissao || "—"})</div>
                  <div style="font-size: 10pt; margin-top: 3px; text-align: justify;">${p.evolucao || "—"}</div>
                </div>
              `).join('')}
            </div>

            <div class="section">
              <div class="section-title">4. CONCLUSÃO E ORIENTAÇÕES</div>
              ${data.motivoAlta ? `<div style="margin-bottom: 4px;"><strong>Motivo da Alta:</strong> ${data.motivoAlta}</div>` : ""}
              ${data.condicaoFuncional ? `<div style="margin-bottom: 4px;"><strong>Condição Funcional:</strong> ${data.condicaoFuncional}</div>` : ""}
              ${data.orientacoesUsuario ? `<div style="margin-bottom: 4px;"><strong>Orientações:</strong> ${data.orientacoesUsuario}</div>` : ""}
            </div>

            <div style="margin-top: 60px; display: flex; justify-content: center; page-break-inside: avoid;">
              <div class="signature">
                <div class="signature-line" style="width: 250px;"></div>
                <div class="name">Coordenação / Responsável Técnico</div>
                <div class="role">Unidade de Atendimento — Oriximiná-PA</div>
              </div>
            </div>
          `;
        }
      } catch (e) {
        console.error("Erro ao processar JSON para impressão:", e);
        body = `<div class="p-4 bg-destructive/10 text-destructive rounded-md">Erro ao processar dados do relatório para impressão.</div>`;
      }
    } else {
      const row = (label: string, val?: any) => {
        if (!val || val === 'false' || val === '[]' || val === '{}') return "";
        let displayVal = val;
        
        // Handle JSON strings (like prescriptions, exams, specialty fields)
        if (typeof val === 'string' && val.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(val);
            if (parsed.especialidade_fields) {
               let fieldsHtml = "";
               Object.entries(parsed.especialidade_fields).forEach(([k, v]) => {
                 if (v && v !== 'false') {
                   const cleanLabel = k.replace('esp_', '').replace(/_/g, ' ').toUpperCase();
                   fieldsHtml += `<div style="margin-bottom: 4px;"><span style="font-weight:700; font-size:9pt;">${cleanLabel}:</span> ${v === 'true' ? 'Sim' : v}</div>`;
                 }
               });
               return fieldsHtml ? `<div class="section"><div class="section-title">${label}</div><div class="section-content">${fieldsHtml}</div></div>` : "";
            }
            if (parsed.medicamentos) {
               displayVal = parsed.medicamentos.map((m: any) => `• ${m.medicamento}: ${m.posologia} (${m.duracao || 'contínuo'})`).join('<br/>');
            } else if (parsed.exames) {
               displayVal = parsed.exames.map((e: any) => `• ${e.nome}${e.indicacao ? ` (Ind: ${e.indicacao})` : ''}`).join('<br/>');
            } else if (parsed.especialidade_fields === undefined && parsed.texto !== undefined) {
               displayVal = parsed.texto;
            } else {
               displayVal = JSON.stringify(parsed);
            }
          } catch (e) { /* keep as is */ }
        } else if (typeof val === 'string' && val.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              if (parsed.length === 0) return "";
              displayVal = parsed.map(p => typeof p === 'string' ? `• ${p}` : `• ${p.nome || p.medicamento || JSON.stringify(p)}`).join('<br/>');
            }
          } catch (e) {}
        }
        
        return `<div class="section"><div class="section-title">${label}</div><div class="section-content">${String(displayVal).replace(/\n/g, "<br/>")}</div></div>`;
      };
      
      // Load extra data for the print if available
      let acolhimentoBody = "";
      if (item.tipo_registro === 'acolhimento_mental' || item.dados_acolhimento) {
        try {
          const d = item.dados_acolhimento || (await supabase.from('prontuarios').select('dados_acolhimento').eq('id', item.id).single()).data?.dados_acolhimento;
          
          if (d) {
            const row = (label: string, value: any) => {
              if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return "";
              const displayValue = Array.isArray(value) ? value.join(', ') : String(value === 'sim' ? 'Sim' : value === 'nao' ? 'Não' : value);
              return `
                <div style="margin-bottom: 6px;">
                  <div style="font-size: 8pt; color: #64748b; text-transform: uppercase; font-weight: 700;">${label}</div>
                  <div style="font-size: 10pt; color: #000; font-weight: 500; white-space: pre-wrap;">${displayValue}</div>
                </div>
              `;
            };

            const section = (title: string, content: string) => {
              if (!content) return "";
              return `
                <div style="margin-top: 12px; border-top: 0.5px solid #e2e8f0; padding-top: 8px;">
                  <div style="font-size: 9pt; color: #0369a1; font-weight: 800; margin-bottom: 8px; text-transform: uppercase;">${title}</div>
                  ${content}
                </div>
              `;
            };

            const s3 = section("Motivo da Procura", row("Queixa Principal", d.secao3?.queixa) + row("Outros", d.secao3?.outros));
            const s4 = section("Sintomas", row("Sintomas Observados", d.secao4?.sintomas));
            const s5 = section("Antecedentes", row("Antecedentes", d.secao5?.antecedentes) + row("Uso de Psicofármacos", d.secao5?.uso_psicofarmacos) + row("Medicação Atual", d.secao5?.medicacao_atual));
            const s15 = section("Parecer e Conduta", row("Parecer", d.secao15?.parecer));

            acolhimentoBody = `
              <div class="section" style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 0.5px solid #e2e8f0; margin-bottom: 15px;">
                <div style="font-size: 10pt; color: #0369a1; font-weight: 900; margin-bottom: 10px; border-bottom: 1px solid #0369a1; padding-bottom: 4px;">ACOLHIMENTO EM SAÚDE MENTAL</div>
                ${s3}${s4}${s5}${s15}
              </div>
            `;
          }
        } catch (e) {
          console.error("Erro ao carregar acolhimento para impressão:", e);
        }
      }

      body = `
        <div class="doc-content">
          ${acolhimentoBody}
          ${row("Queixa principal", item.queixa_principal)}
          ${row("Evolução / SOAP", item.evolucao)}
          ${row("Informações Complementares", item.observacoes)}
          ${row("Conduta", item.conduta)}
          ${row("Procedimentos", item.procedimentos_texto)}
          ${row("Outro procedimento", item.outro_procedimento)}
          ${row("Indicação de retorno", item.indicacao_retorno)}
        </div>
        <div class="signature" style="margin-top:50px; page-break-inside: avoid;">
          <div class="signature-line"></div>
          <div class="name">${item.profissional_nome || ""}</div>
        </div>
      `;
    }

    await openPrintDocument(title, body, {
      "Paciente": pacienteNome,
      "Data": formatDateBR(item.data_atendimento),
      "Profissional": item.profissional_nome || "-"
    });
  };

  const handleDownloadPDF = (item: ProntuarioItem) => {
    handlePrint(item);
    toast.info("Aguarde a janela de impressão para salvar como PDF");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Carregando histórico...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <AlertTriangle className="w-8 h-8 text-destructive/60" />
        <p className="text-sm text-destructive text-center">{error}</p>
        <Button variant="outline" size="sm" onClick={() => loadData()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const activeEpisodios = episodios.filter((e) => e.status === "ativo");

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 shrink-0">
          <FileText className="w-4 h-4 text-primary" /> Histórico Clínico
        </h3>
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar -mx-1 px-1 sm:mx-0 sm:px-0 sm:overflow-visible sm:flex-wrap sm:justify-end">
          <Button size="sm" variant="outline" onClick={() => setHistoricoOpen(true)} className="h-8 shrink-0">
            <History className="w-3.5 h-3.5 mr-1" /> Histórico completo
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 shrink-0">
                <Paperclip className="w-3.5 h-3.5 mr-1" /> Documentos
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Paperclip className="w-5 h-5 text-primary" />
                  Documentos de {pacienteNome}
                </DialogTitle>
              </DialogHeader>
              <div className="py-2">
                <PacienteDocumentos pacienteId={pacienteId} />
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="outline" onClick={() => setDocModalOpen(true)} className="h-8 shrink-0">
            <FileSignature className="w-3.5 h-3.5 mr-1" /> Gerar documento
          </Button>
        </div>
      </div>

      {activeEpisodios.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Tratamentos Ativos
          </h3>
          {activeEpisodios.map((ep) => {
            const sessoes = prontuarios.filter((p) => p.episodio_id === ep.id).length;
            return (
              <Card key={ep.id} className="border-primary/20 bg-primary/5">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{ep.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {ep.profissional_nome} • Início:{" "}
                        {formatDateBR(ep.data_inicio)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {sessoes} sessão(ões)
                    </Badge>
                  </div>
                  {ep.descricao && <p className="text-xs text-muted-foreground mt-1">{ep.descricao}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="space-y-4">
        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 border-2 border-dashed rounded-xl bg-muted/20">
            <FileText className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground text-center">Nenhum atendimento registrado nesta linha do tempo.</p>
          </div>
        ) : (
          <div className="relative pl-5 space-y-4">
            <div className="absolute left-1.5 top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-border to-transparent" aria-hidden="true" />
            {timeline.map((item) => {
              const isOwn = item.profissional_id === currentProfissionalId;
              const expanded = expandedId === item.id;
              return (
                <div key={item.id} className="relative group">
                  <div className={cn(
                    "absolute -left-[17px] top-3 w-3.5 h-3.5 rounded-full border-2 border-background transition-transform group-hover:scale-110 z-10",
                    item.tipo_registro?.includes('alta') ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-primary"
                  )} />
                  <Card className={cn(
                    "border shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden",
                    expanded ? "ring-1 ring-primary/20" : ""
                  )}>
                    <CardContent className="p-0">
                      <div 
                        className="flex items-start justify-between gap-2.5 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <time className="text-xs font-bold text-primary flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDateBR(item.data_atendimento)}
                            </time>
                            {item.hora_atendimento && (
                              <Badge variant="secondary" className="text-[10px] font-medium h-5 px-1.5 py-0 bg-muted/60">
                                <Clock className="w-2.5 h-2.5 mr-1 text-muted-foreground" />
                                {item.hora_atendimento}
                              </Badge>
                            )}
                            {item.episodioTitulo && (
                              <Badge variant="outline" className="text-[10px] h-5 border-primary/20 text-primary/80 bg-primary/5">
                                {item.episodioTitulo}
                              </Badge>
                            )}
                            {item.tipo_registro?.includes('alta') && (
                              <Badge className="text-[10px] h-5 bg-amber-500/10 text-amber-600 border-amber-200">ALTA</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                             <p className="text-sm font-bold text-foreground truncate">
                               {item.profissional_nome}
                             </p>
                             {isOwn && <Badge className="text-[9px] h-4 bg-primary/10 text-primary border-none">VOCÊ</Badge>}
                          </div>
                          {item.unidadeNome && <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-2.5 h-2.5" /> {item.unidadeNome}</p>}
                          
                          {item.evolucao && !expanded && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic leading-relaxed bg-muted/40 p-2 rounded-md border border-border/40">
                              "{item.evolucao}"
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 self-start mt-1">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary" 
                            onClick={(e) => { e.stopPropagation(); setViewerItem(item); }} 
                            title="Visualizar Detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full" title="Mais opções">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => handlePrint(item)}>
                                <Printer className="w-3.5 h-3.5 mr-2" /> Imprimir Registro
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadPDF(item)}>
                                <FileDown className="w-3.5 h-3.5 mr-2" /> Baixar PDF
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setViewerItem(item); setTimeout(() => setDocModalOpen(true), 100); }}>
                                <FileSignature className="w-3.5 h-3.5 mr-2" /> Gerar Documento
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      
                      {expanded && (
                        <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="border-t pt-4 space-y-4">
                            {renderContent(item)}
                          </div>
                          <div className="mt-4 pt-4 border-t flex justify-end">
                             <Button variant="ghost" size="sm" onClick={() => setExpandedId(null)} className="text-[10px] uppercase font-bold tracking-wider gap-1 h-7">
                               <ChevronUp className="w-3 h-3" /> Recolher
                             </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-full px-6 border-primary/20 text-primary hover:bg-primary/5 font-semibold text-xs"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      Carregando...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 mr-2" />
                      Carregar mais registros
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={!!viewerItem} onOpenChange={(o) => !o && setViewerItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {viewerItem && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Registro — {formatDateBR(viewerItem.data_atendimento)}
                </SheetTitle>
                <SheetDescription>
                  {viewerItem.profissional_nome}
                </SheetDescription>
              </SheetHeader>
              <Separator className="my-4" />
              <div className="space-y-4">
                {renderContent(viewerItem)}
              </div>
              <Separator className="my-4" />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewerItem(null)}>Fechar</Button>
                <Button variant="outline" size="sm" onClick={() => handlePrint(viewerItem)}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDownloadPDF(viewerItem)}>
                  <FileDown className="w-3.5 h-3.5 mr-1" /> Baixar PDF
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <HistoricoCompletoModal
        open={historicoOpen}
        onOpenChange={setHistoricoOpen}
        pacienteId={pacienteId}
        pacienteNome={pacienteNome}
        unidades={unidades}
        currentProfissionalId={currentProfissionalId}
      />

      <GerarDocumentoModal
        open={docModalOpen}
        onOpenChange={setDocModalOpen}
        paciente={{ id: pacienteId, nome: pacienteNome, cpf: '', cns: '', data_nascimento: '', cid: '', especialidade_destino: '' }}
      />
    </div>
  );
};