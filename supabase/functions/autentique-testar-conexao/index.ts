import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders, callAutentique } from '../_shared/autentique.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { token, ambiente } = await req.json();

    if (!token) {
      throw new Error('Token não fornecido');
    }

    // Query simples para testar o token
    const query = `
      query {
        viewer {
          name
          email
          organization {
            name
          }
        }
      }
    `;

    const data = await callAutentique(query, {}, token);

    return new Response(JSON.stringify({ 
      ok: true, 
      viewer: data.viewer,
      message: 'Conectado ao Autentique com sucesso.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ 
      ok: false, 
      error: 'auth_error', 
      message: err.message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
