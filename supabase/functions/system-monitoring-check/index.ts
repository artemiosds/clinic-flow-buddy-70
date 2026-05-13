import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  
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
      console.error("No Authorization header provided");
      return new Response(JSON.stringify({ error: "Não autorizado: Token ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError?.message || "User not found");
      return new Response(JSON.stringify({ 
        error: "Sessão inválida", 
        details: userError?.message 
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Authenticated user: ${user.id}`);

    // Validar perfil MASTER no banco
    const { data: funcionario, error: funcError } = await supabaseClient
      .from("funcionarios")
      .select("role, usuario")
      .eq("id", user.id)
      .maybeSingle();

    if (funcError) {
      console.error("Error fetching funcionario:", funcError);
      return new Response(JSON.stringify({ error: "Erro ao validar permissões" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isMaster = funcionario && (funcionario.role?.toLowerCase().trim() === 'master' || funcionario.usuario === 'admin.sms');

    if (!isMaster) {
      console.error(`User ${user.id} is not a Master. Role: ${funcionario?.role}`);
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
      const { data: buckets, error: bucketsError } = await supabaseClient.storage.listBuckets();
      if (bucketsError) {
        console.error("Storage listBuckets error:", bucketsError);
      } else if (buckets) {
        storageStats = await Promise.all(buckets.map(async (bucket) => {
          const { data: files, error: filesError } = await supabaseClient.storage.from(bucket.id).list("", { limit: 1 });
          if (filesError) console.error(`Error listing files for bucket ${bucket.name}:`, filesError);
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
      ...dbStats,
      storageStats,
      environment: Deno.env.get("ENVIRONMENT") || "production",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Global error in monitoring function:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro interno no servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
