/**
 * Central map for record type labels in the medical records system.
 * This ensures consistency across all screens while keeping internal keys intact.
 */
export const TIPO_REGISTRO_LABELS: Record<string, string> = {
  avaliacao_inicial: "1ª Consulta",
  retorno: "Retorno",
  sessao: "Sessão",
  urgencia: "Urgência",
  procedimento: "Procedimento",
  alta: "Alta",
  alta_individual: "Relatório de Alta Individual",
  alta_multiprofissional: "Relatório de Alta Multiprofissional",
  falta: "Falta",
  consulta: "1ª Consulta", // Legacy mapping
};

/**
 * Gets the display label for a record type.
 * @param type The internal type key (e.g., 'avaliacao_inicial')
 * @returns The localized label (e.g., '1ª Consulta')
 */
export const getTipoRegistroLabel = (type: string | undefined | null): string => {
  if (!type) return "";
  return TIPO_REGISTRO_LABELS[type] || type;
};
