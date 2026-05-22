/**
 * Engine de regras condicionais e filtro por contexto (especialidade / tipo de prontuário)
 * para campos personalizados. Compartilhado por todos os renderers e pelo HTML de impressão.
 */
import type { CustomFieldDef } from '@/hooks/useCustomFields';

export type ConditionOperator = 'eq' | 'neq' | 'in' | 'notin' | 'gt' | 'lt' | 'filled' | 'empty';
export interface ConditionalRule { campo: string; operador: ConditionOperator; valor?: any; }
export interface ContextoCampos { especialidade?: string; tipoProntuario?: string; idade?: number; perfil?: string; unidadeId?: string; }

const norm = (v: any): string => (v ?? '').toString().trim().toLowerCase();

function evaluateRule(rule: ConditionalRule, allValues: Record<string, any>): boolean {
  const v = allValues[rule.campo];
  const filled = v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  switch (rule.operador) {
    case 'filled': return filled;
    case 'empty': return !filled;
    case 'eq': return norm(v) === norm(rule.valor);
    case 'neq': return norm(v) !== norm(rule.valor);
    case 'in': {
      const arr = Array.isArray(rule.valor) ? rule.valor : String(rule.valor ?? '').split(',');
      return arr.map(norm).includes(norm(v));
    }
    case 'notin': {
      const arr = Array.isArray(rule.valor) ? rule.valor : String(rule.valor ?? '').split(',');
      return !arr.map(norm).includes(norm(v));
    }
    case 'gt': return Number(v) > Number(rule.valor);
    case 'lt': return Number(v) < Number(rule.valor);
    default: return true;
  }
}

export function evaluateConditions(
  rules: ConditionalRule[] | undefined,
  allValues: Record<string, any>,
): boolean {
  if (!rules || rules.length === 0) return true;
  return rules.every(r => evaluateRule(r, allValues));
}

/** Aplica filtros de contexto (especialidade/tipo prontuário) — campo passa se lista vazia/ausente. */
export function matchesContext(field: CustomFieldDef, ctx: ContextoCampos): boolean {
  if (field.especialidades && field.especialidades.length > 0) {
    if (!ctx.especialidade) return false;
    const ok = field.especialidades.map(norm).includes(norm(ctx.especialidade));
    if (!ok) return false;
  }
  if (field.tiposProntuario && field.tiposProntuario.length > 0) {
    if (!ctx.tipoProntuario) return false;
    const ok = field.tiposProntuario.map(norm).includes(norm(ctx.tipoProntuario));
    if (!ok) return false;
  }
  if (field.rules) {
    const { rules, age = 0, perfil = '', unidadeId = '' } = { rules: field.rules, age: ctx.idade, perfil: ctx.perfil, unidadeId: ctx.unidadeId };
    if (rules.onlyFirstConsult && ctx.tipoProntuario !== 'avaliacao_inicial') return false;
    if (rules.onlyReturn && ctx.tipoProntuario !== 'retorno') return false;
    if (rules.onlyChild && age >= 18) return false;
    if (rules.onlyElderly && age < 60) return false;
    if (rules.profiles?.length && !rules.profiles.includes(perfil)) return false;
    if (rules.unidades?.length && !rules.unidades.includes(unidadeId)) return false;
  }
  return true;
}

/** Filtra campos visíveis dado valores atuais e contexto. */
export function filterVisibleFields(
  fields: CustomFieldDef[],
  allValues: Record<string, any>,
  ctx: ContextoCampos = {},
): CustomFieldDef[] {
  return fields.filter(f =>
    f.ativo !== false &&
    matchesContext(f, ctx) &&
    evaluateConditions(f.condicional, allValues)
  );
}

/** Agrupa campos por `secao` mantendo a ordem original; campos sem seção vão em "". */
export function groupBySection(fields: CustomFieldDef[]): Array<{ secao: string; fields: CustomFieldDef[] }> {
  const map = new Map<string, CustomFieldDef[]>();
  for (const f of fields) {
    const k = (f.secao || '').trim();
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(f);
  }
  return Array.from(map.entries()).map(([secao, fields]) => ({ secao, fields }));
}
