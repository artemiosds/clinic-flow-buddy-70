import React from 'react';
import { createRoot } from 'react-dom/client';
import { loadDocumentConfig } from '@/lib/printLayout';
import PacienteFichaDocument, {
  type PacienteFichaDocumentData,
  type FichaPrintMode,
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

  const config = await loadDocumentConfig();
  const generatedAt = new Date();
  const host = document.createElement('div');
  host.className = 'patient-sheet-print-host';
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(
    React.createElement(PacienteFichaDocument, {
      data,
      mode,
      institutionalConfig: config,
      generatedAt,
    }),
  );

  console.log('[FichaPaciente] Imprimindo ficha', {
    pacienteId: data.paciente.id,
    nome: data.paciente.nome_completo,
    modo: mode,
  });

  await new Promise((resolve) => setTimeout(resolve, 80));
  window.print();

  setTimeout(() => {
    root.unmount();
    host.remove();
  }, 300);
}
