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
import { buildInstitutionalCSS } from "@/lib/printLayout";

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

// Helpers
function safeData<T>(result: { data: T | null; error: any }, context: string): T {
  if (result.error) {
    console.error(`[Historico] Erro em ${context}:`, result.error);
    return [] as unknown as T;
  }
  return result.data ?? ([] as unknown as T);
}

function formatDateBR(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("pt-BR");
}

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
              <div><span className="text-muted-foreground block uppercase font-bold text-[10px]">Período</span>{data.periodoInicio && new Date(data.periodoInicio + 'T12:00:00').toLocaleDateString('pt-BR')} a {data.periodoFim && new Date(data.periodoFim + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
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
                  <p className="text-xs text-muted-foreground line-clamp-3"><strong>Evolução:</strong> {prof.evolucao}</p>
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
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewerItem, setViewerItem] = useState<ProntuarioItem | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const cancelledRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!pacienteId) {
      setProntuarios([]);
      setEpisodios([]);
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const [{ data: pData, error: pError }, { data: eData, error: eError }] = await Promise.all([
        supabase
          .from("prontuarios")
          .select(
            "id,data_atendimento,hora_atendimento,profissional_nome,profissional_id,queixa_principal,evolucao,conduta,indicacao_retorno,procedimentos_texto,outro_procedimento,unidade_id,episodio_id,tipo_registro,observacoes",
          )
          .eq("paciente_id", pacienteId)
          .order("data_atendimento", { ascending: false }),
        supabase
          .from("episodios_clinicos")
          .select("*")
          .eq("paciente_id", pacienteId)
          .order("data_inicio", { ascending: false }),
      ]);

      if (cancelledRef.current) return;

      if (pError) throw pError;
      if (eError) throw eError;

      setProntuarios(pData || []);
      setEpisodios(eData || []);
    } catch (err) {
      console.error("[Historico] Erro inesperado:", err);
      if (!cancelledRef.current) {
        setError("Erro ao carregar histórico. Tente novamente.");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [pacienteId]);

  useEffect(() => {
    loadData();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadData]);

  // Mapa de unidades (O(1) lookup)
  const unidadeMap = useMemo(() => new Map(unidades.map((u) => [u.id, u.nome])), [unidades]);

  const episodioMap = useMemo(() => new Map(episodios.map((e) => [e.id, e])), [episodios]);

  const timeline = useMemo(() => {
    return prontuarios.map((p) => ({
      ...p,
      unidadeNome: unidadeMap.get(p.unidade_id) || "",
      episodioTitulo: episodioMap.get(p.episodio_id || "")?.titulo || "",
    }));
  }, [prontuarios, unidadeMap, episodioMap]);

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

  const buildProntuarioHTML = (item: ProntuarioItem & { unidadeNome?: string }) => {
    const css = buildInstitutionalCSS();

    // If it's a discharge report, it should use its own formatting logic
    if (item.tipo_registro === "alta_individual" || item.tipo_registro === "alta_multiprofissional") {
      try {
        const data = JSON.parse(item.observacoes);
        const title = item.tipo_registro === "alta_individual" ? "Relatório de Alta Individual" : "Relatório de Alta Multiprofissional";
        
        let contentHtml = '';
        if (item.tipo_registro === "alta_individual") {
          contentHtml = `
            <div class="info-grid">
              <div><span class="info-label">Paciente:</span> <span class="info-value">${pacienteNome}</span></div>
              <div><span class="info-label">Data de Alta:</span> <span class="info-value">${data.dataAlta ? formatDateBR(data.dataAlta) : formatDateBR(item.data_atendimento)}</span></div>
              <div><span class="info-label">Profissional:</span> <span class="info-value">${item.profissional_nome}</span></div>
              <div><span class="info-label">Modalidade:</span> <span class="info-value">${data.modalidade || "—"}</span></div>
            </div>
            <div class="section">
              <div class="section-title">Diagnóstico</div>
              <div class="field"><span class="field-label">CID-10:</span><div class="field-value"><strong>${data.diagCid || "—"}</strong> ${data.cidDesc ? ` - ${data.cidDesc}` : ""}</div></div>
              ${data.cif ? `<div class="field"><span class="field-label">CIF:</span><div class="field-value">${data.cif}</div></div>` : ""}
            </div>
            <div class="section">
              <div class="section-title">Evolução e Atendimento</div>
              <div class="field"><span class="field-label">Período:</span><div class="field-value">${data.periodoInicio ? formatDateBR(data.periodoInicio) : "—"} a ${data.periodoFim ? formatDateBR(data.periodoFim) : "—"}</div></div>
              <div class="field"><span class="field-label">Sessões:</span><div class="field-value">${data.sessoes || "0"}</div></div>
              <div class="field"><span class="field-label">Evolução:</span><div class="field-value">${data.evolucao || "—"}</div></div>
            </div>
          `;
        } else {
          contentHtml = `
            <div class="info-grid">
              <div><span class="info-label">Paciente:</span> <span class="info-value">${pacienteNome}</span></div>
              <div><span class="info-label">Data de Alta:</span> <span class="info-value">${data.dataAlta ? formatDateBR(data.dataAlta) : formatDateBR(item.data_atendimento)}</span></div>
              <div><span class="info-label">Modalidades:</span> <span class="info-value">${data.modalidades?.join(', ') || "—"}</span></div>
            </div>
            <div class="section">
              <div class="section-title">Diagnóstico</div>
              <div class="field"><span class="field-label">CID-10:</span><div class="field-value"><strong>${data.cid10 || "—"}</strong> ${data.cidDesc ? ` - ${data.cidDesc}` : ""}</div></div>
            </div>
            <div class="section">
              <div class="section-title">Seções Profissionais</div>
              ${data.profissionais?.map((p: any) => `
                <div style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                  <strong>${p.profissional_nome} (${p.profissao})</strong><br/>
                  <small>Evolução: ${p.evolucao}</small>
                </div>
              `).join('')}
            </div>
          `;
        }

        return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>${css}</head>
          <body>
            <div class="doc-header">
              <div class="header-center">
                <h1>SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h1>
                <div class="subtitle">CER II - Centro Especializado em Reabilitação</div>
                <div class="doc-title">${title}</div>
              </div>
            </div>
            <div class="doc-content">${contentHtml}</div>
            <div class="signature" style="margin-top:50px">
              <div class="signature-line"></div>
              <div class="name">${item.profissional_nome}</div>
            </div>
          </body></html>`;
      } catch (e) {
        console.error("Erro ao imprimir relatório de alta:", e);
      }
    }

    const row = (label: string, val?: string) =>
      val ? `<div class="section"><h3>${label}</h3><p>${String(val).replace(/\n/g, "<br/>")}</p></div>` : "";
    
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Prontuário ${pacienteNome}</title>${css}</head>
      <body>
        <div class="doc-header">
          <div class="header-center">
            <h1>SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h1>
            <div class="subtitle">CER II - Centro Especializado em Reabilitação</div>
            <div class="doc-title">Prontuário Clínico</div>
          </div>
        </div>
        <div class="doc-meta">
          <strong>Paciente:</strong> ${pacienteNome} &nbsp;|&nbsp;
          <strong>Data:</strong> ${formatDateBR(item.data_atendimento)} ${item.hora_atendimento || ""} &nbsp;|&nbsp;
          <strong>Profissional:</strong> ${item.profissional_nome || "-"}
          ${item.unidadeNome ? `&nbsp;|&nbsp; <strong>Unidade:</strong> ${item.unidadeNome}` : ""}
        </div>
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
      </body></html>`;
  };

  const handlePrint = (item: ProntuarioItem & { unidadeNome?: string }) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.error("Permita pop-ups para imprimir");
      return;
    }
    win.document.write(buildProntuarioHTML(item));
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };

  const handleDownloadPDF = (item: ProntuarioItem & { unidadeNome?: string }) => {
    // Browser print → "Save as PDF" — uses same institutional layout
    handlePrint(item);
    toast.info("Use 'Salvar como PDF' na janela de impressão");
  };

  const handleExportJSON = (item: ProntuarioItem) => {
    const blob = new Blob([JSON.stringify(item, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prontuario_${pacienteNome.replace(/\s+/g, "_")}_${item.data_atendimento}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exportado");
  };

  const handleCopyLink = async (item: ProntuarioItem) => {
    const url = `${window.location.origin}/painel/prontuario?pacienteId=${pacienteId}&prontuarioId=${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
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

      {/* Tratamentos ativos */}
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
                        {new Date(ep.data_inicio + "T12:00:00").toLocaleDateString("pt-BR")}
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

      {/* Timeline */}
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
                            </div>
                            <p className="text-sm text-foreground mt-0.5">
                              {item.profissional_nome}
                              {isOwn && <span className="text-xs text-primary ml-1">(você)</span>}
                            </p>
                            {item.unidadeNome && <p className="text-xs text-muted-foreground">{item.unidadeNome}</p>}
                            {item.procedimentos_texto && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <strong>Procedimentos:</strong> {item.procedimentos_texto}
                              </p>
                            )}
                            {item.queixa_principal && !expanded && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                QP: {item.queixa_principal}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setViewerItem(item)}
                              aria-label="Visualizar prontuário"
                              title="Visualizar"
                            >
                              <Eye className="w-3.5 h-3.5 text-primary" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setHistoricoOpen(true)}
                              aria-label="Histórico do paciente"
                              title="Histórico do paciente"
                            >
                              <History className="w-3.5 h-3.5 text-primary" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => handleDownloadPDF(item)}
                              aria-label="Baixar PDF"
                              title="Baixar PDF"
                            >
                              <FileDown className="w-3.5 h-3.5 text-primary" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  aria-label="Mais ações"
                                  title="Mais ações"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => handlePrint(item)}>
                                  <Printer className="w-3.5 h-3.5 mr-2" /> Imprimir
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExportJSON(item)}>
                                  <Download className="w-3.5 h-3.5 mr-2" /> Exportar JSON
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopyLink(item)}>
                                  <Link2 className="w-3.5 h-3.5 mr-2" /> Copiar link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setViewerItem(item); setTimeout(() => setDocModalOpen(true), 100); }}>
                                  <FileSignature className="w-3.5 h-3.5 mr-2" /> Gerar documento
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {item.queixa_principal && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setExpandedId(expanded ? null : item.id)}
                                aria-label={expanded ? "Recolher" : "Expandir"}
                                aria-expanded={expanded}
                              >
                                {expanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                        {expanded && (
                          <div className="mt-2 space-y-1 text-xs border-t pt-2">
                            {item.queixa_principal && (
                              <p>
                                <strong>Queixa:</strong> {item.queixa_principal}
                              </p>
                            )}
                            {item.evolucao && (
                              <p>
                                <strong>Evolução:</strong> {item.evolucao}
                              </p>
                            )}
                            {item.conduta && (
                              <p>
                                <strong>Conduta:</strong> {item.conduta}
                              </p>
                            )}
                            {item.outro_procedimento && (
                              <p>
                                <strong>Outro procedimento:</strong> {item.outro_procedimento}
                              </p>
                            )}
                            {item.indicacao_retorno && (
                              <p>
                                <strong>Retorno:</strong> {item.indicacao_retorno}
                              </p>
                            )}
                            {!isOwn && (
                              <p className="text-warning italic mt-1">
                                Prontuário de outro profissional (somente leitura)
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Drawer de visualização rápida */}
      <Sheet open={!!viewerItem} onOpenChange={(o) => !o && setViewerItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {viewerItem && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Prontuário — {formatDateBR(viewerItem.data_atendimento)}
                  {viewerItem.hora_atendimento && (
                    <span className="text-sm text-muted-foreground font-normal">{viewerItem.hora_atendimento}</span>
                  )}
                </SheetTitle>
                <SheetDescription>
                  {viewerItem.profissional_nome}
                  {viewerItem.profissional_id === currentProfissionalId && (
                    <span className="text-primary ml-1">(você)</span>
                  )}
                </SheetDescription>
              </SheetHeader>
              <Separator className="my-4" />
              <div className="space-y-4 text-sm">
                {renderContent(viewerItem)}
              </div>
              <Separator className="my-4" />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewerItem(null)}>
                  Fechar
                </Button>
                <Button variant="outline" size="sm" onClick={() => handlePrint(viewerItem)}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDownloadPDF(viewerItem)}>
                  <FileDown className="w-3.5 h-3.5 mr-1" /> Baixar PDF
                </Button>
                <Button size="sm" onClick={() => { setViewerItem(null); setDocModalOpen(true); }}>
                  <FileSignature className="w-3.5 h-3.5 mr-1" /> Gerar documento
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

const Section: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
    <p className="text-foreground whitespace-pre-wrap leading-relaxed">{value}</p>
  </div>
);
