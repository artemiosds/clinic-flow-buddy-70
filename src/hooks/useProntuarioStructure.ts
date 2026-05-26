import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ProntuarioSection } from '@/components/EditorProntuarioConfig';

const CONFIG_KEY = 'estrutura_prontuario';

export function useProntuarioStructure() {
  const [sections, setSections] = useState<ProntuarioSection[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('system_config')
          .select('configuracoes')
          .eq('id', 'default')
          .single();

        const config = data?.configuracoes as any;
        if (config?.[CONFIG_KEY]?.sections) {
          setSections(config[CONFIG_KEY].sections);
        }
      } catch {
        // fallback: no custom structure
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /**
   * Returns enabled sections sorted by order, filtering by record type if provided.
   */
  const getEnabledSections = (tipoRegistro?: string) => {
    if (!sections) return null;
    return sections
      .filter(s => {
        if (!s.enabled) return false;
        if (tipoRegistro && s.tiposProntuario && s.tiposProntuario.length > 0) {
          return s.tiposProntuario.includes(tipoRegistro);
        }
        return true;
      })
      .sort((a, b) => a.order - b.order);
  };

  return { sections, loading, getEnabledSections };
}
