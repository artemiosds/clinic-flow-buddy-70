import React from 'react';
import { ImageIcon } from 'lucide-react';

interface HeaderPreviewA4Props {
  logoEsquerda: string;
  logoCentro?: string;
  logoDireita: string;
  logoEsquerdaTamanho?: number;
  logoCentroTamanho?: number;
  logoDireitaTamanho?: number;
  logoEsquerdaAtiva?: boolean;
  logoCentroAtiva?: boolean;
  logoDireitaAtiva?: boolean;
  logoEsquerdaRedonda?: boolean;
  logoCentroRedonda?: boolean;
  logoDireitaRedonda?: boolean;
  linha1: string;
  linha2: string;
  rodape: string;
  fonte: string;
  tamanhoFonte: number;
  alinhamento: 'center' | 'left' | 'right';
  cor: string;
}

/**
 * Real-time A4-simulated preview of the document header.
 * Scales logo sizes proportionally to fit the 360px preview width
 * (PDF size in px → preview px factor ≈ 0.6).
 */
const HeaderPreviewA4: React.FC<HeaderPreviewA4Props> = ({
  logoEsquerda,
  logoCentro,
  logoDireita,
  logoEsquerdaTamanho = 64,
  logoCentroTamanho = 56,
  logoDireitaTamanho = 64,
  logoEsquerdaAtiva = true,
  logoCentroAtiva = true,
  logoDireitaAtiva = true,
  logoEsquerdaRedonda = false,
  logoCentroRedonda = false,
  logoDireitaRedonda = false,
  linha1,
  linha2,
  rodape,
  fonte,
  tamanhoFonte,
  alinhamento,
  cor,
}) => {
  const scale = 0.55; // preview shrink ratio vs final A4
  const showLeft = logoEsquerdaAtiva;
  const showRight = logoDireitaAtiva;
  const showCenter = logoCentroAtiva && !!logoCentro;

  const hL = Math.round(logoEsquerdaTamanho * scale);
  const hC = Math.round(logoCentroTamanho * scale);
  const hR = Math.round(logoDireitaTamanho * scale);

  const renderSideLogo = (url: string, active: boolean, height: number, label: string, rounded: boolean) => {
    if (!active) return <div style={{ minWidth: 8 }} />;
    if (url) {
      return (
        <img
          src={url}
          alt={label}
          style={
            rounded
              ? { width: height, height, borderRadius: 9999, objectFit: 'cover', background: '#fff' }
              : { maxHeight: height, maxWidth: height * 2, objectFit: 'contain' }
          }
        />
      );
    }
    return (
      <div
        className="flex items-center justify-center bg-muted/40"
        style={{ width: height, height, borderRadius: rounded ? 9999 : 4 }}
      >
        <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
      </div>
    );
  };

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
            <div className="flex-shrink-0 flex items-center justify-start" style={{ minWidth: 8 }}>
              {renderSideLogo(logoEsquerda, showLeft, hL, 'Logo esq')}
            </div>
            <div
              className="flex-1 px-2 min-w-0"
              style={{
                textAlign: alinhamento,
                color: cor,
                fontSize: `${tamanhoFonte * 0.5}px`,
                lineHeight: 1.3,
              }}
            >
              {showCenter && (
                <div className="flex justify-center mb-1">
                  <img
                    src={logoCentro}
                    alt="Logo centro"
                    style={{ maxHeight: hC, maxWidth: hC * 2.4, objectFit: 'contain' }}
                  />
                </div>
              )}
              <div className="font-bold uppercase truncate">{linha1 || 'Linha 1'}</div>
              <div className="opacity-80 mt-0.5 truncate">{linha2 || 'Linha 2'}</div>
            </div>
            <div className="flex-shrink-0 flex items-center justify-end" style={{ minWidth: 8 }}>
              {renderSideLogo(logoDireita, showRight, hR, 'Logo dir')}
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
        Reflete o padrão usado em todos os documentos do sistema
      </div>
    </div>
  );
};

export default HeaderPreviewA4;
