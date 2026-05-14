import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, FileText, ChevronDown, ChevronUp, Activity, AlertTriangle, RefreshCw, Eye, FileSignature, History, MoreVertical, Printer, Download, Link2, FileDown, Paperclip } from "lucide-react";
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
  <div className="mb-2">
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{value || "—"}</p>
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

  return (
    <div className="space-y-4">
      {item.queixa_principal && <Section label="Queixa principal" value={item.queixa_principal} />}
      {item.evolucao && <Section label="Evolução / SOAP" value={item.evolucao} />}
      {item.conduta && <Section label="Conduta" value={item.conduta} />}
      {item.procedimentos_texto && <Section label="Procedimentos" value={item.procedimentos_texto} />}
      {item.outro_procedimento && <Section label="Outro procedimento" value={item.outro_procedimento} />}
      {item.indicacao_retorno && <Section label="Indicação de retorno" value={item.indicacao_retorno} />}
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
          "id,data_atendimento,hora_atendimento,profissional_nome,profissional_id,queixa_principal,evolucao,conduta,indicacao_retorno,procedimentos_texto,outro_procedimento,unidade_id,episodio_id,tipo_registro,observacoes",
        )
        .eq("paciente_id", pacienteId)
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
        setProntuarios(prev => [...prev, ...(pData || [])]);
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

  useEffect(() => {
    setPage(0);
    loadData(0, false);
    return () => {
      cancelledRef.current = true;
    };
  }, [pacienteId]);

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
            <div class="section">
              <div class="section-title">1. IDENTIFICAÇÃO DO PACIENTE</div>
              <div class="info-grid">
                <div><span class="info-label">Paciente:</span> <span class="info-value">${pacienteNome}</span></div>
                <div><span class="info-label">Data Nasc:</span> <span class="info-value">${data.dataNascimento ? formatDateBR(data.dataNascimento) : "—"}</span></div>
                <div><span class="info-label">CNS:</span> <span class="info-value">${data.pacienteCns || "—"}</span></div>
                <div><span class="info-label">Prontuário/ID:</span> <span class="info-value">${item.id.slice(0, 8)}</span></div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">2. IDENTIFICAÇÃO DO ATENDIMENTO</div>
              <div class="info-grid">
                <div><span class="info-label">Profissional:</span> <span class="info-value">${item.profissional_nome}</span></div>
                <div><span class="info-label">Modalidade:</span> <span class="info-value">${data.modalidade || "—"}</span></div>
                <div><span class="info-label">Data de Alta:</span> <span class="info-value">${data.dataAlta ? formatDateBR(data.dataAlta) : formatDateBR(item.data_atendimento)}</span></div>
                <div><span class="info-label">Período:</span> <span class="info-value">${data.periodoInicio ? formatDateBR(data.periodoInicio) : "—"} a ${data.periodoFim ? formatDateBR(data.periodoFim) : "—"}</span></div>
                <div><span class="info-label">Sessões:</span> <span class="info-value">${data.sessoes || "0"}</span></div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">3. DIAGNÓSTICO</div>
              <div class="field"><span class="field-label">CID-10:</span><div class="field-value"><strong>${data.diagCid || "—"}</strong> ${data.cidDesc ? ` - ${data.cidDesc}` : ""}</div></div>
              ${data.cif ? `<div class="field"><span class="field-label">CIF:</span><div class="field-value">${data.cif}</div></div>` : ""}
            </div>

            <div class="section">
              <div class="section-title">4. OBJETIVOS TERAPÊUTICOS</div>
              <div class="field-value">${data.objetivos || "—"}</div>
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

            <div class="signature" style="margin-top:50px">
              <div class="signature-line"></div>
              <div class="name">${item.profissional_nome}</div>
            </div>
          `;
        } else {
          body = `
            <div class="section">
              <div class="section-title">1. IDENTIFICAÇÃO DO PACIENTE</div>
              <div class="info-grid">
                <div><span class="info-label">Paciente:</span> <span class="info-value">${pacienteNome}</span></div>
                <div><span class="info-label">Data de Alta:</span> <span class="info-value">${data.dataAlta ? formatDateBR(data.dataAlta) : formatDateBR(item.data_atendimento)}</span></div>
                <div style="grid-column: span 2;"><span class="info-label">Modalidades:</span> <span class="info-value">${data.modalidades?.join(', ') || "—"}</span></div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">2. DIAGNÓSTICO</div>
              <div class="field"><span class="field-label">CID-10:</span><div class="field-value"><strong>${data.cid10 || "—"}</strong> ${data.cidDesc ? ` - ${data.cidDesc}` : ""}</div></div>
            </div>

            <div class="section">
              <div class="section-title">3. SEÇÕES PROFISSIONAIS</div>
              ${data.profissionais?.map((p: any) => `
                <div style="margin-bottom: 20px; border: 1px solid #e2e8f0; padding: 12px; border-radius: 4px; page-break-inside: avoid;">
                  <strong>${p.profissional_nome} (${p.profissao || "—"})</strong><br/>
                  <div style="font-size: 10pt; margin-top: 5px; text-align: justify;">${p.evolucao || "—"}</div>
                </div>
              `).join('')}
            </div>

            <div class="section">
              <div class="section-title">4. CONCLUSÃO E ORIENTAÇÕES</div>
              ${data.motivoAlta ? `<div class="field"><span class="field-label">Motivo da Alta:</span><div class="field-value">${data.motivoAlta}</div></div>` : ""}
              ${data.condicaoFuncional ? `<div class="field"><span class="field-label">Condição Funcional:</span><div class="field-value">${data.condicaoFuncional}</div></div>` : ""}
              ${data.orientacoesUsuario ? `<div class="field"><span class="field-label">Orientações:</span><div class="field-value">${data.orientacoesUsuario}</div></div>` : ""}
            </div>

            <div style="margin-top: 60px; display: flex; justify-content: center; page-break-inside: avoid;">
              <div class="signature">
                <div class="signature-line" style="width: 300px;"></div>
                <div class="name">Coordenação / Responsável Técnico</div>
                <div class="role">CER II — Oriximiná-PA</div>
              </div>
            </div>
          `;
        }
      } catch (e) {
        console.error("Erro ao processar JSON para impressão:", e);
        body = `<div class="p-4 bg-destructive/10 text-destructive rounded-md">Erro ao processar dados do relatório para impressão.</div>`;
      }
    } else {
      const row = (label: string, val?: string) =>
        val ? `<div class="section"><div class="section-title">${label}</div><div class="section-content">${String(val).replace(/\n/g, "<br/>")}</div></div>` : "";
      
      body = `
        <div class="doc-content">
          ${row("Queixa principal", item.queixa_principal)}
          ${row("Evolução / SOAP", item.evolucao)}
          ${row("Conduta", item.conduta)}
          ${row("Procedimentos", item.procedimentos_texto)}
          ${row("Outro procedimento", item.outro_procedimento)}
          ${row("Indicação de retorno", item.indicacao_retorno)}
        </div>
        <div class="signature" style="margin-top:50px">
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> Histórico Clínico
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setHistoricoOpen(true)} className="h-8">
            <History className="w-3.5 h-3.5 mr-1" /> Histórico completo
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">
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
          <Button size="sm" variant="outline" onClick={() => setDocModalOpen(true)} className="h-8">
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

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" /> Linha do Tempo ({timeline.length} registro(s))
        </h3>
        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <FileText className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground text-center">Nenhum atendimento registrado.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="relative pl-6 space-y-3">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-border" aria-hidden="true" />
              {timeline.map((item) => {
                const isOwn = item.profissional_id === currentProfissionalId;
                const expanded = expandedId === item.id;
                return (
                  <div key={item.id} className="relative">
                    <div className="absolute -left-4 top-2 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <time className="text-xs font-bold text-primary" dateTime={item.data_atendimento}>
                                {formatDateBR(item.data_atendimento)}
                              </time>
                              {item.hora_atendimento && (
                                <span className="text-xs text-muted-foreground">{item.hora_atendimento}</span>
                              )}
                              {item.episodioTitulo && (
                                <Badge variant="outline" className="text-[10px]">
                                  {item.episodioTitulo}
                                </Badge>
                              )}
                              {item.tipo_registro?.includes('alta') && (
                                <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">ALTA</Badge>
                              )}
                            </div>
                            <p className="text-sm text-foreground mt-0.5">
                              {item.profissional_nome}
                              {isOwn && <span className="text-xs text-primary ml-1">(você)</span>}
                            </p>
                            {item.unidadeNome && <p className="text-xs text-muted-foreground">{item.unidadeNome}</p>}
                            {item.evolucao && !expanded && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                {item.evolucao}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewerItem(item)} title="Visualizar">
                              <Eye className="w-3.5 h-3.5 text-primary" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDownloadPDF(item)} title="Baixar PDF">
                              <FileDown className="w-3.5 h-3.5 text-primary" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Mais ações">
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => handlePrint(item)}>
                                  <Printer className="w-3.5 h-3.5 mr-2" /> Imprimir
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setViewerItem(item); setTimeout(() => setDocModalOpen(true), 100); }}>
                                  <FileSignature className="w-3.5 h-3.5 mr-2" /> Gerar documento
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setExpandedId(expanded ? null : item.id)}
                            >
                              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>
                        {expanded && (
                          <div className="mt-2 space-y-1 text-xs border-t pt-2">
                            {renderContent(item)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
            {hasMore && (
              <div className="flex justify-center p-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-primary hover:text-primary/80"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Carregando...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-2" />
                      Carregar mais atendimentos
                    </>
                  )}
                </Button>
              </div>
            )}
          </ScrollArea>
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