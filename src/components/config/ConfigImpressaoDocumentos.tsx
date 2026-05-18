import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  Upload,
  ImageIcon,
  Trash2,
  Eye,
  Image as ImageLucide,
  FileText,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  CheckCircle2,
  Printer,
} from "lucide-react";
import ModelosDocumentos from "@/components/ModelosDocumentos";
import CarimboConfig from "@/components/CarimboConfig";
import HeaderPreviewA4 from "@/components/config/sistema/HeaderPreviewA4";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  invalidateDocumentConfigCache,
  loadDocumentConfig,
  docHeader,
  docFooter,
  buildInstitutionalCSS,
  docMeta,
} from "@/lib/printLayout";

const CONFIG_KEY = "config_impressao";

interface ImpressaoConfig {
  cabecalho: {
    linha1: string;
    linha2: string;
    logoUrl: string;
    logoEsquerda: string;
    logoCentro: string;
    logoDireita: string;
    fonte: string;
    tamanhoFonte: number;
    alinhamento: "center" | "left" | "right";
    cor: string;
  };
  receituario: {
    titulo: string;
    mostrarProntuario: boolean;
    mostrarConvenio: boolean;
    mostrarNascimento: boolean;
    mostrarAssinatura: boolean;
    rodape: string;
  };
  solicitacaoExames: {
    titulo: string;
    mostrarCodigoSus: boolean;
    mostrarIndicacao: boolean;
    mostrarAssinatura: boolean;
    rodape: string;
  };
  relatorioEvolucao: { habilitado: boolean; camposVisiveis: string[]; historicoSessoes: number };
  termoConsentimento: { habilitado: boolean; texto: string };
  rodapeTexto: string;
}

const DEFAULT: ImpressaoConfig = {
  cabecalho: {
    linha1: "SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ",
    linha2: "CAPS II",
    logoUrl: "",
    logoEsquerda: "",
    logoCentro: "",
    logoDireita: "",
    fonte: "Arial",
    tamanhoFonte: 12,
    alinhamento: "center",
    cor: "#0c4a6e",
  },
  receituario: {
    titulo: "RECEITUÁRIO MÉDICO",
    mostrarProntuario: true,
    mostrarConvenio: true,
    mostrarNascimento: false,
    mostrarAssinatura: true,
    rodape: "",
  },
  solicitacaoExames: {
    titulo: "SOLICITAÇÃO DE EXAMES",
    mostrarCodigoSus: true,
    mostrarIndicacao: true,
    mostrarAssinatura: true,
    rodape: "",
  },
  relatorioEvolucao: {
    habilitado: true,
    camposVisiveis: ["subjetivo", "objetivo", "avaliacao", "plano"],
    historicoSessoes: 5,
  },
  termoConsentimento: { habilitado: false, texto: "" },
  rodapeTexto: "",
};

const FONT_OPTIONS = ["Arial", "Times New Roman", "Helvetica", "Roboto", "Georgia", "Verdana"];

type LogoSide = "esquerda" | "centro" | "direita";

interface LogoUploadCardProps {
  side: LogoSide;
  title: string;
  subtitle: string;
  url: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

const LogoUploadCard: React.FC<LogoUploadCardProps> = ({
  side,
  title,
  subtitle,
  url,
  uploading,
  onUpload,
  onRemove,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo deve ter no máximo 2MB");
      return;
    }
    if (!["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(file.type)) {
      toast.error("Use PNG, JPG, SVG ou WEBP");
      return;
    }
    onUpload(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <ImageLucide className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <Label className="text-[13px] font-bold block">{title}</Label>
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
        {url && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
            <CheckCircle2 className="w-3 h-3" /> Ativa
          </div>
        )}
      </div>

      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 transition-all",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20",
          "flex flex-col items-center gap-3",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
      >
        {url ? (
          <div className="relative group">
            <img
              src={url}
              alt={title}
              className="max-h-20 max-w-[160px] object-contain rounded bg-white p-1 border border-border"
            />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-lg bg-muted flex flex-col items-center justify-center gap-1">
            <ImageIcon className="w-7 h-7 text-muted-foreground/60" />
            <span className="text-[9px] text-muted-foreground">Arraste aqui</span>
          </div>
        )}

        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Recomendado: 200×80px • PNG/JPG/SVG • Máx 2MB</p>
        </div>

        <div className="flex gap-2 flex-wrap justify-center">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="gap-1.5 h-8"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {url ? "Alterar" : "Selecionar"}
          </Button>
          {url && (
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive gap-1.5 h-8">
              <Trash2 className="w-3 h-3" /> Remover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const ConfigImpressaoDocumentos: React.FC = () => {
  const [config, setConfig] = useState<ImpressaoConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLeft, setUploadingLeft] = useState(false);
  const [uploadingCenter, setUploadingCenter] = useState(false);
  const [uploadingRight, setUploadingRight] = useState(false);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from("system_config").select("configuracoes").eq("id", "default").maybeSingle();
    const cfg = data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY]) {
      setConfig({
        ...DEFAULT,
        ...cfg[CONFIG_KEY],
        cabecalho: { ...DEFAULT.cabecalho, ...cfg[CONFIG_KEY].cabecalho },
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const save = async (updated: ImpressaoConfig) => {
    setSaving(true);
    const { data: existing } = await supabase
      .from("system_config")
      .select("configuracoes")
      .eq("id", "default")
      .maybeSingle();
    const existingConfig = (existing?.configuracoes as any) || {};
    await supabase.from("system_config").upsert({
      id: "default",
      configuracoes: { ...existingConfig, [CONFIG_KEY]: updated },
      updated_at: new Date().toISOString(),
    });
    setConfig(updated);
    invalidateDocumentConfigCache();
    setSaving(false);
    toast.success("Configuração salva");
  };

  const update = (path: string, value: any) => {
    const parts = path.split(".");
    const updated = { ...config };
    let obj: any = updated;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = { ...obj[parts[i]] };
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    setConfig(updated);
  };

  const saveField = () => save(config);

  const uploadLogo = async (file: File, side: LogoSide) => {
    const setUploading =
      side === "esquerda" ? setUploadingLeft : side === "centro" ? setUploadingCenter : setUploadingRight;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `logo-${side}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("document-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("document-logos").getPublicUrl(path);
      const url = urlData.publicUrl;
      const key = side === "esquerda" ? "logoEsquerda" : side === "centro" ? "logoCentro" : "logoDireita";
      const updated = { ...config, cabecalho: { ...config.cabecalho, [key]: url } };
      await save(updated);
      toast.success(`Logo ${side} atualizada`);
    } catch (e: any) {
      toast.error("Erro no upload: " + (e.message || ""));
    }
    setUploading(false);
  };

  const removeLogo = async (side: LogoSide) => {
    const key = side === "esquerda" ? "logoEsquerda" : side === "centro" ? "logoCentro" : "logoDireita";
    const updated = { ...config, cabecalho: { ...config.cabecalho, [key]: "" } };
    await save(updated);
    toast.success("Logo removida");
  };

  const handlePreview = async () => {
    const cfg = await loadDocumentConfig();
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) return;
    const css = buildInstitutionalCSS();
    const meta = docMeta({
      Paciente: "João da Silva",
      CPF: "123.456.789-00",
      Data: new Date().toLocaleDateString("pt-BR"),
    });
    const body = `
      <div class="doc-content">
        <div class="content-block" style="margin-top:16px;">
          <p>Atesto para os devidos fins que o(a) paciente <strong>João da Silva</strong>, portador(a) do CPF <strong>123.456.789-00</strong>, compareceu nesta unidade de saúde na data de hoje para consulta médica, necessitando de <strong>3 (três)</strong> dias de afastamento de suas atividades laborais.</p>
          <br/>
          <p>Este documento é uma pré-visualização do layout padrão dos documentos clínicos gerados pelo sistema.</p>
        </div>
        <div class="signature" style="margin-top:60px;">
          <div class="signature-line"></div>
          <div class="name">Dr. Maria Santos</div>
          <div class="role">Fisioterapia — CREFITO-12 12345/PA</div>
        </div>
      </div>
    `;
    previewWindow.document.write(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Pré-visualização</title>${css}</head><body>${docHeader("ATESTADO MÉDICO", cfg)}${meta}${body}${docFooter(cfg)}</body></html>`,
    );
    previewWindow.document.close();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HERO: Logos + Cabeçalho com preview lateral */}
      <Card className="shadow-card border-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/5 via-background to-background p-5 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-bold font-display text-foreground text-lg leading-tight">
                  Logos e Cabeçalho Institucional
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure como cada documento clínico será impresso e exportado
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePreview} className="gap-1.5">
                <Eye className="w-4 h-4" /> Pré-visualizar
              </Button>
              <Button variant="default" size="sm" onClick={() => window.print()} className="gap-1.5">
                <Printer className="w-4 h-4" /> Imprimir teste
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
            {/* Left: Controls */}
            <div className="space-y-6 min-w-0">
              {/* Logos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <LogoUploadCard
                  side="esquerda"
                  title="Logo Esquerda"
                  subtitle="Ex: SMS Oriximiná"
                  url={config.cabecalho.logoEsquerda}
                  uploading={uploadingLeft}
                  onUpload={(f) => uploadLogo(f, "esquerda")}
                  onRemove={() => removeLogo("esquerda")}
                />
                <LogoUploadCard
                  side="direita"
                  title="Logo Direita"
                  subtitle="Ex: CAPS II"
                  url={config.cabecalho.logoDireita}
                  uploading={uploadingRight}
                  onUpload={(f) => uploadLogo(f, "direita")}
                  onRemove={() => removeLogo("direita")}
                />
              </div>

              <Separator />

              {/* Header text fields */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">Textos do Cabeçalho</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Linha 1 — Nome da Secretaria</Label>
                    <Input
                      value={config.cabecalho.linha1}
                      onChange={(e) => update("cabecalho.linha1", e.target.value)}
                      onBlur={saveField}
                      placeholder="Nome da Secretaria"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Linha 2 — Nome da Unidade</Label>
                    <Input
                      value={config.cabecalho.linha2}
                      onChange={(e) => update("cabecalho.linha2", e.target.value)}
                      onBlur={saveField}
                      placeholder="Nome da Unidade"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <Label className="text-xs">Texto do Rodapé</Label>
                    <Input
                      value={config.rodapeTexto}
                      onChange={(e) => update("rodapeTexto", e.target.value)}
                      onBlur={saveField}
                      placeholder="Endereço completo"
                    />
                  </div>
                </div>

                {/* Typography controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fonte do cabeçalho</Label>
                    <Select
                      value={config.cabecalho.fonte}
                      onValueChange={(v) => {
                        update("cabecalho.fonte", v);
                        save({ ...config, cabecalho: { ...config.cabecalho, fonte: v } });
                      }}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map((f) => (
                          <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center justify-between">
                      <span>Tamanho da fonte</span>
                      <span className="text-primary font-bold">{config.cabecalho.tamanhoFonte}px</span>
                    </Label>
                    <div className="px-1 pt-3">
                      <Slider
                        min={10}
                        max={24}
                        step={1}
                        value={[config.cabecalho.tamanhoFonte]}
                        onValueChange={(v) => update("cabecalho.tamanhoFonte", v[0])}
                        onValueCommit={() => saveField()}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Cor do texto</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={config.cabecalho.cor}
                        onChange={(e) => update("cabecalho.cor", e.target.value)}
                        onBlur={saveField}
                        className="w-10 h-10 rounded-lg border border-input cursor-pointer bg-transparent"
                      />
                      <Input
                        value={config.cabecalho.cor}
                        onChange={(e) => update("cabecalho.cor", e.target.value)}
                        onBlur={saveField}
                        className="flex-1 font-mono text-xs uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Alignment */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Alinhamento</Label>
                  <div className="grid grid-cols-3 gap-2 max-w-md">
                    {(
                      [
                        { v: "left", icon: AlignLeft, label: "Esquerda" },
                        { v: "center", icon: AlignCenter, label: "Centro" },
                        { v: "right", icon: AlignRight, label: "Direita" },
                      ] as const
                    ).map(({ v, icon: Icon, label }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => save({ ...config, cabecalho: { ...config.cabecalho, alinhamento: v } })}
                        className={cn(
                          "flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border-2 transition-all text-xs",
                          config.cabecalho.alinhamento === v
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border hover:border-primary/50 text-muted-foreground",
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: A4 live preview */}
            <div className="lg:w-[380px] flex-shrink-0">
              <HeaderPreviewA4
                logoEsquerda={config.cabecalho.logoEsquerda}
                logoDireita={config.cabecalho.logoDireita}
                linha1={config.cabecalho.linha1}
                linha2={config.cabecalho.linha2}
                rodape={config.rodapeTexto}
                fonte={config.cabecalho.fonte}
                tamanhoFonte={config.cabecalho.tamanhoFonte}
                alinhamento={config.cabecalho.alinhamento}
                cor={config.cabecalho.cor}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Receituário */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Receituário</h3>
          <div className="space-y-3">
            <div>
              <Label>Título do documento</Label>
              <Input
                value={config.receituario.titulo}
                onChange={(e) => update("receituario.titulo", e.target.value)}
                onBlur={saveField}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "mostrarProntuario", label: "Nº do prontuário" },
                { key: "mostrarConvenio", label: "Convênio" },
                { key: "mostrarNascimento", label: "Data de nascimento" },
                { key: "mostrarAssinatura", label: "Campo de assinatura" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <span className="text-sm">{item.label}</span>
                  <Switch
                    checked={(config.receituario as any)[item.key]}
                    onCheckedChange={(v) => save({ ...config, receituario: { ...config.receituario, [item.key]: v } })}
                  />
                </div>
              ))}
            </div>
            <div>
              <Label>Rodapé personalizado</Label>
              <Input
                value={config.receituario.rodape}
                onChange={(e) => update("receituario.rodape", e.target.value)}
                onBlur={saveField}
                placeholder="Texto opcional no rodapé"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Solicitação de Exames */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Solicitação de Exames</h3>
          <div className="space-y-3">
            <div>
              <Label>Título do documento</Label>
              <Input
                value={config.solicitacaoExames.titulo}
                onChange={(e) => update("solicitacaoExames.titulo", e.target.value)}
                onBlur={saveField}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "mostrarCodigoSus", label: "Código SUS" },
                { key: "mostrarIndicacao", label: "Indicação clínica" },
                { key: "mostrarAssinatura", label: "Campo de assinatura" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <span className="text-sm">{item.label}</span>
                  <Switch
                    checked={(config.solicitacaoExames as any)[item.key]}
                    onCheckedChange={(v) =>
                      save({ ...config, solicitacaoExames: { ...config.solicitacaoExames, [item.key]: v } })
                    }
                  />
                </div>
              ))}
            </div>
            <div>
              <Label>Rodapé personalizado</Label>
              <Input
                value={config.solicitacaoExames.rodape}
                onChange={(e) => update("solicitacaoExames.rodape", e.target.value)}
                onBlur={saveField}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Relatório de Evolução */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display text-foreground">Relatório de Evolução</h3>
            <Switch
              checked={config.relatorioEvolucao.habilitado}
              onCheckedChange={(v) =>
                save({ ...config, relatorioEvolucao: { ...config.relatorioEvolucao, habilitado: v } })
              }
            />
          </div>
          <div className="space-y-3">
            <div>
              <Label>Mostrar histórico de quantas sessões</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={config.relatorioEvolucao.historicoSessoes}
                onChange={(e) => update("relatorioEvolucao.historicoSessoes", parseInt(e.target.value) || 5)}
                onBlur={saveField}
                className="w-24"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Termo de Consentimento */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold font-display text-foreground">Termo de Consentimento</h3>
              <p className="text-xs text-muted-foreground">Exigir na primeira consulta</p>
            </div>
            <Switch
              checked={config.termoConsentimento.habilitado}
              onCheckedChange={(v) =>
                save({ ...config, termoConsentimento: { ...config.termoConsentimento, habilitado: v } })
              }
            />
          </div>
          {config.termoConsentimento.habilitado && (
            <div>
              <Label>Texto do Termo</Label>
              <Textarea
                value={config.termoConsentimento.texto}
                onChange={(e) => update("termoConsentimento.texto", e.target.value)}
                onBlur={saveField}
                className="min-h-[200px]"
                placeholder="Eu, paciente acima identificado, declaro que..."
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <ModelosDocumentos />
      <CarimboConfig />
    </div>
  );
};

export default ConfigImpressaoDocumentos;
