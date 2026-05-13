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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing environment variables");
      return new Response(JSON.stringify({ error: "Configuração do servidor incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validar perfil MASTER no banco
    const { data: funcionario } = await supabaseClient
      .from("funcionarios")
      .select("role, usuario")
      .eq("id", user.id)
      .maybeSingle();

    const isMaster = funcionario && (funcionario.role?.toLowerCase().trim() === 'master' || funcionario.usuario === 'admin.sms');

    if (!isMaster) {
      return new Response(JSON.stringify({ error: "Acesso negado: Somente Master pode monitorar o sistema" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Chamar RPC para estatísticas do banco
    const { data: dbStats, error: rpcError } = await supabaseClient.rpc('get_system_stats');
    if (rpcError) {
      console.error("RPC Error:", rpcError);
    }

    // 2. Coletar estatísticas do Storage
    let storageStats = [];
    try {
      const { data: buckets } = await supabaseClient.storage.listBuckets();
      if (buckets) {
        storageStats = await Promise.all(buckets.map(async (bucket) => {
          const { data: files } = await supabaseClient.storage.from(bucket.id).list("", { limit: 1 });
          return {
            id: bucket.id,
            name: bucket.name,
            fileCount: files?.length || 0,
            public: bucket.public
          };
        }));
      }
    } catch (err) {
      console.error("Storage Error:", err);
    }

    return new Response(JSON.stringify({
      ...dbStats,
      storageStats,
      environment: Deno.env.get("ENVIRONMENT") || "production",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Erro interno no servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
