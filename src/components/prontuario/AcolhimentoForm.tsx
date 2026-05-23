import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, User, Clock, CheckCircle2 } from 'lucide-react';

interface AcolhimentoFormProps {
  pacienteId: string;
  profissionalId?: string;
  agendamentoId?: string;
  initialData?: any;
  formData: any;
  setFormData: (data: any) => void;
  onSave: (data: any) => Promise<void>;
  saving?: boolean;
}

const SINTOMAS_OPTIONS = [
  "Alucinação", "Delírios", "Labilidade emocional", "Embotamento afetivo", 
  "Pensamento e fala alterada", "Aparência alterada", "Tristeza", "Medo",
  "Ansiedade", "Nervosismo", "Falta de prazer", "Perda de interesse",
  "Insônia ou sono alterado", "Culpa", "Agressividade", "Raiva",
  "Pensamentos negativos", "Autoagressão", "Choro", "Dificuldades em tomar decisões",
  "Baixa autoestima", "Alteração do apetite", "Preocupação", "Tremor",
  "Falta de ar", "Dor de cabeça", "Tontura", "Palpitação",
  "Desconforto abdominal", "Cansaço", "Inquietação", "Angústia",
  "Irritabilidade", "Memória alterada", "Atenção e concentração alterada",
  "Orientação alterada de tempo e espaço", "Presença de pensamento de morte"
];

const VICISSITUDES_OPTIONS = [
  "Divórcio/separação", "Perda de emprego", "Morte de familiares e amigos",
  "Mudança de emprego", "Casamento/união conjugal", "Gravidez",
  "Parto e puerpério", "Sequelas pós COVID-19", "Fracassos e perdas",
  "Comportamento ao dirigir"
];

export const AcolhimentoForm: React.FC<AcolhimentoFormProps> = ({
  pacienteId,
  profissionalId,
  agendamentoId,
  initialData,
  formData,
  setFormData,
  onSave,
  saving
}) => {

  const updateField = (section: string, field: string, value: any) => {
    setFormData({
      ...formData,
      [section]: {
        ...(formData[section] || {}),
        [field]: value
      }
    });
  };

  const handleCheckboxChange = (section: string, listField: string, item: string, checked: boolean) => {
    const currentList = formData[section]?.[listField] || [];
    let newList;
    if (checked) {
      newList = [...currentList, item];
    } else {
      newList = currentList.filter((i: string) => i !== item);
    }
    updateField(section, listField, newList);
  };

  const handleSave = () => {
    onSave(formData);
  };

  const SectionHeader = ({ title, subtitle }: { title: string, subtitle?: string }) => (
    <div className="border-b pb-2 mb-4 mt-8 first:mt-0">
      <h3 className="text-sm font-bold uppercase tracking-wider text-primary">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );

  const RadioField = ({ section, field, label, options }: { section: string, field: string, label: string, options: { value: string, label: string }[] }) => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">{label}</Label>
      <RadioGroup 
        value={formData[section]?.[field]} 
        onValueChange={(val) => updateField(section, field, val)}
        className="flex flex-wrap gap-4"
      >
        {options.map(opt => (
          <div key={opt.value} className="flex items-center space-x-2">
            <RadioGroupItem value={opt.value} id={`${section}-${field}-${opt.value}`} />
            <Label htmlFor={`${section}-${field}-${opt.value}`} className="text-xs font-normal cursor-pointer">{opt.label}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );

  const YES_NO_IGNORE = [
    { value: 'sim', label: 'Sim' },
    { value: 'nao', label: 'Não' },
    { value: 'ignorado', label: 'Ignorado' }
  ];

  return (
    <div className="space-y-6 pb-10">
      {initialData && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Acolhimento registrado</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground uppercase font-bold">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(initialData.criado_em).toLocaleString('pt-BR')}
            </div>
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {initialData.profissional_nome || 'Profissional'}
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO III */}
      <section>
        <SectionHeader title="SEÇÃO III — MOTIVO DE PROCURA AO SERVIÇO" />
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Queixa principal, sintomas e evolução</Label>
            <Textarea 
              placeholder="Descreva a queixa principal..." 
              className="min-h-[120px]"
              value={formData.secao3?.queixa || ''}
              onChange={(e) => updateField('secao3', 'queixa', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Outros</Label>
            <Input 
              placeholder="Outras informações..." 
              value={formData.secao3?.outros || ''}
              onChange={(e) => updateField('secao3', 'outros', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* SEÇÃO IV */}
      <section>
        <SectionHeader title="SEÇÃO IV — SINTOMAS NOS ÚLTIMOS 30 DIAS" subtitle="IV-Baseado nos últimos 30 dias responda sim ou não para os sintomas:" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SINTOMAS_OPTIONS.map(sintoma => (
            <div key={sintoma} className="flex items-center space-x-2">
              <Checkbox 
                id={`sintoma-${sintoma}`} 
                checked={(formData.secao4?.sintomas || []).includes(sintoma)}
                onCheckedChange={(checked) => handleCheckboxChange('secao4', 'sintomas', sintoma, !!checked)}
              />
              <Label htmlFor={`sintoma-${sintoma}`} className="text-xs font-normal cursor-pointer leading-tight">{sintoma}</Label>
            </div>
          ))}
        </div>
      </section>

      {/* SEÇÃO V */}
      <section>
        <SectionHeader title="SEÇÃO V — ANTECEDENTES PESSOAIS" subtitle="(doenças infectocontagiosas, crônico-degenerativas, álcool, tabagismo, sono, histórico saúde mental, comportamento suicida)" />
        <div className="space-y-4">
          <Textarea 
            placeholder="Descreva antecedentes pessoais..." 
            value={formData.secao5?.antecedentes || ''}
            onChange={(e) => updateField('secao5', 'antecedentes', e.target.value)}
          />
          <RadioField section="secao5" field="uso_psicofarmacos" label="Uso de medicação psicofármacos" options={YES_NO_IGNORE} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Qual medicação anterior</Label>
              <Input value={formData.secao5?.medicacao_anterior || ''} onChange={(e) => updateField('secao5', 'medicacao_anterior', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Qual medicação atual</Label>
              <Input value={formData.secao5?.medicacao_atual || ''} onChange={(e) => updateField('secao5', 'medicacao_atual', e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO VI */}
      <section>
        <SectionHeader title="SEÇÃO VI — USO DE SUBSTÂNCIAS" />
        <div className="space-y-6">
          <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
            <RadioField section="secao6" field="uso_alcool" label="Uso de bebida alcoólica" options={YES_NO_IGNORE} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Qual</Label>
                <Input value={formData.secao6?.alcool_qual || ''} onChange={(e) => updateField('secao6', 'alcool_qual', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Frequência</Label>
                <Input value={formData.secao6?.alcool_frequencia || ''} onChange={(e) => updateField('secao6', 'alcool_frequencia', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
            <RadioField section="secao6" field="uso_droga" label="Uso de droga psicoativa" options={YES_NO_IGNORE} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Qual</Label>
                <Input value={formData.secao6?.droga_qual || ''} onChange={(e) => updateField('secao6', 'droga_qual', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Frequência</Label>
                <Input value={formData.secao6?.droga_frequencia || ''} onChange={(e) => updateField('secao6', 'droga_frequencia', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
            <RadioField 
              section="secao6" field="habito_fumar" label="Hábito de fumar" 
              options={[...YES_NO_IGNORE.filter(o => o.value !== 'sim'), { value: 'sim', label: 'Sim' }, { value: 'ex_fumante', label: 'Ex-fumante' }].sort()} 
            />
            <RadioField 
              section="secao6" field="tempo_exposicao_tipo" label="Tempo de exposição ao tabaco" 
              options={[{ value: 'dia', label: 'Dia' }, { value: 'mes', label: 'Mês' }, { value: 'ano', label: 'Ano' }]} 
            />
          </div>
        </div>
      </section>

      {/* SEÇÃO VII */}
      <section>
        <SectionHeader title="SEÇÃO VII — HISTÓRICO DE INTERNAÇÃO PSIQUIÁTRICA" />
        <div className="space-y-6">
          <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
            <RadioField section="secao7" field="tratamento_suicidio" label="Possui tratamento de suicídio" options={YES_NO_IGNORE} />
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Qual</Label>
              <Input value={formData.secao7?.suicidio_qual || ''} onChange={(e) => updateField('secao7', 'suicidio_qual', e.target.value)} />
            </div>
          </div>

          <RadioField section="secao7" field="ideacao_suicida" label="Ideação suicida" options={YES_NO_IGNORE} />

          <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
            <RadioField 
              section="secao7" field="tentativa_suicidio_6meses" label="Episódio de tentativa de suicídio nos últimos 6 meses" 
              options={[{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} 
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Data</Label>
                <Input type="date" value={formData.secao7?.tentativa_data || ''} onChange={(e) => updateField('secao7', 'tentativa_data', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Qual</Label>
                <Input value={formData.secao7?.tentativa_qual || ''} onChange={(e) => updateField('secao7', 'tentativa_qual', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <RadioField section="secao7" field="acompanhamento_psiquiatra" label="Fez ou faz acompanhamento com psiquiatra" options={[{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} />
            <RadioField section="secao7" field="problemas_saude_mental" label="Teve problemas de saúde mental" options={[{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} />
            <RadioField section="secao7" field="avaliado_equipe_mental" label="Já avaliado por equipe de saúde mental" options={[{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} />
          </div>
        </div>
      </section>

      {/* SEÇÃO VIII */}
      <section>
        <SectionHeader title="SEÇÃO VIII — ANTECEDENTES NO TRÂNSITO" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RadioField section="secao8" field="acidente" label="Acidente" options={[{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} />
          <RadioField section="secao8" field="transtorno_transito" label="Transtorno mental relacionado ao trânsito" options={YES_NO_IGNORE} />
        </div>
      </section>

      {/* SEÇÃO IX */}
      <section>
        <SectionHeader title="SEÇÃO IX — OUTROS ANTECEDENTES" />
        <div className="space-y-4">
          <RadioField section="secao9" field="doenca_oncologica" label="Relacionado à doença oncológica" options={[{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} />
          <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
            <RadioField section="secao9" field="relacionado_covid" label="Relacionado à COVID-19 ou sequelas" options={YES_NO_IGNORE} />
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Quais</Label>
              <Input value={formData.secao9?.covid_quais || ''} onChange={(e) => updateField('secao9', 'covid_quais', e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO X */}
      <section>
        <SectionHeader title="SEÇÃO X — HISTÓRICO PESSOAL" />
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Personalidade anterior</Label>
            <Input value={formData.secao10?.personalidade_anterior || ''} onChange={(e) => updateField('secao10', 'personalidade_anterior', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Características gerais observadas</Label>
            <Textarea value={formData.secao10?.caracteristicas_gerais || ''} onChange={(e) => updateField('secao10', 'caracteristicas_gerais', e.target.value)} />
          </div>
        </div>
      </section>

      {/* SEÇÃO XI */}
      <section>
        <SectionHeader title="SEÇÃO XI — ANTECEDENTES FAMILIARES PSIQUIÁTRICOS" />
        <div className="space-y-4">
          <Input placeholder="Descreva antecedentes familiares..." value={formData.secao11?.antecedentes_familiares || ''} onChange={(e) => updateField('secao11', 'antecedentes_familiares', e.target.value)} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Situação sociofamiliar</Label>
              <Input value={formData.secao11?.situacao_sociofamiliar || ''} onChange={(e) => updateField('secao11', 'situacao_sociofamiliar', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">História de moradia (alugada, própria, quantos cômodos)</Label>
              <Input value={formData.secao11?.historia_moradia || ''} onChange={(e) => updateField('secao11', 'historia_moradia', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Renda familiar</Label>
              <Input value={formData.secao11?.renda_familiar || ''} onChange={(e) => updateField('secao11', 'renda_familiar', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Moradores</Label>
              <Input value={formData.secao11?.moradores || ''} onChange={(e) => updateField('secao11', 'moradores', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Sociabilidade e lazer</Label>
              <Input value={formData.secao11?.sociabilidade_lazer || ''} onChange={(e) => updateField('secao11', 'sociabilidade_lazer', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Relacionamento e dinâmica familiar</Label>
              <Input value={formData.secao11?.relacionamento_dinamica || ''} onChange={(e) => updateField('secao11', 'relacionamento_dinamica', e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO XII */}
      <section>
        <SectionHeader title="SEÇÃO XII — HISTÓRIA SOCIAL" />
        <Textarea placeholder="Descreva a história social..." value={formData.secao12?.historia_social || ''} onChange={(e) => updateField('secao12', 'historia_social', e.target.value)} />
      </section>

      {/* SEÇÃO XIII */}
      <section>
        <SectionHeader title="SEÇÃO XIII — VICISSITUDES COMUNS NA VIDA" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {VICISSITUDES_OPTIONS.map(v => (
            <div key={v} className="flex items-center space-x-2">
              <Checkbox 
                id={`vicissitude-${v}`} 
                checked={(formData.secao13?.vicissitudes || []).includes(v)}
                onCheckedChange={(checked) => handleCheckboxChange('secao13', 'vicissitudes', v, !!checked)}
              />
              <Label htmlFor={`vicissitude-${v}`} className="text-xs font-normal cursor-pointer leading-tight">{v}</Label>
            </div>
          ))}
        </div>
      </section>

      {/* SEÇÃO XIV */}
      <section>
        <SectionHeader title="SEÇÃO XIV — HISTÓRIA OCUPACIONAL" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RadioField section="secao14" field="relacao_doenca_ocupacional" label="Alguma relação de doença ocupacional" options={YES_NO_IGNORE} />
            <RadioField section="secao14" field="transtorno_mental_trabalho" label="Transtorno mental relacionado ao trabalho" options={YES_NO_IGNORE} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Conduta — afastamento da situação de desgaste mental ou do local de trabalho</Label>
            <Input value={formData.secao14?.conduta_afastamento || ''} onChange={(e) => updateField('secao14', 'conduta_afastamento', e.target.value)} />
          </div>
        </div>
      </section>

      {/* SEÇÃO XV */}
      <section>
        <SectionHeader title="SEÇÃO XV — PARECER DO ACOLHEDOR" />
        <div className="space-y-4">
          <Textarea 
            placeholder="Descreva o parecer..." 
            className="min-h-[120px]" 
            value={formData.secao15?.parecer || ''}
            onChange={(e) => updateField('secao15', 'parecer', e.target.value)}
          />
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Contrarreferência</Label>
            <Input value={formData.secao15?.contrarreferencia || ''} onChange={(e) => updateField('secao15', 'contrarreferencia', e.target.value)} />
          </div>
        </div>
      </section>

      {/* SEÇÃO XVI */}
      <section>
        <SectionHeader title="SEÇÃO XVI — ENCAMINHAMENTO" />
        <div className="space-y-4">
          <RadioField 
            section="secao16" field="encaminhamento" label="Encaminhamento" 
            options={[{ value: 'ubs', label: 'UBS' }, { value: 'outros', label: 'Outros' }]} 
          />
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Se outros, especifique:</Label>
            <Input value={formData.secao16?.encaminhamento_outros || ''} onChange={(e) => updateField('secao16', 'encaminhamento_outros', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Motivo</Label>
            <Textarea value={formData.secao16?.motivo || ''} onChange={(e) => updateField('secao16', 'motivo', e.target.value)} />
          </div>
        </div>
      </section>

      <div className="flex justify-end pt-8 border-t">
        <Button onClick={handleSave} disabled={saving} className="gradient-primary">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Salvando...' : 'Salvar Acolhimento'}
        </Button>
      </div>
    </div>
  );
};
