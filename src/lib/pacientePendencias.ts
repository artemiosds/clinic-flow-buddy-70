

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
  | "sem_bairro"
  | "sem_bpa";

export interface PendenciaResultado {
  pendencias: PendenciaTipo[];
  score: number; // 0 to 100
  status: "completo" | "parcial" | "pendente";
  labels: string[];
}

export function calcularPendenciasPaciente(p: any): PendenciaResultado {
  const pendencias: PendenciaTipo[] = [];
  const cd = p.custom_data || p.customData || {};
  
  // Regras de negócio essenciais para atualização cadastral e BPA/SUS
  if (!p.cpf || p.cpf.replace(/\D/g, '').length !== 11) pendencias.push("sem_cpf");
  if (!p.cns || p.cns.replace(/\D/g, '').length !== 15) pendencias.push("sem_cns");
  if (!p.data_nascimento && !p.dataNascimento) pendencias.push("sem_nascimento");
  if (!p.telefone || p.telefone.replace(/\D/g, '').length < 10) pendencias.push("sem_telefone");
  if (!p.nome_mae && !p.nomeMae) pendencias.push("sem_mae");
  
  // Sexo can be in p or custom_data
  const sexo = p.sexo || cd.sexo;
  if (!sexo) pendencias.push("sem_sexo");
  
  // Endereço (Prioridade DNE/Campos específicos)
  const temEndereco = (p.endereco || cd.logradouro) && (cd.bairro || p.bairro) && (p.municipio || cd.municipio);
  if (!temEndereco) {
    if (!p.endereco && !cd.logradouro) pendencias.push("sem_endereco");
    if (!cd.bairro && !p.bairro) pendencias.push("sem_bairro");
    const municipio = p.municipio || cd.municipio;
    if (!municipio) pendencias.push("sem_municipio");
  }
  
  // Unidade removida das pendências principais (agora apenas opcional/administrativa)
  // if (!p.unidade_id && !p.unidadeId) pendencias.push("sem_unidade");
  
  // SUS specific
  if (!cd.raca_cor && !cd.racaCor && !p.raca_cor) pendencias.push("sem_raca");
  
  // Lógica de Pendente BPA (CPF, CNS, Mãe, Nascimento, Sexo, Raça são críticos para BPA)
  const faltaEssencialBPA = !p.cpf || !p.cns || (!p.nome_mae && !p.nomeMae) || (!p.data_nascimento && !p.dataNascimento) || !sexo || (!cd.raca_cor && !p.raca_cor);
  if (faltaEssencialBPA) {
    pendencias.push("sem_bpa");
  }

  // Score ponderado focado no essencial
  const criticalFields = 7; // CPF, CNS, Nasc, Mae, Sexo, Endereco, Raca
  const missingCritical = pendencias.filter(pt => 
    ["sem_cpf", "sem_cns", "sem_nascimento", "sem_mae", "sem_sexo", "sem_endereco", "sem_raca"].includes(pt)
  ).length;
  
  const score = Math.max(0, Math.min(100, Math.round(((criticalFields - missingCritical) / criticalFields) * 100)));

  const labelsMap: Record<PendenciaTipo, string> = {
    sem_cpf: "CPF",
    sem_cns: "CNS",
    sem_endereco: "Endereço",
    sem_telefone: "Telefone",
    sem_nascimento: "Nascimento",
    sem_sexo: "Sexo",
    sem_mae: "Nome da Mãe",
    sem_municipio: "Município",
    sem_unidade: "Unidade",
    sem_raca: "Raça/Cor",
    sem_nacionalidade: "Nacionalidade",
    sem_tipo_logradouro: "Logradouro",
    sem_bairro: "Bairro",
    sem_bpa: "Pendente BPA"
  };

  return {
    pendencias,
    score,
    status: score === 100 ? "completo" : score >= 50 ? "parcial" : "pendente",
    labels: pendencias.filter(pt => pt !== "sem_bpa").map(pt => labelsMap[pt])
  };
}
