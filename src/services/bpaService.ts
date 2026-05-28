import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from 'xlsx';

export interface ProntuarioRow {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  data_atendimento: string;
  unidade_id: string;
  custom_data?: any;
}

export interface LinhaBPA {
  key: string;                // identificador único da linha
  prontuario_id?: string;
  pts_id?: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  data: string;
  procedimento_nome: string;
  codigo_sigtap: string;
  cid?: string;
  fonte_procedimento: "prontuario" | "pts" | "paciente" | "tratamento" | "outro_prontuario_mesmo_paciente" | "historico_paciente";
  fonte_cid?: "prontuario" | "pts" | "atendimento" | "paciente" | "outro_prontuario_mesmo_paciente" | "historico_paciente";
}

export interface ValidationFlags {
  identificacao: boolean;  // CNS (15) OU CPF (11)
  cbo: boolean;            // CBO obrigatório
  sigtap: boolean;         // SIGTAP só obrigatório p/ não-médicos
  nome: boolean;           // Nome paciente
  dataNasc: boolean;       // Data nascimento
}

export interface BpaLine {
  id: string;
  data: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  unidade_nome: string;
  cnes_unidade: string;
  cbo_profissional: string;
  cns_profissional: string;
  procedimento_id: string;
  procedimento_nome: string;
  codigo_sigtap: string;
  paciente_cns: string;
  paciente_cpf: string;
  paciente_nascimento: string;
  paciente_sexo: string;
  paciente_municipio_ibge: string;
  paciente_municipio_nome: string;
  paciente_raca: string;
  paciente_nacionalidade: string;
  paciente_etnia: string;
  carater_atendimento: string;
  cid: string;
  autorizacao: string;
  fonte_procedimento?: string;
  fonte_cid?: string;
  // Novos campos para controle médico
  profissao_profissional?: string;
  is_medico?: boolean;
  procedimento_dispensa_motivo?: string;
  cid_dispensa_motivo?: string;
}

export interface BpaValidation {
  isValid: boolean;
  errors: string[];
}

export const isCboMedico = (cbo: string) => {
  const c = (cbo || '').replace(/\D/g, '');
  return c.startsWith('225') || c.startsWith('2231'); // Médicos
};

export const isProfissionalMedico = (profData: any): boolean => {
  if (!profData) return false;
  
  // 1. Verificar CBO primeiro
  const cbo = (profData.cbo_codigo || profData.cbo || '').replace(/\D/g, '');
  if (isCboMedico(cbo)) return true;

  // 2. Normalizar e verificar campos de texto
  const normalize = (val: any) => {
    if (!val || typeof val !== 'string') return '';
    return val
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .trim();
  };

  const keywords = ['medico', 'medica'];
  
  // Campos a verificar
  const valuesToCheck = [
    profData.profissao,
    profData.profissao_profissional,
    profData.cargo,
    profData.funcao,
    profData.especialidade,
    profData.custom_data?.profissao,
    profData.custom_data?.cargo,
    profData.custom_data?.funcao,
    profData.custom_data?.carimbo?.profissao
  ];

  return valuesToCheck.some(val => {
    const normalized = normalize(val);
    return keywords.some(k => normalized.includes(k));
  });
};


/**
 * Valida uma linha de produção BPA-I
 */
export const validateBpaLine = (line: BpaLine): BpaValidation => {
  const errors: string[] = [];
  
  const cns = (line.paciente_cns || '').replace(/\D/g, '');
  const cpf = (line.paciente_cpf || '').replace(/\D/g, '');
  const cbo = (line.cbo_profissional || '').replace(/\D/g, '');
  const sigtap = (line.codigo_sigtap || '').replace(/\D/g, '');
  const cnes = (line.cnes_unidade || '').replace(/\D/g, '');
  
  if (!line.paciente_nome?.trim() || line.paciente_nome.length < 3) errors.push('Paciente: Nome ausente ou muito curto');
  if (!line.paciente_nascimento) errors.push('Paciente: Data de nascimento ausente');
  
  if (cns.length !== 15 && cpf.length !== 11) {
    errors.push('Paciente: CNS (15 dgt) ou CPF (11 dgt) obrigatório');
  }
  
  if (!line.paciente_sexo || (line.paciente_sexo !== 'M' && line.paciente_sexo !== 'F')) {
    errors.push('Paciente: Sexo (M/F) inválido ou ausente');
  }
  
  if (!line.paciente_municipio_ibge || line.paciente_municipio_ibge.length < 6) {
    errors.push('Paciente: Código IBGE do município ausente ou inválido');
  }

  if (!cbo) {
    errors.push('Profissional: CBO não cadastrado');
  } else if (cbo.length !== 6) {
    errors.push(`Profissional: CBO deve ter 6 dígitos (atual: ${cbo})`);
  }

  if (!cnes) {
    errors.push('Unidade: Sem CNES cadastrado');
  } else if (cnes.length !== 7) {
    errors.push(`Unidade: CNES deve ter 7 dígitos (atual: ${cnes})`);
  }
  
  const isMed = line.is_medico;
  
  if (!isMed) {
    if (!sigtap) {
      errors.push('Procedimento: Código SIGTAP ausente');
    } else if (sigtap.length !== 10) {
      errors.push(`Procedimento: SIGTAP deve ter 10 dígitos (atual: ${sigtap})`);
    }

    if (!line.cid || line.cid.length < 3) {
      errors.push('Procedimento: CID obrigatório não informado');
    }
  } else {
    // Para médicos, se tiver SIGTAP, valida o tamanho se preenchido.
    if (sigtap && sigtap.length !== 10) {
      errors.push(`Procedimento: SIGTAP deve ter 10 dígitos (atual: ${sigtap})`);
    }
    // CID opcional para médicos
    if (line.cid && line.cid.length < 3) {
      errors.push('Procedimento: CID informado é inválido');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};


/**
 * Normaliza os dados para o formato BPA
 */
export const normalizeBpaData = (raw: any): BpaLine => {
  const cd = raw.paciente_custom || {};
  const profCd = raw.profissional_custom || {};
  const unitCd = raw.unidade_custom || {};
  
  const sexoRaw = String(cd.sexo || raw.paciente_sexo || '').toUpperCase();
  let sexo = 'I';
  if (sexoRaw.startsWith('M')) sexo = 'M';
  else if (sexoRaw.startsWith('F')) sexo = 'F';

  const isMed = isProfissionalMedico(profCd);
  const sigtapFinal = (raw.codigo_sigtap || '').replace(/\D/g, '');
  const cidFinal = (raw.cid || cd.cid || '').replace(/[^A-Z0-9]/g, '').slice(0, 4);

  return {
    id: raw.id || raw.key || raw.prontuario_id || 'unknown',
    data: raw.data_atendimento || raw.data,
    paciente_id: raw.paciente_id,
    paciente_nome: raw.paciente_nome,
    profissional_id: raw.profissional_id,
    profissional_nome: raw.profissional_nome,
    unidade_id: raw.unidade_id,
    unidade_nome: raw.unidade_nome,
    cnes_unidade: (unitCd.cnes || '').replace(/\D/g, '').slice(0, 7),
    cbo_profissional: (profCd.cbo_codigo || profCd.cbo || '').replace(/\D/g, '').slice(0, 6),
    cns_profissional: (profCd.cns || '').replace(/\D/g, '').slice(0, 15),
    procedimento_id: raw.procedimento_id || '',
    procedimento_nome: raw.procedimento_nome || (isMed ? 'Consulta Médica' : '—'),
    codigo_sigtap: sigtapFinal.length === 10 ? sigtapFinal : (isMed ? '0301010072' : ''),
    paciente_cns: (raw.paciente_cns || '').replace(/\D/g, ''),
    paciente_cpf: (raw.paciente_cpf || '').replace(/\D/g, ''),
    paciente_nascimento: raw.paciente_nascimento,
    paciente_sexo: sexo,
    paciente_municipio_ibge: (cd.municipio_ibge || cd.codigo_ibge_municipio || '').replace(/\D/g, ''),
    paciente_municipio_nome: raw.paciente_municipio || 'Oriximiná',
    paciente_raca: cd.raca_cor || cd.racaCor || '99',
    paciente_nacionalidade: cd.nacionalidade_codigo || '010',
    paciente_etnia: (cd.etnia_codigo || '').replace(/\D/g, ''),
    carater_atendimento: cd.carater_atendimento || '01',
    cid: cidFinal,
    autorizacao: (cd.numero_autorizacao || '').replace(/[^A-Z0-9]/g, '').slice(0, 13),
    fonte_procedimento: raw.fonte_procedimento,
    fonte_cid: raw.fonte_cid,
    // Novos campos
    is_medico: isMed,
    profissao_profissional: profCd.profissao || profCd.cargo || profCd.funcao || '—',
    procedimento_dispensa_motivo: isMed && !sigtapFinal ? 'Dispensado para profissão médica' : undefined,
    cid_dispensa_motivo: isMed && !cidFinal ? 'Dispensado para profissão médica' : undefined,
  };
};

/**
 * Exporta os dados para XLSX no formato de conferência BPA-I profissional e organizado
 */
export const exportBpaToXlsx = (lines: BpaLine[], competencia: string) => {
  // 1. Dados Detalhados
  const detailedData = lines.map(l => {
    const v = validateBpaLine(l);
    return {
      'STATUS': v.isValid ? '✅ OK' : '⚠️ PENDENTE',
      'PENDÊNCIAS / ALERTAS': v.errors.join('; ') || 'Nenhuma pendência',
      'FONTE PROCEDIMENTO': l.fonte_procedimento?.toUpperCase() || 'N/A',
      'FONTE CID': l.fonte_cid?.toUpperCase() || '—',
      'DATA ATENDIMENTO': l.data ? new Date(l.data).toLocaleDateString('pt-BR') : '—',
      'PACIENTE': l.paciente_nome?.toUpperCase(),
      'CNS PACIENTE': l.paciente_cns || '—',
      'CPF PACIENTE': l.paciente_cpf || '—',
      'NASCIMENTO': l.paciente_nascimento ? new Date(l.paciente_nascimento).toLocaleDateString('pt-BR') : '—',
      'SEXO': l.paciente_sexo,
      'CÓDIGO IBGE (MUNICÍPIO)': l.paciente_municipio_ibge || '—',
      'PROFISSIONAL': l.profissional_nome?.toUpperCase(),
      'VÍNCULO / PROFISSÃO': l.profissao_profissional?.toUpperCase(),
      'CBO': l.cbo_profissional,
      'CATEGORIA MÉDICA': l.is_medico ? 'SIM' : 'NÃO',
      'PROCEDIMENTO': l.procedimento_nome?.toUpperCase(),
      'CÓDIGO SIGTAP': l.codigo_sigtap,
      'MOTIVO DISPENSA PROC.': l.procedimento_dispensa_motivo || '—',
      'CID': l.cid?.toUpperCase() || '—',
      'MOTIVO DISPENSA CID': l.cid_dispensa_motivo || '—',
      'CNES UNIDADE': l.cnes_unidade,
      'UNIDADE EXECUTORA': l.unidade_nome?.toUpperCase(),
      'ID REGISTRO': (l.id || '').split('_')[0] || '—', 
    };
  });

  // 2. Dados de Resumo (Stats)
  const total = lines.length;
  const validos = lines.filter(l => validateBpaLine(l).isValid).length;
  const pendentes = total - validos;
  
  const summaryData = [
    { 'MÉTRICA': 'Competência', 'VALOR': competencia },
    { 'MÉTRICA': 'Total de Registros', 'VALOR': total },
    { 'MÉTRICA': 'Registros Válidos', 'VALOR': validos },
    { 'MÉTRICA': 'Registros com Pendência', 'VALOR': pendentes },
    { 'MÉTRICA': 'Aproveitamento', 'VALOR': total > 0 ? `${((validos/total)*100).toFixed(1)}%` : '0%' },
    {},
    { 'MÉTRICA': 'Data da Exportação', 'VALOR': new Date().toLocaleString('pt-BR') }
  ];

  // Criar Workbook
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: Detalhes
  const wsDetailed = XLSX.utils.json_to_sheet(detailedData);
  XLSX.utils.book_append_sheet(wb, wsDetailed, "Produção Detalhada");

  // Sheet 2: Resumo
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo Executivo");

  // Ajuste de colunas na aba detalhada
  const colWidths = [
    { wch: 12 }, // Status
    { wch: 45 }, // Pendências
    { wch: 20 }, // Fonte Proc
    { wch: 15 }, // Fonte CID
    { wch: 18 }, // Data
    { wch: 35 }, // Paciente
    { wch: 18 }, // CNS
    { wch: 18 }, // CPF
    { wch: 15 }, // Nascimento
    { wch: 8 },  // Sexo
    { wch: 20 }, // IBGE
    { wch: 30 }, // Profissional
    { wch: 25 }, // Profissão
    { wch: 10 }, // CBO
    { wch: 18 }, // Categoria Médica
    { wch: 40 }, // Procedimento
    { wch: 15 }, // SIGTAP
    { wch: 30 }, // Dispensa Proc
    { wch: 8 },  // CID
    { wch: 30 }, // Dispensa CID
    { wch: 15 }, // CNES
    { wch: 30 }, // Unidade
    { wch: 15 }  // ID
  ];
  wsDetailed['!cols'] = colWidths;

  // Ajuste de colunas na aba resumo
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 25 }];

  // Gerar arquivo
  const filename = `PRODUCAO_BPA_${competencia}_${new Date().getTime()}.xlsx`;
  XLSX.writeFile(wb, filename);
};


/**
 * Chama a Edge Function para gerar o TXT final
 */
export const generateBpaTxt = async (competencia: string, unidadeId: string, cnes: string) => {
  const { data, error } = await supabase.functions.invoke('generate-bpa', {
    body: { competencia, unidade_id: unidadeId, cnes },
  });
  
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  const blob = new Blob([data.conteudo], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = data.filename || `BPA_${competencia}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return data;
};
