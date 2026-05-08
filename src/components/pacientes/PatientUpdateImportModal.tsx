import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { normalizePhone } from "@/lib/phoneUtils";
import { Badge } from "@/components/ui/badge";
import { updatePacienteCadastro } from "@/lib/pacienteService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface PreviewRow {
  id_paciente?: string;
  nome_completo: string;
  cpf?: string;
  cns?: string;
  data_nascimento?: string;
  telefone?: string;
  unidade_id?: string;
  raw: any;
  status: "novo" | "atualizar" | "erro";
  motivo?: string;
}

const PatientUpdateImportModal: React.FC<Props> = ({ open, onOpenChange, onImported }) => {
  const [step, setStep] = useState<"upload" | "preview" | "processing">("upload");
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      await processCSV(text);
    };
    reader.readAsText(file, "UTF-8");
  };

  const processCSV = async (text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      toast.error("Arquivo CSV vazio ou sem dados.");
      setLoading(false);
      return;
    }

    const separator = text.includes(";") ? ";" : ",";
    const headers = lines[0].split(separator).map(h => h.replace(/"/g, "").trim().toLowerCase());
    
    const rows = lines.slice(1);
    const parsedRows: PreviewRow[] = [];

    for (const row of rows) {
      const values = row.split(separator).map(v => v.replace(/"/g, "").trim());
      const data: any = {};
      headers.forEach((h, i) => {
        data[h] = values[i];
      });

      const nome = data.nome_completo || data.nome;
      if (!nome) continue;

      const id = data.id_paciente || data.id;

      parsedRows.push({
        id_paciente: id,
        nome_completo: nome,
        cpf: data.cpf,
        cns: data.cns,
        data_nascimento: data.data_nascimento || data.nascimento,
        telefone: data.telefone_principal || data.telefone,
        raw: data,
        status: id ? "atualizar" : "novo"
      });
    }

    setPreviewData(parsedRows);
    setStep("preview");
    setLoading(false);
  };

  const executeImport = async () => {
    setStep("processing");
    let count = 0;
    let errors = 0;

    for (const row of previewData) {
      try {
        const payload: any = {
          nome: row.nome_completo,
          cpf: row.cpf,
          cns: row.cns,
          data_nascimento: row.data_nascimento,
          telefone: row.telefone,
          ...row.raw
        };

        // Mapear campos comuns que podem estar com nomes diferentes no CSV
        if (row.raw.raca_cor_ibge) payload.raca_cor = row.raw.raca_cor_ibge;
        if (row.raw.logradouro) payload.endereco = row.raw.logradouro;

        if (row.id_paciente) {
          // Atualizar paciente existente usando a função centralizada
          await updatePacienteCadastro(row.id_paciente, payload, "Importador");
        } else {
          // Tentar encontrar por CPF se não tiver ID
          const cleanCPF = (row.cpf || "").replace(/\D/g, "");
          if (cleanCPF) {
            const { data: existing } = await supabase
              .from("pacientes")
              .select("id")
              .eq("cpf", cleanCPF)
              .maybeSingle();
            
            if (existing) {
              await updatePacienteCadastro(existing.id, payload, "Importador(CPF)");
              count++;
              continue;
            }
          }

          // Criar novo paciente
          const { error } = await supabase.from("pacientes").insert({
            ...payload,
            id: `p${Date.now()}${Math.floor(Math.random() * 1000)}`,
            atualizado_em: new Date().toISOString()
          });
          if (error) throw error;
        }
        count++;
      } catch (err) {
        console.error("Erro na importação de linha:", err);
        errors++;
      }
    }

    toast.success(`Importação finalizada: ${count} pacientes processados.`);
    if (errors > 0) toast.warning(`${errors} registros falharam.`);
    onImported();
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Importar Atualizações Cadastrais</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-2">
          {step === "upload" && (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
              <Upload className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-sm text-center max-w-xs mb-4">
                Selecione o arquivo CSV exportado e corrigido para atualizar os dados dos pacientes.
              </p>
              <Button onClick={() => fileInputRef.current?.click()} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Selecionar Arquivo CSV
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".csv"
              />
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Prévia da Importação ({previewData.length} registros)</h3>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    {previewData.filter(p => p.status === "atualizar").length} Atualizações
                  </Badge>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    {previewData.filter(p => p.status === "novo").length} Novos
                  </Badge>
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ação</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF / CNS</TableHead>
                      <TableHead>Nascimento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(0, 10).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {row.status === "atualizar" ? (
                            <Badge variant="outline" className="text-blue-600 border-blue-200">Atualizar</Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-200">Novo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{row.nome_completo}</TableCell>
                        <TableCell className="text-[10px]">{row.cpf || row.cns || "-"}</TableCell>
                        <TableCell className="text-[10px]">{row.data_nascimento || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {previewData.length > 10 && (
                  <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                    + {previewData.length - 10} registros ocultos na prévia
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "processing" && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm font-medium">Processando atualizações... Não feche esta janela.</p>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 border-t bg-muted/20">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={step === "processing"}>
            Cancelar
          </Button>
          {step === "preview" && (
            <Button onClick={executeImport}>
              <Save className="w-4 h-4 mr-2" />
              Confirmar e Importar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PatientUpdateImportModal;
