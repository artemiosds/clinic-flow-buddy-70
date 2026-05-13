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
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Chave segura da Edge Function não configurada." 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validar Autenticação JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Usuário não autenticado." 
      }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Sessão inválida ou expirada." 
      }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 2. Validar Perfil MASTER
    // Buscamos o perfil real do usuário
    const { data: funcionario, error: funcError } = await supabaseClient
      .from("funcionarios")
      .select("role, usuario")
      .eq("id", user.id)
      .maybeSingle();

    if (funcError) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Falha ao validar permissões no banco de dados." 
      }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Regra flexível para Master conforme solicitado
    const role = funcionario?.role?.toLowerCase().trim();
    const isMaster = funcionario && (
      role === 'master' || 
      role === 'gestor_master' || 
      role === 'administrador' || 
      role === 'admin' ||
      funcionario.usuario === 'admin.sms'
    );

    if (!isMaster) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Acesso negado. Apenas MASTER pode executar limpeza." 
      }), { 
        status: 403, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 3. Validar Payload
    const body = await req.json();
    const { 
      cleanup_type, 
      confirmation_text, 
      dry_run = false, 
      filters = {} 
    } = body;

    const allowedTypes = [
      "logs_old", 
      "notifications_old", 
      "temp_files", 
      "orphan_files", 
      "monitoring_snapshots_old", 
      "non_critical_errors_old"
    ];

    if (!cleanup_type || !allowedTypes.includes(cleanup_type)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Tipo de limpeza inválido." 
      }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    if (!dry_run && confirmation_text !== "LIMPAR") {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Confirmação LIMPAR obrigatória para executar limpeza." 
      }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 4. Executar Lógica de Limpeza
    let itemsCount = 0;
    const olderThanDays = filters.older_than_days || (cleanup_type === "notifications_old" ? 30 : 90);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const cutoffIso = cutoff.toISOString();

    let message = "";
    let status = "success";
    let errorMessage = null;

    try {
      if (cleanup_type === "logs_old") {
        // Tentar identificar a tabela de logs correta
        const tablesToTry = ["logs_auditoria", "logs", "system_logs", "auditoria"];
        let targetTable = null;
        
        // Verificação rápida de existência (simulada por tentativa de count)
        for (const t of tablesToTry) {
          const { error: testErr } = await supabaseClient.from(t).select('id').limit(1);
          if (!testErr) {
            targetTable = t;
            break;
          }
        }

        if (!targetTable) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Nenhuma tabela de logs configurada para limpeza." 
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const query = supabaseClient
          .from(targetTable)
          .select("id", { count: "exact", head: true })
          .lt("created_at", cutoffIso);
        
        // Filtros de segurança: não apagar coisas críticas se possível
        // Depende da estrutura da tabela, mas tentamos ser genéricos
        if (targetTable === "logs_auditoria") {
          query.not("acao", "ilike", "%EXCLUSAO%").not("acao", "ilike", "%PRONTUARIO%");
        }

        const { count, error: countErr } = await query;
        if (countErr) throw countErr;
        
        itemsCount = count || 0;

        if (!dry_run && itemsCount > 0) {
          const { error: deleteErr } = await supabaseClient
            .from(targetTable)
            .delete()
            .lt("created_at", cutoffIso)
            .not("acao", "ilike", "%EXCLUSAO%")
            .not("acao", "ilike", "%PRONTUARIO%");
          
          if (deleteErr) throw deleteErr;
          message = "Limpeza de logs concluída com sucesso.";
        } else {
          message = dry_run ? `Análise: ${itemsCount} logs antigos identificados.` : "Nenhum log antigo encontrado.";
        }

      } else if (cleanup_type === "notifications_old") {
        const targetTable = "notificacoes";
        const { error: testErr } = await supabaseClient.from(targetTable).select('id').limit(1);
        
        if (testErr) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Nenhuma tabela de notificações configurada para limpeza." 
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { count, error: countErr } = await supabaseClient
          .from(targetTable)
          .select("id", { count: "exact", head: true })
          .lt("created_at", cutoffIso)
          .eq("lida", true);
        
        if (countErr) throw countErr;
        itemsCount = count || 0;

        if (!dry_run && itemsCount > 0) {
          const { error: deleteErr } = await supabaseClient
            .from(targetTable)
            .delete()
            .lt("created_at", cutoffIso)
            .eq("lida", true);
          
          if (deleteErr) throw deleteErr;
          message = "Limpeza de notificações concluída com sucesso.";
        } else {
          message = dry_run ? `Análise: ${itemsCount} notificações antigas identificadas.` : "Nenhuma notificação antiga lida encontrada.";
        }
      } else {
        // Tipos não implementados ainda retornam sucesso vazio para não quebrar
        message = "Este tipo de limpeza será implementado em breve.";
        itemsCount = 0;
      }

      // 5. Registrar Log da Limpeza (apenas em execução real)
      if (!dry_run) {
        await supabaseClient.from("system_cleanup_logs").insert({
          cleanup_type,
          items_count: itemsCount,
          status: "success",
          details: { ...filters, dry_run, older_than_days: olderThanDays, cutoff: cutoffIso },
          created_by: user.id
        });
      }

    } catch (err) {
      status = "error";
      errorMessage = err.message;
      
      if (!dry_run) {
        await supabaseClient.from("system_cleanup_logs").insert({
          cleanup_type,
          items_count: 0,
          status: "error",
          error_message: errorMessage,
          details: { ...filters, dry_run, error: true },
          created_by: user.id
        });
      }

      return new Response(JSON.stringify({ 
        success: false, 
        error: "Falha interna ao executar limpeza.",
        details: errorMessage
      }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      dry_run,
      cleanup_type,
      [dry_run ? "estimated_items" : "deleted_items"]: itemsCount,
      safe_to_clean: itemsCount > 0,
      message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: "Falha crítica na Edge Function.", 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});