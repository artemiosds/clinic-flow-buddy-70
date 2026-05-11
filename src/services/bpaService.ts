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
}

export interface LinhaBPA {
  key: string;                // prontuario_id + proc_id
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
  fonte_procedimento: "prontuario" | "pts" | "tratamento";
  fonte_cid?: "prontuario" | "pts" | "atendimento";
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
}

export interface BpaValidation {
  isValid: boolean;
  errors: string[];
}

export const isCboMedico = (cbo: string) => {
  const c = (cbo || '').replace(/\D/g, '');
  return c.startsWith('225') || c.startsWith('2231'); // Médicos
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
  
  const isMed = isCboMedico(cbo);
  if (!isMed) {
    if (!sigtap) {
      errors.push('Procedimento: Código SIGTAP ausente');
    } else if (sigtap.length !== 10) {
      errors.push(`Procedimento: SIGTAP deve ter 10 dígitos (atual: ${sigtap})`);
    }
  } else {
    // Para médicos, se tiver SIGTAP, valida. Se não tiver, o backend usará 0301010072
    if (sigtap && sigtap.length !== 10) {
      errors.push(`Procedimento: SIGTAP deve ter 10 dígitos (atual: ${sigtap})`);
    }
  }

  // Validação de CID se o procedimento exigir (lógica simplificada: se tiver campo CID na linha mas estiver vazio)
  // Nota: Alguns procedimentos exigem CID no BPA-I. Por enquanto validamos se está presente se informado.
  if (line.cid && line.cid.length < 3) {
    errors.push('Procedimento: CID informado é inválido');
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

  return {
    id: raw.id,
    data: raw.data_atendimento || raw.data,
    paciente_id: raw.paciente_id,
    paciente_nome: raw.paciente_nome,
    profissional_id: raw.profissional_id,
    profissional_nome: raw.profissional_nome,
    unidade_id: raw.unidade_id,
    unidade_nome: raw.unidade_nome,
    cnes_unidade: (unitCd.cnes || '').replace(/\D/g, '').slice(0, 7),
    cbo_profissional: (profCd.cbo_codigo || '').replace(/\D/g, '').slice(0, 6),
    cns_profissional: (profCd.cns || '').replace(/\D/g, '').slice(0, 15),
    procedimento_id: raw.procedimento_id || '',
    procedimento_nome: raw.procedimento_nome || (isCboMedico(profCd.cbo_codigo) ? 'Consulta Médica' : '—'),
    codigo_sigtap: (raw.codigo_sigtap || '').replace(/\D/g, '').length === 10 ? raw.codigo_sigtap : (isCboMedico(profCd.cbo_codigo) ? '0301010072' : ''),
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
    cid: (raw.cid || cd.cid || '').replace(/[^A-Z0-9]/g, '').slice(0, 4),
    autorizacao: (cd.numero_autorizacao || '').replace(/[^A-Z0-9]/g, '').slice(0, 13),
    fonte_procedimento: raw.fonte_procedimento,
    fonte_cid: raw.fonte_cid,
  };
};

/**
 * Exporta os dados para XLSX no formato de conferência BPA-I
 */
export const exportBpaToXlsx = (lines: BpaLine[], competencia: string) => {
  const data = lines.map(l => {
    const v = validateBpaLine(l);
    return {
      'STATUS': v.isValid ? 'OK' : 'PENDENTE',
      'PENDÊNCIAS': v.errors.join('; '),
      'FONTE PROC': l.fonte_procedimento,
      'FONTE CID': l.fonte_cid || '—',
      'DATA ATENDIMENTO': l.data,
      'PACIENTE': l.paciente_nome,
      'CNS PACIENTE': l.paciente_cns,
      'CPF PACIENTE': l.paciente_cpf,
      'NASCIMENTO': l.paciente_nascimento,
      'SEXO': l.paciente_sexo,
      'MUNICIPIO IBGE': l.paciente_municipio_ibge,
      'PROCEDIMENTO': l.procedimento_nome,
      'SIGTAP': l.codigo_sigtap,
      'PROFISSIONAL': l.profissional_nome,
      'CBO': l.cbo_profissional,
      'CNS PROFISSIONAL': l.cns_profissional,
      'CNES UNIDADE': l.cnes_unidade,
      'UNIDADE': l.unidade_nome,
      'CARÁTER': l.carater_atendimento,
      'CID': l.cid,
      'AUTORIZAÇÃO': l.autorizacao,
      'PRONTUARIO_ID': l.id.split('_')[0], // Se id for composto
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produção BPA-I");

  // Ajusta largura das colunas
  const colWidths = [
    { wch: 10 }, { wch: 30 }, { wch: 15 }, { wch: 30 }, { wch: 15 },
    { wch: 12 }, { wch: 12 }, { wch: 6 }, { wch: 15 }, { wch: 30 },
    { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 15 }, { wch: 12 },
    { wch: 20 }, { wch: 8 }, { wch: 6 }, { wch: 15 }
  ];
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `CONFERENCIA_BPA_${competencia}.xlsx`);
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
