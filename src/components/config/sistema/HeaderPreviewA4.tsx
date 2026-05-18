import React from 'react';
import { ImageIcon } from 'lucide-react';

interface HeaderPreviewA4Props {
  logoEsquerda: string;
  logoCentro?: string;
  logoDireita: string;
  linha1: string;
  linha2: string;
  rodape: string;
  fonte: string;
  tamanhoFonte: number;
  alinhamento: 'center' | 'left' | 'right';
  cor: string;
}

/** Real-time A4-simulated preview of the document header */
const HeaderPreviewA4: React.FC<HeaderPreviewA4Props> = ({
  logoEsquerda,
  logoCentro,
  logoDireita,
  linha1,
  linha2,
  rodape,
  fonte,
  tamanhoFonte,
  alinhamento,
  cor,
}) => {
  return (
    <div className="sticky top-4">
      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
        Pré-visualização A4
      </div>
      <div
        className="bg-white rounded-md shadow-lg border border-border overflow-hidden mx-auto"
        style={{ aspectRatio: '210/297', maxWidth: 360 }}
      >
        <div className="p-4 h-full flex flex-col" style={{ fontFamily: fonte }}>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-primary">
            <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
              {logoEsquerda ? (
                <img src={logoEsquerda} alt="Logo esq" className="max-h-12 max-w-12 object-contain" />
              ) : (
                <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
              )}
            </div>
            <div
              className="flex-1 px-2"
              style={{
                textAlign: alinhamento,
                color: cor,
                fontSize: `${tamanhoFonte * 0.5}px`,
                lineHeight: 1.3,
              }}
            >
              {logoCentro && (
                <div className="flex justify-center mb-1">
                  <img
                    src={logoCentro}
                    alt="Logo centro"
                    className="max-h-10 max-w-[80px] object-contain"
                  />
                </div>
              )}
              <div className="font-bold uppercase">{linha1 || 'Linha 1'}</div>
              <div className="opacity-80 mt-0.5">{linha2 || 'Linha 2'}</div>
            </div>
            <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
              {logoDireita ? (
                <img src={logoDireita} alt="Logo dir" className="max-h-12 max-w-12 object-contain" />
              ) : (
                <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
              )}
            </div>
          </div>

          {/* Body placeholder */}
          <div className="flex-1 mt-4 space-y-2">
            <div className="text-[8px] font-bold text-foreground/80 uppercase tracking-wider">
              Atestado Médico
            </div>
            <div className="space-y-1.5 mt-2">
              <div className="h-1.5 bg-muted/60 rounded w-full" />
              <div className="h-1.5 bg-muted/60 rounded w-11/12" />
              <div className="h-1.5 bg-muted/60 rounded w-10/12" />
              <div className="h-1.5 bg-muted/60 rounded w-full" />
              <div className="h-1.5 bg-muted/60 rounded w-9/12" />
            </div>
            <div className="mt-6 space-y-1.5">
              <div className="h-1.5 bg-muted/60 rounded w-full" />
              <div className="h-1.5 bg-muted/60 rounded w-8/12" />
            </div>
            {/* Signature */}
            <div className="mt-12 flex flex-col items-center">
              <div className="w-32 border-t border-foreground/40" />
              <div className="text-[7px] text-muted-foreground mt-1">Assinatura</div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 border-t border-border mt-2 text-[6px] text-muted-foreground text-center">
            {rodape || 'Endereço da instituição'}
          </div>
        </div>
      </div>
      <div className="text-[10px] text-center text-muted-foreground mt-2">
        Atualiza em tempo real • Tamanho A4 (210×297mm)
      </div>
    </div>
  );
};

export default HeaderPreviewA4;
