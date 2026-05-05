// Edge function PÚBLICA (sem JWT do usuário) — autentica via x-integration-token + x-system-id.
// Lista profissionais ativos que aceitam encaminhamento externo.
// Também responde a pings (body { ping: true }) para o teste de conexão.
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

  try {
    const authHeader = req.headers.get('Authorization');
    const systemIdHeader = req.headers.get('X-System-Identifier');
    
    const tokenIn = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : (req.headers.get('x-integration-token') ?? '');
    const systemId = systemIdHeader ?? (req.headers.get('x-system-id') ?? '');
    const ip = req.headers.get('x-forwarded-for') ?? '';

    if (!tokenIn || !systemId) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_credentials' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Busca por identificador do sistema remetente
    const { data: sis, error } = await supabase
      .from('sistemas_integrados')
      .select('id, identificador_sistema, token_entrada_hash, ativo, permite_receber, permite_enviar')
      .eq('identificador_sistema', systemId)
      .maybeSingle();

    if (error || !sis) {
      return new Response(JSON.stringify({ ok: false, error: 'unknown_system' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!sis.ativo) {
      return new Response(JSON.stringify({ ok: false, error: 'integration_inactive' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const incomingHash = await sha256(tokenIn);
    if (!sis.token_entrada_hash || incomingHash !== sis.token_entrada_hash) {
      await supabase.from('logs_integracao').insert({
        tipo_acao: 'listar_profissionais', direcao: 'entrada',
        sistema_integrado_id: sis.id, identificador_remoto: systemId,
        status: 'rejeitado', http_status: 401, mensagem: 'invalid_token', ip,
      });
      return new Response(JSON.stringify({ ok: false, error: 'invalid_token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));

    // Ping (teste de conexão)
    if (body?.ping === true) {
      await supabase.from('logs_integracao').insert({
        tipo_acao: 'teste_conexao', direcao: 'entrada',
        sistema_integrado_id: sis.id, identificador_remoto: systemId,
        status: 'sucesso', http_status: 200, mensagem: 'pong', ip,
      });
      return new Response(JSON.stringify({ ok: true, pong: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Lista profissionais ativos com flag aceita_encaminhamento_externo = true em custom_data
    const { data: profs } = await supabase
      .from('funcionarios')
      .select('id, nome, profissao, cargo, unidade_id, ativo, custom_data, role, numero_conselho, tipo_conselho, uf_conselho')
      .eq('ativo', true)
      .in('role', ['profissional', 'master']);

    const lista = (profs ?? [])
      .filter((p: any) => p?.custom_data?.aceita_encaminhamento_externo === true)
      .map((p: any) => ({
        id: p.id,
        nome: p.nome,
        especialidade: p.profissao ?? '',
        cargo: p.cargo ?? '',
        unidade_id: p.unidade_id ?? '',
        conselho: p.tipo_conselho && p.numero_conselho
          ? `${p.tipo_conselho} ${p.numero_conselho}/${p.uf_conselho ?? ''}`.trim()
          : '',
        aceita_encaminhamento_externo: true,
      }));

    await supabase.from('logs_integracao').insert({
      tipo_acao: 'listar_profissionais', direcao: 'entrada',
      sistema_integrado_id: sis.id, identificador_remoto: systemId,
      status: 'sucesso', http_status: 200, mensagem: `${lista.length} profissionais retornados`, ip,
    });

    return new Response(JSON.stringify({ ok: true, profissionais: lista }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
