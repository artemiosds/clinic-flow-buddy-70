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
      return new Response(JSON.stringify({ error: "Configuração incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Validar perfil MASTER
    const { data: funcionario } = await supabaseClient
      .from("funcionarios")
      .select("role, usuario")
      .eq("id", user.id)
      .maybeSingle();

    const isMaster = funcionario && (funcionario.role?.toLowerCase().trim() === 'master' || funcionario.usuario === 'admin.sms');
    if (!isMaster) return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { type, days, confirmation } = body;

    if (confirmation !== "LIMPAR") {
      return new Response(JSON.stringify({ error: "Confirmação inválida. Digite LIMPAR para confirmar." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let itemsCount = 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days || 90));

    if (type === "logs") {
      const { count, error } = await supabaseClient
        .from("logs_auditoria")
        .delete({ count: 'exact' })
        .lt("created_at", cutoff.toISOString())
        .not("acao", "ilike", "%EXCLUSAO%")
        .not("acao", "ilike", "%PRONTUARIO%");
      
      if (error) throw error;
      itemsCount = count || 0;
    } else if (type === "notifications") {
      const { count, error } = await supabaseClient
        .from("notificacoes")
        .delete({ count: 'exact' })
        .lt("created_at", cutoff.toISOString())
        .eq("lida", true);
      
      if (error) throw error;
      itemsCount = count || 0;
    } else {
      return new Response(JSON.stringify({ error: "Tipo de limpeza inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabaseClient.from("system_cleanup_logs").insert({
      cleanup_type: type,
      items_count: itemsCount,
      status: "success",
      details: { days, type, cutoff: cutoff.toISOString() },
      created_by: user.id
    });

    return new Response(JSON.stringify({ success: true, count: itemsCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Erro na limpeza" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
