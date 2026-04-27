/**
 * Utilitários únicos para Cartão Nacional de Saúde (CNS).
 *
 * Padrão oficial: 15 dígitos exibidos como "000 0000 0000 0000" (3-4-4-4).
 * Salvamos no banco SEM máscara (apenas dígitos).
 */

/** Remove tudo que não é dígito e limita a 15 caracteres. */
export function normalizeCNS(value?: string | null): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '').slice(0, 15);
}

/** Alias semântico — remove a máscara, retorna só dígitos (até 15). */
export function unmaskCNS(value?: string | null): string {
  return normalizeCNS(value);
}

/**
 * Aplica máscara progressiva no padrão 3-4-4-4.
 * Aceita entradas parciais (durante digitação).
 */
export function formatCNS(value?: string | null): string {
  const d = normalizeCNS(value);
  if (!d) return '';
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 11) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11, 15)}`;
}

/** Alias para uso em onChange de inputs. */
export const maskCNS = formatCNS;

/**
 * Validação opcional. Retorna null se válido (vazio ou 15 dígitos),
 * ou uma mensagem de erro caso contrário.
 */
export function validateCNS(value?: string | null): string | null {
  const d = normalizeCNS(value);
  if (d.length === 0) return null; // Não obrigatório
  if (d.length !== 15) return 'CNS deve conter 15 dígitos.';
  return null;
}

/** True se o CNS for vazio ou tiver exatamente 15 dígitos. */
export function isCNSValid(value?: string | null): boolean {
  return validateCNS(value) === null;
}
