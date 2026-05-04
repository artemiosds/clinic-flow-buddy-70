import React, { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Building2, Upload, Trash2, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface InstituicaoConfig {
  nome: string;
  cer: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  email: string;
  logoUrl: string;
}

interface Props {
  value: InstituicaoConfig;
  onChange: (v: InstituicaoConfig) => void;
}

/* ---------- masks & validators ---------- */
const maskCnpj = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const maskTelefone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d)/, '($1) $2-$3').trim();
  return d.replace(/(\d{2})(\d{5})(\d)/, '($1) $2-$3').trim();
};

const validaCnpj = (cnpj: string) => {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let sum = 0, pos = n - 7;
    for (let i = 0; i < n; i++) {
      sum += parseInt(d[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(d[12]) && calc(13) === parseInt(d[13]);
};

const validaEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export const InstituicaoSection: React.FC<Props> = ({ value, onChange }) => {
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cnpjOk = !value.cnpj || validaCnpj(value.cnpj);
  const emailOk = !value.email || validaEmail(value.email);
  const telOk = !value.telefone || value.telefone.replace(/\D/g, '').length >= 10;

  const handleUpload = useCallback(async (file: File) => {
    if (!file.type.match(/^image\/(png|jpe?g|webp|svg\+xml)$/)) {
      toast.error('Formato inválido. Use PNG, JPG, WEBP ou SVG');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 2 MB');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `instituicao/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('document-logos').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('document-logos').getPublicUrl(path);
      onChange({ ...value, logoUrl: data.publicUrl });
      toast.success('Logo enviado com sucesso');
    } catch (e: any) {
      toast.error(`Erro no upload: ${e.message || 'falha'}`);
    } finally {
      setUploading(false);
    }
  }, [onChange, value]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="font-semibold font-display text-foreground">Informações da Instituição</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Form */}
          <div className="lg:col-span-2 space-y-3">
            <FieldWithStatus label="Nome da Instituição" valid={!!value.nome.trim()}>
              <Input value={value.nome} onChange={e => onChange({ ...value, nome: e.target.value })} maxLength={300} />
            </FieldWithStatus>

            <FieldWithStatus label="Nome do CAPS" valid={true} optional>
              <Input value={value.cer} onChange={e => onChange({ ...value, cer: e.target.value })} maxLength={300} />
            </FieldWithStatus>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldWithStatus label="CNPJ" valid={cnpjOk} optional>
                <Input
                  value={value.cnpj}
                  onChange={e => onChange({ ...value, cnpj: maskCnpj(e.target.value) })}
                  placeholder="00.000.000/0000-00"
                  className={cn(!cnpjOk && 'border-destructive focus-visible:ring-destructive')}
                />
              </FieldWithStatus>
              <FieldWithStatus label="Telefone" valid={telOk} optional>
                <Input
                  value={value.telefone}
                  onChange={e => onChange({ ...value, telefone: maskTelefone(e.target.value) })}
                  placeholder="(93) 99999-9999"
                />
              </FieldWithStatus>
            </div>

            <FieldWithStatus label="Endereço" valid={true} optional>
              <Input value={value.endereco} onChange={e => onChange({ ...value, endereco: e.target.value })} maxLength={500} />
            </FieldWithStatus>

            <FieldWithStatus label="E-mail institucional" valid={emailOk} optional>
              <Input
                type="email"
                value={value.email}
                onChange={e => onChange({ ...value, email: e.target.value })}
                placeholder="contato@instituicao.gov.br"
                className={cn(!emailOk && 'border-destructive focus-visible:ring-destructive')}
              />
            </FieldWithStatus>

            {/* Logo upload */}
            <div>
              <Label className="text-xs">Logo da Instituição</Label>
              <div
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'mt-1 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all',
                  drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  uploading && 'opacity-60 pointer-events-none',
                )}
              >
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                />
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-foreground">
                  {uploading ? 'Enviando...' : 'Clique ou arraste o logo aqui'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, WEBP ou SVG até 2 MB</p>
              </div>
              {value.logoUrl && (
                <div className="flex items-center justify-between mt-2 p-2 bg-muted/30 rounded">
                  <span className="text-[10px] truncate text-muted-foreground flex-1 mr-2">{value.logoUrl}</span>
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => onChange({ ...value, logoUrl: '' })}
                    className="h-7 text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Remover
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Preview cabeçalho */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Preview do Cabeçalho
            </Label>
            <div className="mt-2 rounded-xl border-2 border-dashed overflow-hidden">
              <div className="bg-card p-3 border-b">
                <div className="flex items-center gap-2">
                  {value.logoUrl ? (
                    <img src={value.logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded" />
                  ) : (
                    <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground truncate">
                      {value.nome || 'Nome da Instituição'}
                    </p>
                    {value.cer && (
                      <p className="text-[10px] text-muted-foreground truncate">{value.cer}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-muted/20 p-3 space-y-1 text-[10px] text-muted-foreground">
                {value.cnpj && <p>CNPJ: {value.cnpj}</p>}
                {value.endereco && <p>{value.endereco}</p>}
                {value.telefone && <p>Tel: {value.telefone}</p>}
                {value.email && <p>{value.email}</p>}
                {!value.cnpj && !value.endereco && !value.telefone && !value.email && (
                  <p className="italic">Preencha os campos para visualizar</p>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Aparecerá nos relatórios e documentos institucionais
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const FieldWithStatus: React.FC<{ label: string; valid: boolean; optional?: boolean; children: React.ReactNode }> = ({ label, valid, optional, children }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <Label className="text-xs">
        {label} {!optional && <span className="text-destructive">*</span>}
      </Label>
      {!valid && (
        <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
          <AlertCircle className="w-3 h-3" /> inválido
        </span>
      )}
      {valid && !optional && (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
          <Check className="w-3 h-3" /> ok
        </span>
      )}
    </div>
    {children}
  </div>
);
