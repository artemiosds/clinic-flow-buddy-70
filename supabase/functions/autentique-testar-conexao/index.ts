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
    const { token: tokenInput, ambiente, saveStatus } = await req.json();

    let token = tokenInput;
    
    // Se o token vier vazio ou mascarado (com bolinhas), tenta pegar o real do banco
    const isMasked = !token || token.includes('•') || token.includes('*');
    
    if (isMasked) {
      const { data: config, error: configError } = await supabase
        .from('assinatura_eletronica_config')
        .select('token_api')
        .eq('provider', 'autentique')
        .maybeSingle();
      
      if (configError || !config?.token_api) {
        return new Response(JSON.stringify({ 
          ok: false, 
          message: 'Token Autentique não configurado ou não encontrado no banco.', 
          code: 'TOKEN_NOT_CONFIGURED' 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      token = config.token_api;
    }

    // Logs seguros (conforme solicitado no item 3)
    console.log('Iniciando teste de conexão Autentique:', {
      token_configurado: !!token,
      token_length: token?.length || 0,
      token_was_masked: isMasked,
      endpoint: 'https://api.autentique.com.br/v2/graphql',
      saveStatus
    });

    // 5. CHAMADA PARA API AUTENTIQUE (GraphQL v2)
    const query = `
      query {
        me {
          id
          name
          email
          organization {
            id
            name
          }
        }
      }
    `;

    let autentiqueData;
    try {
      autentiqueData = await callAutentique(query, {}, token);
    } catch (err: any) {
      const errorCode = err.message === 'TOKEN_INVALID' ? 'TOKEN_INVALID' : 
                        err.message === 'RATE_LIMITED' ? 'RATE_LIMITED' :
                        err.code === 'GRAPHQL_ERROR' ? 'GRAPHQL_ERROR' : 'ENDPOINT_UNAVAILABLE';
      
      let friendlyMessage = 'Não foi possível conectar ao Autentique no momento.';
      if (errorCode === 'TOKEN_INVALID') friendlyMessage = 'Token Autentique inválido, expirado ou sem permissão.';
      if (errorCode === 'RATE_LIMITED') friendlyMessage = 'Limite de requisições da API Autentique atingido. Aguarde alguns instantes.';
      if (errorCode === 'GRAPHQL_ERROR') friendlyMessage = `Autentique respondeu erro GraphQL: ${err.message}`;

      console.error(`Erro no teste Autentique [${errorCode}]:`, err.message);
      
      // 6. ATUALIZAR STATUS NO BANCO EM CASO DE ERRO
      if (saveStatus) {
        await supabase
          .from('assinatura_eletronica_config')
          .update({ 
            status_conexao: 'erro',
            ultimo_teste_em: new Date().toISOString(),
            ultimo_erro: err.message
          })
          .eq('provider', 'autentique');
      }

      return new Response(JSON.stringify({ 
        ok: false, 
        message: friendlyMessage, 
        code: errorCode,
        debug: {
          stage: 'autentique_api',
          technical_error: err.message,
          graphql_errors: err.code === 'GRAPHQL_ERROR'
        }
      }), {
        status: 200,
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
          organizacao_nome: autentiqueData.me?.organization?.name || 'N/A'
        })
        .eq('provider', 'autentique');
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      account: {
        name: autentiqueData.me?.name,
        email: autentiqueData.me?.email,
        organization: autentiqueData.me?.organization?.name
      },
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
      code: 'INTERNAL_ERROR', 
      message: 'Erro interno inesperado na função de teste.',
      debug: { technical_error: err.message }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
