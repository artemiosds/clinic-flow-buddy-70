import { supabase } from '@/integrations/supabase/client';
import { normalizePhone } from './phoneUtils';
import { unmaskCNS } from './cnsUtils';

/**
 * Normaliza e valida os dados de um paciente seguindo o padrão oficial.
 */
export function normalizePacientePayload(dados: any) {
  const cleanCPF = dados.cpf ? String(dados.cpf).replace(/\D/g, "") : "";
  const cleanCNS = dados.cns ? unmaskCNS(dados.cns) : "";
  const normalizedPhone = dados.telefone ? normalizePhone(dados.telefone) : "";
  const normalizedPhoneSec = dados.telefone_secundario ? normalizePhone(dados.telefone_secundario) : "";

  const payload: any = {
    nome: (dados.nome || "").toUpperCase(),
    nome_mae: (dados.nome_mae || "").toUpperCase(),
    data_nascimento: dados.data_nascimento || null,
    cpf: cleanCPF,
    cns: cleanCNS,
    telefone: normalizedPhone,
    email: (dados.email || "").toLowerCase(),
    sexo: dados.sexo || "I",
    naturalidade: (dados.naturalidade || "").toUpperCase(),
    nacionalidade: dados.nacionalidade || "Brasileira",
    raca_cor: dados.raca_cor || "nao_declarado",
    cep: (dados.cep || "").replace(/\D/g, ""),
    tipo_logradouro: dados.tipo_logradouro || "",
    endereco: (dados.endereco || dados.logradouro || "").toUpperCase(),
    numero: dados.numero || "",
    complemento: (dados.complemento || "").toUpperCase(),
    bairro: (dados.bairro || "").toUpperCase(),
    municipio: (dados.municipio || "Oriximiná").toUpperCase(),
    uf: (dados.uf || "PA").toUpperCase(),
    telefone_secundario: normalizedPhoneSec,
    menor_idade: !!dados.menor_idade,
    nome_responsavel: (dados.nome_responsavel || "").toUpperCase(),
    cpf_responsavel: (dados.cpf_responsavel || "").replace(/\D/g, ""),
    situacao_rua: !!dados.situacao_rua,
    pais_nascimento: dados.pais_nascimento || "Brasil",
    unidade_id: dados.unidade_id || null,
    atualizado_em: new Date().toISOString(),
  };

  // Sincronizar custom_data
  payload.custom_data = {
    ...(dados.custom_data || {}),
    sexo: payload.sexo,
    raca_cor: payload.raca_cor,
    nacionalidade: payload.nacionalidade,
    naturalidade: payload.naturalidade,
    cep: payload.cep,
    bairro: payload.bairro,
    logradouro: payload.endereco,
    numero: payload.numero,
    complemento: payload.complemento,
    municipio: payload.municipio,
    uf: payload.uf,
    tipo_logradouro: payload.tipo_logradouro,
    telefone_secundario: payload.telefone_secundario,
    situacao_rua: payload.situacao_rua,
  };

  return payload;
}

/**
 * Cria ou atualiza um paciente no banco de dados.
 */
export async function savePacienteCadastro(dados: any, id?: string) {
  const payload = normalizePacientePayload(dados);
  
  if (id) {
    const { data, error } = await supabase
      .from("pacientes")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    // Verificar duplicidade básica
    if (payload.cpf) {
      const { data: existing } = await supabase
        .from("pacientes")
        .select("id")
        .eq("cpf", payload.cpf)
        .maybeSingle();
      if (existing) throw new Error("Já existe um paciente cadastrado com este CPF.");
    }

    const newId = `pac_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const { data, error } = await supabase
      .from("pacientes")
      .insert([{ ...payload, id: newId }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
