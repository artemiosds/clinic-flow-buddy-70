
import { Paciente } from "@/types";

export type PendenciaTipo = 
  | "sem_cpf" 
  | "sem_cns" 
  | "sem_endereco" 
  | "sem_telefone" 
  | "sem_nascimento" 
  | "sem_sexo" 
  | "sem_mae" 
  | "sem_municipio" 
  | "sem_unidade" 
  | "sem_raca" 
  | "sem_nacionalidade"
  | "sem_tipo_logradouro"
  | "sem_bairro";

export interface PendenciaResultado {
  pendencias: PendenciaTipo[];
  score: number; // 0 to 100
  status: "completo" | "incompleto" | "critico";
  labels: string[];
}

export function calcularPendenciasPaciente(p: any): PendenciaResultado {
  const pendencias: PendenciaTipo[] = [];
  const cd = p.custom_data || p.customData || {};
  
  if (!p.cpf || p.cpf.replace(/\D/g, '').length !== 11) pendencias.push("sem_cpf");
  if (!p.cns || p.cns.replace(/\D/g, '').length !== 15) pendencias.push("sem_cns");
  if (!p.data_nascimento && !p.dataNascimento) pendencias.push("sem_nascimento");
  if (!p.telefone || p.telefone.replace(/\D/g, '').length < 10) pendencias.push("sem_telefone");
  if (!p.nome_mae && !p.nomeMae) pendencias.push("sem_mae");
  
  // Sexo can be in p or custom_data
  const sexo = p.sexo || cd.sexo;
  if (!sexo) pendencias.push("sem_sexo");
  
  // Endereço
  if (!p.endereco && !cd.logradouro) pendencias.push("sem_endereco");
  if (!cd.bairro && !p.bairro) pendencias.push("sem_bairro");
  if (!cd.tipo_logradouro && !cd.tipoLogradouro && !p.tipo_logradouro) pendencias.push("sem_tipo_logradouro");
  
  const municipio = p.municipio || cd.municipio;
  if (!municipio) pendencias.push("sem_municipio");
  
  if (!p.unidade_id && !p.unidadeId) pendencias.push("sem_unidade");
  
  // SUS specific
  if (!cd.raca_cor && !cd.racaCor && !p.raca_cor) pendencias.push("sem_raca");
  if (!cd.nacionalidade && !p.nacionalidade) pendencias.push("sem_nacionalidade");


  const totalFields = 12; // Adjusted weighted score target
  const missingCount = pendencias.length;
  const score = Math.max(0, Math.min(100, Math.round(((totalFields - missingCount) / totalFields) * 100)));

  const labelsMap: Record<PendenciaTipo, string> = {
    sem_cpf: "Falta CPF",
    sem_cns: "Falta CNS",
    sem_endereco: "Falta Endereço",
    sem_telefone: "Falta Telefone",
    sem_nascimento: "Falta Data Nasc.",
    sem_sexo: "Falta Sexo",
    sem_mae: "Falta Nome da Mãe",
    sem_municipio: "Falta Município",
    sem_unidade: "Sem Unidade",
    sem_raca: "Falta Raça/Cor",
    sem_nacionalidade: "Falta Nacionalidade",
    sem_tipo_logradouro: "Falta Tipo Logradouro",
    sem_bairro: "Falta Bairro"
  };

  return {
    pendencias,
    score,
    status: score === 100 ? "completo" : score > 70 ? "incompleto" : "critico",
    labels: pendencias.map(p => labelsMap[p])
  };
}
