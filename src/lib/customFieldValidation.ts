/**
 * Validação e máscaras para campos personalizados.
 * Reusável em renderers (on-change) e em submits (bloquear salvar).
 */
import type { CustomFieldDef } from '@/hooks/useCustomFields';

export type MaskKind = 'cpf' | 'cnpj' | 'telefone' | 'cep' | 'data' | 'hora' | 'currency' | 'custom';

const onlyDigits = (s: string) => (s || '').replace(/\D+/g, '');

export function applyMask(field: CustomFieldDef, raw: string): string {
  if (raw == null) return '';
  const mask = field.validacao?.mascara || autoMaskForType(field.tipo);
  if (!mask) return raw;
  const d = onlyDigits(raw);
  switch (mask) {
    case 'cpf':
      return d.slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    case 'cnpj':
      return d.slice(0, 14)
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    case 'telefone': {
      const v = d.slice(0, 11);
      if (v.length <= 10) return v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3').trim();
      return v.replace(/^(\d{2})(\d{5})(\d{0,4})$/, '($1) $2-$3').trim();
    }
    case 'cep':
      return d.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
    case 'data':
      return d.slice(0, 8).replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
    case 'hora':
      return d.slice(0, 4).replace(/(\d{2})(\d)/, '$1:$2');
    case 'currency': {
      const n = (parseInt(d || '0', 10) / 100).toFixed(2);
      return n.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    case 'custom': {
      const pattern = field.validacao?.mascaraCustom || '';
      let result = '';
      let di = 0;
      for (const ch of pattern) {
        if (ch === '9') { if (di < d.length) { result += d[di++]; } else break; }
        else { result += ch; }
      }
      return result;
    }
    default: return raw;
  }
}

function autoMaskForType(t: string): MaskKind | undefined {
  if (t === 'cpf') return 'cpf';
  if (t === 'cnpj') return 'cnpj';
  if (t === 'phone') return 'telefone';
  if (t === 'cep') return 'cep';
  if (t === 'currency') return 'currency';
  return undefined;
}

export interface ValidationError { campo: string; mensagem: string; }

export function validateField(field: CustomFieldDef, value: any): string | null {
  const filled = value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);
  if (field.obrigatorio && !filled) return `${field.rotulo} é obrigatório`;
  if (!filled) return null;
  const v = field.validacao || {};
  const str = String(value);
  if (v.minLength && str.length < v.minLength) return `${field.rotulo}: mínimo ${v.minLength} caracteres`;
  if (v.maxLength && str.length > v.maxLength) return `${field.rotulo}: máximo ${v.maxLength} caracteres`;
  if (typeof v.min === 'number' && Number(value) < v.min) return `${field.rotulo}: valor mínimo ${v.min}`;
  if (typeof v.max === 'number' && Number(value) > v.max) return `${field.rotulo}: valor máximo ${v.max}`;
  if (v.pattern) {
    try { if (!new RegExp(v.pattern).test(str)) return `${field.rotulo}: formato inválido`; }
    catch { /* regex inválida ignorada */ }
  }
  // Validações por tipo
  if (field.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return `${field.rotulo}: e-mail inválido`;
  if (field.tipo === 'cpf' && onlyDigits(str).length !== 11) return `${field.rotulo}: CPF deve ter 11 dígitos`;
  if (field.tipo === 'cnpj' && onlyDigits(str).length !== 14) return `${field.rotulo}: CNPJ deve ter 14 dígitos`;
  if (field.tipo === 'cep' && onlyDigits(str).length !== 8) return `${field.rotulo}: CEP deve ter 8 dígitos`;
  return null;
}

export function validateAll(fields: CustomFieldDef[], values: Record<string, any>): ValidationError[] {
  const errs: ValidationError[] = [];
  for (const f of fields) {
    const e = validateField(f, values[f.nome]);
    if (e) errs.push({ campo: f.nome, mensagem: e });
  }
  return errs;
}
