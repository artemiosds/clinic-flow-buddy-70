import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) throw new Error("Sessão inválida");

    // Verificar se é Master
    const { data: func } = await supabaseAdmin
      .from("funcionarios")
      .select("role, usuario")
      .eq("id", user.id)
      .maybeSingle();

    const isMaster = func && (func.role?.toLowerCase() === 'master' || func.usuario === 'admin.sms');
    if (!isMaster) throw new Error("Apenas administradores podem gerar backup");

    const body = await req.json();
    const action = body.action;

    if (action === "generate-full-backup") {
      const zip = new JSZip();
      const exportLog: string[] = [];
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-");

      // Tabelas para exportar
      const tablesToExport = [
        'pacientes', 'agendamentos', 'prontuarios', 'funcionarios', 'unidades', 
        'configuracoes', 'procedimentos', 'atendimentos', 'especialidades',
        'whatsapp_config', 'whatsapp_templates', 'system_config', 'prontuario_config',
        'salas', 'especialidades_config', 'cbo_codigos', 'cid10_codigos',
        'fila_espera', 'logs_auditoria'
      ];

      const dbFolder = zip.folder("database");
      const csvFolder = dbFolder.folder("csv");
      const jsonFolder = dbFolder.folder("json");
      const sqlFolder = dbFolder.folder("sql");

      for (const table of tablesToExport) {
        try {
          const { data, error } = await supabaseAdmin.from(table).select("*");
          if (error) {
             exportLog.push(`[AVISO] Tabela ${table} ignorada: ${error.message}`);
             continue;
          }

          if (data && data.length > 0) {
            // JSON
            jsonFolder.addFile(`${table}.json`, JSON.stringify(data, null, 2));

            // CSV
            const headers = Object.keys(data[0]);
            const csvRows = [headers.join(",")];
            data.forEach(row => {
              csvRows.push(headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return "";
                const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
                return `"${s.replace(/"/g, '""')}"`;
              }).join(","));
            });
            csvFolder.addFile(`${table}.csv`, csvRows.join("\n"));

            // SQL
            const sqlRows = data.map(row => {
              const keys = Object.keys(row).join(", ");
              const vals = Object.values(row).map(v => {
                if (v === null) return "NULL";
                if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
                return v;
              }).join(", ");
              return `INSERT INTO public.${table} (${keys}) VALUES (${vals});`;
            });
            sqlFolder.addFile(`${table}.sql`, sqlRows.join("\n"));

            exportLog.push(`[SUCESSO] Tabela ${table} exportada (${data.length} registros)`);
          } else {
            exportLog.push(`[INFO] Tabela ${table} está vazia`);
          }
        } catch (err) {
          exportLog.push(`[ERRO] Falha ao exportar tabela ${table}: ${err.message}`);
        }
      }

      // Storage (Simulado - listagem de arquivos se houver permissão)
      try {
        const { data: buckets } = await supabaseAdmin.storage.listBuckets();
        if (buckets) {
          const storageLog = ["BUCKETS ENCONTRADOS:\n"];
          for (const bucket of buckets) {
            storageLog.push(`- ${bucket.id} (${bucket.public ? 'Público' : 'Privado'})`);
          }
          zip.addFile("storage/bucket_list.txt", storageLog.join("\n"));
        }
      } catch (e) {
        exportLog.push(`[AVISO] Não foi possível listar buckets de storage`);
      }

      // Secrets
      const secretsNames = [
        "SUPABASE_URL", "SUPABASE_ANON_KEY", "LOVABLE_API_KEY", 
        "WHATSAPP_API_KEY", "GOOGLE_CLIENT_ID", "AUTENTIQUE_TOKEN"
      ];
      zip.addFile("config/secrets_required.txt", "Configurações necessárias:\n" + 
        secretsNames.map(s => `${s}=******** (Mascarado por segurança)`).join("\n"));

      // README
      const readme = `
# Backup Lovable Cloud - Sistema de Gestão de Saúde
Data: ${now.toLocaleString('pt-BR')}
Gerado por: ${func?.usuario || user.email}

## Estrutura do Backup
- /database: Dados em SQL, JSON e CSV
- /config: Lista de secrets necessárias
- /logs: Relatório da exportação
- /storage: Listagem de buckets

## Restauração
1. Crie as tabelas no novo banco.
2. Importe os arquivos SQL ou CSV.
3. Configure as Secrets listadas em /config.
`;
      zip.addFile("README_RESTAURACAO.md", readme);
      zip.addFile("logs/export_log.txt", exportLog.join("\n"));

      const content = await zip.generateAsync({ type: "uint8array" });

      return new Response(content, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="backup_${timestamp}.zip"`,
        },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
