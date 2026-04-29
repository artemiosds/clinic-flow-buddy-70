import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Variáveis de sistema a filtrar
const SYSTEM_VARS = new Set([
  "PATH", "HOME", "DENO_DIR", "HOSTNAME", "PORT", "TMPDIR",
  "USER", "LANG", "TERM", "_", "DENO_REGION", "DENO_DEPLOYMENT_ID",
  "PWD", "SHLVL", "SHELL", "LOGNAME", "OLDPWD",
]);

function isSystemVar(name: string): boolean {
  if (SYSTEM_VARS.has(name)) return true;
  if (name.startsWith("XDG_")) return true;
  return false;
}

// Edge functions conhecidas no projeto (probe)
const KNOWN_FUNCTION_NAMES = [
  "admin-credentials",
  "auth-login",
  "ensure-patient-portal",
  "generate-bpa",
  "google-calendar-auth",
  "google-calendar-sync",
  "integracao-atualizar-status",
  "integracao-callback-status",
  "integracao-enviar-encaminhamento",
  "integracao-listar-profissionais",
  "integracao-listar-profissionais-proxy",
  "integracao-receber-encaminhamento",
  "integracao-retry-envios",
  "integracao-test-connection",
  "manage-employee",
  "manage-external",
  "patient-signup",
  "process-whatsapp-queue",
  "public-scheduling",
  "reset-password",
  "send-email",
  "send-reminders",
  "send-reminders-whatsapp",
  "send-whatsapp-evolution",
  "sync-sigtap-datasus",
  "webhook-notify",
  "whatsapp-webhook-receiver",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Validar JWT manualmente
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: token ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Verificar role master via tabela funcionarios (sistema atual)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: func, error: funcError } = await adminClient
      .from("funcionarios")
      .select("role, ativo")
      .eq("auth_user_id", userData.user.id)
      .eq("ativo", true)
      .maybeSingle();

    if (funcError) {
      return new Response(
        JSON.stringify({ error: "Erro ao verificar permissão", details: funcError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!func || String(func.role).toLowerCase().trim() !== "master") {
      return new Response(
        JSON.stringify({ error: "Forbidden: acesso restrito ao perfil Master" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Coletar todos os secrets
    const env = Deno.env.toObject();
    const allSecrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (!isSystemVar(key) && value) {
        allSecrets[key] = value;
      }
    }

    const project_url = allSecrets["SUPABASE_URL"] ?? null;
    const anon_key = allSecrets["SUPABASE_ANON_KEY"] ?? null;
    const service_role_key = allSecrets["SUPABASE_SERVICE_ROLE_KEY"] ?? null;

    // Secrets extras (sem as 3 credenciais principais)
    const secrets: Record<string, string> = {};
    for (const [k, v] of Object.entries(allSecrets)) {
      if (!["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].includes(k)) {
        secrets[k] = v;
      }
    }

    // 4. Probe de Edge Functions
    const probeResults = await Promise.allSettled(
      KNOWN_FUNCTION_NAMES.map(async (name) => {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
            method: "OPTIONS",
            headers: { "apikey": SUPABASE_ANON_KEY },
          });
          return { name, ok: res.status < 500 };
        } catch {
          return { name, ok: false };
        }
      }),
    );

    const edge_functions = probeResults
      .filter((r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<any>).value.ok)
      .map((r) => (r as PromiseFulfilledResult<any>).value.name);

    // 5. Listar tabelas via exec_sql
    let database_tables: any[] = [];
    try {
      const { data: tablesData, error: tablesError } = await adminClient.rpc("exec_sql", {
        sql_query: `
          SELECT t.tablename as name, COALESCE(s.n_live_tup, 0)::int as row_count,
            (SELECT count(*)::int FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename) as column_count,
            (SELECT string_agg(c.column_name,',') FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename AND c.column_name LIKE '%encrypted%') as encrypted_columns,
            EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename AND c.column_name='user_id') as has_user_id
          FROM pg_tables t LEFT JOIN pg_stat_user_tables s ON s.relname=t.tablename
          WHERE t.schemaname='public' ORDER BY t.tablename
        `,
      });
      if (!tablesError && Array.isArray(tablesData)) {
        database_tables = tablesData;
      }
    } catch (e) {
      console.error("Falha exec_sql:", e);
    }

    return new Response(
      JSON.stringify({
        project_url,
        anon_key,
        service_role_key,
        secrets,
        edge_functions,
        edge_functions_count: edge_functions.length,
        database_tables,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
