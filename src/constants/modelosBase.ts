
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
    perfis_permitidos: ['master', 'recepcao', 'profissional', 'avaliacao_enfermagem'],
    conteudo: `
      <h1 style="text-align: center;">DECLARAÇÃO DE COMPARECIMENTO</h1>
      <p style="text-align: justify; margin-top: 30px;">
        Declaramos para os devidos fins que o(a) Sr(a). <strong>{{nome_paciente}}</strong>, inscrito(a) no CPF sob nº <strong>{{cpf}}</strong> e CNS nº <strong>{{cns}}</strong>, compareceu a esta unidade de saúde <strong>{{unidade}}</strong> no dia <strong>{{data_atendimento}}</strong>, permanecendo em atendimento no período das <strong>{{horario_entrada}}</strong> às <strong>{{horario_saida}}</strong>, para fins de <strong>{{finalidade}}</strong>.
      </p>
      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{assinatura_profissional}}
        <p style="font-size: 12px; color: #666;">{{profissional}}</p>
      </div>
    `
  },
  {
    tipo: 'Atestado Médico',
    nome: 'Atestado Médico Padrão',
    variaveis: ['nome_paciente', 'cpf', 'cns', 'data_atendimento', 'dias_afastamento', 'data_inicio', 'data_fim', 'cid', 'profissional', 'conselho', 'numero_conselho'],
    perfis_permitidos: ['master', 'profissional'],
    conteudo: `
      <h1 style="text-align: center;">ATESTADO MÉDICO</h1>
      <p style="text-align: justify; margin-top: 30px;">
        Atesto, para os devidos fins, que o(a) Sr(a). <strong>{{nome_paciente}}</strong>, portador(a) do CPF nº <strong>{{cpf}}</strong>, foi atendido(a) nesta data e necessita de <strong>{{dias_afastamento}}</strong> dias de afastamento de suas atividades laborais/escolares, a partir de <strong>{{data_inicio}}</strong> até <strong>{{data_fim}}</strong>, por motivos de saúde.
      </p>
      <p style="text-align: justify;">
        CID: {{cid}} (conforme autorização do paciente).
      </p>
      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{assinatura_profissional}}
        <p style="font-size: 12px; color: #666;">{{profissional}} - {{conselho}} {{numero_conselho}}</p>
      </div>
    `
  },
  {
    tipo: 'Receituário',
    nome: 'Receituário Médico Padrão',
    variaveis: ['nome_paciente', 'cpf', 'medicamentos', 'orientacoes', 'validade', 'profissional', 'conselho', 'numero_conselho'],
    perfis_permitidos: ['master', 'profissional'],
    conteudo: `
      <h1 style="text-align: center;">RECEITUÁRIO</h1>
      <p style="margin-top: 20px;"><strong>Paciente:</strong> {{nome_paciente}}</p>
      <p><strong>CPF:</strong> {{cpf}}</p>
      
      <div style="margin-top: 30px; min-height: 300px;">
        <p style="font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 5px;">USO INTERNO / EXTERNO:</p>
        <p>{{medicamentos}}</p>
        
        <p style="font-weight: bold; margin-top: 20px;">ORIENTAÇÕES:</p>
        <p>{{orientacoes}}</p>
      </div>

      <p style="font-size: 12px; color: #666; margin-top: 20px;">Receita válida por {{validade}}.</p>

      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{assinatura_profissional}}
        <p style="font-size: 12px; color: #666;">{{profissional}} - {{conselho}} {{numero_conselho}}</p>
      </div>
    `
  },
  {
    tipo: 'Encaminhamento',
    nome: 'Encaminhamento Clínico Padrão',
    variaveis: ['nome_paciente', 'cpf', 'especialidade_destino', 'unidade_destino', 'motivo', 'resumo_clinico', 'prioridade', 'cid', 'profissional'],
    perfis_permitidos: ['master', 'profissional', 'avaliacao_enfermagem'],
    conteudo: `
      <h1 style="text-align: center;">ENCAMINHAMENTO</h1>
      <p style="margin-top: 20px;"><strong>Para:</strong> {{especialidade_destino}} - {{unidade_destino}}</p>
      <p><strong>Prioridade:</strong> {{prioridade}}</p>
      
      <p style="margin-top: 30px;">Encaminho o(a) paciente <strong>{{nome_paciente}}</strong>, CPF nº <strong>{{cpf}}</strong>, para avaliação especializada.</p>
      
      <div style="margin-top: 20px;">
        <p><strong>Motivo:</strong> {{motivo}}</p>
        <p><strong>Resumo Clínico:</strong> {{resumo_clinico}}</p>
        <p><strong>CID:</strong> {{cid}}</p>
      </div>

      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{assinatura_profissional}}
        <p style="font-size: 12px; color: #666;">{{profissional}}</p>
      </div>
    `
  },
  {
    tipo: 'Relatório de Evolução Clínica',
    nome: 'Relatório de Evolução Padrão',
    variaveis: ['nome_paciente', 'cpf', 'data_atendimento', 'evolucao', 'conduta', 'profissional'],
    perfis_permitidos: ['master', 'profissional', 'gestao'],
    conteudo: `
      <h1 style="text-align: center;">RELATÓRIO DE EVOLUÇÃO CLÍNICA</h1>
      <p style="margin-top: 20px;"><strong>Paciente:</strong> {{nome_paciente}}</p>
      <p><strong>Data do Atendimento:</strong> {{data_atendimento}}</p>
      
      <div style="margin-top: 30px;">
        <h3>Evolução:</h3>
        <p style="text-align: justify;">{{evolucao}}</p>
        
        <h3 style="margin-top: 20px;">Conduta:</h3>
        <p style="text-align: justify;">{{conduta}}</p>
      </div>

      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{assinatura_profissional}}
        <p style="font-size: 12px; color: #666;">{{profissional}}</p>
      </div>
    `
  },
  {
    tipo: 'Documento personalizado',
    nome: 'Estrutura Base Simples',
    variaveis: ['nome_paciente', 'cpf', 'profissional', 'unidade'],
    perfis_permitidos: ['master', 'profissional', 'gestao', 'recepcao', 'avaliacao_enfermagem'],
    conteudo: `
      <h1 style="text-align: center;">TÍTULO DO DOCUMENTO</h1>
      <p style="margin-top: 20px;"><strong>Identificação do Paciente:</strong> {{nome_paciente}} (CPF: {{cpf}})</p>
      
      <div style="margin-top: 30px; min-height: 400px; border: 1px dashed #ccc; padding: 20px;">
        Corpo livre do documento...
      </div>

      <p style="text-align: right; margin-top: 50px;">
        {{unidade}}, {{data_hoje}}.
      </p>
      <div style="margin-top: 80px; text-align: center;">
        {{assinatura_profissional}}
        <p style="font-size: 12px; color: #666;">{{profissional}}</p>
      </div>
    `
  }
];

export const getBaseTemplate = (tipo: string): BaseTemplate | undefined => {
  return MODELOS_BASE.find(m => m.tipo === tipo) || MODELOS_BASE.find(m => m.tipo === 'Documento personalizado');
};
