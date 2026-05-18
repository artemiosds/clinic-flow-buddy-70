import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { loadDocumentConfig, type DocumentConfig } from '@/lib/printLayout';
import PacienteFichaDocument, {
  type FichaPrintMode,
  type PacienteFichaDocumentData,
} from '@/components/pacientes/PacienteFichaDocument';

interface FichaImpressaoProps {
  data: PacienteFichaDocumentData;
  mode?: FichaPrintMode;
}

export type { FichaPrintMode } from '@/components/pacientes/PacienteFichaDocument';

export const FichaImpressao: React.FC<FichaImpressaoProps> = ({ data, mode = 'completa' }) => {
  const [config, setConfig] = useState<DocumentConfig | null>(null);
  const [printHost, setPrintHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    const fetchConfig = async () => {
      const cfg = await loadDocumentConfig();
      if (active) setConfig(cfg);
    };

    fetchConfig();

    const host = document.createElement('div');
    host.className = 'patient-sheet-print-host';
    document.body.appendChild(host);
    setPrintHost(host);

    return () => {
      active = false;
      host.remove();
    };
  }, []);

  const generatedAt = useMemo(() => new Date(), [data.paciente.id, mode]);

  const handlePrint = useCallback(() => {
    if (!data?.paciente?.id) {
      console.error('[FichaPaciente] Paciente não selecionado para impressão.');
      toast.error('Paciente não selecionado para impressão.');
      return;
    }

    if (!config || !printHost) {
      toast.error('A ficha ainda está sendo preparada para impressão.');
      return;
    }

    console.log('[FichaPaciente] Imprimindo ficha', {
      pacienteId: data.paciente.id,
      nome: data.paciente.nome_completo,
      modo: mode,
    });

    window.requestAnimationFrame(() => {
      window.print();
    });
  }, [config, data, mode, printHost]);

  if (!config) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm">Carregando configuração institucional da ficha...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="patient-sheet-preview-shell no-print">
          <PacienteFichaDocument
            data={data}
            mode={mode}
            institutionalConfig={config}
            generatedAt={generatedAt}
          />
        </div>

        <div className="no-print flex w-full max-w-xl flex-col gap-3">
          <Button onClick={handlePrint} size="lg" className="w-full">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir Ficha
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Para melhor resultado no navegador, desmarque a opção de cabeçalhos e rodapés do navegador.
          </p>
        </div>
      </div>

      {printHost
        ? createPortal(
            <div className="patient-sheet-print-host-inner">
              <PacienteFichaDocument
                data={data}
                mode={mode}
                institutionalConfig={config}
                generatedAt={generatedAt}
              />
            </div>,
            printHost,
          )
        : null}
    </>
  );
};

export default FichaImpressao;
