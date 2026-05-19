import { openPrintDocument } from '@/lib/printLayout';
import { buildFichaBody, FICHA_EXTRA_CSS } from '@/lib/fichaPacienteHtml';
import { renderCustomFieldsHtml } from '@/lib/customFieldsPrint';
import type {
  PacienteFichaDocumentData,
  FichaPrintMode,
} from '@/components/pacientes/PacienteFichaDocument';

export type FichaPacienteData = PacienteFichaDocumentData;

export async function printFichaPaciente(
  data: FichaPacienteData,
  mode: FichaPrintMode = 'completa',
): Promise<void> {
  if (!data?.paciente?.id) {
    console.error('[FichaPaciente] Paciente não selecionado para impressão.');
    throw new Error('Paciente não selecionado para impressão.');
  }

  const extra = await renderCustomFieldsHtml('paciente', data.customData || {}, {
    unidadeId: data.unidadeId,
    titulo: 'Campos Personalizados do Paciente',
  }).catch(() => '');

  const { title, body, meta } = buildFichaBody(data, mode, { extraBeforeSignature: extra });

  console.log('[FichaPaciente] Imprimindo ficha (institucional)', {
    pacienteId: data.paciente.id,
    nome: data.paciente.nome_completo,
    modo: mode,
  });

  await openPrintDocument(title, body, meta, { pageSize: 'A4', extraCSS: FICHA_EXTRA_CSS });
}
