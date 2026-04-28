// Edge function PÚBLICA — recebe callback do sistema destino informando mudança de status
// (visualizado, aceito, recusado, agendado) de um encaminhamento que ORIGINAMOS.
// Autentica via x-integration-token + x-system-id (mesmo esquema das demais).
// Body: { remoto_encaminhamento_id: string (uuid local na origem),
//         status: 'visualizado'|'aceito'|'recusado'|'agendado',
//         justificativa_recusa?: string,
//         agendado_em?: string,
//         id_no_destino?: string }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-integration-token, x-system-id',
};

async function sha256(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ALLOWED = new Set(['visualizado', 'aceito', 'recusado', 'agendado']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const ip = req.headers.get('x-forwarded-for') ?? '';
  const tokenIn = req.headers.get('x-integration-token') ?? '';
  const systemId = req.headers.get('x-system-id') ?? '';

  try {
    if (!tokenIn || !systemId) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_credentials' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sis } = await supabase
      .from('sistemas_integrados')
      .select('id, identificador_sistema, token_entrada_hash, ativo')
      .eq('identificador_sistema', systemId)
      .maybeSingle();

    if (!sis || !sis.ativo) {
      return new Response(JSON.stringify({ ok: false, error: 'unknown_or_inactive_system' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hash = await sha256(tokenIn);
    if (!sis.token_entrada_hash || hash !== sis.token_entrada_hash) {
      await supabase.from('logs_integracao').insert({
        tipo_acao: 'callback_status', direcao: 'entrada',
        sistema_integrado_id: sis.id, identificador_remoto: systemId,
        status: 'rejeitado', http_status: 401, mensagem: 'invalid_token', ip,
      });
      return new Response(JSON.stringify({ ok: false, error: 'invalid_token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const remotoId = String(body.remoto_encaminhamento_id ?? '').trim();
    const novoStatus = String(body.status ?? '').trim();
    if (!remotoId || !ALLOWED.has(novoStatus)) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Localiza encaminhamento de SAÍDA correspondente
    const { data: enc, error: fErr } = await supabase
      .from('encaminhamentos_externos')
      .select('id, status, sistema_integrado_id, direcao')
      .eq('id', remotoId)
      .eq('direcao', 'saida')
      .maybeSingle();

    if (fErr || !enc) {
      await supabase.from('logs_integracao').insert({
        tipo_acao: 'callback_status', direcao: 'entrada',
        sistema_integrado_id: sis.id, identificador_remoto: systemId,
        status: 'falha', http_status: 404, mensagem: 'encaminhamento_nao_encontrado', ip,
      });
      return new Response(JSON.stringify({ ok: false, error: 'encaminhamento_nao_encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (enc.sistema_integrado_id && enc.sistema_integrado_id !== sis.id) {
      return new Response(JSON.stringify({ ok: false, error: 'system_mismatch' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const upd: Record<string, any> = { status: novoStatus };
    const nowIso = new Date().toISOString();
    if (novoStatus === 'visualizado') upd.visualizado_em = nowIso;
    if (novoStatus === 'aceito') upd.aceito_em = nowIso;
    if (novoStatus === 'recusado') {
      upd.recusado_em = nowIso;
      upd.justificativa_recusa = String(body.justificativa_recusa ?? '');
    }
    if (novoStatus === 'agendado') {
      upd.agendado_em = body.agendado_em ? String(body.agendado_em) : nowIso;
    }
    if (body.id_no_destino) {
      upd.remoto_encaminhamento_id = String(body.id_no_destino);
    }

    const { error: uErr } = await supabase
      .from('encaminhamentos_externos')
      .update(upd)
      .eq('id', enc.id);

    if (uErr) {
      await supabase.from('logs_integracao').insert({
        tipo_acao: 'callback_status', direcao: 'entrada',
        sistema_integrado_id: sis.id, identificador_remoto: systemId,
        encaminhamento_id: enc.id,
        status: 'falha', http_status: 500, mensagem: uErr.message, ip,
      });
      return new Response(JSON.stringify({ ok: false, error: 'update_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('logs_integracao').insert({
      tipo_acao: 'callback_status', direcao: 'entrada',
      sistema_integrado_id: sis.id, identificador_remoto: systemId,
      encaminhamento_id: enc.id,
      status: 'sucesso', http_status: 200,
      mensagem: `status_${novoStatus}`, ip,
    });

    return new Response(JSON.stringify({ ok: true, id: enc.id, status: novoStatus }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
