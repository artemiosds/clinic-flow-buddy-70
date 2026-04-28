// Cron-driven retry — reprocessa encaminhamentos com status='falha_envio' cuja
// proxima_tentativa_em já passou. Backoff exponencial: 5min, 15min, 1h, 6h, 24h.
// Limite máximo: 5 tentativas. Após isso, marca como 'falha_definitiva'.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BACKOFF_MIN = [5, 15, 60, 360, 1440]; // minutos por tentativa (1ª já feita ao enviar)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const startedAt = new Date().toISOString();
  let processed = 0;
  let succeeded = 0;
  let definitivos = 0;

  try {
    // Permite acionamento manual via body opcional { encaminhamento_id }
    const body = await req.json().catch(() => null);
    const manualId: string | null = body?.encaminhamento_id ?? null;

    let query = admin
      .from('encaminhamentos_externos')
      .select('id, sistema_integrado_id, paciente_id_origem, motivo, resumo_clinico, cid, procedimentos, documento_texto, documento_url, pdf_url, pdf_path, paciente_nome, paciente_cpf, paciente_cns, paciente_data_nascimento, paciente_telefone, paciente_dados, origem_unidade, origem_profissional_id, origem_profissional_nome, origem_especialidade, destino_profissional_id, destino_profissional_nome, destino_especialidade, paciente_id_origem, tentativas, origem_identificador_sistema')
      .in('status', ['falha_envio', 'pendente_envio'])
      .lte('tentativas', 5)
      .limit(20);

    if (manualId) {
      query = admin
        .from('encaminhamentos_externos')
        .select('id, sistema_integrado_id, paciente_id_origem, motivo, resumo_clinico, cid, procedimentos, documento_texto, documento_url, pdf_url, pdf_path, paciente_nome, paciente_cpf, paciente_cns, paciente_data_nascimento, paciente_telefone, paciente_dados, origem_unidade, origem_profissional_id, origem_profissional_nome, origem_especialidade, destino_profissional_id, destino_profissional_nome, destino_especialidade, paciente_id_origem, tentativas, origem_identificador_sistema')
        .eq('id', manualId)
        .limit(1);
    } else {
      // Apenas vencidos (proxima_tentativa_em <= now)
      query = query.or(`proxima_tentativa_em.lte.${startedAt},proxima_tentativa_em.is.null`);
    }

    const { data: pendentes, error: pErr } = await query;
    if (pErr) throw pErr;

    for (const enc of pendentes ?? []) {
      processed++;
      const tentativaAtual = (enc.tentativas ?? 0) + 1;

      // Carrega sistema parceiro
      const { data: sis } = await admin
        .from('sistemas_integrados')
        .select('id, nome, identificador_sistema, url_base, token_saida, ativo, permite_enviar')
        .eq('id', enc.sistema_integrado_id)
        .maybeSingle();

      if (!sis || !sis.ativo || !sis.permite_enviar) {
        await admin.from('encaminhamentos_externos').update({
          status: 'falha_envio',
          tentativas: tentativaAtual,
          ultima_tentativa_em: new Date().toISOString(),
          ultimo_erro: 'sistema_inativo_ou_sem_permissao',
          proxima_tentativa_em: null,
        }).eq('id', enc.id);
        continue;
      }

      // Anexos
      const { data: anexos } = await admin
        .from('encaminhamentos_anexos')
        .select('nome_arquivo, mime_type, tamanho_bytes, storage_path, url_remota')
        .eq('encaminhamento_id', enc.id)
        .eq('direcao', 'saida');

      const anexosPayload: any[] = [];
      for (const a of anexos ?? []) {
        if (a.url_remota) {
          anexosPayload.push({ nome: a.nome_arquivo, mime_type: a.mime_type, tamanho: a.tamanho_bytes, url: a.url_remota });
        } else if (a.storage_path) {
          const { data: signed } = await admin.storage.from('encaminhamentos').createSignedUrl(a.storage_path, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) {
            anexosPayload.push({ nome: a.nome_arquivo, mime_type: a.mime_type, tamanho: a.tamanho_bytes, url: signed.signedUrl });
          }
        }
      }

      // PDF assinado
      let pdfUrl = enc.pdf_url ?? '';
      if (!pdfUrl && enc.pdf_path) {
        const { data: signed } = await admin.storage.from('encaminhamentos').createSignedUrl(enc.pdf_path, 60 * 60 * 24 * 7);
        pdfUrl = signed?.signedUrl ?? '';
      }

      const remotePayload = {
        remoto_encaminhamento_id: enc.id,
        origem_unidade: enc.origem_unidade,
        origem_profissional_id: enc.origem_profissional_id,
        origem_profissional_nome: enc.origem_profissional_nome,
        origem_especialidade: enc.origem_especialidade,
        destino_profissional_id: enc.destino_profissional_id,
        destino_profissional_nome: enc.destino_profissional_nome,
        destino_especialidade: enc.destino_especialidade,
        paciente_id_origem: enc.paciente_id_origem,
        paciente_nome: enc.paciente_nome,
        paciente_cpf: enc.paciente_cpf,
        paciente_cns: enc.paciente_cns,
        paciente_data_nascimento: enc.paciente_data_nascimento,
        paciente_telefone: enc.paciente_telefone,
        paciente_dados: enc.paciente_dados,
        motivo: enc.motivo,
        resumo_clinico: enc.resumo_clinico,
        cid: enc.cid,
        procedimentos: enc.procedimentos,
        documento_texto: enc.documento_texto,
        documento_url: pdfUrl || enc.documento_url,
        anexos: anexosPayload,
      };

      const target = `${sis.url_base.replace(/\/+$/, '')}/functions/v1/integracao-receber-encaminhamento`;
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
            'x-system-id': enc.origem_identificador_sistema || '',
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

      const proximoBackoff = BACKOFF_MIN[Math.min(tentativaAtual - 1, BACKOFF_MIN.length - 1)];
      const proximaTentativa = okFlag ? null : (tentativaAtual >= 5 ? null : new Date(Date.now() + proximoBackoff * 60 * 1000).toISOString());
      const novoStatus = okFlag ? 'enviado' : (tentativaAtual >= 5 ? 'falha_definitiva' : 'falha_envio');
      if (okFlag) succeeded++;
      if (novoStatus === 'falha_definitiva') definitivos++;

      await admin.from('encaminhamentos_externos').update({
        status: novoStatus,
        tentativas: tentativaAtual,
        ultima_tentativa_em: new Date().toISOString(),
        proxima_tentativa_em: proximaTentativa,
        ultimo_erro: okFlag ? '' : mensagem.slice(0, 500),
        remoto_encaminhamento_id: okFlag && respPayload?.id ? String(respPayload.id) : enc.id,
      }).eq('id', enc.id);

      if (okFlag) {
        await admin.from('sistemas_integrados').update({ ultima_sincronizacao: new Date().toISOString() }).eq('id', sis.id);
      }

      await admin.from('logs_integracao').insert({
        tipo_acao: 'reenvio_encaminhamento',
        direcao: 'saida',
        sistema_integrado_id: sis.id,
        identificador_remoto: sis.identificador_sistema,
        encaminhamento_id: enc.id,
        paciente_id: enc.paciente_id_origem,
        status: okFlag ? 'sucesso' : (novoStatus === 'falha_definitiva' ? 'falha_definitiva' : 'falha'),
        http_status: httpStatus || null,
        mensagem,
        detalhes: { tentativa: tentativaAtual, elapsedMs, manual: !!manualId },
      });
    }

    return new Response(JSON.stringify({
      ok: true, started_at: startedAt, processed, succeeded, definitivos,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
