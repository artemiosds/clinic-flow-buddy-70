import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ 
        success: false, 
        function: "system-monitoring-check",
        error: "Configuração do servidor incompleta. SUPABASE_SERVICE_ROLE_KEY não encontrada." 
      }, 500);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ 
        success: false, 
        function: "system-monitoring-check",
        error: "Usuário não autenticado." 
      }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ 
        success: false, 
        function: "system-monitoring-check",
        error: "Sessão inválida ou expirada.",
        details: userError?.message 
      }, 401);
    }

    // Validar perfil MASTER no banco
    const { data: funcionario, error: funcError } = await supabaseClient
      .from("funcionarios")
      .select("role, usuario")
      .eq("id", user.id)
      .maybeSingle();

    if (funcError) {
      return jsonResponse({ 
        success: false, 
        function: "system-monitoring-check",
        error: "Erro ao validar permissões do usuário.",
        details: funcError.message
      }, 500);
    }

    const role = funcionario?.role?.toLowerCase().trim();
    const isMaster = funcionario && (
      role === 'master' || 
      role === 'gestor_master' || 
      role === 'administrador' || 
      role === 'admin' ||
      funcionario.usuario === 'admin.sms'
    );

    if (!isMaster) {
      return jsonResponse({ 
        success: false, 
        function: "system-monitoring-check",
        error: "Acesso negado. Apenas Gestor Master pode acessar o monitoramento." 
      }, 403);
    }

    // 1. Chamar RPC para estatísticas do banco
    let dbStats = { success: false, error: "Falha ao consultar estatísticas do banco." };
    try {
      const { data, error: rpcError } = await supabaseClient.rpc('get_system_stats');
      if (rpcError) {
        dbStats = { success: false, error: rpcError.message };
      } else {
        dbStats = { success: true, ...data };
      }
    } catch (err) {
      dbStats = { success: false, error: err.message };
    }

    // 2. Coletar estatísticas do Storage
    let storageData = { success: false, stats: [], error: null };
    try {
      const { data: buckets, error: bucketsError } = await supabaseClient.storage.listBuckets();
      if (bucketsError) {
        storageData = { success: false, stats: [], error: bucketsError.message };
      } else if (buckets) {
        const stats = await Promise.all(buckets.map(async (bucket) => {
          try {
            const { data: files, error: filesError } = await supabaseClient.storage.from(bucket.id).list("", { limit: 1 });
            return {
              id: bucket.id,
              name: bucket.name,
              fileCount: files?.length || 0,
              public: bucket.public,
              status: filesError ? 'erro' : 'ok'
            };
          } catch (e) {
            return { id: bucket.id, name: bucket.name, error: e.message, status: 'erro' };
          }
        }));
        storageData = { success: true, stats, error: null };
      }
    } catch (err) {
      storageData = { success: false, stats: [], error: err.message };
    }

    return jsonResponse({
      success: true,
      ...dbStats,
      storage: storageData,
      environment: Deno.env.get("ENVIRONMENT") || "production",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return jsonResponse({ 
      success: false, 
      function: "system-monitoring-check",
      error: "Falha crítica na Edge Function de monitoramento.",
      details: error.message 
    }, 500);
  }
});
