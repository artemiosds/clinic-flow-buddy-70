// Edge function PÚBLICA — recebe encaminhamentos do sistema externo via x-integration-token + x-system-id.
// Insere em encaminhamentos_externos com direcao='entrada' e status='recebido'.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const ip = req.headers.get('x-forwarded-for') ?? '';
  const authHeader = req.headers.get('Authorization');
  const systemIdHeader = req.headers.get('X-System-Identifier');
  
  const tokenIn = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : (req.headers.get('x-integration-token') ?? '');
  const systemId = systemIdHeader ?? (req.headers.get('x-system-id') ?? '');

  try {
    if (!tokenIn || !systemId) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_credentials' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sis } = await supabase
      .from('sistemas_integrados')
      .select('id, identificador_sistema, nome, token_entrada_hash, ativo, permite_receber')
      .eq('identificador_sistema', systemId)
      .maybeSingle();

    if (!sis) {
      return new Response(JSON.stringify({ ok: false, error: 'unknown_system' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!sis.ativo || !sis.permite_receber) {
      return new Response(JSON.stringify({ ok: false, error: 'reception_not_allowed' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hash = await sha256(tokenIn);
    if (!sis.token_entrada_hash || hash !== sis.token_entrada_hash) {
      await supabase.from('logs_integracao').insert({
        tipo_acao: 'recebimento', direcao: 'entrada',
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

    // Validação mínima
    const required = ['paciente_nome', 'motivo'];
    for (const f of required) {
      if (!body[f] || String(body[f]).trim() === '') {
        return new Response(JSON.stringify({ ok: false, error: `missing_field:${f}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const insertPayload = {
      direcao: 'entrada',
      sistema_integrado_id: sis.id,
      remoto_encaminhamento_id: String(body.remoto_encaminhamento_id ?? ''),
      origem_identificador_sistema: systemId,
      origem_unidade: String(body.origem_unidade ?? sis.nome ?? ''),
      origem_profissional_id: String(body.origem_profissional_id ?? ''),
      origem_profissional_nome: String(body.origem_profissional_nome ?? ''),
      origem_especialidade: String(body.origem_especialidade ?? ''),
      destino_unidade: String(body.destino_unidade ?? ''),
      destino_profissional_id: String(body.destino_profissional_id ?? ''),
      destino_profissional_nome: String(body.destino_profissional_nome ?? ''),
      destino_especialidade: String(body.destino_especialidade ?? ''),
      paciente_id_origem: String(body.paciente_id_origem ?? ''),
      paciente_nome: String(body.paciente_nome ?? ''),
      paciente_cpf: String(body.paciente_cpf ?? '').replace(/\D/g, ''),
      paciente_cns: String(body.paciente_cns ?? '').replace(/\D/g, ''),
      paciente_data_nascimento: String(body.paciente_data_nascimento ?? ''),
      paciente_telefone: String(body.paciente_telefone ?? ''),
      paciente_dados: body.paciente_dados ?? {},
      motivo: String(body.motivo ?? ''),
      resumo_clinico: String(body.resumo_clinico ?? ''),
      cid: String(body.cid ?? ''),
      procedimentos: Array.isArray(body.procedimentos) ? body.procedimentos : [],
      documento_texto: String(body.documento_texto ?? ''),
      documento_url: String(body.documento_url ?? ''),
      status: 'recebido',
      recebido_em: new Date().toISOString(),
    };

    const { data: inserted, error: iErr } = await supabase
      .from('encaminhamentos_externos')
      .insert(insertPayload)
      .select('id')
      .single();

    if (iErr) {
      await supabase.from('logs_integracao').insert({
        tipo_acao: 'recebimento', direcao: 'entrada',
        sistema_integrado_id: sis.id, identificador_remoto: systemId,
        status: 'falha', http_status: 500, mensagem: iErr.message, ip,
      });
      return new Response(JSON.stringify({ ok: false, error: 'insert_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Persiste anexos recebidos (URLs assinadas pelo emissor — visualização inline no modal)
    if (Array.isArray(body.anexos) && body.anexos.length) {
      const rows = body.anexos
        .filter((a: any) => a && (a.url || a.storage_path))
        .map((a: any) => ({
          encaminhamento_id: inserted.id,
          direcao: 'entrada',
          nome_arquivo: String(a.nome || a.nome_arquivo || 'anexo'),
          mime_type: String(a.mime_type || 'application/octet-stream'),
          tamanho_bytes: Number(a.tamanho || a.tamanho_bytes || 0),
          storage_path: '',
          url_remota: String(a.url || ''),
          origem: 'remoto',
        }));
      if (rows.length) await supabase.from('encaminhamentos_anexos').insert(rows);
    }

    await supabase.from('logs_integracao').insert({
      tipo_acao: 'recebimento', direcao: 'entrada',
      sistema_integrado_id: sis.id, identificador_remoto: systemId,
      paciente_id: insertPayload.paciente_id_origem,
      encaminhamento_id: inserted.id,
      status: 'sucesso', http_status: 200, mensagem: 'recebido', ip,
    });

    return new Response(JSON.stringify({ ok: true, id: inserted.id, status: 'recebido' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    await supabase.from('logs_integracao').insert({
      tipo_acao: 'recebimento', direcao: 'entrada',
      identificador_remoto: systemId,
      status: 'falha', http_status: 500, mensagem: err?.message ?? 'internal_error', ip,
    }).catch(() => {});
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
