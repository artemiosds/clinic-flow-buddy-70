import { supabase } from '@/integrations/supabase/client';
import { enqueueOfflineMutation } from "@/lib/offline/offlineMutation";
import { toast } from "sonner";



export interface PTSMeta {
  id?: string;
  pts_id?: string;
  titulo: string;
  descricao: string;
  categoria: string;
  especialidade: string;
  responsavel_id?: string;
  prioridade: string;
  prazo?: string;
  indicador_sucesso: string;
  status: string;
  observacoes: string;
}

export interface PTS {
  id: string;
  patient_id: string;
  professional_id: string;
  unit_id: string;
  diagnostico_funcional: string;
  objetivos_terapeuticos: string;
  especialidades_envolvidas: string[];
  status: string;
  prioridade: string;
  contextos_afetados: string[];
  fatores_risco_vulnerabilidade: string;
  rede_apoio: string;
  tipo_atendimento: string[];
  necessidade_interdisciplinar: boolean;
  motivo_encaminhamento: string;
  barreiras: string;
  potencialidades: string;
  objetivos_especificos: string;
  observacoes_especialidade: any;
  plano_conduta: string;
  data_ultima_revisao: string | null;
  data_proxima_revisao: string | null;
  revisao_obrigatoria: boolean;
  observacoes_revisao: string;
  criterio_alta_atingido: boolean;
  motivo_encerramento: string;
  resumo_alta_encerramento: string;
  orientacoes_finais: string;
  encaminhamentos_pos_alta: string;
  ciencia_familia: boolean;
  created_at: string;
  updated_at: string;
  metas?: PTSMeta[];
  sigtap?: any[];
  cids?: any[];
}

export const ptsService = {
  async getActivePTS(patientId: string): Promise<PTS | null> {
    const { data, error } = await supabase
      .from('pts')
      .select(`
        *,
        metas:pts_metas(*),
        sigtap:pts_sigtap(*),
        cids:pts_cid(*)
      `)
      .eq('patient_id', patientId)
      .eq('status', 'ativo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as any;
  },

  async getPTSHistory(patientId: string): Promise<PTS[]> {
    const { data, error } = await supabase
      .from('pts')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as any[];
  },

  async createPTS(ptsData: Partial<PTS>, metas: PTSMeta[], sigtap: any[], cids: any[]) {
    const ptsId = crypto.randomUUID();
    
    // Filter out relation fields
    const { metas: _, sigtap: __, cids: ___, id: ____, created_at: _____, updated_at: ______, ...cleanData } = ptsData as any;
    
    // Queue PTS creation
    await enqueueOfflineMutation("INSERT", {
      ...cleanData,
      id: ptsId,
    }, {
      table: 'pts',
      showToast: false
    });

    if (metas.length > 0) {
      for (const m of metas) {
        const { id, ...cleanMeta } = m as any;
        await enqueueOfflineMutation("INSERT", {
          ...cleanMeta,
          pts_id: ptsId,
        }, {
          table: 'pts_metas',
          showToast: false
        });
      }
    }

    if (sigtap.length > 0) {
      for (const s of sigtap) {
        const { id, pts_id, ...cleanSigtap } = s;
        await enqueueOfflineMutation("INSERT", {
          ...cleanSigtap,
          pts_id: ptsId,
        }, {
          table: 'pts_sigtap',
          showToast: false
        });
      }
    }

    if (cids.length > 0) {
      for (const c of cids) {
        const { id, pts_id, ...cleanCid } = c;
        await enqueueOfflineMutation("INSERT", {
          ...cleanCid,
          pts_id: ptsId,
        }, {
          table: 'pts_cid',
          showToast: false
        });
      }
    }

    toast.success("PTS salvo localmente. Aguardando sincronização.");
    return ptsId;
  },

  async updatePTS(ptsId: string, ptsData: Partial<PTS>) {
    const { metas: _, sigtap: __, cids: ___, id: ____, created_at: _____, updated_at: ______, ...cleanData } = ptsData as any;
    
    return await enqueueOfflineMutation("UPDATE", cleanData, {
      table: 'pts',
      lookupField: 'id',
      lookupValue: ptsId
    });
  },


  async registerRevision(ptsId: string, revisionData: {
    profissional_id: string;
    alteracoes_realizadas: string;
    observacoes: string;
    proxima_revisao?: string;
  }) {
    const { error: revisionError } = await supabase
      .from('pts_revisoes')
      .insert({
        pts_id: ptsId,
        profissional_id: revisionData.profissional_id,
        alteracoes_realizadas: revisionData.alteracoes_realizadas,
        observacoes: revisionData.observacoes
      });

    if (revisionError) throw revisionError;

    const { error: ptsError } = await supabase
      .from('pts')
      .update({
        data_ultima_revisao: new Date().toISOString().split('T')[0],
        data_proxima_revisao: revisionData.proxima_revisao || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', ptsId);

    if (ptsError) throw ptsError;
  },

  async closePTS(ptsId: string, closureData: {
    motivo_encerramento: string;
    resumo_alta_encerramento: string;
    orientacoes_finais?: string;
    encaminhamentos_pos_alta?: string;
    criterio_alta_atingido: boolean;
  }) {
    const { error } = await supabase
      .from('pts')
      .update({
        ...closureData,
        status: 'concluido',
        updated_at: new Date().toISOString()
      })
      .eq('id', ptsId);

    if (error) throw error;
  },

  async updateMetaStatus(metaId: string, status: string, observations?: string) {
    const { error } = await supabase
      .from('pts_metas')
      .update({
        status,
        observacoes: observations,
        updated_at: new Date().toISOString()
      })
      .eq('id', metaId);

    if (error) throw error;
  }
};
