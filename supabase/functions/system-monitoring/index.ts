import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized", details: userError }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is MASTER
    const { data: funcionario, error: funcError } = await supabaseClient
      .from("funcionarios")
      .select("role, usuario")
      .eq("id", user.id)
      .maybeSingle();

    if (funcError) {
      console.error("Func check error:", funcError);
    }

    const isMaster = funcionario && (funcionario.role?.toLowerCase().trim() === 'master' || funcionario.usuario === 'admin.sms');

    if (!isMaster) {
      return new Response(JSON.stringify({ error: "Forbidden: Only master can access monitoring" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "check-system") {
      // 1. Table stats
      const tablesToMonitor = [
        'pacientes', 'agendamentos', 'prontuarios', 'tratamentos', 
        'sessoes_tratamento', 'fila_espera', 'funcionarios', 'unidades', 
        'logs_auditoria', 'notificacoes', 'documentos', 'anexos', 
        'configuracoes'
      ];

      const tableStats = [];
      for (const table of tablesToMonitor) {
        try {
          console.log(`Checking table: ${table}`);
          const { count, error } = await supabaseClient
            .from(table)
            .select("*", { count: 'exact', head: true });
          
          if (error) {
            console.error(`Error counting table ${table}:`, error);
          }

          // Stats for last 7 and 30 days if created_at exists
          let last7 = 0;
          let last30 = 0;
          
          try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const { count: c7 } = await supabaseClient
              .from(table)
              .select("*", { count: 'exact', head: true })
              .gte('created_at', sevenDaysAgo.toISOString());
            last7 = c7 || 0;

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const { count: c30 } = await supabaseClient
              .from(table)
              .select("*", { count: 'exact', head: true })
              .gte('created_at', thirtyDaysAgo.toISOString());
            last30 = c30 || 0;
          } catch (e) {
            // Probably created_at doesn't exist
          }

          tableStats.push({
            table,
            count: count || 0,
            last7,
            last30,
            status: (count || 0) > 100000 ? 'atencao' : 'normal'
          });
        } catch (err) {
          console.error(`Exception on table ${table}:`, err);
          tableStats.push({
            table,
            count: 0,
            last7: 0,
            last30: 0,
            status: 'erro'
          });
        }
      }

      // 2. Storage stats
      let storageStats = [];
      try {
        const { data: buckets, error: bucketError } = await supabaseClient.storage.listBuckets();
        if (bucketError) {
          console.error("Bucket list error:", bucketError);
        } else {
          storageStats = await Promise.all((buckets || []).map(async (bucket) => {
            const { data: files, error: fileError } = await supabaseClient.storage.from(bucket.id).list("", { limit: 1 });
            return {
              id: bucket.id,
              name: bucket.name,
              fileCount: files?.length || 0,
              public: bucket.public
            };
          }));
        }
      } catch (err) {
        console.error("Storage stats exception:", err);
      }

      return new Response(JSON.stringify({
        status: "online",
        tableStats,
        storageStats,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cleanup") {
      const { type, days } = body;
      
      let result;
      if (type === "logs") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (days || 90));
        
        const { count, error } = await supabaseClient
          .from("logs_auditoria")
          .delete()
          .lt("created_at", cutoff.toISOString());
        
        if (error) throw error;
        result = { success: true, count };
      }

      // Log cleanup action
      await supabaseClient.from("system_cleanup_logs").insert({
        created_by: user.id,
        cleanup_type: type,
        items_count: result?.count || 0,
        status: "success",
        details: { days, type }
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Global edge function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
