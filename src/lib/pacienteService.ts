import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "./phoneUtils";
import { unmaskCNS } from "./cnsUtils";
import { auditService } from "@/services/auditService";
import { isNetworkError } from "./utils";
import { enqueueOfflineMutation } from "./offline/offlineMutation";


/**
 * Função única e centralizada para atualizar o cadastro de um paciente.
 * Garante normalização de dados, integridade e sincronização de cache.
 */
export async function updatePacienteCadastro(
  pacienteId: string, 
  dados: any, 
  origem: string = "sistema"
) {
  if (!pacienteId) throw new Error("ID do paciente é obrigatório para atualização.");

  // 1. Normalização de identificação
  const cleanCPF = dados.cpf ? String(dados.cpf).replace(/\D/g, "") : undefined;
  const cleanCNS = dados.cns ? unmaskCNS(dados.cns) : undefined;
  const normalizedPhone = dados.telefone ? normalizePhone(dados.telefone) : undefined;
  const normalizedPhoneSec = dados.telefone_secundario ? normalizePhone(dados.telefone_secundario) : undefined;

  // 2. Montagem do payload principal (colunas da tabela)
  const updateData: any = {
    atualizado_em: new Date().toISOString(),
  };

  // Mapeamento obrigatório solicitado
  if (dados.nome !== undefined) updateData.nome = dados.nome || "";
  if (dados.nome_completo !== undefined) updateData.nome = dados.nome_completo || "";
  if (dados.nome_mae !== undefined) updateData.nome_mae = dados.nome_mae || "";
  if (dados.data_nascimento !== undefined) updateData.data_nascimento = dados.data_nascimento || "";
  if (dados.cpf !== undefined) updateData.cpf = cleanCPF || "";
  if (dados.cns !== undefined) updateData.cns = cleanCNS || "";
  if (dados.email !== undefined) updateData.email = (dados.email || "").toLowerCase();
  if (dados.telefone !== undefined) updateData.telefone = normalizedPhone || "";
  if (dados.telefone_principal !== undefined) updateData.telefone = normalizedPhone || "";
  
  // Novos campos que viraram colunas
  if (dados.sexo !== undefined) updateData.sexo = dados.sexo || "";
  if (dados.naturalidade !== undefined) updateData.naturalidade = dados.naturalidade || "";
  if (dados.nacionalidade !== undefined) updateData.nacionalidade = dados.nacionalidade || "Brasil";
  if (dados.raca_cor !== undefined) updateData.raca_cor = dados.raca_cor || "";
  if (dados.raca_cor_ibge !== undefined) updateData.raca_cor = dados.raca_cor_ibge || "";
  
  if (dados.cep !== undefined) updateData.cep = dados.cep || "";
  if (dados.tipo_logradouro !== undefined) updateData.tipo_logradouro = dados.tipo_logradouro || "";
  if (dados.logradouro !== undefined) updateData.endereco = dados.logradouro || updateData.endereco || "";
  if (dados.endereco !== undefined) updateData.endereco = dados.endereco || "";
  if (dados.numero !== undefined) updateData.numero = dados.numero || "";
  if (dados.complemento !== undefined) updateData.complemento = dados.complemento || "";
  if (dados.bairro !== undefined) updateData.bairro = dados.bairro || "";
  if (dados.municipio !== undefined) updateData.municipio = dados.municipio || "";
  if (dados.uf !== undefined) updateData.uf = dados.uf || "";
  if (dados.telefone_secundario !== undefined) updateData.telefone_secundario = normalizedPhoneSec || "";
  if (dados.unidade_id !== undefined) updateData.unidade_id = dados.unidade_id || "";
  if (dados.observacoes !== undefined) updateData.observacoes = dados.observacoes || "";
  
  // Novos campos SUS
  if (dados.situacao_rua !== undefined) updateData.situacao_rua = !!dados.situacao_rua;
  if (dados.etnia !== undefined) updateData.etnia = dados.etnia || "";
  if (dados.etnia_outra !== undefined) updateData.etnia_outra = dados.etnia_outra || "";
  if (dados.pais_nascimento !== undefined) updateData.pais_nascimento = dados.pais_nascimento || "";
  if (dados.tipo_logradouro_codigo !== undefined) updateData.tipo_logradouro_codigo = dados.tipo_logradouro_codigo || "";

  // Campos de Exceção Administrativa
  if (dados.is_tfd !== undefined) updateData.is_tfd = !!dados.is_tfd;
  if (dados.possui_ordem_judicial !== undefined) updateData.possui_ordem_judicial = !!dados.possui_ordem_judicial;
  if (dados.motivo_excecao_bloqueio !== undefined) updateData.motivo_excecao_bloqueio = dados.motivo_excecao_bloqueio || "";
  if (dados.observacao_tfd_ordem_judicial !== undefined) updateData.observacao_tfd_ordem_judicial = dados.observacao_tfd_ordem_judicial || "";
  if (dados.data_marcacao_excecao !== undefined) updateData.data_marcacao_excecao = dados.data_marcacao_excecao || null;
  if (dados.marcado_por !== undefined) updateData.marcado_por = dados.marcado_por || null;



  // 4. Preservar custom_data e buscar dados para auditoria
  const { data: currentPatient } = await supabase
    .from("pacientes")
    .select("*")
    .eq("id", pacienteId)
    .single();

  const currentCD = (currentPatient?.custom_data as any) || {};
  
  // Sincronizamos os campos principais no custom_data também por precaução
  const newCD = {
    ...currentCD,
    ...(dados.custom_data || {}),
    sexo: updateData.sexo !== undefined ? updateData.sexo : (currentCD.sexo || ""),
    raca_cor: updateData.raca_cor !== undefined ? updateData.raca_cor : (currentCD.raca_cor || ""),
    nacionalidade: updateData.nacionalidade !== undefined ? updateData.nacionalidade : (currentCD.nacionalidade || "Brasil"),
    naturalidade: updateData.naturalidade !== undefined ? updateData.naturalidade : (currentCD.naturalidade || ""),
    cep: updateData.cep !== undefined ? updateData.cep : (currentCD.cep || ""),
    bairro: updateData.bairro !== undefined ? updateData.bairro : (currentCD.bairro || ""),
    logradouro: updateData.endereco !== undefined ? updateData.endereco : (currentCD.logradouro || ""),
    numero: updateData.numero !== undefined ? updateData.numero : (currentCD.numero || ""),
    complemento: updateData.complemento !== undefined ? updateData.complemento : (currentCD.complemento || ""),
    municipio: updateData.municipio !== undefined ? updateData.municipio : (currentCD.municipio || ""),
    uf: updateData.uf !== undefined ? updateData.uf : (currentCD.uf || ""),
    tipo_logradouro: updateData.tipo_logradouro !== undefined ? updateData.tipo_logradouro : (currentCD.tipo_logradouro || ""),
    telefone_secundario: updateData.telefone_secundario !== undefined ? updateData.telefone_secundario : (currentCD.telefone_secundario || ""),
  };

  updateData.custom_data = newCD;

  // 5. Execução do Update Local-First
  const clientOpId = (dados as any).client_operation_id || (dados as any).id_operacao_cliente || null;
  
  return await enqueueOfflineMutation("UPDATE", updateData, {
    table: "pacientes",
    lookupField: "id",
    lookupValue: pacienteId,
    onSuccess: async (res) => {
      // Auditoria de sucesso (opcional, pode ser feita no worker ou aqui)
      await auditService.log({
        acao: "edicao_paciente",
        entidade: "paciente",
        entidadeId: pacienteId,
        entidadeNome: dados.nome || currentPatient?.nome,
        modulo: "pacientes",
        before: currentPatient,
        after: { ...currentPatient, ...updateData },
        pacienteId,
        origem
      });

      // Recalcular status de falta após alteração de exceção
      if (updateData.is_tfd !== undefined || updateData.possui_ordem_judicial !== undefined) {
        if (navigator.onLine) {
          await supabase.rpc('recalcular_status_falta_paciente', { p_paciente_id: pacienteId });
        }
      }
    }
  });
}

