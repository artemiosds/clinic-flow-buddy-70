import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Paperclip, Upload, FileText, Image as ImageIcon, FileType, Trash2, Download, Eye,
  Loader2, UserCircle, FileCheck2, Search, X
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const BUCKET = "paciente-documentos";
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const CATEGORIAS = [
  { value: "identificacao", label: "Identificação (RG/CPF)", icon: UserCircle, color: "text-blue-600" },
  { value: "comprovante", label: "Comprovante", icon: FileCheck2, color: "text-emerald-600" },
  { value: "exame", label: "Exame", icon: Search, color: "text-violet-600" },
  { value: "laudo", label: "Laudo / Relatório", icon: FileText, color: "text-amber-600" },
  { value: "outro", label: "Outro", icon: FileType, color: "text-slate-600" },
  { value: "justificativa_falta", label: "Justificativa de Falta", icon: X, color: "text-destructive" },
];

const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

const getCategoriaConfig = (cat: string) => CATEGORIAS.find(c => c.value === cat) || CATEGORIAS[0];

interface DocRow {
  id: string;
  paciente_id: string;
  unidade_id: string;
  nome_arquivo: string;
  nome_original: string;
  tipo_documento: string;
  mime_type: string;
  tamanho_bytes: number;
  storage_bucket: string;
  storage_path: string;
  uploaded_by_nome: string;
  created_at: string;
}

interface PacienteDocumentosProps {
  pacienteId: string;
  unidadeId?: string;
  disabled?: boolean;
  agendamentoId?: string;
}

const PacienteDocumentos: React.FC<PacienteDocumentosProps> = ({
  pacienteId, unidadeId, disabled, agendamentoId,
}) => {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categoria, setCategoria] = useState<string>("identificacao");
  const [descricao, setDescricao] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const reload = useCallback(async () => {
    if (!pacienteId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("paciente_documentos")
        .select("*")
        .eq("paciente_id", pacienteId)
        .eq("ativo", true);
      
      if (agendamentoId) {
        query = query.eq("agendamento_id", agendamentoId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      
      if (error) throw error;
      setDocs((data || []) as DocRow[]);
    } catch (err) {
      console.error("[docs fetch]", err);
      toast.error("Erro ao carregar documentos");
    } finally {
      setLoading(false);
    }
  }, [pacienteId, agendamentoId]);

  useEffect(() => { reload(); }, [reload]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!pacienteId) {
      toast.error("Paciente não identificado");
      return;
    }

    setUploading(true);
    let uploadedCount = 0;

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: arquivo muito grande (máx 10MB)`);
          continue;
        }

        const ext = file.name.split(".").pop();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${pacienteId}/${Date.now()}_${safeName}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        
        if (upErr) {
          console.error("[doc upload]", upErr);
          toast.error(`Falha ao enviar ${file.name}`);
          continue;
        }

        const { error: insErr } = await supabase.from("paciente_documentos").insert({
          paciente_id: pacienteId,
          unidade_id: unidadeId || user?.unidadeId || "",
          nome_arquivo: descricao.trim() || file.name,
          nome_original: file.name,
          tipo_documento: categoria,
          mime_type: file.type || "application/octet-stream",
          tamanho_bytes: file.size,
          storage_bucket: BUCKET,
          storage_path: path,
          uploaded_by: user?.id || "",
          uploaded_by_nome: user?.nome || "",
          agendamento_id: agendamentoId || null,
        });

        if (insErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          console.error("[doc insert]", insErr);
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
    } catch (err) {
      console.error("[upload error]", err);
      toast.error("Erro inesperado no upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleView = async (doc: DocRow) => {
    try {
      const { data, error } = await supabase.storage.from(doc.storage_bucket || BUCKET).createSignedUrl(doc.storage_path, 60 * 10);
      if (error || !data?.signedUrl) {
        toast.error("Não foi possível abrir o arquivo. Verifique se ele ainda existe.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Erro ao gerar link de visualização");
    }
  };

  const handleDownload = async (doc: DocRow) => {
    try {
      const { data, error } = await supabase.storage.from(doc.storage_bucket || BUCKET).download(doc.storage_path);
      if (error || !data) {
        toast.error("Falha ao baixar o arquivo");
        return;
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.nome_original || doc.nome_arquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Erro no download");
    }
  };

  const handleDelete = async (doc: DocRow) => {
    if (!confirm(`Deseja realmente remover o documento "${doc.nome_arquivo}"?`)) return;
    
    try {
      // Soft delete in DB
      const { error } = await supabase
        .from("paciente_documentos")
        .update({ ativo: false, deleted_at: new Date().toISOString(), deleted_by: user?.id })
        .eq("id", doc.id);

      if (error) throw error;
      
      toast.success("Documento removido");
      reload();
    } catch (err) {
      console.error("[delete error]", err);
      toast.error("Falha ao remover documento");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      {/* FORM DE UPLOAD */}
      {!disabled && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                Categoria
              </label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => {
                    const Icon = c.icon;
                    return (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${c.color}`} />
                          <span>{c.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                Nome do documento / Descrição
              </label>
              <Input
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Ex: RG Frente, Comprovante de Residência..."
                className="h-10"
                maxLength={100}
              />
            </div>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              rounded-lg border-2 border-dashed cursor-pointer transition-all p-6 text-center
              ${dragOver ? "border-primary bg-primary/5" : "border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border"}
              ${uploading ? "opacity-50 pointer-events-none" : ""}
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
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm font-medium">Enviando arquivos...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground/60" />
                <p className="text-sm font-medium">
                  Clique ou arraste arquivos para anexar
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, Imagens, Word ou Excel (até 10MB)
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LISTA DE DOCUMENTOS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Paperclip className="w-4 h-4" />
            Documentos Anexados
            <Badge variant="secondary" className="h-5 px-1.5">{docs.length}</Badge>
          </h4>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        </div>

        {docs.length > 0 ? (
          <div className="grid grid-cols-1 gap-2">
            {docs.map(doc => {
              const cfg = getCategoriaConfig(doc.tipo_documento);
              const Icon = cfg.icon;
              return (
                <div
                  key={doc.id}
                  className="group flex items-center gap-3 rounded-lg border border-border/50 bg-card hover:bg-accent/30 transition-all px-3 py-3"
                >
                  <div className={`w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-foreground truncate max-w-[200px]" title={doc.nome_arquivo}>
                        {doc.nome_arquivo}
                      </p>
                      <Badge variant="outline" className="text-[9px] h-4 px-1 font-medium uppercase">
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium">{formatBytes(doc.tamanho_bytes)}</span>
                      <span>•</span>
                      <span>{new Date(doc.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      {doc.uploaded_by_nome && (
                        <>
                          <span>•</span>
                          <span className="truncate italic">Por: {doc.uploaded_by_nome}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => handleView(doc)}
                      title="Visualizar"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => handleDownload(doc)}
                      title="Baixar"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    {!disabled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(doc)}
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : !loading ? (
          <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-border/60 bg-muted/10">
            <FileText className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground font-medium">Nenhum documento anexado.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PacienteDocumentos;
