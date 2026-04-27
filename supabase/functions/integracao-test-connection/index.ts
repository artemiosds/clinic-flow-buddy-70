// Edge function: testa conexão com um Sistema Integrado externo (outro Lovable igual).
// Apenas Master/Gestão autenticado pode chamar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function logSafe(detail: Record<string, any>) {
  const clone = { ...detail };
  if (clone.token) clone.token = '***';
  return clone;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { sistema_id, url_base, token_saida, identificador_sistema } = body ?? {};

    let alvoUrl = (url_base ?? '').toString().trim().replace(/\/+$/, '');
    let alvoToken = (token_saida ?? '').toString();
    let alvoIdent = (identificador_sistema ?? '').toString();

    // Se sistema_id foi passado, busca registro do banco (token completo)
    if (sistema_id && (!alvoUrl || !alvoToken)) {
      const { data: sis, error } = await supabase
        .from('sistemas_integrados')
        .select('url_base, token_saida, identificador_sistema, ativo, permite_enviar')
        .eq('id', sistema_id)
        .maybeSingle();
      if (error || !sis) {
        return new Response(JSON.stringify({ ok: false, error: 'Sistema não encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!sis.ativo) {
        return new Response(JSON.stringify({ ok: false, error: 'Integração inativa' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      alvoUrl = String(sis.url_base ?? '').trim().replace(/\/+$/, '');
      alvoToken = String(sis.token_saida ?? '');
      alvoIdent = String(sis.identificador_sistema ?? '');
    }

    if (!alvoUrl) {
      return new Response(JSON.stringify({ ok: false, error: 'URL base obrigatória' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Endpoint padrão de health da própria família de funções
    const target = `${alvoUrl}/functions/v1/integracao-listar-profissionais`;

    const t0 = Date.now();
    let httpStatus = 0;
    let okFlag = false;
    let mensagem = '';
    let payload: any = null;
    try {
      const resp = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-integration-token': alvoToken,
          'x-system-id': alvoIdent,
        },
        body: JSON.stringify({ ping: true }),
      });
      httpStatus = resp.status;
      payload = await resp.json().catch(() => null);
      okFlag = resp.ok && payload?.ok !== false;
      mensagem = okFlag ? 'Conexão OK' : (payload?.error ?? `HTTP ${httpStatus}`);
    } catch (err: any) {
      mensagem = `Falha de rede: ${err?.message ?? err}`;
    }
    const elapsedMs = Date.now() - t0;

    // Atualiza ultima_sincronizacao quando sucesso
    if (okFlag && sistema_id) {
      await supabase.from('sistemas_integrados').update({ ultima_sincronizacao: new Date().toISOString() }).eq('id', sistema_id);
    }

    // Log
    await supabase.from('logs_integracao').insert({
      tipo_acao: 'teste_conexao',
      direcao: 'saida',
      sistema_integrado_id: sistema_id ?? null,
      identificador_remoto: alvoIdent,
      usuario_id: claims.claims.sub ?? '',
      status: okFlag ? 'sucesso' : 'falha',
      http_status: httpStatus || null,
      mensagem,
      detalhes: logSafe({ url: alvoUrl, elapsedMs }),
    });

    return new Response(
      JSON.stringify({ ok: okFlag, http_status: httpStatus, message: mensagem, elapsed_ms: elapsedMs }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'Erro inesperado' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
