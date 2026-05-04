import { useCallback, useRef, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { auditService } from '@/services/auditService';
import { toast } from 'sonner';
import { z } from 'zod';

/* ---------- Zod schemas for configuration sections ---------- */

const urlSchema = z.string().url('URL inválida').or(z.literal(''));

const sistemaConfigSchema = z.object({
  instituicao: z.object({
    nome: z.string().min(1, 'Nome é obrigatório').max(300),
    cer: z.string().max(300).optional(),
    cnpj: z.string().max(20).optional(),
    endereco: z.string().max(500).optional(),
    telefone: z.string().max(30).optional(),
    email: z.string().email('E-mail inválido').or(z.literal('')).optional(),
    logoUrl: urlSchema.optional(),
  }).optional(),
  notificacoes: z.record(z.unknown()).optional(),
  aparencia: z.object({
    tema: z.enum(['claro', 'escuro', 'sistema']).optional(),
    corPrimaria: z.string().max(20).optional(),
    fonte: z.string().max(50).optional(),
    tamanhoFonte: z.enum(['pequeno', 'medio', 'grande']).optional(),
  }).optional(),
  conformidade: z.object({
    lgpdTexto: z.string().max(5000).optional(),
    exibirAvisoLgpd: z.boolean().optional(),
    retencaoDados: z.number().min(1).max(100).optional(),
    anonimizarApos: z.number().min(1).max(100).optional(),
  }).optional(),
}).passthrough();

const SCHEMAS: Record<string, z.ZodType<any>> = {
  config_sistema: sistemaConfigSchema,
};

const DRAFT_KEY = 'config_draft_pending';

interface PendingDraft {
  key: string;
  value: unknown;
  unidadeId?: string;
  timestamp: number;
}

/**
 * Hook centralizado para ler/gravar configurações com:
 * - Validação Zod
 * - Atualização otimista
 * - Auditoria automática
 * - Realtime Sync
 * - Suporte a unidade-específica (ID unit:{uuid})
 */
export function useConfiguracao(unidadeId?: string) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [configuracoes, setConfiguracoes] = useState<Record<string, any>>({});
  const savingRef = useRef(false);
  
  const configRowId = unidadeId ? `unit:${unidadeId}` : 'default';

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', configRowId)
        .maybeSingle();
      
      if (data?.configuracoes) {
        setConfiguracoes(data.configuracoes as Record<string, any>);
      }
    } catch (err) {
      console.error('Fetch config error:', err);
    } finally {
      setLoading(false);
    }
  }, [configRowId]);

  useEffect(() => {
    fetchConfig();
    
    // Realtime subscription for this specific config row
    const channel = supabase
      .channel(`rt:system_config:${configRowId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_config', filter: `id=eq.${configRowId}` },
        (payload: any) => {
          if (payload.new && payload.new.configuracoes) {
            setConfiguracoes(payload.new.configuracoes);
          }
        }
      )
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [configRowId, fetchConfig]);

  /** Validate a config section using Zod */
  const validate = useCallback((key: string, value: unknown): string | null => {
    const schema = SCHEMAS[key];
    if (schema) {
      const result = schema.safeParse(value);
      if (!result.success) {
        return result.error.issues.map(i => i.message).join('; ');
      }
    }
    return null;
  }, []);

  /** Save a config key to system_config with optimistic update, audit & offline fallback */
  const atualizarConfiguracao = useCallback(
    async (key: string, value: unknown, options?: { silent?: boolean; auditAcao?: string }) => {
      if (savingRef.current) return;
      
      // 1. Validate
      const err = validate(key, value);
      if (err) {
        toast.error(`Validação falhou: ${err}`);
        return;
      }

      savingRef.current = true;
      const oldValue = configuracoes[key] ?? null;
      const newConfig = { ...configuracoes, [key]: value };

      // 2. Optimistic UI update
      setConfiguracoes(newConfig);

      try {
        // 3. Persist
        const { error } = await supabase.from('system_config').upsert({
          id: configRowId,
          configuracoes: newConfig as any,
          updated_at: new Date().toISOString(),
        });

        if (error) throw error;

        // 4. Audit log (non-blocking)
        if (user) {
          auditService.log({
            acao: options?.auditAcao || `ALTERAR_CONFIG_${key.toUpperCase()}`,
            entidade: 'system_config',
            entidadeId: configRowId,
            modulo: 'configuracoes',
            user: { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId },
            oldValue: oldValue ? { [key]: oldValue } : undefined,
            newValue: { [key]: value },
          });
        }

        if (!options?.silent) toast.success('Configuração salva com sucesso');
      } catch (networkErr) {
        // 5. Rollback on error
        setConfiguracoes(configuracoes);
        toast.error('Erro ao salvar configuração.');
        console.error('Config save error:', networkErr);
      } finally {
        savingRef.current = false;
      }
    },
    [user, validate, configRowId, configuracoes],
  );

  return {
    configuracoes,
    loading,
    atualizarConfiguracao,
    validate,
    isMaster: user?.role === 'master',
    refetch: fetchConfig
  };
}