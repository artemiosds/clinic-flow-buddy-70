
import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  FileDown, 
  FileUp, 
  AlertTriangle, 
  CheckCircle2, 
  Users, 
  Filter, 
  Pencil, 
  Download,
  MoreVertical,
  Check
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { calcularPendenciasPaciente, PendenciaTipo } from "@/lib/pacientePendencias";
import { formatCPF, formatarDataBR, formatTelefoneBR } from "@/components/PacienteDetalheModal";
import QuickEditPatientModal from "@/components/pacientes/QuickEditPatientModal";
import PatientUpdateImportModal from "@/components/pacientes/PatientUpdateImportModal";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

const PacienteAtualizacaoCadastral: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { logAction } = useData();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const { data: rawPatients, isLoading } = useQuery({
    queryKey: ["pacientes-pendencias", user?.unidadeId],
    queryFn: async () => {
      let query = supabase.from("pacientes").select("*");
      
      if (user?.unidadeId && user?.usuario !== 'admin.sms') {
        query = query.eq('unidade_id', user.unidadeId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  const patientsWithPendencies = useMemo(() => {
    if (!rawPatients) return [];
    
    return rawPatients.map(p => {
      const res = calcularPendenciasPaciente(p);
      return { ...p, ...res };
    }).filter(p => {
      if (filterType === "all") return p.pendencias.length > 0;
      if (filterType === "sem_unidade") return p.pendencias.includes("sem_unidade");
      if (filterType === "sem_cpf") return p.pendencias.includes("sem_cpf");
      if (filterType === "sem_cns") return p.pendencias.includes("sem_cns");
      if (filterType === "critico") return p.status === "critico";
      return true;
    });
  }, [rawPatients, filterType]);

  const stats = useMemo(() => {
    if (!rawPatients) return { total: 0, completos: 0, incompletos: 0, semUnidade: 0, semCPF: 0, semCNS: 0 };
    
    const calculated = rawPatients.map(p => calcularPendenciasPaciente(p));
    
    return {
      total: rawPatients.length,
      completos: calculated.filter(c => c.score === 100).length,
      incompletos: calculated.filter(c => c.pendencias.length > 0).length,
      semUnidade: calculated.filter(c => c.pendencias.includes("sem_unidade")).length,
      semCPF: calculated.filter(c => c.pendencias.includes("sem_cpf")).length,
      semCNS: calculated.filter(c => c.pendencias.includes("sem_cns")).length,
    };
  }, [rawPatients]);

  const filteredData = useMemo(() => {
    if (!search) return patientsWithPendencies;
    const q = search.toLowerCase();
    return patientsWithPendencies.filter(p => 
      p.nome.toLowerCase().includes(q) || 
      p.cpf?.includes(q) || 
      p.cns?.includes(q)
    );
  }, [patientsWithPendencies, search]);

  const handleExportCSV = (selectedOnly = false) => {
    const dataToExport = selectedOnly 
      ? filteredData.filter(p => selectedIds.includes(p.id))
      : filteredData;
      
    if (dataToExport.length === 0) {
      toast.error("Nenhum paciente selecionado para exportar.");
      return;
    }

    const headers = [
      "id_paciente", "nome_completo", "nome_mae", "data_nascimento", "sexo", "cpf", "cns", 
      "naturalidade", "cep", "tipo_logradouro_dne", "logradouro", "numero", "complemento", 
      "bairro", "municipio", "uf", "telefone_principal", "telefone_secundario", "email", 
      "nacionalidade", "raca_cor_ibge", "unidade_id", "pendencias_detectadas"
    ];

    const rows = dataToExport.map(p => {
      const cd = p.custom_data || {};
      return [
        p.id,
        p.nome,
        p.nome_mae || "",
        p.data_nascimento || "",
        p.sexo || cd.sexo || "",
        p.cpf || "",
        p.cns || "",
        cd.naturalidade || "",
        cd.cep || "",
        cd.tipo_logradouro_codigo || "",
        cd.logradouro || p.endereco || "",
        cd.numero || "",
        cd.complemento || "",
        cd.bairro || "",
        p.municipio || cd.municipio || "",
        cd.uf || "",
        p.telefone || "",
        cd.telefone_secundario || "",
        p.email || "",
        cd.nacionalidade || "Brasil",
        cd.raca_cor || "",
        p.unidade_id || "",
        p.labels.join(" | ")
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(";");
    });

    const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pacientes_pendentes_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`${dataToExport.length} pacientes exportados.`);
    logAction({ acao: "exportar_pendencias_cadastrais", entidade: "paciente", detalhes: { count: dataToExport.length }, user });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredData.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredData.map(p => p.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Central de Atualização Cadastral" 
        subtitle="Identifique e corrija dados incompletos dos pacientes para garantir a conformidade com BPA/SUS."
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <FileUp className="w-4 h-4 mr-2" />
            Importar Atualizações
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <FileDown className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExportCSV(false)}>
                Exportar todos os pendentes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportCSV(true)} disabled={selectedIds.length === 0}>
                Exportar selecionados ({selectedIds.length})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageHeader>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total de Pacientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Base cadastral completa</p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Com Pendências</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.incompletos}</div>
            <p className="text-xs text-muted-foreground mt-1">{Math.round((stats.incompletos / stats.total) * 100) || 0}% da base</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Sem Unidade</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.semUnidade}</div>
            <p className="text-xs text-muted-foreground mt-1">Pacientes não vinculados</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Sem CPF/CNS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.semCPF + stats.semCNS}</div>
            <p className="text-xs text-muted-foreground mt-1">Essenciais para BPA/SUS</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Lista de Pacientes com Pendências</CardTitle>
              <Badge variant="outline" className="ml-2">
                {filteredData.length} pacientes
              </Badge>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome, CPF ou CNS..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filtrar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os pendentes</SelectItem>
                  <SelectItem value="critico">Críticos (baixa completude)</SelectItem>
                  <SelectItem value="sem_unidade">Sem unidade</SelectItem>
                  <SelectItem value="sem_cpf">Falta CPF</SelectItem>
                  <SelectItem value="sem_cns">Falta CNS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox 
                      checked={selectedIds.length > 0 && selectedIds.length === filteredData.length}
                      onCheckedChange={handleToggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>CPF / CNS</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Pendências Principais</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7} className="h-16 animate-pulse bg-muted/20" />
                    </TableRow>
                  ))
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 className="w-8 h-8 text-success opacity-20" />
                        <p>Nenhum paciente com pendências encontrado para o filtro atual.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedIds.includes(p.id)}
                          onCheckedChange={() => handleToggleSelect(p.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{p.nome}</span>
                          <span className="text-[10px] text-muted-foreground">{formatarDataBR(p.data_nascimento)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-[11px]">
                          <span>CPF: {p.cpf ? formatCPF(p.cpf) : <span className="text-destructive font-semibold">PENDENTE</span>}</span>
                          <span>CNS: {p.cns ? p.cns : <span className="text-destructive font-semibold">PENDENTE</span>}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.unidade_id ? (
                          <Badge variant="outline" className="font-normal">Unidade vinculada</Badge>
                        ) : (
                          <Badge variant="destructive" className="font-normal">SEM UNIDADE</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.labels.slice(0, 3).map((label: string, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-[9px] h-4 px-1 px-1 py-0">
                              {label}
                            </Badge>
                          ))}
                          {p.labels.length > 3 && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0">
                              +{p.labels.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${p.status === 'critico' ? 'bg-destructive' : 'bg-warning'}`}
                              style={{ width: `${p.score}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-medium">{p.score}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setQuickEditId(p.id)}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1.5" />
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modais */}
      {quickEditId && (
        <QuickEditPatientModal 
          open={!!quickEditId} 
          onOpenChange={(open) => !open && setQuickEditId(null)}
          pacienteId={quickEditId}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["pacientes-pendencias"] });
            setQuickEditId(null);
          }}
        />
      )}

      {isImportOpen && (
        <PatientUpdateImportModal 
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ["pacientes-pendencias"] });
            setIsImportOpen(false);
          }}
        />
      )}
    </div>
  );
};

// Sub-components helpers
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default PacienteAtualizacaoCadastral;
