/**
 * Builds the BODY HTML (sections only — no header/footer) for the
 * "Ficha de Atendimento Clínico" using the institutional document shell
 * (printLayout.ts → openPrintDocument). This guarantees that the ficha
 * uses the exact same header/footer/branding as every other document in
 * the system (prontuário, receituário, exames, encaminhamento, etc.).
 */

import type { PacienteFichaDocumentData, FichaPrintMode } from '@/components/pacientes/PacienteFichaDocument';

const esc = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const hasValue = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return true;
  return String(v).trim().length > 0;
};

const txt = (v: unknown, fallback = '—'): string => {
  if (!hasValue(v)) return fallback;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v).trim();
};

const formatDate = (value?: string, fallback = '—'): string => {
  if (!value) return fallback;
  try {
    const normalized = value.length <= 10 ? `${value}T12:00:00` : value;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return fallback;
  }
};

const calculateAge = (birthDate?: string): string => {
  if (!birthDate) return '—';
  const normalized = birthDate.includes('/') ? birthDate.split('/').reverse().join('-') : birthDate;
  const b = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(b.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age -= 1;
  return age >= 0 ? `${age} anos` : '—';
};

const sexoLabel = (v?: string): string => {
  const n = String(v || '').trim().toUpperCase();
  if (n === 'M' || n === 'MASCULINO') return 'Masculino';
  if (n === 'F' || n === 'FEMININO') return 'Feminino';
  if (n === 'I' || n === 'IGNORADO') return 'Ignorado';
  return 'Não informado';
};

const racaLabel = (v?: string): string => {
  const n = String(v || '').trim().toLowerCase();
  const map: Record<string, string> = {
    branca: 'Branca', preta: 'Preta', parda: 'Parda', amarela: 'Amarela',
    indigena: 'Indígena', indígena: 'Indígena',
    nao_declarado: 'Não declarado', 'não declarado': 'Não declarado',
  };
  return map[n] || txt(v, 'Não declarado');
};

interface FieldItem { label: string; value: unknown; fallback?: string; emphasis?: boolean; manual?: boolean; }

const field = (f: FieldItem): string => `
  <div class="ficha-field">
    <span class="ficha-field-label">${esc(f.label)}</span>
    <span class="ficha-field-value${f.emphasis ? ' ficha-field-value--emphasis' : ''}${f.manual ? ' ficha-field-value--manual' : ''}">${esc(txt(f.value, f.fallback || (f.manual ? '' : '—')))}</span>
  </div>`;

const grid = (cols: number | '3-wide', fields: FieldItem[]): string =>
  `<div class="ficha-grid ficha-grid--${cols}">${fields.map(field).join('')}</div>`;

const section = (title: string, inner: string, badge?: string): string => `
  <div class="ficha-section">
    <div class="ficha-section-head">
      <h2 class="ficha-section-title">${esc(title)}</h2>
      ${badge ? `<span class="ficha-badge">${esc(badge)}</span>` : ''}
    </div>
    ${inner}
  </div>`;

export const FICHA_EXTRA_CSS = `
  .ficha-section { border: 0.8px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; margin-bottom: 6px; page-break-inside: avoid; break-inside: avoid; background: #fff; }
  .ficha-section-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 2px; }
  .ficha-section-title { margin: 0 0 2px; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #0369a1; border-bottom: 0.8px solid #bae6fd; padding-bottom: 1px; letter-spacing: 0.1px; }
  .ficha-section-head .ficha-section-title { flex: 1; margin-bottom: 0; }
  .ficha-badge { display: inline-flex; align-items: center; border-radius: 999px; background: #fee2e2; color: #b91c1c; padding: 0px 5px; font-size: 7pt; font-weight: 700; text-transform: uppercase; }
  .ficha-grid { display: grid; gap: 2px 8px; margin-top: 1px; }
  .ficha-grid--1 { grid-template-columns: 1fr; }
  .ficha-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ficha-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ficha-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ficha-grid--5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .ficha-grid--8 { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .ficha-grid--3-wide { grid-template-columns: 2fr 0.7fr 1fr; }
  .ficha-field { min-width: 0; padding: 1px 0; }
  .ficha-field-label { display: block; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.1px; line-height: 1.0; }
  .ficha-field-value { display: block; min-height: 11px; font-size: 9pt; font-weight: 500; color: #000; overflow-wrap: anywhere; border-bottom: 1px solid transparent; line-height: 1.1; }
  .ficha-field-value--emphasis { font-weight: 700; font-size: 9.5pt; color: #000; }
  .ficha-field-value--manual { border-bottom: 0.8px solid #94a3b8; min-height: 14px; margin-top: 1px; }
  .ficha-text-block { min-height: 28px; border: 0.8px dashed #cbd5e1; border-radius: 3px; background: #f8fafc; padding: 4px 6px; color: #000; white-space: pre-wrap; font-size: 9pt; }
  .ficha-manual-lines { margin-top: 4px; }
  .ficha-line { border-bottom: 0.8px solid #cbd5e1; height: 18px; margin-bottom: 1px; }
  .ficha-signature-block { margin-top: 15px; text-align: center; page-break-inside: avoid; break-inside: avoid; }
  .ficha-signature-date { font-size: 9pt; color: #000; margin-bottom: 15px; text-align: left; font-weight: 500; }
  .ficha-signature-line { width: 100%; border-top: 0.8px solid #111827; margin-bottom: 1px; }
  .ficha-signature-name { font-size: 8.5pt; font-weight: 700; color: #111827; text-transform: uppercase; }
  .ficha-signature-meta { font-size: 7.5pt; color: #475569; }
`;

export interface BuiltFicha {
  title: string;
  body: string;
  meta: Record<string, string>;
}

export function buildFichaBody(
  data: PacienteFichaDocumentData,
  mode: FichaPrintMode,
  opts: { extraBeforeSignature?: string } = {},
): BuiltFicha {
  const somenteDados = mode === 'dados_pessoais';
  const p = data.paciente;
  const dc = data.dadosClinicos;
  const sv = data.sinaisVitais;
  const title = somenteDados ? 'FICHA DE ATENDIMENTO CLÍNICO' : 'FICHA DE ATENDIMENTO COMPLETA';

  const body: string[] = [];

  body.push(section(
    '1. Identificação do paciente',
    grid(2, [
      { label: 'Nome', value: p.nome_completo, fallback: 'Não informado', emphasis: true },
      { label: 'Nome da mãe', value: p.nome_mae, fallback: 'Não informado' },
    ]) +
    grid(5, [
      { label: 'CPF', value: p.cpf, fallback: 'Não informado' },
      { label: 'CNS', value: p.cns, fallback: 'Não informado' },
      { label: 'Data de nascimento', value: formatDate(p.data_nascimento, 'Não informado'), fallback: 'Não informado' },
      { label: 'Idade', value: calculateAge(p.data_nascimento) },
      { label: 'Sexo', value: sexoLabel(p.sexo), fallback: 'Não informado' },
    ]) +
    grid(4, [
      { label: 'Naturalidade', value: p.naturalidade },
      { label: 'UF naturalidade', value: p.naturalidade_uf },
      { label: 'Nacionalidade', value: p.nacionalidade || 'Brasileira' },
      { label: 'Raça/Cor', value: racaLabel(p.raca_cor), fallback: 'Não declarado' },
    ]) +
    grid(2, [
      { label: 'Situação de rua', value: p.situacao_rua },
      { label: 'Origem do cadastro', value: p.origem_cadastro },
    ]),
    p.menor_idade ? 'Menor de idade' : undefined,
  ));

  body.push(section(
    '2. Endereço e localização',
    grid('3-wide', [
      {
        label: 'Tipo de logradouro / logradouro',
        value: [txt(p.tipo_logradouro, ''), txt(p.logradouro, '')].filter(Boolean).join(' ').trim(),
        fallback: txt(p.endereco_legado, 'Não informado'),
      },
      { label: 'Número', value: p.numero, fallback: 'S/N' },
      { label: 'Complemento', value: p.complemento },
    ]) +
    grid(4, [
      { label: 'Bairro', value: p.bairro },
      { label: 'Município', value: p.municipio || 'Oriximiná' },
      { label: 'UF', value: p.uf || 'PA' },
      { label: 'CEP', value: p.cep },
    ]) +
    grid(1, [
      { label: 'Referência', value: p.referencia || p.endereco_legado, fallback: 'Não informado' },
    ]),
  ));

  body.push(section(
    '3. Contato',
    grid(3, [
      { label: 'Telefone principal', value: p.telefone, fallback: 'Não informado' },
      { label: 'Telefone secundário', value: p.telefone_secundario },
      { label: 'E-mail', value: p.email },
    ]),
  ));

  body.push(section(
    '4. Dados complementares',
    grid(3, [
      { label: 'Responsável', value: p.nome_responsavel, fallback: 'O próprio' },
      { label: 'CPF do responsável', value: p.cpf_responsavel },
      { label: 'Vínculo', value: p.parentesco },
    ]) +
    grid(4, [
      { label: 'Unidade vinculada', value: p.unidade_vinculada, fallback: 'Não informado' },
      { label: 'UBS de origem', value: p.ubs_origem },
      { label: 'Tipo de encaminhamento', value: p.tipo_encaminhamento },
      { label: 'Especialidade destino', value: p.especialidade_destino },
    ]) +
    grid(2, [
      { label: 'Profissional solicitante', value: p.profissional_solicitante },
      { label: 'Observações cadastrais', value: p.observacoes, fallback: 'Não informado' },
    ]),
  ));

  if (!somenteDados) {
    body.push(section(
      '5. Dados do atendimento',
      grid(4, [
        { label: 'Unidade de atendimento', value: dc.unidade_atendimento },
        { label: 'Tipo de atendimento', value: dc.tipo_atendimento },
        { label: 'Especialidade', value: dc.especialidade },
        { label: 'Data do atendimento', value: formatDate(dc.data_atendimento) },
      ]) +
      grid(3, [
        { label: 'Unidade de origem', value: dc.unidade_origem },
        { label: 'CID / diagnóstico', value: dc.cid },
        { label: 'Encaminhamento', value: dc.encaminhamento },
      ]),
    ));

    body.push(section(
      '6. Triagem / sinais vitais',
      grid(4, [
        { label: 'PA', value: sv.pressao_arterial, manual: true },
        { label: 'FC', value: sv.frequencia_cardiaca, manual: true },
        { label: 'FR', value: sv.frequencia_respiratoria, manual: true },
        { label: 'Temp', value: sv.temperatura, manual: true },
        { label: 'SpO2', value: sv.saturacao, manual: true },
        { label: 'Peso', value: sv.peso, manual: true },
        { label: 'Altura', value: sv.altura, manual: true },
        { label: 'Glicemia', value: sv.glicemia, manual: true },
      ]),
    ));

    body.push(section(
      '7. Avaliação clínica',
      grid(1, [
        { label: 'Queixa principal', value: dc.queixa_principal, manual: true },
      ]) +
      `<div class="ficha-manual-lines">
        <span class="ficha-field-label">Evolução clínica</span>
        <div class="ficha-line"></div>
        <div class="ficha-line"></div>
        <div class="ficha-line"></div>
      </div>`
    ));

    body.push(section(
      '8. Conduta / prescrição',
      grid(2, [
        { label: 'Diagnóstico', value: dc.cid, manual: true },
        { label: 'Retorno', value: '', manual: true },
      ]) +
      `<div class="ficha-manual-lines">
        <span class="ficha-field-label">Medicação / Prescrição</span>
        <div class="ficha-line"></div>
        <div class="ficha-line"></div>
      </div>
      <div class="ficha-manual-lines">
        <span class="ficha-field-label">Procedimentos</span>
        <div class="ficha-line"></div>
        <div class="ficha-line"></div>
      </div>`
    ));

    if (opts.extraBeforeSignature) body.push(opts.extraBeforeSignature);

    body.push(`
      <div class="ficha-signature-block">
        <div class="ficha-signature-date">Oriximiná — PA, ____ / ____ / ________</div>
        
        <div style="display: flex; justify-content: space-around; gap: 30px; margin-top: 15px;">
          <div style="flex: 1;">
            <div class="ficha-signature-line" style="margin: 0 auto; width: 250px;"></div>
            <div class="ficha-signature-name">${esc(txt(data.profissional.nome, 'PROFISSIONAL RESPONSÁVEL'))}</div>
          </div>
          
          <div style="flex: 1;">
            <div class="ficha-signature-line" style="margin: 0 auto; width: 250px;"></div>
            <div class="ficha-signature-name">REGISTRO PROFISSIONAL</div>
            <div class="ficha-signature-meta">${esc(txt(data.profissional.registro))}</div>
          </div>
        </div>
      </div>
    `);
  } else if (opts.extraBeforeSignature) {
    body.push(opts.extraBeforeSignature);
  }

  const meta: Record<string, string> = {
    Paciente: txt(p.nome_completo, 'Não informado'),
    Prontuário: txt(dc.numero_prontuario, '—'),
  };
  if (!somenteDados && hasValue(dc.data_atendimento)) {
    meta['Data do atendimento'] = formatDate(dc.data_atendimento);
  }

  return { title, body: body.join('\n'), meta };
}
