import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders, callAutentique } from '../_shared/autentique.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Validar autenticação do usuário
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Cabeçalho de autorização ausente');
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Usuário não autenticado');

    // Verificar se é Master/Admin
    const { data: funcionario, error: funcError } = await supabase
      .from('funcionarios')
      .select('role, cargo')
      .eq('auth_user_id', user.id)
      .single();

    if (funcError || !funcionario || (funcionario.role !== 'master' && !funcionario.cargo?.toLowerCase().includes('administrador'))) {
      throw new Error('Acesso negado. Apenas administradores podem testar conexões.');
    }

    const { token, ambiente, saveStatus } = await req.json();

    if (!token) {
      throw new Error('Token não fornecido');
    }

    // Query simples para testar o token
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

    const data = await callAutentique(query, {}, token);

    // Se solicitado, atualizar o status na tabela
    if (saveStatus) {
      await supabase
        .from('assinatura_eletronica_config')
        .update({ 
          status_conexao: 'sucesso',
          ultimo_teste_em: new Date().toISOString(),
          ultimo_erro: null,
          organizacao_nome: data.viewer?.organization?.name || 'N/A'
        })
        .eq('provider', 'autentique');
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      viewer: data.viewer,
      message: 'Conectado ao Autentique com sucesso.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Erro no teste de conexão Autentique:', err.message);
    
    // Tentar registrar o erro se soubermos qual config falhou (opcional)
    
    return new Response(JSON.stringify({ 
      ok: false, 
      error: 'auth_error', 
      message: err.message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
