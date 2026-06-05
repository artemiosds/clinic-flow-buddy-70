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

    const { data: func } = await supabaseAdmin
      .from("funcionarios")
      .select("role, usuario")
      .eq("id", user.id)
      .maybeSingle();

    const isMaster = func && (func.role?.toLowerCase() === 'master' || func.usuario === 'admin.sms');
    if (!isMaster) throw new Error("Apenas administradores podem gerar backup");

    const { action } = await req.json();

    if (action === "generate-full-backup") {
      const zip = new JSZip();
      const exportLog: string[] = [];
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-");

      const tablesToExport = [
        'pacientes', 'agendamentos', 'prontuarios', 'funcionarios', 'unidades', 
        'configuracoes', 'procedimentos', 'atendimentos', 'especialidades',
        'whatsapp_config', 'whatsapp_templates', 'system_config', 'prontuario_config'
      ];

      const dbFolder = zip.folder("database");
      const csvFolder = dbFolder.folder("csv");
      const jsonFolder = dbFolder.folder("json");
      const sqlFolder = dbFolder.folder("sql");

      for (const table of tablesToExport) {
        try {
          const { data, error } = await supabaseAdmin.from(table).select("*");
          if (!error && data && data.length > 0) {
            jsonFolder.addFile(`${table}.json`, JSON.stringify(data, null, 2));
            
            const headers = Object.keys(data[0]);
            const csvRows = [headers.join(",")];
            const sqlRows = [];
            
            data.forEach(row => {
              csvRows.push(headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return "";
                const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
                return `"${s.replace(/"/g, '""')}"`;
              }).join(","));
              
              const keys = Object.keys(row).join(", ");
              const vals = Object.values(row).map(v => {
                if (v === null) return "NULL";
                if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
                return v;
              }).join(", ");
              sqlRows.push(`INSERT INTO public.${table} (${keys}) VALUES (${vals});`);
            });
            
            csvFolder.addFile(`${table}.csv`, csvRows.join("\n"));
            sqlFolder.addFile(`${table}.sql`, sqlRows.join("\n"));
            exportLog.push(`[SUCESSO] Tabela ${table} exportada (${data.length} registros)`);
          } else {
            exportLog.push(`[INFO] Tabela ${table} ignorada ou vazia`);
          }
        } catch (err) {
          exportLog.push(`[ERRO] Falha ao exportar tabela ${table}`);
        }
      }

      zip.addFile("README_RESTAURACAO.md", `Backup gerado em ${now.toLocaleString('pt-BR')}`);
      zip.addFile("logs/export_log.txt", exportLog.join("\n"));

      const content = await zip.generateAsync({ type: "uint8array" });

      return new Response(content, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/zip",
        },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
