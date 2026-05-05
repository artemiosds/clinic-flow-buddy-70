import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-system-identifier',
};

async function sha256(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const authHeader = req.headers.get('Authorization');
    const systemId = req.headers.get('X-System-Identifier');

    if (!authHeader?.startsWith('Bearer ') || !systemId) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'missing_credentials',
        message: 'Token de saída ou Identificador do sistema não enviados.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenIn = authHeader.replace('Bearer ', '');

    // Busca o sistema que está tentando se conectar a nós
    const { data: sis, error: sErr } = await supabase
      .from('sistemas_integrados')
      .select('id, nome, identificador_sistema, token_entrada_hash, ativo, permite_receber')
      .eq('identificador_sistema', systemId)
      .maybeSingle();

    if (sErr || !sis) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'unknown_system',
        message: 'Sistema de origem não reconhecido ou não cadastrado.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!sis.ativo) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'system_inactive',
        message: 'A integração com este sistema está inativa.'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenHash = await sha256(tokenIn);
    if (tokenHash !== sis.token_entrada_hash) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'invalid_token',
        message: 'Token recusado pelo sistema externo. Verifique se o token de saída do sistema de origem corresponde ao token de entrada configurado aqui.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Busca o identificador local para retornar ao outro sistema
    const { data: config } = await supabase
      .from('clinica_config')
      .select('identificador_local, nome_clinica')
      .maybeSingle();

    return new Response(JSON.stringify({ 
      ok: true, 
      nome: config?.nome_clinica ?? 'Sistema Lovable',
      identificador: config?.identificador_local ?? 'desconhecido',
      permite_receber: sis.permite_receber,
      timestamp: new Date().toISOString(),
      message: 'Conexão estabelecida com sucesso.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: 'internal_error', message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
