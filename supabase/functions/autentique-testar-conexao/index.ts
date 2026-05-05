import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders, callAutentique } from '../_shared/autentique.ts';

Deno.serve(async (req) => {
  // 1. CORS / OPTIONS
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 2. VALIDAR USUÁRIO LOGADO
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        ok: false, 
        message: 'Cabeçalho de autorização ausente.', 
        code: 'UNAUTHENTICATED' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        ok: false, 
        message: 'Usuário não autenticado.', 
        code: 'UNAUTHENTICATED' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. VALIDAR PERMISSÃO (Master/Admin)
    const { data: funcionario, error: funcError } = await supabase
      .from('funcionarios')
      .select('role, cargo')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const isMaster = funcionario?.role === 'master';
    const isAdmin = funcionario?.cargo?.toLowerCase().includes('administrador');

    if (funcError || !funcionario || (!isMaster && !isAdmin)) {
      return new Response(JSON.stringify({ 
        ok: false, 
        message: 'Você não tem permissão para testar a integração Autentique.', 
        code: 'FORBIDDEN' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. BUSCAR PAYLOAD
    const { token, ambiente, saveStatus } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ 
        ok: false, 
        message: 'Token Autentique não configurado.', 
        code: 'TOKEN_NOT_CONFIGURED' 
      }), {
        status: 200, // Retorno 200 para erro controlado no teste
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. CHAMADA PARA API AUTENTIQUE
    const query = `
      query {
        viewer {
          name
          email
          organization {
            name
          }
        }
      }
    `;

    let autentiqueData;
    try {
      autentiqueData = await callAutentique(query, {}, token);
    } catch (autentiqueErr: any) {
      console.error('Erro na API Autentique:', autentiqueErr.message);
      
      const isAuthError = autentiqueErr.message.toLowerCase().includes('unauthorized') || 
                         autentiqueErr.message.toLowerCase().includes('token');
      
      // 6. ATUALIZAR STATUS NO BANCO EM CASO DE ERRO
      if (saveStatus) {
        await supabase
          .from('assinatura_eletronica_config')
          .update({ 
            status_conexao: 'erro',
            ultimo_teste_em: new Date().toISOString(),
            ultimo_erro: autentiqueErr.message
          })
          .eq('provider', 'autentique');
      }

      return new Response(JSON.stringify({ 
        ok: false, 
        message: isAuthError ? 'Token Autentique inválido ou sem permissão.' : 'Não foi possível conectar ao Autentique no momento.', 
        code: isAuthError ? 'TOKEN_INVALID' : 'AUTENTIQUE_UNAVAILABLE',
        technical_error: autentiqueErr.message
      }), {
        status: 200, // Retorno 200 para erro controlado
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. ATUALIZAR STATUS NO BANCO EM SUCESSO
    if (saveStatus) {
      await supabase
        .from('assinatura_eletronica_config')
        .update({ 
          status_conexao: 'sucesso',
          ultimo_teste_em: new Date().toISOString(),
          ultimo_erro: null,
          organizacao_nome: autentiqueData.viewer?.organization?.name || 'N/A'
        })
        .eq('provider', 'autentique');
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      viewer: autentiqueData.viewer,
      message: 'Conectado ao Autentique com sucesso.',
      code: 'CONNECTED',
      tested_at: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Erro inesperado no teste Autentique:', err.message);
    
    return new Response(JSON.stringify({ 
      ok: false, 
      error: 'internal_error', 
      message: 'Erro interno inesperado na função de teste.',
      technical_error: err.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
