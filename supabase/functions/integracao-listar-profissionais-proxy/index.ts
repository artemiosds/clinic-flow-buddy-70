// Edge function autenticada — proxy para listar profissionais do sistema parceiro.
// Body: { sistema_id: uuid }. Faz fetch ao endpoint público remoto integracao-listar-profissionais.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { sistema_id } = body ?? {};
    if (!sistema_id) {
      return new Response(JSON.stringify({ ok: false, error: 'sistema_id_required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sis, error } = await admin
      .from('sistemas_integrados')
      .select('id, identificador_sistema, url_base, token_saida, ativo')
      .eq('id', sistema_id)
      .maybeSingle();
    if (error || !sis) {
      return new Response(JSON.stringify({ ok: false, error: 'sistema_nao_encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!sis.ativo) {
      return new Response(JSON.stringify({ ok: false, error: 'integration_inactive' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: clinica } = await admin.from('clinica_config').select('identificador_local').limit(1).maybeSingle();
    const localIdent = ((clinica as any)?.identificador_local ?? '').trim();
    if (!localIdent) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'identificador_local_nao_configurado',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const target = `${String(sis.url_base).replace(/\/+$/, '')}/functions/v1/integracao-listar-profissionais`;

    let httpStatus = 0;
    let payload: any = null;
    try {
      const resp = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-integration-token': sis.token_saida ?? '',
          'x-system-id': localIdent,
        },
        body: JSON.stringify({}),
      });
      httpStatus = resp.status;
      payload = await resp.json().catch(() => null);
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: `network_error: ${err?.message ?? err}` }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (httpStatus >= 200 && httpStatus < 300 && payload?.ok) {
      return new Response(JSON.stringify({ ok: true, profissionais: payload.profissionais ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      ok: false,
      error: payload?.error ?? `HTTP ${httpStatus}`,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
