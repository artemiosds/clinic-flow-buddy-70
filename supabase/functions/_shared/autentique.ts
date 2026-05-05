import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const AUTENTIQUE_URL = 'https://api.autentique.com.br/v2/graphql';

export interface AutentiqueConfig {
  id: string;
  ativo: boolean;
  ambiente: 'sandbox' | 'production';
  token_api: string;
  organizacao_nome?: string;
}

export async function getAutentiqueConfig(supabase: any, unidadeId?: string): Promise<AutentiqueConfig | null> {
  let query = supabase
    .from('assinatura_eletronica_config')
    .select('*')
    .eq('provider', 'autentique');
  
  if (unidadeId) {
    query = query.eq('unidade_id', unidadeId);
  } else {
    query = query.is('unidade_id', null);
  }

  const { data, error } = await query.maybeSingle();
  
  if (error || !data) {
    // Se não achou por unidade, tenta global
    if (unidadeId) {
      return getAutentiqueConfig(supabase);
    }
    return null;
  }
  
  return data as AutentiqueConfig;
}

export async function callAutentique(query: string, variables: any, token: string) {
  const response = await fetch(AUTENTIQUE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  if (result.errors) {
    throw new Error(result.errors[0].message);
  }
  return result.data;
}
