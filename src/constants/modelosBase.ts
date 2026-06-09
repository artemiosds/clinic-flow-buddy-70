
export interface BaseTemplate {
  tipo: string;
  nome: string;
  conteudo: string;
  perfis_permitidos: string[];
  variaveis: string[];
  campos_manuais?: string[];
}

export const MODELOS_BASE: BaseTemplate[] = [
  {
    tipo: 'Declaração de Comparecimento',
    nome: 'Declaração de Comparecimento Padrão',
    variaveis: ['nome_paciente', 'cpf', 'cns', 'data_atendimento', 'horario_entrada', 'horario_saida', 'unidade', 'profissional', 'finalidade'],
    campos_manuais: ['horario_entrada', 'horario_saida', 'finalidade'],
    perfis_permitidos: ['master', 'recepcao', 'profissional', 'avaliacao_enfermagem'],
    conteudo: `
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 30px;">DECLARAÇÃO DE COMPARECIMENTO</h1>
      <p style="text-align: justify; line-height: 1.8;">
        Declaramos para os devidos fins que o(a) Sr(a). <strong>{{nome_paciente}}</strong>, inscrito(a) no CPF sob nº <strong>{{cpf}}</strong> e CNS nº <strong>{{cns}}</strong>, compareceu a esta unidade de saúde <strong>{{unidade}}</strong> no dia <strong>{{data_atendimento}}</strong>, permanecendo em atendimento no período das <strong>{{horario_entrada}}</strong> às <strong>{{horario_saida}}</strong>, para fins de <strong>{{finalidade}}</strong>.
      </p>
      <p style="text-align: justify; line-height: 1.8; margin-top: 15px;">
        Por ser verdade, firmo a presente.
      </p>
      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{carimbo_profissional}}
      </div>
    `
  },
  {
    tipo: 'Declaração de Acompanhante',
    nome: 'Declaração de Acompanhante Padrão',
    variaveis: ['nome_paciente', 'cpf', 'cns', 'nome_acompanhante', 'cpf_acompanhante', 'data_atendimento', 'horario_entrada', 'horario_saida', 'unidade', 'profissional'],
    campos_manuais: ['nome_acompanhante', 'cpf_acompanhante', 'horario_entrada', 'horario_saida'],
    perfis_permitidos: ['master', 'recepcao', 'profissional', 'avaliacao_enfermagem'],
    conteudo: `
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 30px;">DECLARAÇÃO DE ACOMPANHANTE</h1>
      <p style="text-align: justify; line-height: 1.8;">
        Declaramos para os devidos fins que o(a) Sr(a). <strong>{{nome_acompanhante}}</strong>, inscrito(a) no CPF sob nº <strong>{{cpf_acompanhante}}</strong>, permaneceu nesta unidade de saúde <strong>{{unidade}}</strong> na data de <strong>{{data_atendimento}}</strong>, no período das <strong>{{horario_entrada}}</strong> às <strong>{{horario_saida}}</strong>, na condição de acompanhante do(a) paciente <strong>{{nome_paciente}}</strong>, inscrito(a) no CPF sob nº <strong>{{cpf}}</strong>.
      </p>
      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{carimbo_profissional}}
      </div>
    `
  },
  {
    tipo: 'Atestado Médico',
    nome: 'Atestado Médico Padrão',
    variaveis: ['nome_paciente', 'cpf', 'cns', 'data_atendimento', 'dias_afastamento', 'data_inicio', 'data_fim', 'cid', 'profissional', 'conselho', 'numero_conselho'],
    campos_manuais: ['dias_afastamento', 'data_inicio', 'data_fim', 'cid', 'observacoes'],
    perfis_permitidos: ['master', 'profissional'],
    conteudo: `
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 30px;">ATESTADO MÉDICO</h1>
      <p style="text-align: justify; line-height: 1.8;">
        Atesto, para os devidos fins, que o(a) Sr(a). <strong>{{nome_paciente}}</strong>, portador(a) do CPF nº <strong>{{cpf}}</strong>, foi atendido(a) nesta unidade de saúde na data de <strong>{{data_atendimento}}</strong> e necessita de <strong>{{dias_afastamento}}</strong> dia(s) de afastamento de suas atividades, a contar de <strong>{{data_inicio}}</strong>.
      </p>
      <p style="text-align: justify; line-height: 1.8;">
        <strong>Diagnóstico (CID):</strong> {{cid}}
      </p>
      <p style="text-align: justify; line-height: 1.8;">
        <strong>Observações:</strong> {{observacoes}}
      </p>
      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{carimbo_profissional}}
      </div>
    `
  },
  {
    tipo: 'Receituário',
    nome: 'Receituário Padrão',
    variaveis: ['nome_paciente', 'cpf', 'medicamentos', 'orientacoes', 'validade', 'profissional', 'conselho', 'numero_conselho'],
    campos_manuais: ['medicamentos', 'orientacoes', 'validade_receita'],
    perfis_permitidos: ['master', 'profissional'],
    conteudo: `
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 20px;">RECEITUÁRIO</h1>
      <div style="border: 1px solid #eee; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <p><strong>Paciente:</strong> {{nome_paciente}}</p>
        <p><strong>CPF:</strong> {{cpf}}</p>
      </div>
      
      <div style="min-height: 350px;">
        <p style="font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 15px;">USO INTERNO / EXTERNO:</p>
        <div style="line-height: 1.6; white-space: pre-wrap;">{{medicamentos}}</div>
        
        <p style="font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 30px; margin-bottom: 10px;">ORIENTAÇÕES:</p>
        <div style="line-height: 1.6; white-space: pre-wrap;">{{orientacoes}}</div>
      </div>

      <p style="font-size: 11px; color: #666; margin-top: 20px; font-style: italic;">
        Esta receita tem validade de {{validade_receita}}.
      </p>

      <p style="text-align: right; margin-top: 40px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 60px; text-align: center;">
        {{carimbo_profissional}}
      </div>
    `
  },
  {
    tipo: 'Encaminhamento',
    nome: 'Encaminhamento Clínico Padrão',
    variaveis: ['nome_paciente', 'cpf', 'especialidade_destino', 'unidade_destino', 'motivo', 'resumo_clinico', 'prioridade', 'cid', 'profissional'],
    campos_manuais: ['especialidade_destino', 'unidade_destino', 'motivo', 'resumo_clinico', 'prioridade', 'cid'],
    perfis_permitidos: ['master', 'profissional', 'avaliacao_enfermagem'],
    conteudo: `
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 30px;">ENCAMINHAMENTO</h1>
      <div style="margin-bottom: 20px; background: #f9f9f9; padding: 15px; border-radius: 5px;">
        <p><strong>Para:</strong> {{especialidade_destino}}</p>
        <p><strong>Unidade de Destino:</strong> {{unidade_destino}}</p>
        <p><strong>Prioridade:</strong> {{prioridade}}</p>
      </div>
      
      <p style="margin-top: 20px; line-height: 1.6;">Encaminho o(a) paciente <strong>{{nome_paciente}}</strong>, inscrito(a) no CPF nº <strong>{{cpf}}</strong>, para vossa avaliação e conduta especializada.</p>
      
      <div style="margin-top: 20px; line-height: 1.6;">
        <p><strong>Motivo do Encaminhamento:</strong> {{motivo}}</p>
        <p><strong>Resumo Clínico / Hipótese Diagnóstica:</strong> {{resumo_clinico}}</p>
        <p><strong>CID:</strong> {{cid}}</p>
      </div>

      <p style="text-align: justify; margin-top: 20px;">Coloco-me à disposição para eventuais esclarecimentos.</p>

      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{carimbo_profissional}}
      </div>
    `
  },
  {
    tipo: 'Solicitação de Exames',
    nome: 'Solicitação de Exames Padrão',
    variaveis: ['nome_paciente', 'cpf', 'exames', 'justificativa', 'profissional'],
    campos_manuais: ['exames', 'justificativa'],
    perfis_permitidos: ['master', 'profissional'],
    conteudo: `
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 30px;">SOLICITAÇÃO DE EXAMES</h1>
      <p><strong>Paciente:</strong> {{nome_paciente}}</p>
      <p><strong>CPF:</strong> {{cpf}}</p>
      
      <div style="margin-top: 30px; min-height: 300px;">
        <p style="font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 5px;">EXAMES SOLICITADOS:</p>
        <div style="line-height: 1.8; white-space: pre-wrap; margin-top: 15px;">{{exames}}</div>
        
        <p style="font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 30px;">JUSTIFICATIVA CLÍNICA:</p>
        <p style="line-height: 1.6;">{{justificativa}}</p>
      </div>

      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{carimbo_profissional}}
      </div>
    `
  },
  {
    tipo: 'Relatório de Evolução Clínica',
    nome: 'Relatório de Evolução Padrão',
    variaveis: ['nome_paciente', 'cpf', 'data_atendimento', 'evolucao', 'conduta', 'profissional'],
    campos_manuais: ['evolucao', 'conduta'],
    perfis_permitidos: ['master', 'profissional', 'gestao'],
    conteudo: `
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 30px;">RELATÓRIO DE EVOLUÇÃO CLÍNICA</h1>
      <div style="margin-bottom: 20px;">
        <p><strong>Paciente:</strong> {{nome_paciente}} (CPF: {{cpf}})</p>
        <p><strong>Data de Referência:</strong> {{data_atendimento}}</p>
      </div>
      
      <div style="margin-top: 30px;">
        <h3 style="border-left: 4px solid #333; padding-left: 10px; font-size: 16px;">Evolução do Quadro:</h3>
        <p style="text-align: justify; line-height: 1.8; white-space: pre-wrap;">{{evolucao}}</p>
        
        <h3 style="border-left: 4px solid #333; padding-left: 10px; font-size: 16px; margin-top: 30px;">Conduta Terapêutica:</h3>
        <p style="text-align: justify; line-height: 1.8; white-space: pre-wrap;">{{conduta}}</p>
      </div>

      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{carimbo_profissional}}
      </div>
    `
  },
  {
    tipo: 'Laudo',
    nome: 'Laudo Técnico Padrão',
    variaveis: ['nome_paciente', 'cpf', 'cns', 'data_atendimento', 'cid', 'diagnostico', 'prognostico', 'conduta', 'profissional'],
    campos_manuais: ['cid', 'diagnostico', 'prognostico', 'conduta'],
    perfis_permitidos: ['master', 'profissional'],
    conteudo: `
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 30px;">LAUDO TÉCNICO PERICIAL / CLÍNICO</h1>
      <p style="text-align: justify; line-height: 1.6;">
        A pedido do interessado, submeti a exame clínico o(a) Sr(a). <strong>{{nome_paciente}}</strong>, portador(a) do CPF nº <strong>{{cpf}}</strong> e CNS nº <strong>{{cns}}</strong>, em acompanhamento nesta unidade na data de <strong>{{data_atendimento}}</strong>.
      </p>
      
      <div style="margin-top: 25px;">
        <p><strong>1. Hipótese Diagnóstica / CID:</strong> {{cid}}</p>
        <p style="margin-top: 15px;"><strong>2. Descrição Diagnóstica:</strong></p>
        <p style="text-align: justify; line-height: 1.7; white-space: pre-wrap;">{{diagnostico}}</p>
        
        <p style="margin-top: 15px;"><strong>3. Prognóstico / Considerações:</strong></p>
        <p style="text-align: justify; line-height: 1.7; white-space: pre-wrap;">{{prognostico}}</p>
        
        <p style="margin-top: 15px;"><strong>4. Conduta Sugerida:</strong></p>
        <p style="text-align: justify; line-height: 1.7; white-space: pre-wrap;">{{conduta}}</p>
      </div>

      <p style="text-align: justify; margin-top: 25px;">O presente laudo reflete o estado clínico do paciente no momento da avaliação.</p>

      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{carimbo_profissional}}
      </div>
    `
  },
  {
    tipo: 'Documento personalizado',
    nome: 'Estrutura Base Simples',
    variaveis: ['nome_paciente', 'cpf', 'profissional', 'unidade', 'corpo_documento'],
    campos_manuais: ['titulo_documento', 'corpo_documento'],
    perfis_permitidos: ['master', 'profissional', 'gestao', 'recepcao', 'avaliacao_enfermagem'],
    conteudo: `
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 30px;">{{titulo_documento}}</h1>
      <p style="margin-bottom: 25px;"><strong>Paciente:</strong> {{nome_paciente}} (CPF: {{cpf}})</p>
      
      <div style="min-height: 400px; line-height: 1.8; text-align: justify; white-space: pre-wrap;">
        {{corpo_documento}}
      </div>

      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{carimbo_profissional}}
      </div>
    `
  }
];

export const getBaseTemplate = (tipo: string): BaseTemplate | undefined => {
  // Try exact match first
  const exact = MODELOS_BASE.find(m => m.tipo === tipo);
  if (exact) return exact;

  // Partial match
  const partial = MODELOS_BASE.find(m => tipo.toLowerCase().includes(m.tipo.toLowerCase()));
  if (partial) return partial;

  // Fallback
  return MODELOS_BASE.find(m => m.tipo === 'Documento personalizado');
};
