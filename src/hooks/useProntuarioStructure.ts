import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ProntuarioSection } from '@/components/EditorProntuarioConfig';
import { DEFAULT_SECTIONS } from '@/components/EditorProntuarioConfig';

const CONFIG_KEY = 'estrutura_prontuario';

export function useProntuarioStructure() {
  const [sections, setSections] = useState<ProntuarioSection[]>(DEFAULT_SECTIONS);
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
        } else {
          setSections(JSON.parse(JSON.stringify(DEFAULT_SECTIONS)));
        }
      } catch {
        setSections(JSON.parse(JSON.stringify(DEFAULT_SECTIONS)));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /**
   * Returns enabled fields from enabled sections, sorted by order.
   * Builtin fields map to form keys; custom fields use `custom_<id>`.
   */
  const getEnabledFields = () => {
    return sections
      .filter(s => s.enabled)
      .sort((a, b) => a.order - b.order)
      .map(s => ({
        ...s,
        fields: (s.fields || []).filter(f => f.enabled).sort((a, b) => a.order - b.order),
      }))
      .filter(s => s.fields.length > 0);
  };

  return { sections, loading, getEnabledFields };
}
