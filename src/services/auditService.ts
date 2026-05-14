import { supabase } from '@/integrations/supabase/client';
import { getPublicIp, getDeviceInfo } from '@/lib/clientInfo';

interface UserInfo {
  id?: string;
  nome?: string;
  role?: string;
  unidadeId?: string;
  cpf?: string;
  email?: string;
}

interface AuditParams {
  acao: string;
  entidade: string;
  entidadeId?: string;
  entidadeNome?: string;
  modulo?: string;
  user?: UserInfo | null;
  detalhes?: Record<string, any>;
  before?: any;
  after?: any;
  status?: 'sucesso' | 'erro' | 'bloqueado' | 'pendente';
  erro?: string;
  pacienteId?: string;
  profissionalId?: string;
  unidadeAfetadaId?: string;
  origem?: string;
}

/**
 * Calculates differences between two objects
 */
export const diffObjects = (before: any, after: any) => {
  if (!before) return after;
  if (!after) return null;

  const changes: Record<string, { before: any; after: any }> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  allKeys.forEach(key => {
    // Skip technical fields
    if (['updated_at', 'criado_em', 'atualizado_em', 'id'].includes(key)) return;
    
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = {
        before: before[key],
        after: after[key]
      };
    }
  });

  return Object.keys(changes).length > 0 ? changes : null;
};

export const auditService = {
  async log(params: AuditParams) {
    try {
      const ip = await getPublicIp();
      const device = getDeviceInfo();
      const ua = navigator.userAgent;

      // Enrich details
      const detalhes: Record<string, any> = { 
        ...(params.detalhes || {}),
        dispositivo: device,
        user_agent: ua,
        origem: params.origem || window.location.pathname,
      };

      if (params.before) detalhes.before = params.before;
      if (params.after) detalhes.after = params.after;
      
      const changes = diffObjects(params.before, params.after);
      if (changes) {
        detalhes.changes = changes;
        detalhes.campos_alterados = Object.keys(changes);
      }

      // Contextual IDs
      if (params.pacienteId) detalhes.paciente_id = params.pacienteId;
      if (params.profissionalId) detalhes.profissional_id = params.profissionalId;
      if (params.unidadeAfetadaId) detalhes.unidade_afetada_id = params.unidadeAfetadaId;
      if (params.entidadeNome) detalhes.entidade_nome = params.entidadeNome;

      // User info for easier retrieval
      if (params.user?.cpf) detalhes.usuario_cpf = params.user.cpf;
      if (params.user?.email) detalhes.usuario_email = params.user.email;

      const payload = {
        acao: params.acao,
        entidade: params.entidade,
        entidade_id: params.entidadeId || '',
        modulo: params.modulo || params.entidade,
        user_id: params.user?.id || '',
        user_nome: params.user?.nome || 'sistema',
        role: params.user?.role || 'sistema',
        unidade_id: params.user?.unidadeId || '',
        ip,
        detalhes,
        status: params.status || 'sucesso',
        erro: params.erro || '',
      };

      const { error } = await supabase.from('action_logs').insert(payload);
      if (error) throw error;
      
      return true;
    } catch (err) {
      console.error('Audit log error:', err);
      return false;
    }
  },

  // Helper for updates to easily record before/after
  async auditUpdate(params: Omit<AuditParams, 'before' | 'after'> & { before: any; after: any }) {
    return this.log(params);
  },

  async auditCreate(params: Omit<AuditParams, 'after'> & { data: any }) {
    return this.log({ ...params, after: params.data });
  },

  async auditDelete(params: Omit<AuditParams, 'before'> & { data: any }) {
    return this.log({ ...params, before: params.data, status: params.status || 'sucesso' });
  },

  async auditError(params: AuditParams & { erro: string }) {
    return this.log({ ...params, status: 'erro' });
  }
};
