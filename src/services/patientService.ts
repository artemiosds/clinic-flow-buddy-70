import { supabase } from '@/integrations/supabase/client';

export const patientService = {
  async getAll(limit = 1000, unidadeId?: string) {
    const all: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      let query = supabase.from('pacientes').select('*').range(offset, offset + limit - 1);
      if (unidadeId) query = query.eq('unidade_id', unidadeId);
      const { data } = await query;
      if (data && data.length > 0) {
        all.push(...data);
        offset += data.length;
        hasMore = data.length === limit;
      } else {
        hasMore = false;
      }
    }
    return all;
  },

  async getById(id: string) {
    const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
    return data;
  },

  async search(query: string, unidadeId?: string) {
    const digitsOnly = query.replace(/\D/g, '');
    const orParts = [`nome.ilike.%${query}%`, `cpf.ilike.%${query}%`];
    if (digitsOnly) orParts.push(`cns.ilike.%${digitsOnly}%`);
    let q = supabase.from('pacientes').select('*').or(orParts.join(',')).limit(50);
    if (unidadeId) q = q.eq('unidade_id', unidadeId);
    const { data } = await q;
    return data || [];
  },
};
