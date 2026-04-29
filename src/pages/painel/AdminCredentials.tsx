import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Eye, EyeOff, Copy, Check, ShieldAlert, Key, Download,
  Loader2, Code2, Database, AlertTriangle, Info,
} from "lucide-react";

interface TableRaw {
  name: string;
  row_count: number;
  column_count: number;
  encrypted_columns: string | null;
  has_user_id: boolean;
}

interface CredentialsData {
  project_url: string | null;
  anon_key: string | null;
  service_role_key: string | null;
  secrets: Record<string, string>;
  edge_functions: string[];
  edge_functions_count: number;
  database_tables?: TableRaw[];
}

type TableClass = "essencial" | "historico" | "ignorar";

function classifyTable(t: TableRaw): { cls: TableClass; reason: string } {
  const n = t.name.toLowerCase();
  if (/_log|_history|migration|audit/.test(n) || (t.encrypted_columns && t.encrypted_columns.length > 0)) {
    return { cls: "ignorar", reason: "Tabela de log/auditoria/histórico ou com colunas criptografadas — geralmente não precisa migrar." };
  }
  if (/settings|config|role/.test(n) || (n === "profiles" && t.has_user_id)) {
    return { cls: "essencial", reason: "Configuração, papel de usuário ou perfil — essencial para o funcionamento do sistema." };
  }
  if (t.has_user_id && /credit|subscription/.test(n) && t.row_count < 1000) {
    return { cls: "essencial", reason: "Dados de assinatura/crédito por usuário — essenciais." };
  }
  if (/payment|sale|transaction|order/.test(n)) {
    return { cls: "historico", reason: "Tabela transacional/histórica — migre se precisar do histórico." };
  }
  return { cls: "historico", reason: "Tabela de domínio — avalie a necessidade de migrar histórico." };
}

function maskValue(v: string): string {
  if (!v) return "";
  if (v.length <= 24) return "•".repeat(v.length);
  return `${v.slice(0, 12)}•••••${v.slice(-8)}`;
}

const SecretRow = ({ label, value, revealed }: { label: string; value: string; revealed: boolean }) => {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const visible = revealed && show;

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} copiado`);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="font-mono text-sm break-all text-foreground">
          {revealed ? (visible ? value : maskValue(value)) : "••••••••••••••••"}
        </div>
      </div>
      {revealed && (
        <>
          <Button size="icon" variant="ghost" onClick={() => setShow((s) => !s)} aria-label="Mostrar/ocultar">
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={handleCopy} aria-label="Copiar">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </>
      )}
    </div>
  );
};

export default function AdminCredentials() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CredentialsData | null>(null);

  const isMaster = user?.role?.toLowerCase().trim() === "master";

  const handleReveal = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        toast.error("Sessão não encontrada. Faça login novamente.");
        return;
      }
      const { data: resp, error } = await supabase.functions.invoke("admin-credentials", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if ((resp as any)?.error) throw new Error((resp as any).error);
      setData(resp as CredentialsData);
      toast.success("Credenciais reveladas");
    } catch (e: any) {
      toast.error(`Falha: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAll = async () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push("═══════════════════════════════════════");
    lines.push("  CREDENCIAIS DO PROJETO");
    lines.push("═══════════════════════════════════════");
    lines.push(`SUPABASE_URL=${data.project_url ?? ""}`);
    lines.push(`SUPABASE_ANON_KEY=${data.anon_key ?? ""}`);
    lines.push(`SUPABASE_SERVICE_ROLE_KEY=${data.service_role_key ?? ""}`);
    lines.push("");
    lines.push("═══════════════════════════════════════");
    lines.push("  SECRETS ADICIONAIS");
    lines.push("═══════════════════════════════════════");
    for (const [k, v] of Object.entries(data.secrets)) {
      lines.push(`${k}=${v}`);
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Todas as credenciais copiadas");
  };

  const handleDownloadTs = () => {
    if (!data) return;
    const all: Record<string, string> = {};
    if (data.project_url) all.SUPABASE_URL = data.project_url;
    if (data.anon_key) all.SUPABASE_ANON_KEY = data.anon_key;
    if (data.service_role_key) all.SUPABASE_SERVICE_ROLE_KEY = data.service_role_key;
    Object.assign(all, data.secrets);

    const lines: string[] = [];
    lines.push(`// Secrets do projeto - Gerado em ${new Date().toLocaleDateString("pt-BR")}`);
    lines.push(`export const SECRETS = {`);
    for (const [k, v] of Object.entries(all)) {
      lines.push(`  ${k}: ${JSON.stringify(v)},`);
    }
    lines.push(`} as const;`);
    lines.push(``);
    lines.push(`export type SecretKey = keyof typeof SECRETS;`);
    lines.push(``);

    const blob = new Blob([lines.join("\n")], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "secrets.ts";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("secrets.ts baixado");
  };

  const handleDownloadEdgeFunctions = () => {
    try {
      const modules = import.meta.glob("/supabase/functions/*/index.ts", {
        query: "?raw",
        import: "default",
        eager: true,
      }) as Record<string, string>;

      const entries = Object.entries(modules);
      if (entries.length === 0) {
        toast.warning("Nenhuma edge function encontrada no build");
        return;
      }

      const lines: string[] = [];
      lines.push(`// Edge Functions consolidadas - Gerado em ${new Date().toLocaleDateString("pt-BR")}`);
      lines.push(`// Total: ${entries.length} função(ões)`);
      lines.push("");
      for (const [path, source] of entries) {
        const name = path.split("/").slice(-2, -1)[0];
        lines.push(`// ═══════════════════════════════════════`);
        lines.push(`//   ${name}`);
        lines.push(`//   ${path}`);
        lines.push(`// ═══════════════════════════════════════`);
        lines.push(source);
        lines.push("");
      }

      const blob = new Blob([lines.join("\n")], { type: "text/typescript" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "edge-functions.ts";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${entries.length} edge function(s) exportadas`);
    } catch (e: any) {
      toast.error(`Falha ao exportar: ${e?.message || e}`);
    }
  };

  const tables = data?.database_tables ?? [];
  const hasUserTables = useMemo(
    () => tables.some((t) => /profile|user_role|users/.test(t.name.toLowerCase())),
    [tables],
  );

  if (!isMaster) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Acesso restrito</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Esta página é exclusiva ao perfil <strong>Master</strong>.
        </p>
      </div>
    );
  }

  const secretsCount = data ? Object.keys(data.secrets).length : 0;
  const credCount = data
    ? [data.project_url, data.anon_key, data.service_role_key].filter(Boolean).length
    : 0;
  const fnCount = data?.edge_functions_count ?? 0;
  const tableCount = tables.length;

  return (
    <TooltipProvider>
      <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-7 w-7 text-destructive" />
              Credenciais do Projeto
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Área restrita ao Master. Não compartilhe estes dados.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleReveal} disabled={loading} variant="default">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Revelar Tudo
            </Button>
            {data && (
              <>
                <Button variant="outline" onClick={handleCopyAll}>
                  <Copy className="h-4 w-4" />
                  Copiar Tudo
                </Button>
                <Button variant="outline" onClick={handleDownloadTs}>
                  <Download className="h-4 w-4" />
                  Download .ts
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Aviso de risco */}
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong>Atenção:</strong> a <code className="bg-muted px-1 rounded">service_role_key</code> dá acesso total ao banco e ignora RLS.
            Vazar este valor compromete todo o sistema.
          </div>
        </div>

        {/* 4 Cards resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-8 w-8 text-destructive" />
                <div>
                  <div className="text-2xl font-bold">{credCount}</div>
                  <div className="text-xs text-muted-foreground">Credenciais</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Key className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{secretsCount}</div>
                  <div className="text-xs text-muted-foreground">Secrets</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Code2 className="h-8 w-8 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold">{fnCount}</div>
                  <div className="text-xs text-muted-foreground">Edge Functions</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Database className="h-8 w-8 text-emerald-600" />
                <div>
                  <div className="text-2xl font-bold">{tableCount}</div>
                  <div className="text-xs text-muted-foreground">Tabelas do Banco</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Card de Credenciais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Credenciais
            </CardTitle>
            <CardDescription>Chaves principais do projeto</CardDescription>
          </CardHeader>
          <CardContent>
            <SecretRow label="Project URL" value={data?.project_url ?? ""} revealed={!!data} />
            <SecretRow label="Anon Key" value={data?.anon_key ?? ""} revealed={!!data} />
            <SecretRow label="Service Role Key" value={data?.service_role_key ?? ""} revealed={!!data} />
          </CardContent>
        </Card>

        {/* Card de Secrets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Secrets
            </CardTitle>
            <CardDescription>Variáveis de ambiente adicionais</CardDescription>
          </CardHeader>
          <CardContent>
            {!data && <p className="text-sm text-muted-foreground">Clique em "Revelar Tudo" para listar.</p>}
            {data && Object.keys(data.secrets).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum secret adicional configurado.</p>
            )}
            {data &&
              Object.entries(data.secrets).map(([k, v]) => (
                <SecretRow key={k} label={k} value={v} revealed />
              ))}
          </CardContent>
        </Card>

        {/* Card de Edge Functions */}
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-blue-600" />
                Edge Functions
              </CardTitle>
              <CardDescription>Funções descobertas via probe</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadEdgeFunctions}>
              <Download className="h-4 w-4" />
              Download .ts
            </Button>
          </CardHeader>
          <CardContent>
            {!data && <p className="text-sm text-muted-foreground">Clique em "Revelar Tudo" para listar.</p>}
            {data && (
              <div className="flex flex-wrap gap-2">
                {data.edge_functions.length === 0 && (
                  <span className="text-sm text-muted-foreground">Nenhuma encontrada.</span>
                )}
                {data.edge_functions.map((name) => (
                  <Badge key={name} variant="secondary" className="font-mono text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card de Tabelas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-600" />
              Tabelas do Banco
            </CardTitle>
            <CardDescription>Classificação heurística para migração</CardDescription>
          </CardHeader>
          <CardContent>
            {hasUserTables && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 mb-4 flex gap-2 text-sm">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Usuários migrados precisam redefinir a senha via "Esqueci minha senha". Emails e metadados
                  são copiados, mas senhas são hashes irreversíveis.
                </span>
              </div>
            )}
            {!data && <p className="text-sm text-muted-foreground">Clique em "Revelar Tudo" para listar.</p>}
            {data && tables.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma tabela detectada.</p>
            )}
            {data && tables.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-4">Tabela</th>
                      <th className="py-2 pr-4">Linhas</th>
                      <th className="py-2 pr-4">Colunas</th>
                      <th className="py-2 pr-4">Classificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((t) => {
                      const { cls, reason } = classifyTable(t);
                      const variant =
                        cls === "essencial" ? "default" : cls === "historico" ? "secondary" : "outline";
                      const colorClass =
                        cls === "essencial"
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : cls === "historico"
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "text-muted-foreground";
                      return (
                        <tr key={t.name} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-4 font-mono">{t.name}</td>
                          <td className="py-2 pr-4">{t.row_count}</td>
                          <td className="py-2 pr-4">{t.column_count}</td>
                          <td className="py-2 pr-4">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant={variant} className={colorClass}>
                                  {cls === "essencial" ? "Essencial" : cls === "historico" ? "Histórico" : "Ignorar"}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">
                                  <strong>{t.row_count}</strong> registros · <strong>{t.column_count}</strong> colunas
                                </p>
                                <p className="text-xs mt-1">{reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
