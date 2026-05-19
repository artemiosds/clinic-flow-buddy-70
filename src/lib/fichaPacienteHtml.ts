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

interface FieldItem { label: string; value: unknown; fallback?: string; emphasis?: boolean; }

const field = (f: FieldItem): string => `
  <div class="ficha-field">
    <span class="ficha-field-label">${esc(f.label)}</span>
    <span class="ficha-field-value${f.emphasis ? ' ficha-field-value--emphasis' : ''}">${esc(txt(f.value, f.fallback || '—'))}</span>
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
  .ficha-section { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }
  .ficha-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .ficha-section-title { margin: 0 0 6px; font-size: 10pt; font-weight: 700; text-transform: uppercase; color: #0369a1; border-bottom: 1px solid #bae6fd; padding-bottom: 3px; letter-spacing: 0.3px; }
  .ficha-section-head .ficha-section-title { flex: 1; margin-bottom: 0; }
  .ficha-badge { display: inline-flex; align-items: center; border-radius: 999px; background: #fee2e2; color: #b91c1c; padding: 2px 8px; font-size: 8pt; font-weight: 700; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ficha-grid { display: grid; gap: 4px 12px; margin-top: 4px; }
  .ficha-grid--1 { grid-template-columns: 1fr; }
  .ficha-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ficha-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ficha-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ficha-grid--5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .ficha-grid--3-wide { grid-template-columns: 2fr 0.7fr 1fr; }
  .ficha-field { min-width: 0; padding: 2px 0; }
  .ficha-field-label { display: block; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.3px; }
  .ficha-field-value { display: block; min-height: 14px; font-size: 10pt; font-weight: 500; color: #1a1a1a; overflow-wrap: anywhere; }
  .ficha-field-value--emphasis { font-weight: 700; font-size: 11pt; }
  .ficha-text-block { min-height: 38px; border: 1px dashed #cbd5e1; border-radius: 4px; background: #f8fafc; padding: 8px 10px; color: #1a1a1a; white-space: pre-wrap; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ficha-signature-block { margin-top: 28px; text-align: right; page-break-inside: avoid; break-inside: avoid; }
  .ficha-signature-date { font-size: 9pt; color: #475569; margin-bottom: 28px; }
  .ficha-signature-line { width: 280px; max-width: 100%; margin-left: auto; border-top: 1px solid #111827; }
  .ficha-signature-name { margin-top: 4px; font-size: 10pt; font-weight: 700; color: #111827; }
  .ficha-signature-meta { font-size: 9pt; color: #475569; }
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
        { label: 'PA', value: sv.pressao_arterial },
        { label: 'FC', value: sv.frequencia_cardiaca },
        { label: 'FR', value: sv.frequencia_respiratoria },
        { label: 'Temperatura', value: sv.temperatura },
        { label: 'SpO2', value: sv.saturacao },
        { label: 'Peso', value: sv.peso },
        { label: 'Altura', value: sv.altura },
        { label: 'Glicemia', value: sv.glicemia },
      ]),
    ));

    body.push(section(
      '7. Queixa principal',
      `<div class="ficha-text-block">${esc(txt(dc.queixa_principal, 'Não informado'))}</div>`,
    ));

    body.push(`
      <div class="ficha-signature-block">
        <div class="ficha-signature-date">Oriximiná — PA, ____ / ____ / ________</div>
        <div class="ficha-signature-line"></div>
        <div class="ficha-signature-name">${esc(txt(data.profissional.nome, 'Profissional responsável'))}</div>
        <div class="ficha-signature-meta">${esc(txt(data.profissional.cargo))} • ${esc(txt(data.profissional.registro))}</div>
      </div>
    `);
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
