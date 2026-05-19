import React, { useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Printer } from 'lucide-react';
import { openPrintDocument } from '@/lib/printLayout';
import { toast } from 'sonner';

interface Props {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<Props> = ({ title, children, actions, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = async () => {
    if (!ref.current) return;
    const clone = ref.current.cloneNode(true) as HTMLElement;
    const body = `<div class="chart-print-wrapper">${clone.innerHTML}</div>`;
    try {
      await openPrintDocument(title, body, undefined, {
        pageSize: 'A4',
        orientation: 'landscape',
        extraCSS: `.chart-print-wrapper svg{max-width:100%;height:auto;display:block;margin:0 auto;}`,
      });
    } catch (err: any) {
      if (err?.message === 'POPUP_BLOCKED') {
        toast.error('Pop-up bloqueado. Permita pop-ups para imprimir o gráfico.');
      } else {
        console.error('[ChartCard] Erro ao imprimir', err);
      }
    }
  };

  return (
    <Card className={`group relative rounded-2xl border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-shadow ${className}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold font-display text-foreground text-[16px]">{title}</h3>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={handlePrint}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted"
              title="Imprimir gráfico"
            >
              <Printer className="w-5 h-5" style={{ color: '#9ca3af' }} />
            </button>
          </div>
        </div>
        <div ref={ref}>{children}</div>
      </CardContent>
    </Card>
  );
};
