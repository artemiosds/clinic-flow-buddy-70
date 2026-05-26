import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { CampoConfig } from '@/hooks/useProntuarioTiposConfig';
import type { ProntuarioField } from '@/components/EditorProntuarioConfig';
import CamposEspecialidade from './CamposEspecialidade';

/** Known builtin keys that map directly to form state */
const BUILTIN_KEYS = new Set([
  'queixa_principal', 'anamnese', 'sinais_sintomas', 'exame_fisico',
  'hipotese', 'conduta', 'prescricao', 'solicitacao_exames',
  'evolucao', 'observacoes', 'indicacao_retorno',
  'procedimentos_texto', 'outro_procedimento',
]);

interface DynamicProntuarioFieldsProps {
  campos: (CampoConfig | ProntuarioField)[];
  /** Builtin form values (form.queixa_principal, etc.) */
  formValues: Record<string, string>;
  /** Custom (non-builtin) field values */
  customValues: Record<string, string>;
  onFormChange: (key: string, value: string) => void;
  onCustomChange: (key: string, value: string) => void;
  disabled?: boolean;
  /** Pass-through for specialty fields if they should be part of the flow */
  especialidadeFields?: Record<string, string>;
  onEspecialidadeChange?: (key: string, value: string) => void;
  profissao?: string;
  profissionalId?: string;
  tipoProntuario?: any;
}

const DynamicProntuarioFields: React.FC<DynamicProntuarioFieldsProps> = ({
  campos, formValues, customValues, onFormChange, onCustomChange, disabled,
  especialidadeFields, onEspecialidadeChange, profissao, profissionalId, tipoProntuario,
}) => {
  if (campos.length === 0) return null;

  const getValue = (campo: CampoConfig | ProntuarioField): string => {
    if (BUILTIN_KEYS.has(campo.key)) return formValues[campo.key] || '';
    return customValues[campo.key] || '';
  };

  const setValue = (campo: CampoConfig | ProntuarioField, value: string) => {
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
        const tipo = (campo as CampoConfig).tipo || (campo as ProntuarioField).type;
        const obrigatorio = (campo as CampoConfig).obrigatorio ?? (campo as ProntuarioField).required;
        const opcoes = (campo as CampoConfig).opcoes || (campo as ProntuarioField).options;

        return (
          <div key={campo.id}>
            <Label className="text-sm">
              {campo.label}
              {obrigatorio && <span className="text-destructive ml-1">*</span>}
            </Label>

            {/* TEXTAREA */}
            {(tipo === 'textarea') && (
              <DebouncedTextarea
                rows={2}
                value={value}
                onChange={(e) => setValue(campo, e.target.value)}
                disabled={disabled}
                placeholder={campo.label}
              />
            )}

            {/* TEXT */}
            {(tipo === 'texto' || tipo === 'text') && (
              <Input
                value={value}
                onChange={(e) => setValue(campo, e.target.value)}
                disabled={disabled}
                placeholder={campo.label}
                className="h-9"
              />
            )}

            {/* NUMBER */}
            {tipo === 'numero' && (
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
            {tipo === 'data' && (
              <Input
                type="date"
                value={value}
                onChange={(e) => setValue(campo, e.target.value)}
                disabled={disabled}
                className="h-9"
              />
            )}

            {/* SELECT */}
            {tipo === 'select' && (
              <Select value={value} onValueChange={(v) => setValue(campo, v)} disabled={disabled}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={`Selecione ${campo.label}`} />
                </SelectTrigger>
                <SelectContent>
                  {(opcoes || []).map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* CHECKBOX (multiple choice) */}
            {tipo === 'checkbox' && (
              <div className="space-y-1.5 mt-1">
                {(opcoes || []).map((opt) => {
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

      {/* Seção de Especialidade integrada ao fluxo se configurada */}
      {profissao && especialidadeFields && onEspecialidadeChange && (
        <div className="mt-6 border-t pt-6">
          <CamposEspecialidade
            profissao={profissao}
            values={especialidadeFields}
            onChange={onEspecialidadeChange}
            profissionalId={profissionalId}
            tipoProntuario={tipoProntuario}
          />
        </div>
      )}
    </div>
  );
};

export default DynamicProntuarioFields;
