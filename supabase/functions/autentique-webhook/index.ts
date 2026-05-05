import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders } from '../_shared/autentique.ts';

Deno.serve(async (req) => {
  // Autentique envia webhooks via POST
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    
    // O payload do Autentique varia conforme o evento
    // Geralmente contém event: { type: "..." }, document: { id: "..." }
    const eventType = body.event?.type;
    const authDocId = body.document?.id;

    if (!authDocId) {
      return new Response(JSON.stringify({ ok: false, message: 'ID do documento não encontrado' }), { status: 400 });
    }

    // Busca o documento local
    const { data: doc, error: docErr } = await supabase
      .from('documentos_assinatura_autentique')
      .select('id, status, documento_local_id')
      .eq('autentique_document_id', authDocId)
      .maybeSingle();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ ok: false, message: 'Documento não encontrado no sistema local' }), { status: 404 });
    }

    let newStatus = doc.status;
    if (eventType === 'document.signed') newStatus = 'parcialmente_assinado';
    if (eventType === 'document.completed') newStatus = 'concluido';
    if (eventType === 'document.rejected') newStatus = 'recusado';

    // Atualiza status do documento
    const { error: updErr } = await supabase
      .from('documentos_assinatura_autentique')
      .update({ 
        status: newStatus,
        status_detalhado: body,
        finalizado_em: newStatus === 'concluido' ? new Date().toISOString() : null
      })
      .eq('id', doc.id);

    if (updErr) throw updErr;

    // Se concluiu, podemos atualizar o status na tabela original de documentos_gerados
    if (newStatus === 'concluido' && doc.documento_local_id) {
      await supabase
        .from('documentos_gerados')
        .update({ status: 'assinado_eletronicamente' })
        .eq('id', doc.documento_local_id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Erro no webhook Autentique:', err);
    return new Response(JSON.stringify({ ok: false, message: err.message }), { status: 500 });
  }
});
