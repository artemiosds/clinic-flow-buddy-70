import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, FileJson, FileSpreadsheet, FileText, CloudUpload, Calendar, Upload, Database, ShieldCheck, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface BackupConfig {
  autoBackup: boolean;
  agendamento: 'diario' | 'semanal' | 'mensal';
  ultimoBackup: string | null;
}

interface Props {
  value: BackupConfig;
  onChange: (v: BackupConfig) => void;
}

const TABELAS = ['pacientes', 'agendamentos', 'prontuarios', 'funcionarios'] as const;

export const BackupSection: React.FC<Props> = ({ value, onChange }) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [formato, setFormato] = useState<'json' | 'csv' | 'pdf' | 'full'>('full');
  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);

  const handleFullBackup = async () => {
    setExporting(true);
    setProgress(5);
    try {
      const { data, error } = await supabase.functions.invoke('system-backup-export', {
        body: { action: 'generate-full-backup' }
      });

      if (error) throw error;

      // O retorno é um Blob do ZIP
      const blob = new Blob([data], { type: 'application/zip' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_completo_${timestamp}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      onChange({ ...value, ultimoBackup: new Date().toISOString() });
      toast.success('Backup completo gerado com sucesso!');
      setExportOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao gerar backup completo: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setExporting(false);
      setProgress(0);
    }
  };

  const handleExport = async () => {
    if (formato === 'full') {
      await handleFullBackup();
      return;
    }
    setExporting(true);
    setProgress(10);
    try {
      const queries = TABELAS.map(t => supabase.from(t).select('*'));
      setProgress(40);
      const responses = await Promise.all(queries);
      setProgress(70);
      const results: Record<string, any[]> = {};
      TABELAS.forEach((t, i) => { results[t] = (responses[i].data as any[]) || []; });

      let blob: Blob;
      let filename: string;
      const dateStr = new Date().toISOString().slice(0, 10);

      if (formato === 'json') {
        blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        filename = `backup_${dateStr}.json`;
      } else if (formato === 'csv') {
        const lines: string[] = [];
        TABELAS.forEach(t => {
          const rows = results[t];
          lines.push(`# ${t.toUpperCase()}`);
          if (rows.length === 0) { lines.push(''); return; }
          const headers = Object.keys(rows[0]);
          lines.push(headers.join(','));
          rows.forEach(r => {
            lines.push(headers.map(h => {
              const v = r[h];
              if (v === null || v === undefined) return '';
              const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
              return `"${s.replace(/"/g, '""')}"`;
            }).join(','));
          });
          lines.push('');
        });
        blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        filename = `backup_${dateStr}.csv`;
      } else {
        const lines = [
          'RELATÓRIO DE BACKUP',
          '====================',
          `Data: ${new Date().toLocaleString('pt-BR')}`,
          '',
          ...TABELAS.map(t => `${t}: ${results[t].length} registros`),
        ];
        blob = new Blob([lines.join('\n')], { type: 'application/pdf' });
        filename = `backup_${dateStr}.pdf`;
      }

      setProgress(95);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(100);

      onChange({ ...value, ultimoBackup: new Date().toISOString() });
      toast.success('Backup exportado com sucesso!');
      setTimeout(() => { setExportOpen(false); setProgress(0); setExporting(false); }, 800);
    } catch (e) {
      toast.error('Erro ao exportar backup');
      setExporting(false);
      setProgress(0);
    }
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.info(`Arquivo selecionado: ${file.name} — restauração manual recomendada via suporte técnico`);
    e.target.value = '';
  };

  const formatLast = (iso: string | null) => {
    if (!iso) return 'Nenhum backup realizado';
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-primary" />
          <h3 className="font-semibold font-display text-foreground">Backup e Dados</h3>
        </div>

        {/* Cards de exportação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { f: 'full' as const, icon: Archive, label: 'Backup Completo', desc: 'Sistema + Arquivos (ZIP)', color: 'text-primary', bg: 'bg-primary/10' },
            { f: 'json' as const, icon: FileJson, label: 'Exportar JSON', desc: 'Dados parciais (Tabelas)', color: 'text-amber-600', bg: 'bg-amber-500/10' },
            { f: 'csv' as const, icon: FileSpreadsheet, label: 'Exportar CSV', desc: 'Planilhas parciais', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
            { f: 'pdf' as const, icon: FileText, label: 'Exportar PDF', desc: 'Relatório resumido', color: 'text-rose-600', bg: 'bg-rose-500/10' },
          ].map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.f}
                type="button"
                onClick={() => { setFormato(opt.f); setExportOpen(true); }}
                className="p-4 rounded-xl border bg-card hover:border-primary/40 hover:shadow-md transition-all text-left group"
              >
                <div className={`w-10 h-10 rounded-lg ${opt.bg} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-5 h-5 ${opt.color}`} />
                </div>
                <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Configurações de backup automático */}
        <div className="space-y-3 p-4 rounded-xl border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CloudUpload className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Backup automático</p>
                <p className="text-[11px] text-muted-foreground">Sistema gera e armazena backups periodicamente</p>
              </div>
            </div>
            <Switch checked={value.autoBackup} onCheckedChange={v => onChange({ ...value, autoBackup: v })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> Frequência</Label>
              <Select
                value={value.agendamento}
                onValueChange={(v: any) => onChange({ ...value, agendamento: v })}
                disabled={!value.autoBackup}
              >
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diario">Diário</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Último backup</Label>
              <div className="h-9 mt-1 px-3 rounded-md border bg-background flex items-center text-sm text-muted-foreground">
                {formatLast(value.ultimoBackup)}
              </div>
            </div>
          </div>
        </div>

        {/* Restaurar */}
        <div className="mt-3">
          <Label className="block">
            <input type="file" accept=".json,.csv" onChange={handleRestore} className="hidden" />
            <Button asChild variant="outline" className="w-full cursor-pointer">
              <span><Upload className="w-4 h-4 mr-2" /> Restaurar Backup (selecione um arquivo)</span>
            </Button>
          </Label>
        </div>

        {/* Modal exportação */}
        <Dialog open={exportOpen} onOpenChange={(o) => !exporting && setExportOpen(o)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" /> Confirmar Exportação
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {formato === 'full' ? (
                <Alert className="bg-primary/5 border-primary/20">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <AlertTitle>Segurança Master</AlertTitle>
                  <AlertDescription className="text-xs">
                    Você está prestes a gerar um backup completo do sistema. Isso inclui dados sensíveis de pacientes e configurações globais. 
                    O arquivo será compactado em um ZIP seguro.
                  </AlertDescription>
                </Alert>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Será exportado o backup parcial no formato <strong className="uppercase text-foreground">{formato}</strong>
                  contendo as tabelas principais: pacientes, agendamentos, prontuários e funcionários.
                </p>
              )}
              {exporting && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Exportando...</span>
                    <span className="font-mono text-primary">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExportOpen(false)} disabled={exporting}>Cancelar</Button>
              <Button onClick={handleExport} disabled={exporting}>
                <Download className="w-4 h-4 mr-1" /> Exportar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
