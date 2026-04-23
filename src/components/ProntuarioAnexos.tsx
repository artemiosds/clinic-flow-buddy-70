import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Paperclip, Upload, FileText, Image as ImageIcon, FileType, Trash2, Download, Eye,
  Loader2, FileCheck2, Microscope, Stethoscope,
} from "lucide-react";

const BUCKET = "prontuario-anexos";
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

const CATEGORIAS = [
  { value: "documento", label: "Documento", icon: FileText, color: "text-blue-600" },
  { value: "exame", label: "Exame / Resultado", icon: Microscope, color: "text-emerald-600" },
  { value: "laudo", label: "Laudo", icon: Stethoscope, color: "text-violet-600" },
  { value: "imagem", label: "Imagem", icon: ImageIcon, color: "text-amber-600" },
  { value: "outro", label: "Outro", icon: FileType, color: "text-slate-600" },
];

const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

const getCategoriaConfig = (cat: string) => CATEGORIAS.find(c => c.value === cat) || CATEGORIAS[0];

interface AnexoRow {
  id: string;
  prontuario_id: string;
  paciente_id: string;
  agendamento_id: string;
  tipo_registro: string;
  categoria: string;
  nome_arquivo: string;
  storage_path: string;
  mime_type: string;
  tamanho_bytes: number;
  descricao: string;
  uploaded_by_nome: string;
  criado_em: string;
}

interface ProntuarioAnexosProps {
  /** UUID of the prontuario record. If absent, anexos can still be staged but won't persist until saved */
  prontuarioId?: string | null;
  pacienteId: string;
  agendamentoId?: string;
  tipoRegistro: string;
  unidadeId?: string;
  uploadedBy?: string;
  uploadedByNome?: string;
  /** Highlight retorno-style with a "previous results" panel */
  showResultadosAnteriores?: boolean;
  disabled?: boolean;
}

const ProntuarioAnexos: React.FC<ProntuarioAnexosProps> = ({
  prontuarioId, pacienteId, agendamentoId, tipoRegistro, unidadeId,
  uploadedBy, uploadedByNome, showResultadosAnteriores, disabled,
}) => {
  const [anexos, setAnexos] = useState<AnexoRow[]>([]);
  const [previousResults, setPreviousResults] = useState<AnexoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categoria, setCategoria] = useState<string>(tipoRegistro === "retorno" ? "exame" : "documento");
  const [descricao, setDescricao] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (!pacienteId) return;
    setLoading(true);
    try {
      // current prontuario anexos
      if (prontuarioId) {
        const { data } = await (supabase as any)
          .from("prontuario_anexos")
          .select("*")
          .eq("prontuario_id", prontuarioId)
          .order("criado_em", { ascending: false });
        setAnexos((data || []) as AnexoRow[]);
      } else {
        setAnexos([]);
      }

      // previous results (other prontuarios of same patient — exames/laudos)
      if (showResultadosAnteriores) {
        const { data } = await (supabase as any)
          .from("prontuario_anexos")
          .select("*")
          .eq("paciente_id", pacienteId)
          .in("categoria", ["exame", "laudo"])
          .order("criado_em", { ascending: false })
          .limit(20);
        const filtered = ((data || []) as AnexoRow[]).filter(a => a.prontuario_id !== prontuarioId);
        setPreviousResults(filtered);
      }
    } finally {
      setLoading(false);
    }
  }, [prontuarioId, pacienteId, showResultadosAnteriores]);

  useEffect(() => { reload(); }, [reload]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!prontuarioId) {
      toast.error("Salve o prontuário primeiro para anexar arquivos");
      return;
    }
    if (!pacienteId) {
      toast.error("Paciente não definido");
      return;
    }

    setUploading(true);
    let uploadedCount = 0;

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: arquivo muito grande (máx 15MB)`);
          continue;
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${pacienteId}/${prontuarioId}/${Date.now()}_${safeName}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (upErr) {
          console.error("[anexo upload]", upErr);
          toast.error(`Falha ao enviar ${file.name}`);
          continue;
        }

        const { error: insErr } = await (supabase as any).from("prontuario_anexos").insert({
          prontuario_id: prontuarioId,
          paciente_id: pacienteId,
          agendamento_id: agendamentoId || "",
          tipo_registro: tipoRegistro,
          categoria,
          nome_arquivo: file.name,
          storage_path: path,
          mime_type: file.type || "application/octet-stream",
          tamanho_bytes: file.size,
          descricao: descricao.trim(),
          uploaded_by: uploadedBy || "",
          uploaded_by_nome: uploadedByNome || "",
          unidade_id: unidadeId || "",
        });

        if (insErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          console.error("[anexo insert]", insErr);
          toast.error(`Falha ao registrar ${file.name}`);
          continue;
        }
        uploadedCount++;
      }

      if (uploadedCount > 0) {
        toast.success(`${uploadedCount} arquivo(s) anexado(s)`);
        setDescricao("");
        await reload();
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleView = async (anexo: AnexoRow) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(anexo.storage_path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o arquivo");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownload = async (anexo: AnexoRow) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(anexo.storage_path);
    if (error || !data) {
      toast.error("Falha ao baixar");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = anexo.nome_arquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (anexo: AnexoRow) => {
    if (!confirm(`Remover "${anexo.nome_arquivo}"?`)) return;
    await supabase.storage.from(BUCKET).remove([anexo.storage_path]);
    const { error } = await (supabase as any).from("prontuario_anexos").delete().eq("id", anexo.id);
    if (error) {
      toast.error("Falha ao remover");
      return;
    }
    toast.success("Anexo removido");
    reload();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    handleFiles(e.dataTransfer.files);
  };

  const renderAnexoCard = (a: AnexoRow, withDelete = true) => {
    const cfg = getCategoriaConfig(a.categoria);
    const Icon = cfg.icon;
    const isImage = a.mime_type.startsWith("image/");
    return (
      <div
        key={a.id}
        className="group flex items-center gap-3 rounded-lg border border-border/50 bg-card hover:bg-accent/30 transition-colors px-3 py-2.5"
      >
        <div className={`w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate" title={a.nome_arquivo}>{a.nome_arquivo}</p>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">{cfg.label}</Badge>
            {isImage && <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">IMG</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
            <span>{formatBytes(a.tamanho_bytes)}</span>
            <span>·</span>
            <span>{new Date(a.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
            {a.uploaded_by_nome && <><span>·</span><span className="truncate">{a.uploaded_by_nome}</span></>}
          </div>
          {a.descricao && <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">{a.descricao}</p>}
        </div>
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleView(a)} title="Visualizar">
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDownload(a)} title="Baixar">
            <Download className="w-3.5 h-3.5" />
          </Button>
          {withDelete && !disabled && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => handleDelete(a)} title="Remover">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Anexos e Documentos</h4>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{anexos.length}</Badge>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* PAINEL DE RESULTADOS ANTERIORES (Retorno) */}
        {showResultadosAnteriores && previousResults.length > 0 && (
          <div className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/10 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <FileCheck2 className="w-4 h-4 text-emerald-600" />
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Resultados de exames e laudos anteriores
              </p>
              <Badge className="bg-emerald-600 text-white text-[10px] h-4 px-1.5 ml-auto">{previousResults.length}</Badge>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {previousResults.map(a => renderAnexoCard(a, false))}
            </div>
          </div>
        )}

        {/* FORM DE UPLOAD */}
        {!disabled && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Categoria</label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => {
                      const Icon = c.icon;
                      return (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2"><Icon className={`w-3.5 h-3.5 ${c.color}`} />{c.label}</div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Descrição (opcional)</label>
                <Input
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  placeholder="Ex: Hemograma de 10/04, Raio-X tórax..."
                  className="h-9 mt-1 text-sm"
                  maxLength={200}
                />
              </div>
            </div>

            {/* DRAG & DROP ZONE */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                rounded-lg border-2 border-dashed cursor-pointer transition-all
                ${dragOver ? "border-primary bg-primary/5" : "border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border"}
                ${uploading ? "opacity-50 pointer-events-none" : ""}
                px-4 py-5 text-center
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              />
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-muted-foreground/60 mx-auto mb-1.5" />
                  <p className="text-sm font-medium text-foreground">
                    Arraste arquivos ou <span className="text-primary underline">clique para selecionar</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">PDF, imagens, Word, Excel · até 15MB cada</p>
                  {!prontuarioId && (
                    <p className="text-[11px] text-amber-600 mt-1.5">⚠ Salve o prontuário primeiro para habilitar anexos</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* LISTA DE ANEXOS DESTE PRONTUÁRIO */}
        {loading ? (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Carregando anexos...
          </div>
        ) : anexos.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Anexos deste atendimento</p>
            {anexos.map(a => renderAnexoCard(a))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center italic py-2">Nenhum anexo neste atendimento.</p>
        )}
      </div>
    </div>
  );
};

export default ProntuarioAnexos;
