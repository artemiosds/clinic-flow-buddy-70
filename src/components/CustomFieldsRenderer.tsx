import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomFieldDef } from '@/hooks/useCustomFields';
import { filterVisibleFields, groupBySection, type ContextoCampos } from '@/lib/customFieldRules';
import { applyMask, validateField } from '@/lib/customFieldValidation';
import { cn } from '@/lib/utils';

interface CustomFieldsRendererProps {
  fields: CustomFieldDef[];
  values: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  disabled?: boolean;
  /** Contexto opcional para filtro por especialidade/tipo de prontuário */
  contexto?: ContextoCampos;
  /** Se true, mostra erros de validação inline */
  showValidation?: boolean;
}

const inputTypeFor = (t: CustomFieldDef['tipo']): string => {
  switch (t) {
    case 'number': return 'number';
    case 'date': return 'date';
    case 'time': return 'time';
    case 'email': return 'email';
    case 'url': return 'url';
    case 'file': return 'file';
    default: return 'text';
  }
};

const isMaskedType = (t: CustomFieldDef['tipo']) =>
  ['phone', 'cpf', 'cnpj', 'cep', 'currency'].includes(t);

const CustomFieldsRenderer: React.FC<CustomFieldsRendererProps> = ({
  fields, values, onChange, disabled, contexto, showValidation,
}) => {
  const ordered = useMemo(
    () => [...fields].filter(f => f.ativo !== false).sort((a, b) => a.ordem - b.ordem),
    [fields],
  );
  const visible = useMemo(
    () => filterVisibleFields(ordered, values, contexto || {}),
    [ordered, values, contexto],
  );
  if (visible.length === 0) return null;

  const groups = groupBySection(visible);

  const handleChange = (field: CustomFieldDef, raw: any) => {
    let v = raw;
    if (typeof raw === 'string' && (isMaskedType(field.tipo) || field.validacao?.mascara)) {
      v = applyMask(field, raw);
    }
    if (field.tipo === 'number') v = raw === '' ? '' : Number(raw);
    onChange(field.nome, v);
  };

  const renderField = (field: CustomFieldDef) => {
    const val = values[field.nome] ?? field.valorPadrao ?? '';
    const error = showValidation ? validateField(field, val) : null;
    const labelEl = (
      <Label className="text-sm">
        {field.rotulo}
        {field.obrigatorio && <span className="text-destructive ml-1">*</span>}
        {field.ajuda && <span className="text-[10px] text-muted-foreground ml-2">({field.ajuda})</span>}
      </Label>
    );

    const wrap = (inner: React.ReactNode, wide = false) => (
      <div key={field.id} className={cn(wide && 'md:col-span-2', field.destaque && 'p-3 rounded-lg border bg-primary/5')}>
        {labelEl}
        {inner}
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );

    switch (field.tipo) {
      case 'textarea':
        return wrap(
          <Textarea
            value={val} onChange={e => handleChange(field, e.target.value)}
            disabled={disabled} rows={3}
            maxLength={field.validacao?.maxLength}
            placeholder={field.placeholder}
          />, true);

      case 'checkbox': {
        if (field.opcoes && field.opcoes.length > 0) {
          const selected: string[] = Array.isArray(val) ? val : (typeof val === 'string' && val ? val.split('||') : []);
          return wrap(
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
              {field.opcoes.map(opt => (
                <div key={opt} className="flex items-center gap-2">
                  <Checkbox
                    id={`cf-${field.id}-${opt}`}
                    checked={selected.includes(opt)}
                    onCheckedChange={c => {
                      const next = c ? [...selected, opt] : selected.filter(v => v !== opt);
                      onChange(field.nome, next);
                    }}
                    disabled={disabled}
                  />
                  <Label htmlFor={`cf-${field.id}-${opt}`} className="text-sm cursor-pointer font-normal">{opt}</Label>
                </div>
              ))}
            </div>, true);
        }
        return (
          <div key={field.id} className="flex items-center gap-2">
            <Checkbox id={`cf-${field.id}`} checked={!!val} onCheckedChange={v => onChange(field.nome, v)} disabled={disabled} />
            <Label htmlFor={`cf-${field.id}`} className="text-sm cursor-pointer">{field.rotulo}</Label>
            {error && <p className="text-xs text-destructive ml-2">{error}</p>}
          </div>
        );
      }

      case 'radio':
        return wrap(
          <RadioGroup value={val || ''} onValueChange={v => onChange(field.nome, v)} disabled={disabled} className="flex flex-wrap gap-3 mt-1">
            {(field.opcoes || []).map(opt => (
              <div key={opt} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`cf-${field.id}-${opt}`} />
                <Label htmlFor={`cf-${field.id}-${opt}`} className="text-sm cursor-pointer font-normal">{opt}</Label>
              </div>
            ))}
          </RadioGroup>, true);

      case 'select':
        return wrap(
          <Select value={val || ''} onValueChange={v => onChange(field.nome, v)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder={field.placeholder || 'Selecione...'} /></SelectTrigger>
            <SelectContent>
              {(field.opcoes || []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>);

      default:
        return wrap(
          <Input
            type={inputTypeFor(field.tipo)}
            value={val}
            onChange={e => handleChange(field, e.target.value)}
            disabled={disabled}
            required={field.obrigatorio}
            placeholder={field.placeholder}
            maxLength={field.validacao?.maxLength}
            min={field.validacao?.min}
            max={field.validacao?.max}
          />);
    }
  };

  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <div key={gi} className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {g.secao || 'Campos Personalizados'}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {g.fields.map(renderField)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CustomFieldsRenderer;
