// Edge function autenticada — envia um encaminhamento para um Sistema Integrado externo.
// Body: { sistema_id: uuid, payload: { ... } }  Onde payload contém os campos clínicos.
// Persiste em encaminhamentos_externos (direcao=saida) ANTES de enviar; após resposta atualiza status.
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
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { sistema_id, payload, anexos, pdf } = body as {
      sistema_id: string;
      payload: Record<string, any>;
      anexos?: Array<{ nome: string; mime_type: string; tamanho: number; storage_path?: string; url?: string }>;
      pdf?: { storage_path: string; url?: string } | null;
    };

    if (!sistema_id || !payload?.paciente_nome || !payload?.motivo) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_required_fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Carrega configuração do sistema parceiro
    const { data: sis, error: sisErr } = await admin
      .from('sistemas_integrados')
      .select('id, nome, identificador_sistema, url_base, token_saida, ativo, permite_enviar')
      .eq('id', sistema_id)
      .maybeSingle();

    if (sisErr || !sis) {
      return new Response(JSON.stringify({ ok: false, error: 'sistema_nao_encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!sis.ativo || !sis.permite_enviar) {
      return new Response(JSON.stringify({ ok: false, error: 'envio_nao_permitido' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Identificador local do nosso sistema (para o parceiro nos reconhecer)
    const { data: clinica } = await admin
      .from('clinica_config')
      .select('identificador_local, nome_clinica')
      .limit(1)
      .maybeSingle();
    const localIdent = (clinica?.identificador_local ?? '').trim();
    if (!localIdent) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'identificador_local_nao_configurado',
        message: 'Configure o "Identificador deste sistema" em Configurações antes de enviar encaminhamentos.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Persistência local primeiro (status=pendente_envio)
    const insertLocal: Record<string, any> = {
      direcao: 'saida',
      sistema_integrado_id: sis.id,
      origem_identificador_sistema: localIdent,
      origem_unidade: String(payload.origem_unidade ?? clinica?.nome_clinica ?? ''),
      origem_profissional_id: String(payload.origem_profissional_id ?? ''),
      origem_profissional_nome: String(payload.origem_profissional_nome ?? ''),
      origem_especialidade: String(payload.origem_especialidade ?? ''),
      destino_unidade: String(sis.nome ?? ''),
      destino_profissional_id: String(payload.destino_profissional_id ?? ''),
      destino_profissional_nome: String(payload.destino_profissional_nome ?? ''),
      destino_especialidade: String(payload.destino_especialidade ?? ''),
      paciente_id_origem: String(payload.paciente_id_origem ?? ''),
      paciente_nome: String(payload.paciente_nome ?? ''),
      paciente_cpf: String(payload.paciente_cpf ?? '').replace(/\D/g, ''),
      paciente_cns: String(payload.paciente_cns ?? '').replace(/\D/g, ''),
      paciente_data_nascimento: String(payload.paciente_data_nascimento ?? ''),
      paciente_telefone: String(payload.paciente_telefone ?? ''),
      paciente_dados: payload.paciente_dados ?? {},
      motivo: String(payload.motivo ?? ''),
      resumo_clinico: String(payload.resumo_clinico ?? ''),
      cid: String(payload.cid ?? ''),
      procedimentos: Array.isArray(payload.procedimentos) ? payload.procedimentos : [],
      documento_texto: String(payload.documento_texto ?? ''),
      status: 'pendente_envio',
      criado_por: userId,
      tentativas: 0,
    };

    const { data: saved, error: insErr } = await admin
      .from('encaminhamentos_externos')
      .insert(insertLocal)
      .select('id')
      .single();
    if (insErr || !saved) {
      return new Response(JSON.stringify({ ok: false, error: 'erro_persistir', detail: insErr?.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Envia ao parceiro
    const target = `${sis.url_base.replace(/\/+$/, '')}/functions/v1/integracao-receber-encaminhamento`;
    const remotePayload = { ...payload, remoto_encaminhamento_id: saved.id, origem_unidade: insertLocal.origem_unidade };

    const t0 = Date.now();
    let httpStatus = 0;
    let okFlag = false;
    let mensagem = '';
    let respPayload: any = null;
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
      respPayload = await resp.json().catch(() => null);
      okFlag = resp.ok && respPayload?.ok !== false;
      mensagem = okFlag ? 'enviado' : (respPayload?.error ?? `HTTP ${httpStatus}`);
    } catch (err: any) {
      mensagem = `network_error: ${err?.message ?? err}`;
    }
    const elapsedMs = Date.now() - t0;

    // Atualiza registro local
    await admin.from('encaminhamentos_externos').update({
      status: okFlag ? 'enviado' : 'falha_envio',
      tentativas: 1,
      ultima_tentativa_em: new Date().toISOString(),
      ultimo_erro: okFlag ? '' : mensagem.slice(0, 500),
      remoto_encaminhamento_id: okFlag && respPayload?.id ? String(respPayload.id) : '',
    }).eq('id', saved.id);

    if (okFlag) {
      await admin.from('sistemas_integrados').update({ ultima_sincronizacao: new Date().toISOString() }).eq('id', sis.id);
    }

    await admin.from('logs_integracao').insert({
      tipo_acao: 'envio_encaminhamento',
      direcao: 'saida',
      sistema_integrado_id: sis.id,
      identificador_remoto: sis.identificador_sistema,
      encaminhamento_id: saved.id,
      paciente_id: insertLocal.paciente_id_origem,
      usuario_id: userId,
      status: okFlag ? 'sucesso' : 'falha',
      http_status: httpStatus || null,
      mensagem,
      detalhes: logSafe({ url: sis.url_base, elapsedMs }),
    });

    return new Response(JSON.stringify({
      ok: okFlag,
      id: saved.id,
      remoto_id: respPayload?.id ?? null,
      http_status: httpStatus,
      message: mensagem,
      elapsed_ms: elapsedMs,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
