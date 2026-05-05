import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders, callAutentique, getAutentiqueConfig } from '../_shared/autentique.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any;
  try {
    body = await req.json();
    console.log('[Autentique Webhook] Recebido:', JSON.stringify(body, null, 2));
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: 'Payload inválido' }), { status: 400 });
  }

  const eventType = body.event?.type;
  const authDocId = body.document?.id;

  // Registrar log do webhook
  const { data: logEntry } = await supabase
    .from('autentique_webhook_logs')
    .insert({
      payload: body,
      event_type: eventType,
      document_id: authDocId,
    })
    .select('id')
    .single();

  if (!authDocId) {
    if (logEntry) await supabase.from('autentique_webhook_logs').update({ status_code: 400, erro: 'ID do documento não encontrado' }).eq('id', logEntry.id);
    return new Response(JSON.stringify({ ok: false, message: 'ID do documento não encontrado' }), { status: 400 });
  }

  try {
    // Busca o documento local
    const { data: doc, error: docErr } = await supabase
      .from('documentos_assinatura_autentique')
      .select('*')
      .eq('autentique_document_id', authDocId)
      .maybeSingle();

    if (docErr || !doc) {
      if (logEntry) await supabase.from('autentique_webhook_logs').update({ status_code: 404, erro: 'Documento não encontrado no sistema local' }).eq('id', logEntry.id);
      return new Response(JSON.stringify({ ok: false, message: 'Documento não encontrado no sistema local' }), { status: 404 });
    }

    let newStatus = doc.status;
    if (eventType === 'document.signed') newStatus = 'parcialmente_assinado';
    if (eventType === 'document.completed') newStatus = 'concluido';
    if (eventType === 'document.rejected') newStatus = 'recusado';

    // Atualiza status do documento
    const updateData: any = { 
      status: newStatus,
      status_detalhado: body,
      updated_at: new Date().toISOString()
    };

    if (newStatus === 'concluido') {
      updateData.finalizado_em = new Date().toISOString();
    }

    const { error: updErr } = await supabase
      .from('documentos_assinatura_autentique')
      .update(updateData)
      .eq('id', doc.id);

    if (updErr) throw updErr;

    // Se concluiu, podemos atualizar o status na tabela original de documentos_gerados
    if (newStatus === 'concluido' && doc.documento_local_id) {
      await supabase
        .from('documentos_gerados')
        .update({ status: 'assinado_eletronicamente' })
        .eq('id', doc.documento_local_id);
      
      // Lógica de download automático do PDF
      const config = await getAutentiqueConfig(supabase, doc.unidade_id);
      
      if (config && (config as any).baixar_assinado_automaticamente) {
        console.log(`[Autentique Webhook] Iniciando download automático para o documento ${doc.id}`);
        
        try {
          // Precisamos da URL de download do PDF assinado
          // Se não estiver no payload, buscamos via GraphQL
          let downloadUrl = body.document?.files?.signed;
          
          if (!downloadUrl) {
            const query = `
              query GetDocument($id: ID!) {
                document(id: $id) {
                  files {
                    signed
                  }
                }
              }
            `;
            const result = await callAutentique(query, { id: authDocId }, config.token_api);
            downloadUrl = result.document?.files?.signed;
          }

          if (downloadUrl) {
            const pdfRes = await fetch(downloadUrl);
            if (!pdfRes.ok) throw new Error('Falha ao baixar PDF do Autentique');
            
            const pdfBlob = await pdfRes.blob();
            const filePath = `${doc.unidade_id}/${doc.paciente_id}/autentique/${doc.id}/assinado.pdf`;
            
            const { error: uploadErr } = await supabase.storage
              .from('documentos')
              .upload(filePath, pdfBlob, {
                contentType: 'application/json', // Na verdade é PDF, mas o bucket pode ter restrições
                upsert: true
              });
            
            // Tentar novamente com application/pdf se falhar ou por segurança
            if (uploadErr) {
              console.warn('[Autentique Webhook] Tentando upload com content-type PDF');
              await supabase.storage
                .from('documentos')
                .upload(filePath, pdfBlob, {
                  contentType: 'application/pdf',
                  upsert: true
                });
            }

            await supabase
              .from('documentos_assinatura_autentique')
              .update({ 
                storage_path_assinado: filePath,
                storage_bucket: 'documentos'
              })
              .eq('id', doc.id);
            
            console.log(`[Autentique Webhook] PDF assinado salvo em: ${filePath}`);
          }
        } catch (downloadErr: any) {
          console.error('[Autentique Webhook] Erro ao baixar/salvar PDF:', downloadErr);
          if (logEntry) await supabase.from('autentique_webhook_logs').update({ erro: `Erro download PDF: ${downloadErr.message}` }).eq('id', logEntry.id);
        }
      }
    }

    if (logEntry) await supabase.from('autentique_webhook_logs').update({ status_code: 200, processado: true }).eq('id', logEntry.id);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[Autentique Webhook] Erro fatal:', err);
    if (logEntry) await supabase.from('autentique_webhook_logs').update({ status_code: 500, erro: err.message }).eq('id', logEntry.id);
    return new Response(JSON.stringify({ ok: false, message: err.message }), { status: 500 });
  }
});
