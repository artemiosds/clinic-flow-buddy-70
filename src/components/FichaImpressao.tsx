import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadDocumentConfig,
  buildInstitutionalCSS,
  docHeader,
  docFooter,
  docMeta,
  openPrintDocument,
  type DocumentConfig,
} from '@/lib/printLayout';
import { buildFichaBody, FICHA_EXTRA_CSS } from '@/lib/fichaPacienteHtml';
import { renderCustomFieldsHtml } from '@/lib/customFieldsPrint';
import type {
  FichaPrintMode,
  PacienteFichaDocumentData,
} from '@/components/pacientes/PacienteFichaDocument';

interface FichaImpressaoProps {
  data: PacienteFichaDocumentData;
  mode?: FichaPrintMode;
}

export type { FichaPrintMode } from '@/components/pacientes/PacienteFichaDocument';

/**
 * Preview + print da Ficha de Atendimento Clínico usando o shell institucional
 * canônico (printLayout.ts). O preview e a impressão renderizam EXATAMENTE
 * o mesmo HTML — cabeçalho, logos, fonte e rodapé seguem a configuração
 * global definida em "Logos e Cabeçalho Institucional", igual aos demais
 * documentos do sistema (prontuário, receituário, exames, etc.).
 */
export const FichaImpressao: React.FC<FichaImpressaoProps> = ({ data, mode = 'completa' }) => {
  const [config, setConfig] = useState<DocumentConfig | null>(null);
  const [customHtml, setCustomHtml] = useState<string>('');

  useEffect(() => {
    let active = true;
    loadDocumentConfig().then((cfg) => {
      if (active) setConfig(cfg);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    renderCustomFieldsHtml('paciente', data?.customData || {}, {
      unidadeId: data?.unidadeId,
      titulo: 'Campos Personalizados do Paciente',
    })
      .then((html) => { if (active) setCustomHtml(html); })
      .catch(() => { if (active) setCustomHtml(''); });
    return () => { active = false; };
  }, [data?.customData, data?.unidadeId]);

  const previewHtml = useMemo(() => {
    if (!config) return '';
    const { title, body, meta } = buildFichaBody(data, mode, { extraBeforeSignature: customHtml });
    const css = buildInstitutionalCSS({ pageSize: 'A4', extraCSS: FICHA_EXTRA_CSS }, config);
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  ${css}
  <style>html,body{background:#fff;}</style>
</head>
<body>
  ${docHeader(title, config)}
  ${docMeta(meta)}
  <div class="doc-content">
    ${body}
  </div>
  ${docFooter(config)}
</body>
</html>`;
  }, [config, data, mode, customHtml]);

  const handlePrint = useCallback(async () => {
    if (!data?.paciente?.id) {
      toast.error('Paciente não selecionado para impressão.');
      return;
    }
    try {
      const extra = await renderCustomFieldsHtml('paciente', data?.customData || {}, {
        unidadeId: data?.unidadeId,
        titulo: 'Campos Personalizados do Paciente',
      }).catch(() => '');
      const { title, body, meta } = buildFichaBody(data, mode, { extraBeforeSignature: extra });
      await openPrintDocument(title, body, meta, { pageSize: 'A4', extraCSS: FICHA_EXTRA_CSS });
    } catch (err: any) {
      if (err?.message === 'POPUP_BLOCKED') {
        toast.error('Pop-up bloqueado. Permita pop-ups para imprimir a ficha.');
      } else {
        console.error('[FichaPaciente] Erro ao imprimir', err);
        toast.error('Erro ao gerar impressão da ficha.');
      }
    }
  }, [data, mode]);

  if (!config) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm">Carregando configuração institucional da ficha...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="w-full overflow-hidden rounded-lg border bg-muted/20 p-2">
        <iframe
          title="Pré-visualização da Ficha"
          srcDoc={previewHtml}
          className="w-full bg-white"
          style={{ height: '70vh', border: 0 }}
        />
      </div>

      <div className="flex w-full max-w-xl flex-col gap-3">
        <Button onClick={handlePrint} size="lg" className="w-full">
          <Printer className="mr-2 h-4 w-4" />
          Imprimir Ficha
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Para melhor resultado no navegador, desmarque a opção de cabeçalhos e rodapés do navegador.
        </p>
      </div>
    </div>
  );
};

export default FichaImpressao;
