
import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
  Check,
  ChevronLeft,
  LayoutGrid,
  ClipboardCheck,
  IdCard,
  CreditCard,
  FileWarning,
  Loader2
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";

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
    },
    placeholderData: keepPreviousData
  });

  const patientsWithPendencies = useMemo(() => {
    if (!rawPatients) return [];
    
    return rawPatients.map(p => {
      const res = calcularPendenciasPaciente(p);
      return { ...p, ...res };
    }).filter(p => {
      if (filterType === "all") return p.pendencias.length > 0;
      if (filterType === "pendente") return p.status === "pendente";
      if (filterType === "sem_cpf") return p.pendencias.includes("sem_cpf");
      if (filterType === "sem_cns") return p.pendencias.includes("sem_cns");
      if (filterType === "sem_bpa") return p.pendencias.includes("sem_bpa");
      return true;
    });
  }, [rawPatients, filterType]);

  const stats = useMemo(() => {
    if (!rawPatients) return { total: 0, completos: 0, pendentes: 0, semCPF: 0, semCNS: 0, semBPA: 0 };
    
    const calculated = rawPatients.map(p => calcularPendenciasPaciente(p));
    
    return {
      total: rawPatients.length,
      completos: calculated.filter(c => c.status === "completo").length,
      pendentes: calculated.filter(c => c.status === "pendente" || c.status === "parcial").length,
      semCPF: calculated.filter(c => c.pendencias.includes("sem_cpf")).length,
      semCNS: calculated.filter(c => c.pendencias.includes("sem_cns")).length,
      semBPA: calculated.filter(c => c.pendencias.includes("sem_bpa")).length,
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
      "nacionalidade", "raca_cor_ibge", "pendencias_detectadas"
    ];

    const rows = dataToExport.map(p => {
      const cd = (p.custom_data as any) || {};
      return [
        p.id,
        p.nome,
        (p as any).nome_mae || "",
        (p as any).data_nascimento || "",
        (p as any).sexo || cd.sexo || "",
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Link to="/painel/pacientes" className="hover:text-primary flex items-center gap-1 text-sm transition-colors">
              <ChevronLeft className="w-4 h-4" />
              Voltar para Pacientes
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Central de Atualização Cadastral</h1>
          <p className="text-muted-foreground text-lg">
            Regularize os dados dos pacientes para garantir a integridade da exportação BPA/SUS.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setIsImportOpen(true)} className="shadow-sm border-2">
            <FileUp className="w-4 h-4 mr-2" />
            Importar Atualizações
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="shadow-md">
                <FileDown className="w-4 h-4 mr-2" />
                Exportar Pendentes
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => handleExportCSV(false)}>
                <Download className="w-4 h-4 mr-2" /> Exportar todos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportCSV(true)} disabled={selectedIds.length === 0}>
                <Check className="w-4 h-4 mr-2" /> Exportar selecionados ({selectedIds.length})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Cards de Resumo Modernos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-none shadow-sm bg-gradient-to-br from-white to-slate-50 border-t-4 border-t-slate-300">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total</CardTitle>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="text-xs text-slate-400 mt-1">Pacientes na base</p>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm bg-gradient-to-br from-white to-red-50 border-t-4 border-t-destructive">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-destructive uppercase tracking-wider">Pendentes</CardTitle>
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats.pendentes}</div>
            <p className="text-xs text-destructive/70 mt-1">Ações necessárias</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gradient-to-br from-white to-blue-50 border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-blue-500 uppercase tracking-wider">Sem CPF/CNS</CardTitle>
              <IdCard className="w-4 h-4 text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.semCPF + stats.semCNS}</div>
            <p className="text-xs text-blue-400 mt-1">Dados essenciais</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gradient-to-br from-white to-amber-50 border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-amber-500 uppercase tracking-wider">Pendente BPA</CardTitle>
              <FileWarning className="w-4 h-4 text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{stats.semBPA}</div>
            <p className="text-xs text-amber-500 mt-1">Bloqueios de exportação</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gradient-to-br from-white to-emerald-50 border-t-4 border-t-emerald-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-emerald-500 uppercase tracking-wider">Concluídos</CardTitle>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{stats.completos}</div>
            <p className="text-xs text-emerald-500 mt-1">100% regularizados</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
        <CardHeader className="pb-5 border-b bg-slate-50/50">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ClipboardCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Fila de Regularização</CardTitle>
                <p className="text-sm text-muted-foreground">Gerencie as correções pendentes da base de dados</p>
              </div>
              <Badge variant="secondary" className="px-3 py-1 bg-primary/5 text-primary border-primary/20">
                {filteredData.length} registros
              </Badge>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CPF ou CNS..."
                  className="pl-10 h-11 border-slate-200 focus-visible:ring-primary shadow-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[220px] h-11 border-slate-200 shadow-sm bg-white">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="Filtrar por pendência" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as pendências</SelectItem>
                  <SelectItem value="pendente">Apenas Críticos</SelectItem>
                  <SelectItem value="sem_cpf">Faltando CPF</SelectItem>
                  <SelectItem value="sem_cns">Faltando CNS</SelectItem>
                  <SelectItem value="sem_bpa">Irregular para BPA/SUS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="w-12 px-6">
                    <Checkbox 
                      checked={selectedIds.length > 0 && selectedIds.length === filteredData.length}
                      onCheckedChange={handleToggleSelectAll}
                      className="border-slate-300"
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-slate-600 px-4">Paciente</TableHead>
                  <TableHead className="font-semibold text-slate-600 px-4">Documentos</TableHead>
                  <TableHead className="font-semibold text-slate-600 px-4">Pendências Prioritárias</TableHead>
                  <TableHead className="font-semibold text-slate-600 px-4">Status Cadastral</TableHead>
                  <TableHead className="text-right px-6 font-semibold text-slate-600">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6} className="h-20 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="text-sm text-muted-foreground">Carregando dados...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center gap-4 py-12">
                        <div className="p-4 bg-emerald-50 rounded-full">
                          <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xl font-semibold text-slate-900">Tudo em ordem!</p>
                          <p className="text-muted-foreground">Nenhum registro encontrado com os critérios selecionados.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((p) => (
                    <TableRow key={p.id} className="group hover:bg-slate-50/80 transition-colors border-slate-100">
                      <TableCell className="px-6">
                        <Checkbox 
                          checked={selectedIds.includes(p.id)}
                          onCheckedChange={() => handleToggleSelect(p.id)}
                          className="border-slate-300"
                        />
                      </TableCell>
                      <TableCell className="px-4">
                        <div className="flex flex-col py-1">
                          <span className="font-bold text-slate-900 group-hover:text-primary transition-colors">{p.nome}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            Nascto: {formatarDataBR(p.data_nascimento)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 w-8">CPF:</span>
                            <span className={`text-xs font-medium ${!p.cpf ? 'text-destructive' : 'text-slate-600'}`}>
                              {p.cpf ? formatCPF(p.cpf) : 'Pendente'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 w-8">CNS:</span>
                            <span className={`text-xs font-medium ${!p.cns ? 'text-destructive' : 'text-slate-600'}`}>
                              {p.cns ? p.cns : 'Pendente'}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4">
                        <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                          {p.labels.slice(0, 3).map((label: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-[10px] font-medium bg-white border-slate-200 text-slate-600 px-2 py-0">
                              {label}
                            </Badge>
                          ))}
                          {p.labels.length > 3 && (
                            <Badge variant="outline" className="text-[10px] font-medium bg-slate-100 text-slate-500 border-none px-2 py-0">
                              +{p.labels.length - 3}
                            </Badge>
                          )}
                          {p.pendencias.includes("sem_bpa") && (
                            <Badge className="text-[10px] font-bold bg-amber-50 text-amber-700 border-amber-200 px-2 py-0">
                              Inativo p/ BPA
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4">
                        <div className="flex flex-col gap-1.5 min-w-[120px]">
                          <div className="flex items-center justify-between gap-3">
                            <span className={`text-[10px] font-bold uppercase tracking-tight ${
                              p.status === 'pendente' ? 'text-destructive' : 
                              p.status === 'parcial' ? 'text-amber-600' : 'text-emerald-600'
                            }`}>
                              {p.status === 'pendente' ? 'Cadastro Pendente' : 
                               p.status === 'parcial' ? 'Parcial' : 'Completo'}
                            </span>
                            <span className="text-xs font-bold text-slate-400">{p.score}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                p.status === 'pendente' ? 'bg-destructive' : 
                                p.status === 'parcial' ? 'bg-amber-400' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${p.score}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="hover:bg-primary/10 hover:text-primary transition-all group/btn"
                          onClick={() => setQuickEditId(p.id)}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-2 group-hover/btn:scale-110 transition-transform" />
                          Corrigir Dados
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="p-4 border-t bg-slate-50/30 text-xs text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Campos críticos para o SUS incluem CPF, CNS, Nome da Mãe, Nascimento, Sexo e Raça/Cor.</span>
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

export default PacienteAtualizacaoCadastral;
