// Edge function autenticada — chamada pela UI do DESTINO após aceitar/recusar/agendar/visualizar
// um encaminhamento de ENTRADA. Notifica a ORIGEM via integracao-atualizar-status.
// Body: { encaminhamento_id: uuid (local de entrada), status, justificativa_recusa?, agendado_em? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED = new Set(['visualizado', 'aceito', 'recusado', 'agendado']);

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
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => null);
    const encId = String(body?.encaminhamento_id ?? '').trim();
    const status = String(body?.status ?? '').trim();
    if (!encId || !ALLOWED.has(status)) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Carrega encaminhamento de ENTRADA + sistema integrado
    const { data: enc } = await admin
      .from('encaminhamentos_externos')
      .select('id, direcao, sistema_integrado_id, remoto_encaminhamento_id, origem_identificador_sistema')
      .eq('id', encId)
      .eq('direcao', 'entrada')
      .maybeSingle();

    if (!enc) {
      return new Response(JSON.stringify({ ok: false, error: 'encaminhamento_nao_encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!enc.remoto_encaminhamento_id) {
      // Sem id remoto não há para onde notificar — apenas registra log.
      await admin.from('logs_integracao').insert({
        tipo_acao: 'callback_status', direcao: 'saida',
        sistema_integrado_id: enc.sistema_integrado_id, encaminhamento_id: enc.id,
        usuario_id: userId,
        status: 'falha', mensagem: 'sem_remoto_id',
      });
      return new Response(JSON.stringify({ ok: false, error: 'sem_remoto_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sis } = await admin
      .from('sistemas_integrados')
      .select('id, identificador_sistema, url_base, token_saida, ativo')
      .eq('id', enc.sistema_integrado_id)
      .maybeSingle();
    if (!sis || !sis.ativo) {
      return new Response(JSON.stringify({ ok: false, error: 'sistema_inativo' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: clinica } = await admin
      .from('clinica_config')
      .select('identificador_local')
      .limit(1)
      .maybeSingle();
    const localIdent = (clinica?.identificador_local ?? '').trim();
    if (!localIdent) {
      return new Response(JSON.stringify({ ok: false, error: 'identificador_local_nao_configurado' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const target = `${sis.url_base.replace(/\/+$/, '')}/functions/v1/integracao-atualizar-status`;
    const remotePayload: Record<string, any> = {
      remoto_encaminhamento_id: enc.remoto_encaminhamento_id,
      status,
      id_no_destino: enc.id,
    };
    if (status === 'recusado') remotePayload.justificativa_recusa = String(body?.justificativa_recusa ?? '');
    if (status === 'agendado') remotePayload.agendado_em = body?.agendado_em ?? new Date().toISOString();

    let httpStatus = 0;
    let okFlag = false;
    let mensagem = '';
    try {
      const resp = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-integration-token': sis.token_saida ?? '',
          'x-system-id': localIdent,
        },
        body: JSON.stringify(remotePayload),
      });
      httpStatus = resp.status;
      const j = await resp.json().catch(() => null);
      okFlag = resp.ok && j?.ok !== false;
      mensagem = okFlag ? 'callback_ok' : (j?.error ?? `HTTP ${httpStatus}`);
    } catch (err: any) {
      mensagem = `network_error: ${err?.message ?? err}`;
    }

    await admin.from('logs_integracao').insert({
      tipo_acao: 'callback_status', direcao: 'saida',
      sistema_integrado_id: sis.id,
      identificador_remoto: sis.identificador_sistema,
      encaminhamento_id: enc.id,
      usuario_id: userId,
      status: okFlag ? 'sucesso' : 'falha',
      http_status: httpStatus || null,
      mensagem,
      detalhes: { status_enviado: status },
    });

    return new Response(JSON.stringify({ ok: okFlag, http_status: httpStatus, message: mensagem }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
