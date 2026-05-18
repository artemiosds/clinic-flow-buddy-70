import React from 'react';
import logoSmsFallback from '@/assets/logo-sms-oriximina.jpeg';
import logoCapsFallback from '@/assets/logo-caps-ii.png';
import type { DocumentConfig } from '@/lib/printLayout';

export type FichaPrintMode = 'completa' | 'dados_pessoais';

export interface PacienteFichaDocumentData {
  paciente: {
    id: string;
    nome_completo: string;
    nome_mae: string;
    data_nascimento: string;
    sexo?: string;
    cpf: string;
    cns: string;
    naturalidade?: string;
    naturalidade_uf?: string;
    nacionalidade?: string;
    raca_cor?: string;
    situacao_rua?: boolean;
    menor_idade?: boolean;
    nome_responsavel?: string;
    cpf_responsavel?: string;
    cep?: string;
    tipo_logradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    endereco_legado?: string;
    telefone: string;
    telefone_secundario?: string;
    email?: string;
    parentesco?: string;
    observacoes?: string;
    ubs_origem?: string;
    profissional_solicitante?: string;
    tipo_encaminhamento?: string;
    especialidade_destino?: string;
    unidade_vinculada?: string;
    origem_cadastro?: string;
    referencia?: string;
  };
  dadosClinicos: {
    numero_prontuario: string;
    cid: string;
    tipo_atendimento: string;
    unidade_origem: string;
    unidade_atendimento: string;
    data_atendimento: string;
    especialidade?: string;
    encaminhamento?: string;
    queixa_principal?: string;
  };
  sinaisVitais: {
    pressao_arterial: string;
    frequencia_cardiaca: string;
    temperatura: string;
    saturacao: string;
    peso: string;
    altura: string;
    glicemia?: string;
    frequencia_respiratoria?: string;
  };
  profissional: {
    nome: string;
    cargo: string;
    registro: string;
  };
  evoluciones: Array<{
    data: string;
    observacao: string;
    profissional: string;
  }>;
}

interface PacienteFichaDocumentProps {
  data: PacienteFichaDocumentData;
  mode: FichaPrintMode;
  institutionalConfig: DocumentConfig;
  generatedAt: Date;
}

const hasValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  return String(value).trim().length > 0;
};

const textValue = (value: unknown, fallback = '—'): string => {
  if (!hasValue(value)) return fallback;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value).trim();
};

const formatDate = (value?: string, fallback = '—'): string => {
  if (!value) return fallback;
  try {
    const normalized = value.length <= 10 ? `${value}T12:00:00` : value;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return fallback;
  }
};

const formatDateTime = (value: Date): string =>
  value.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const calculateAge = (birthDate?: string): string => {
  if (!birthDate) return '—';
  const normalized = birthDate.includes('/') ? birthDate.split('/').reverse().join('-') : birthDate;
  const birth = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return '—';

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age >= 0 ? `${age} anos` : '—';
};

const getSexoLabel = (value?: string): string => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'M' || normalized === 'MASCULINO') return 'Masculino';
  if (normalized === 'F' || normalized === 'FEMININO') return 'Feminino';
  if (normalized === 'I' || normalized === 'IGNORADO') return 'Ignorado';
  return 'Não informado';
};

const getRacaLabel = (value?: string): string => {
  const normalized = String(value || '').trim().toLowerCase();
  const labels: Record<string, string> = {
    branca: 'Branca',
    preta: 'Preta',
    parda: 'Parda',
    amarela: 'Amarela',
    indigena: 'Indígena',
    indígena: 'Indígena',
    nao_declarado: 'Não declarado',
    'não declarado': 'Não declarado',
  };

  return labels[normalized] || textValue(value, 'Não declarado');
};

const resolveLogoUrl = (value: string | undefined, fallback: string): string => {
  if (value && value.trim()) return value;
  return fallback;
};

const buildLogoStyle = (size: number, rounded: boolean): React.CSSProperties => {
  const safeSize = Math.max(32, Math.min(160, Number(size) || 64));
  return rounded
    ? {
        width: safeSize,
        height: safeSize,
        minWidth: safeSize,
        borderRadius: 9999,
        objectFit: 'cover',
      }
    : {
        maxHeight: safeSize,
        maxWidth: safeSize * 2,
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
      };
};

interface FieldProps {
  label: string;
  value: unknown;
  fallback?: string;
  emphasize?: boolean;
}

const Field = ({ label, value, fallback = '—', emphasize = false }: FieldProps) => (
  <div className="patient-sheet-field">
    <span className="patient-sheet-field-label">{label}</span>
    <span className={emphasize ? 'patient-sheet-field-value patient-sheet-field-value--emphasis' : 'patient-sheet-field-value'}>
      {textValue(value, fallback)}
    </span>
  </div>
);

export const PacienteFichaDocument: React.FC<PacienteFichaDocumentProps> = ({
  data,
  mode,
  institutionalConfig,
  generatedAt,
}) => {
  const somenteDadosPessoais = mode === 'dados_pessoais';
  const p = data.paciente;
  const dc = data.dadosClinicos;
  const sv = data.sinaisVitais;
  const documentTitle = somenteDadosPessoais ? 'FICHA DE ATENDIMENTO CLÍNICO — DADOS PESSOAIS' : 'FICHA DE ATENDIMENTO COMPLETA';

  const leftLogo = institutionalConfig.logoEsquerdaAtiva !== false
    ? resolveLogoUrl(institutionalConfig.logoEsquerda, logoSmsFallback)
    : '';
  const centerLogo = institutionalConfig.logoCentroAtiva !== false && institutionalConfig.logoCentro
    ? resolveLogoUrl(institutionalConfig.logoCentro, '')
    : '';
  const rightLogo = institutionalConfig.logoDireitaAtiva !== false
    ? resolveLogoUrl(institutionalConfig.logoDireita, logoCapsFallback)
    : '';

  const activeLogos = [leftLogo, centerLogo, rightLogo].filter(Boolean);
  const centeredOnlyLogo = activeLogos.length === 1 ? activeLogos[0] : '';
  const showLeftSide = Boolean(leftLogo) && activeLogos.length > 1;
  const showRightSide = Boolean(rightLogo) && activeLogos.length > 1;
  const showMainLogo = Boolean(centerLogo || centeredOnlyLogo);
  const mainLogoUrl = centerLogo || centeredOnlyLogo;
  const mainLogoSize = centerLogo
    ? institutionalConfig.logoCentroTamanho
    : leftLogo
      ? institutionalConfig.logoEsquerdaTamanho
      : institutionalConfig.logoDireitaTamanho;
  const mainLogoRounded = centerLogo
    ? institutionalConfig.logoCentroRedonda
    : leftLogo
      ? institutionalConfig.logoEsquerdaRedonda
      : institutionalConfig.logoDireitaRedonda;

  const atendimentoFields = [
    sv.pressao_arterial,
    sv.frequencia_cardiaca,
    sv.frequencia_respiratoria,
    sv.temperatura,
    sv.saturacao,
    sv.peso,
    sv.altura,
    sv.glicemia,
    dc.queixa_principal,
    dc.cid,
    dc.tipo_atendimento,
    dc.especialidade,
  ];

  const hasClinicalContent = atendimentoFields.some(hasValue);

  return (
    <article className="patient-sheet-document" data-mode={mode}>
      <header className="patient-sheet-header">
        <div className={`patient-sheet-header-grid logos-${activeLogos.length || 0}`}>
          {showLeftSide ? (
            <div className="patient-sheet-logo-slot patient-sheet-logo-slot--left">
              <img
                src={leftLogo}
                alt="Logo institucional esquerda"
                className="patient-sheet-logo-image"
                style={buildLogoStyle(institutionalConfig.logoEsquerdaTamanho, institutionalConfig.logoEsquerdaRedonda)}
              />
            </div>
          ) : (
            <div className="patient-sheet-logo-slot patient-sheet-logo-slot--empty" aria-hidden="true" />
          )}

          <div className="patient-sheet-header-main">
            {showMainLogo && mainLogoUrl ? (
              <div className="patient-sheet-main-logo-wrap">
                <img
                  src={mainLogoUrl}
                  alt="Logo institucional central"
                  className="patient-sheet-logo-image"
                  style={buildLogoStyle(mainLogoSize, mainLogoRounded)}
                />
              </div>
            ) : null}

            <p className="patient-sheet-header-line">{textValue(institutionalConfig.linha1, 'SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ')}</p>
            <p className="patient-sheet-header-line patient-sheet-header-line--secondary">
              {textValue(institutionalConfig.linha2, 'CAPS II')}
            </p>
            <h1 className="patient-sheet-document-title">{documentTitle}</h1>
          </div>

          {showRightSide ? (
            <div className="patient-sheet-logo-slot patient-sheet-logo-slot--right">
              <img
                src={rightLogo}
                alt="Logo institucional direita"
                className="patient-sheet-logo-image"
                style={buildLogoStyle(institutionalConfig.logoDireitaTamanho, institutionalConfig.logoDireitaRedonda)}
              />
            </div>
          ) : (
            <div className="patient-sheet-logo-slot patient-sheet-logo-slot--empty" aria-hidden="true" />
          )}
        </div>

        <div className="patient-sheet-header-meta">
          <span>Paciente: {textValue(p.nome_completo, 'Não informado')}</span>
          <span>Prontuário: {textValue(dc.numero_prontuario, '—')}</span>
          <span>Emitido em: {formatDateTime(generatedAt)}</span>
        </div>
      </header>

      <section className="patient-sheet-section">
        <div className="patient-sheet-section-head">
          <h2 className="patient-sheet-section-title">1. Identificação do paciente</h2>
          {p.menor_idade ? <span className="patient-sheet-badge">Menor de idade</span> : null}
        </div>
        <div className="patient-sheet-grid patient-sheet-grid--2">
          <Field label="Nome" value={p.nome_completo} fallback="Não informado" emphasize />
          <Field label="Nome da mãe" value={p.nome_mae} fallback="Não informado" />
        </div>
        <div className="patient-sheet-grid patient-sheet-grid--5">
          <Field label="CPF" value={p.cpf} fallback="Não informado" />
          <Field label="CNS" value={p.cns} fallback="Não informado" />
          <Field label="Data de nascimento" value={formatDate(p.data_nascimento, 'Não informado')} fallback="Não informado" />
          <Field label="Idade" value={calculateAge(p.data_nascimento)} />
          <Field label="Sexo" value={getSexoLabel(p.sexo)} fallback="Não informado" />
        </div>
        <div className="patient-sheet-grid patient-sheet-grid--4">
          <Field label="Naturalidade" value={p.naturalidade} />
          <Field label="UF naturalidade" value={p.naturalidade_uf} />
          <Field label="Nacionalidade" value={p.nacionalidade || 'Brasileira'} />
          <Field label="Raça/Cor" value={getRacaLabel(p.raca_cor)} fallback="Não declarado" />
        </div>
        <div className="patient-sheet-grid patient-sheet-grid--2">
          <Field label="Situação de rua" value={p.situacao_rua} />
          <Field label="Origem do cadastro" value={p.origem_cadastro} />
        </div>
      </section>

      <section className="patient-sheet-section">
        <h2 className="patient-sheet-section-title">2. Endereço e localização</h2>
        <div className="patient-sheet-grid patient-sheet-grid--3-wide">
          <Field
            label="Tipo de logradouro / logradouro"
            value={[textValue(p.tipo_logradouro, ''), textValue(p.logradouro, '')].filter(Boolean).join(' ').trim()}
            fallback={textValue(p.endereco_legado, 'Não informado')}
          />
          <Field label="Número" value={p.numero} fallback="S/N" />
          <Field label="Complemento" value={p.complemento} />
        </div>
        <div className="patient-sheet-grid patient-sheet-grid--4">
          <Field label="Bairro" value={p.bairro} />
          <Field label="Município" value={p.municipio || 'Oriximiná'} />
          <Field label="UF" value={p.uf || 'PA'} />
          <Field label="CEP" value={p.cep} />
        </div>
        <div className="patient-sheet-grid patient-sheet-grid--1">
          <Field label="Referência" value={p.referencia || p.endereco_legado} fallback="Não informado" />
        </div>
      </section>

      <section className="patient-sheet-section">
        <h2 className="patient-sheet-section-title">3. Contato</h2>
        <div className="patient-sheet-grid patient-sheet-grid--3">
          <Field label="Telefone principal" value={p.telefone} fallback="Não informado" />
          <Field label="Telefone secundário" value={p.telefone_secundario} />
          <Field label="E-mail" value={p.email} />
        </div>
      </section>

      <section className="patient-sheet-section">
        <h2 className="patient-sheet-section-title">4. Dados complementares</h2>
        <div className="patient-sheet-grid patient-sheet-grid--3">
          <Field label="Responsável" value={p.nome_responsavel} fallback="O próprio" />
          <Field label="CPF do responsável" value={p.cpf_responsavel} />
          <Field label="Vínculo" value={p.parentesco} />
        </div>
        <div className="patient-sheet-grid patient-sheet-grid--4">
          <Field label="Unidade vinculada" value={p.unidade_vinculada} fallback="Não informado" />
          <Field label="UBS de origem" value={p.ubs_origem} />
          <Field label="Tipo de encaminhamento" value={p.tipo_encaminhamento} />
          <Field label="Especialidade destino" value={p.especialidade_destino} />
        </div>
        <div className="patient-sheet-grid patient-sheet-grid--2">
          <Field label="Profissional solicitante" value={p.profissional_solicitante} />
          <Field label="Observações cadastrais" value={p.observacoes} fallback="Não informado" />
        </div>
      </section>

      {!somenteDadosPessoais ? (
        <>
          <section className="patient-sheet-section">
            <h2 className="patient-sheet-section-title">5. Dados do atendimento</h2>
            <div className="patient-sheet-grid patient-sheet-grid--4">
              <Field label="Unidade de atendimento" value={dc.unidade_atendimento} />
              <Field label="Tipo de atendimento" value={dc.tipo_atendimento} />
              <Field label="Especialidade" value={dc.especialidade} />
              <Field label="Data do atendimento" value={formatDate(dc.data_atendimento)} />
            </div>
            <div className="patient-sheet-grid patient-sheet-grid--3">
              <Field label="Unidade de origem" value={dc.unidade_origem} />
              <Field label="CID / diagnóstico" value={dc.cid} />
              <Field label="Encaminhamento" value={dc.encaminhamento} />
            </div>
          </section>

          <section className="patient-sheet-section">
            <h2 className="patient-sheet-section-title">6. Triagem / sinais vitais</h2>
            <div className="patient-sheet-grid patient-sheet-grid--4">
              <Field label="PA" value={sv.pressao_arterial} />
              <Field label="FC" value={sv.frequencia_cardiaca} />
              <Field label="FR" value={sv.frequencia_respiratoria} />
              <Field label="Temperatura" value={sv.temperatura} />
              <Field label="SpO2" value={sv.saturacao} />
              <Field label="Peso" value={sv.peso} />
              <Field label="Altura" value={sv.altura} />
              <Field label="Glicemia" value={sv.glicemia} />
            </div>
            {!hasClinicalContent ? (
              <p className="patient-sheet-helper-text">Sem dados clínicos preenchidos até o momento.</p>
            ) : null}
          </section>

          <section className="patient-sheet-section">
            <h2 className="patient-sheet-section-title">7. Queixa principal</h2>
            <div className="patient-sheet-text-block">{textValue(dc.queixa_principal, 'Não informado')}</div>
          </section>

          <section className="patient-sheet-signature-block">
            <div className="patient-sheet-signature-date">Oriximiná — PA, ____ / ____ / ________</div>
            <div className="patient-sheet-signature-line" />
            <div className="patient-sheet-signature-name">{textValue(data.profissional.nome, 'Profissional responsável')}</div>
            <div className="patient-sheet-signature-meta">
              {textValue(data.profissional.cargo)} • {textValue(data.profissional.registro)}
            </div>
          </section>
        </>
      ) : null}

      <footer className="patient-sheet-footer">
        <span>{textValue(institutionalConfig.linha1, 'Secretaria Municipal de Saúde de Oriximiná')}</span>
        <span>{textValue(institutionalConfig.rodapeTexto, 'Documento institucional')}</span>
        <span>{formatDateTime(generatedAt)}</span>
      </footer>
    </article>
  );
};

export default PacienteFichaDocument;
