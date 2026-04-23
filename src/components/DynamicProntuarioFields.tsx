import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { CampoConfig } from '@/hooks/useProntuarioTiposConfig';

/** Known builtin keys that map directly to form state */
const BUILTIN_KEYS = new Set([
  'queixa_principal', 'anamnese', 'sinais_sintomas', 'exame_fisico',
  'hipotese', 'conduta', 'prescricao', 'solicitacao_exames',
  'evolucao', 'observacoes', 'indicacao_retorno',
  'procedimentos_texto', 'outro_procedimento',
]);

interface DynamicProntuarioFieldsProps {
  campos: CampoConfig[];
  /** Builtin form values (form.queixa_principal, etc.) */
  formValues: Record<string, string>;
  /** Custom (non-builtin) field values */
  customValues: Record<string, string>;
  onFormChange: (key: string, value: string) => void;
  onCustomChange: (key: string, value: string) => void;
  disabled?: boolean;
}

const DynamicProntuarioFields: React.FC<DynamicProntuarioFieldsProps> = ({
  campos, formValues, customValues, onFormChange, onCustomChange, disabled,
}) => {
  if (campos.length === 0) return null;

  const getValue = (campo: CampoConfig): string => {
    if (BUILTIN_KEYS.has(campo.key)) return formValues[campo.key] || '';
    return customValues[campo.key] || '';
  };

  const setValue = (campo: CampoConfig, value: string) => {
    if (BUILTIN_KEYS.has(campo.key)) {
      onFormChange(campo.key, value);
    } else {
      onCustomChange(campo.key, value);
    }
  };

  return (
    <div className="space-y-3">
      {campos.map(campo => {
        // Skip fixed SOAP / system fields — they're rendered separately
        if (campo.key.startsWith('evolucao.') || campo.key === 'contador_sessao' || campo.key === 'sinais_vitais_urgencia') return null;

        const value = getValue(campo);

        return (
          <div key={campo.id}>
            <Label className="text-sm">
              {campo.label}
              {campo.obrigatorio && <span className="text-destructive ml-1">*</span>}
            </Label>

            {/* TEXTAREA */}
            {(campo.tipo === 'textarea') && (
              <DebouncedTextarea
                rows={2}
                value={value}
                onChange={(e) => setValue(campo, e.target.value)}
                disabled={disabled}
                placeholder={campo.label}
              />
            )}

            {/* TEXT */}
            {(campo.tipo === 'texto' || campo.tipo === 'text') && (
              <Input
                value={value}
                onChange={(e) => setValue(campo, e.target.value)}
                disabled={disabled}
                placeholder={campo.label}
                className="h-9"
              />
            )}

            {/* NUMBER */}
            {campo.tipo === 'numero' && (
              <Input
                type="number"
                value={value}
                onChange={(e) => setValue(campo, e.target.value)}
                disabled={disabled}
                placeholder={campo.label}
                className="h-9"
              />
            )}

            {/* DATE */}
            {campo.tipo === 'data' && (
              <Input
                type="date"
                value={value}
                onChange={(e) => setValue(campo, e.target.value)}
                disabled={disabled}
                className="h-9"
              />
            )}

            {/* SELECT */}
            {campo.tipo === 'select' && (
              <Select value={value} onValueChange={(v) => setValue(campo, v)} disabled={disabled}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={`Selecione ${campo.label}`} />
                </SelectTrigger>
                <SelectContent>
                  {(campo.opcoes || []).map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* CHECKBOX (multiple choice) */}
            {campo.tipo === 'checkbox' && (
              <div className="space-y-1.5 mt-1">
                {(campo.opcoes || []).map((opt) => {
                  const selected = value ? value.split('||') : [];
                  const checked = selected.includes(opt);
                  return (
                    <div key={opt} className="flex items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          const next = c
                            ? [...selected, opt]
                            : selected.filter(s => s !== opt);
                          setValue(campo, next.join('||'));
                        }}
                        disabled={disabled}
                      />
                      <span className="text-sm">{opt}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DynamicProntuarioFields;
