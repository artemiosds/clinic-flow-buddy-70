/**
 * Renderiza HTML institucional dos campos personalizados de uma tela,
 * compartilhado por Ficha do Paciente, Prontuário (PDF) e Histórico.
 * Usa as classes .ficha-section/.ficha-grid/.ficha-field já incluídas em FICHA_EXTRA_CSS.
 */
import { supabase } from '@/integrations/supabase/client';
import type { CustomFieldDef, CustomFieldsConfig, ScreenKey, ScreenConfig } from '@/hooks/useCustomFields';
import { filterVisibleFields, groupBySection, type ContextoCampos } from '@/lib/customFieldRules';

const esc = (v: unknown) =>
  v === null || v === undefined ? '' :
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function readValue(field: CustomFieldDef, values: Record<string, any>): string {
  let v: any = values?.[field.nome];
  if ((v === undefined || v === '') && field.legacyNames?.length) {
    for (const ln of field.legacyNames) {
      if (values?.[ln] !== undefined && values?.[ln] !== '') { v = values[ln]; break; }
    }
  }
  if (v === undefined || v === null || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ') || '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'string' && v.includes('||')) return v.split('||').filter(Boolean).join(', ') || '—';
  return String(v);
}

/** Carrega config com cache simples (5min) — evita hits repetidos durante impressão. */
let cache: { at: number; cfg: CustomFieldsConfig } | null = null;
async function loadConfig(): Promise<CustomFieldsConfig> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.cfg;
  try {
    const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const cfg = ((data?.configuracoes as any)?.custom_fields_config || {}) as CustomFieldsConfig;
    cache = { at: Date.now(), cfg };
    return cfg;
  } catch { return {}; }
}

function resolveScreen(cfg: CustomFieldsConfig, screen: ScreenKey, unidadeId?: string): ScreenConfig {
  const sd = cfg[screen]; if (!sd) return { fields: [], hiddenNative: [], labelOverrides: {} };
  const g = sd['__global__'] || { fields: [], hiddenNative: [], labelOverrides: {} };
  if (!unidadeId) return g;
  const u = sd[unidadeId];
  if (!u) return g;
  return {
    fields: [...g.fields, ...u.fields].sort((a, b) => a.ordem - b.ordem),
    hiddenNative: [...new Set([...g.hiddenNative, ...u.hiddenNative])],
    labelOverrides: { ...g.labelOverrides, ...u.labelOverrides },
    orderedNames: u.orderedNames?.length ? u.orderedNames : g.orderedNames,
  };
}

/** HTML pronto a injetar no body institucional. Vazio = string vazia. */
export async function renderCustomFieldsHtml(
  screen: ScreenKey,
  values: Record<string, any>,
  opts: { unidadeId?: string; contexto?: ContextoCampos; titulo?: string } = {},
): Promise<string> {
  if (!values || Object.keys(values).length === 0) return '';
  const cfg = await loadConfig();
  const screenCfg = resolveScreen(cfg, screen, opts.unidadeId);
  const visible = filterVisibleFields(screenCfg.fields, values, opts.contexto || {}, { isPrint: true });
  if (visible.length === 0) return '';

  const groups = groupBySection(visible);
  const sections: string[] = [];
  for (const g of groups) {
    const inner = `
      <div class="ficha-grid ficha-grid--2" style="margin-top: 2px; gap: 2px 10px;">
        ${g.fields.map(f => `
          <div class="ficha-field">
            <span class="ficha-field-label">${esc(f.rotulo)}</span>
            <span class="ficha-field-value">${esc(readValue(f, values))}</span>
          </div>`).join('')}
      </div>`;
    const title = g.secao || opts.titulo || 'Campos Personalizados';
    sections.push(`
      <div class="ficha-section">
        <div class="ficha-section-head"><h2 class="ficha-section-title">${esc(title)}</h2></div>
        ${inner}
      </div>`);
  }
  return sections.join('\n');
}

export function invalidateCustomFieldsPrintCache() { cache = null; }
