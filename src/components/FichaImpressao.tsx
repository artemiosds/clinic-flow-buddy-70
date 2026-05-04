import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import logoSmsFallback from '@/assets/logo-sms-oriximina.jpeg';
import logoCerFallback from '@/assets/logo-cer-ii.png';

interface FichaData {
  paciente: {
    // Identificação
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
    
    // Endereço
    cep?: string;
    tipo_logradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    endereco_legado?: string;

    // Contato
    telefone: string;
    telefone_secundario?: string;
    email?: string;

    // Complementares
    parentesco?: string;
    observacoes?: string;
    ubs_origem?: string;
    profissional_solicitante?: string;
    tipo_encaminhamento?: string;
    especialidade_destino?: string;
    unidade_vinculada?: string;
    origem_cadastro?: string;
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

const formatarData = (data: string): string => {
  if (!data) return '___/___/______';
  try {
    const d = new Date(data.length <= 10 ? data + 'T12:00:00' : data);
    if (isNaN(d.getTime())) return '___/___/______';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '___/___/______';
  }
};

const calcIdade = (dataNasc: string): string => {
  if (!dataNasc) return '__';
  try {
    const d = new Date(dataNasc.length <= 10 ? dataNasc + 'T12:00:00' : dataNasc);
    if (isNaN(d.getTime())) return '__';
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 0 ? `${age} anos` : '__';
  } catch {
    return '__';
  }
};

const v = (valor: string | undefined): string => valor?.trim() || '';

export type FichaPrintMode = 'completa' | 'dados_pessoais';

interface FichaImpressaoProps {
  data: FichaData;
  mode?: FichaPrintMode;
  onPrintComplete?: () => void;
}

const resolveLogoUrl = (src: string): string => {
  if (src.startsWith('http') || src.startsWith('/')) return src;
  return src;
};

const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 10mm 12mm 10mm 12mm; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 10.5px;
    color: #1a1a1a;
    line-height: 1.4;
    background: #fff;
    width: 100%;
  }

  /* ===== HEADER ===== */
  .header {
    display: flex;
    align-items: center;
    gap: 15px;
    padding-bottom: 10px;
    margin-bottom: 12px;
    border-bottom: 2px solid #0c4a6e;
  }
  .header-logo img {
    width: 60px;
    height: 60px;
    object-fit: contain;
  }
  .header-center {
    flex: 1;
    text-align: center;
  }
  .header-center h1 {
    font-size: 14px;
    font-weight: 800;
    text-transform: uppercase;
    color: #0c4a6e;
    margin: 0;
  }
  .header-center h2 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #334155;
    margin: 2px 0;
  }
  .header-center .ficha-tipo {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    background: #0c4a6e;
    color: #fff;
    display: inline-block;
    padding: 2px 15px;
    border-radius: 4px;
    margin-top: 4px;
  }
  .header-right {
    text-align: right;
    font-size: 10px;
    color: #475569;
    min-width: 140px;
  }
  .header-right b { color: #0c4a6e; }

  /* ===== SECTIONS ===== */
  .bloco {
    margin-top: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .bloco-titulo {
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #f1f5f9;
    color: #0c4a6e;
    padding: 4px 10px;
    border-bottom: 1px solid #cbd5e1;
    display: flex;
    justify-content: space-between;
  }
  .bloco-body {
    padding: 6px 10px;
  }

  /* ===== GRID LAYOUTS ===== */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 15px; }
  .grid-3 { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 4px 15px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 12px; }
  .grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px 10px; }
  .grid-mixed { display: grid; grid-template-columns: 2fr 1fr 1.5fr; gap: 4px 15px; }
  .grid-address { display: grid; grid-template-columns: 3fr 1fr 1.5fr; gap: 4px 15px; }

  .campo { margin-bottom: 1px; }
  .campo b {
    font-size: 8px;
    text-transform: uppercase;
    color: #64748b;
    font-weight: 700;
    display: block;
    margin-bottom: 1px;
  }
  .campo span {
    color: #0f172a;
    font-weight: 600;
    font-size: 10.5px;
    display: block;
    min-height: 14px;
  }
  .campo-inline { display: flex; align-items: baseline; gap: 4px; }
  .campo-inline b { display: inline; margin-bottom: 0; }
  .campo-inline span { display: inline; }
  .campo-full { grid-column: 1 / -1; }

  /* ===== SPECIAL ELEMENTS ===== */
  .badge-menor {
    background: #fee2e2;
    color: #991b1b;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    margin-left: 8px;
  }

  /* ===== VITALS TABLE ===== */
  .vitais-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 2px;
  }
  .vitais-table td {
    border: 1px solid #e2e8f0;
    padding: 5px 8px;
    text-align: center;
    width: 25%; /* Ajustado para 4 colunas */
  }
  .vitais-table td b {
    display: block;
    font-size: 7.5px;
    text-transform: uppercase;
    color: #64748b;
    font-weight: 700;
    margin-bottom: 1px;
  }
  .vitais-table td span {
    font-weight: 700;
    color: #0c4a6e;
    font-size: 11px;
  }

  /* ===== EVOLUTION AREAS ===== */
  .evo-item {
    border-bottom: 1px solid #f1f5f9;
    padding: 6px 0;
  }
  .evo-item:last-child { border-bottom: none; }
  .evo-meta { font-size: 8.5px; color: #64748b; font-weight: 700; margin-bottom: 2px; }
  .evo-text { font-size: 10px; color: #1e293b; line-height: 1.4; white-space: pre-wrap; }

  .evo-line {
    border-bottom: 1px solid #e2e8f0;
    height: 22px;
  }

  /* ===== SIGNATURE ===== */
  .assinatura-area {
    margin-top: 25px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    page-break-inside: avoid;
  }
  .assinatura-bloco {
    text-align: center;
    width: 250px;
  }
  .assinatura-traco {
    border-top: 1px solid #334155;
    margin-bottom: 4px;
  }
  .assinatura-nome {
    font-size: 10px;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
  }
  .assinatura-label {
    font-size: 8.5px;
    color: #64748b;
  }

  .data-local {
    font-size: 10px;
    color: #475569;
  }

  /* ===== FOOTER ===== */
  .rodape {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 5px 12mm;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-size: 8px;
    color: #94a3b8;
    background: #fff;
  }

  @media print {
    body { padding-bottom: 40px; }
    .bloco { break-inside: avoid; border-color: #94a3b8; }
    .header { border-bottom-width: 3px; }
    .bloco-titulo { background: #f8fafc !important; -webkit-print-color-adjust: exact; }
    .header-center .ficha-tipo { background: #0c4a6e !important; -webkit-print-color-adjust: exact; }
    .evo-line { border-bottom-color: #cbd5e1 !important; }
  }
`;


export const FichaImpressao: React.FC<FichaImpressaoProps> = ({ data, mode = 'completa', onPrintComplete }) => {
  const somentePessoais = mode === 'dados_pessoais';
  const buildHTML = useCallback(() => {
    const logoLeft = resolveLogoUrl(logoSmsFallback);
    const logoRight = resolveLogoUrl(logoCerFallback);
    const now = new Date();
    const dataAtual = formatarData(now.toISOString());
    const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const p = data.paciente;
    const dc = data.dadosClinicos;
    const sv = data.sinaisVitais;
    const idade = calcIdade(p.data_nascimento);

    const getRacaLabel = (val?: string) => {
      const options: Record<string, string> = {
        branca: 'Branca', preta: 'Preta', parda: 'Parda',
        amarela: 'Amarela', indigena: 'Indígena', nao_declarado: 'Não declarado'
      };
      return options[val || ''] || 'Não declarado';
    };

    const getSexoLabel = (val?: string) => {
      const s = String(val || '').toUpperCase();
      if (s === 'M' || s === 'MASCULINO') return 'Masculino';
      if (s === 'F' || s === 'FEMININO') return 'Feminino';
      if (s === 'I' || s === 'IGNORADO') return 'Ignorado';
      return 'Não informado';
    };

    const val = (value: any, fallback = '—') => {
      if (value === undefined || value === null || value === '') return fallback;
      if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
      return String(value).trim() || fallback;
    };

    const valVital = (v: any) => {
      if (!v || v === '—' || v === 'undefined' || v === 'null') return '________';
      return String(v).trim();
    };

    const evolucaoHTML = data.evoluciones.length > 0
      ? data.evoluciones.map(evo => `
        <div class="evo-item">
          <div class="evo-meta">${formatarData(evo.data)} &mdash; ${val(evo.profissional)}</div>
          <div class="evo-text">${val(evo.observacao)}</div>
        </div>
      `).join('')
      : '';

    const linhasVazias = (titulo: string, numLinhas: number = 3) => `
      <div class="bloco">
        <div class="bloco-titulo">${titulo}</div>
        <div class="bloco-body">
          ${Array.from({ length: numLinhas }, () => '<div class="evo-line"></div>').join('')}
        </div>
      </div>
    `;

    const blocoCurto = (titulo: string) => `
      <div class="bloco">
        <div class="bloco-titulo">${titulo}</div>
        <div class="bloco-body">
          <div class="evo-line"></div>
        </div>
      </div>
    `;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Ficha Cadastral - ${val(p.nome_completo)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>

  <!-- CABEÇALHO -->
  <div class="header">
    <div class="header-logo">
      <img src="${logoLeft}" alt="Logo SMS" />
    </div>
    <div class="header-center">
      <h1>Secretaria Municipal de Saúde de Oriximiná</h1>
      <h2>Centro Especializado em Reabilitação Nível II &mdash; CER II</h2>
      <div class="ficha-tipo">${somentePessoais ? 'FICHA CADASTRAL SIMPLIFICADA' : 'FICHA DE ATENDIMENTO COMPLETA'}</div>
    </div>
    <div class="header-logo">
      <img src="${logoRight}" alt="Logo CER II" />
    </div>
    <div class="header-right">
      <div><b>Data:</b> ${dataAtual}</div>
      <div><b>Hora:</b> ${horaAtual}</div>
      <div><b>Prontuário:</b> ${val(dc.numero_prontuario, 'NOVO')}</div>
    </div>
  </div>

  <!-- SEÇÃO 1: IDENTIFICAÇÃO -->
  <div class="bloco">
    <div class="bloco-titulo">
      <span>1. Identificação do Paciente</span>
      ${p.menor_idade ? '<span class="badge-menor">Paciente Menor de Idade</span>' : ''}
    </div>
    <div class="bloco-body">
      <div class="grid-2">
        <div class="campo campo-full"><b>Nome Completo</b><span style="font-size:12px; font-weight:700">${val(p.nome_completo, 'Não informado')}</span></div>
        <div class="campo"><b>Nome da Mãe</b><span>${val(p.nome_mae, 'Não informado')}</span></div>
        <div class="campo"><b>Naturalidade / UF</b><span>${val(p.naturalidade)} / ${val(p.naturalidade_uf, '—')}</span></div>
      </div>
      <div class="grid-5" style="margin-top:4px">
        <div class="campo"><b>Data de Nasc.</b><span>${formatarData(p.data_nascimento)}</span></div>
        <div class="campo"><b>Idade</b><span>${idade}</span></div>
        <div class="campo"><b>Sexo</b><span>${getSexoLabel(p.sexo)}</span></div>
        <div class="campo"><b>CPF</b><span>${val(p.cpf, 'Não informado')}</span></div>
        <div class="campo"><b>CNS (Cartão SUS)</b><span>${val(p.cns, 'Não informado')}</span></div>
      </div>
      <div class="grid-3" style="margin-top:4px">
        <div class="campo"><b>Nacionalidade</b><span>${val(p.nacionalidade, 'Brasileira')}</span></div>
        <div class="campo"><b>Raça / Cor (IBGE)</b><span>${getRacaLabel(p.raca_cor)}</span></div>
        <div class="campo"><b>Situação de Rua?</b><span>${p.situacao_rua ? 'Sim' : 'Não'}</span></div>
      </div>
    </div>
  </div>

  <!-- SEÇÃO 2: ENDEREÇO -->
  <div class="bloco">
    <div class="bloco-titulo">2. Endereço e Localização</div>
    <div class="bloco-body">
      <div class="grid-address">
        <div class="campo"><b>Tipo de Logradouro / Logradouro</b><span>${val(p.tipo_logradouro)} ${val(p.logradouro, 'Não informado')}</span></div>
        <div class="campo"><b>Número</b><span>${val(p.numero, 'S/N')}</span></div>
        <div class="campo"><b>Complemento</b><span>${val(p.complemento, '—')}</span></div>
      </div>
      <div class="grid-3" style="margin-top:4px">
        <div class="campo"><b>Bairro</b><span>${val(p.bairro, 'Não informado')}</span></div>
        <div class="campo"><b>Município de Residência</b><span>${val(p.municipio, 'Oriximiná')}</span></div>
        <div class="campo"><b>UF / CEP</b><span>${val(p.uf, 'PA')} / ${val(p.cep, '—')}</span></div>
      </div>
      ${p.endereco_legado ? `<div class="campo" style="margin-top:4px; border-top:1px dashed #e2e8f0; padding-top:2px"><b>Endereço Completo (Referência)</b><span>${p.endereco_legado}</span></div>` : ''}
    </div>
  </div>

  <!-- SEÇÃO 3: CONTATO -->
  <div class="bloco">
    <div class="bloco-titulo">3. Informações de Contato</div>
    <div class="bloco-body">
      <div class="grid-3">
        <div class="campo"><b>Telefone Principal</b><span>${val(p.telefone, 'Não informado')}</span></div>
        <div class="campo"><b>Telefone Secundário</b><span>${val(p.telefone_secundario, '—')}</span></div>
        <div class="campo"><b>E-mail</b><span>${val(p.email, '—')}</span></div>
      </div>
    </div>
  </div>

  <!-- SEÇÃO 4: DADOS COMPLEMENTARES -->
  <div class="bloco">
    <div class="bloco-titulo">4. Dados Complementares / Responsável</div>
    <div class="bloco-body">
      <div class="grid-3">
        <div class="campo"><b>Nome do Responsável</b><span>${val(p.nome_responsavel, 'O próprio')}</span></div>
        <div class="campo"><b>CPF do Responsável</b><span>${val(p.cpf_responsavel, '—')}</span></div>
        <div class="campo"><b>Vínculo / Parentesco</b><span>${val(p.parentesco, '—')}</span></div>
      </div>
      <div class="grid-3" style="margin-top:4px">
        <div class="campo"><b>Unidade Vinculada</b><span>${val(p.unidade_vinculada, 'CER II')}</span></div>
        <div class="campo"><b>UBS de Origem</b><span>${val(p.ubs_origem, '—')}</span></div>
        <div class="campo"><b>Tipo Encaminhamento</b><span>${val(p.tipo_encaminhamento, '—')}</span></div>
      </div>
      <div class="grid-2" style="margin-top:4px">
        <div class="campo"><b>Profissional Solicitante</b><span>${val(p.profissional_solicitante, '—')}</span></div>
        <div class="campo"><b>Especialidade Destino</b><span>${val(p.especialidade_destino, '—')}</span></div>
      </div>
      <div class="campo" style="margin-top:4px"><b>Observações Cadastrais</b><span>${val(p.observacoes, 'Nenhuma observação registrada.')}</span></div>
    </div>
  </div>

  ${!somentePessoais ? `
  <!-- SEÇÃO 5: DADOS DO ATENDIMENTO -->
  <div class="bloco">
    <div class="bloco-titulo">5. Dados do Atendimento</div>
    <div class="bloco-body">
      <div class="grid-3">
        <div class="campo"><b>Unidade de Atendimento</b><span>${val(dc.unidade_atendimento, 'CER II')}</span></div>
        <div class="campo"><b>Tipo de Atendimento</b><span>${val(dc.tipo_atendimento, '—')}</span></div>
        <div class="campo"><b>Especialidade</b><span>${val(dc.especialidade, '—')}</span></div>
      </div>
      <div class="grid-2" style="margin-top:4px">
        <div class="campo"><b>Unidade de Origem</b><span>${val(dc.unidade_origem, '—')}</span></div>
        <div class="campo"><b>CID / Diagnóstico</b><span>${val(dc.cid, '—')}</span></div>
      </div>
    </div>
  </div>

  <!-- SEÇÃO 6: TRIAGEM E SINAIS VITAIS -->
  <div class="bloco">
    <div class="bloco-titulo">6. Triagem / Sinais Vitais</div>
    <div class="bloco-body">
      <table class="vitais-table">
        <tr>
          <td><b>PA (Pressão)</b><span>${valVital(sv.pressao_arterial)}</span></td>
          <td><b>FC (BPM)</b><span>${valVital(sv.frequencia_cardiaca)}</span></td>
          <td><b>FR (resp)</b><span>${valVital(sv.frequencia_respiratoria)}</span></td>
          <td><b>Temp (°C)</b><span>${valVital(sv.temperatura)}</span></td>
        </tr>
        <tr>
          <td><b>SpO2 (%)</b><span>${valVital(sv.saturacao)}</span></td>
          <td><b>Peso (kg)</b><span>${valVital(sv.peso)}</span></td>
          <td><b>Altura (m)</b><span>${valVital(sv.altura)}</span></td>
          <td><b>Glicemia</b><span>${valVital(sv.glicemia)}</span></td>
        </tr>
      </table>
    </div>
  </div>

  <!-- CAMPOS CLÍNICOS -->
  ${linhasVazias('7. Queixa Principal', 2)}
  
  <div class="bloco">
    <div class="bloco-titulo">8. Evolução Clínica</div>
    <div class="bloco-body">
      ${evolucaoHTML}
      ${Array.from({ length: 6 }, () => '<div class="evo-line"></div>').join('')}
    </div>
  </div>

  ${linhasVazias('9. Conduta / Prescrição', 4)}
  
  <div class="grid-2">
    ${blocoCurto('10. Diagnóstico')}
    ${blocoCurto('11. Retorno')}
  </div>

  ${linhasVazias('12. Medicação / Prescrição', 4)}
  ${linhasVazias('13. Procedimentos', 3)}
  ` : ''}

  <!-- ASSINATURA -->
  <div class="assinatura-area">
    <div class="data-local">Oriximiná &mdash; PA, ____/____/________</div>
    <div class="assinatura-bloco">
      <div class="assinatura-traco"></div>
      <div class="assinatura-nome">${val(data.profissional.nome, 'PROFISSIONAL RESPONSÁVEL')}</div>
      <div class="assinatura-label">${val(data.profissional.cargo)} &mdash; ${val(data.profissional.registro)}</div>
    </div>
  </div>

  <div class="rodape">
    Impresso via Lovable Cloud &mdash; CER II Oriximiná &mdash; ${dataAtual} ${horaAtual} &mdash; ${somentePessoais ? 'Ficha Cadastral Simplificada' : 'Ficha de Atendimento Completa'}
  </div>

</body>
</html>`;
  }, [data, somentePessoais]);


  const handlePrint = useCallback(() => {
    const html = buildHTML();
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            onPrintComplete?.();
          }, 1000);
        }, 500);
      }
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.addEventListener('afterprint', () => {
        win.close();
        onPrintComplete?.();
      });
    }, 400);
  }, [buildHTML, onPrintComplete]);

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="w-full border rounded-lg bg-white p-6 shadow-sm max-h-[70vh] overflow-y-auto">
        <div className="flex items-center gap-4 mb-4 border-b-2 border-primary/20 pb-4">
          <img src={logoSmsFallback} alt="Logo SMS" className="w-12 h-12 object-contain" />
          <div className="flex-1 text-center">
            <h2 className="text-sm font-bold uppercase tracking-tight text-primary">Prefeitura Municipal de Oriximiná</h2>
            <p className="text-[11px] font-bold text-muted-foreground uppercase">Centro Especializado em Reabilitação II (CER II)</p>
          </div>
          <img src={logoCerFallback} alt="Logo CER II" className="w-12 h-12 object-contain" />
        </div>

        <div className="bg-primary/5 rounded px-3 py-1.5 mb-4 text-center">
          <span className="text-xs font-bold text-primary uppercase tracking-wider">
            {somentePessoais ? 'Visualização da Ficha Cadastral' : 'Visualização da Ficha Completa'}
          </span>
        </div>

        <div className="space-y-4 text-sm">
          {/* Identificação */}
          <div className="border border-slate-200 rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary mb-2 border-b border-slate-100 pb-1 flex justify-between">
              1. Identificação do Paciente
              {data.paciente.menor_idade && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 rounded">Menor de Idade</span>}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
              <p><span className="text-[9px] font-bold uppercase text-slate-400">Nome:</span> <span className="font-semibold">{data.paciente.nome_completo || '—'}</span></p>
              <p><span className="text-[9px] font-bold uppercase text-slate-400">Mãe:</span> {data.paciente.nome_mae || '—'}</p>
              <div className="grid grid-cols-3 gap-2">
                <p><span className="text-[9px] font-bold uppercase text-slate-400">CPF:</span> {data.paciente.cpf || '—'}</p>
                <p><span className="text-[9px] font-bold uppercase text-slate-400">CNS:</span> {data.paciente.cns || '—'}</p>
                <p><span className="text-[9px] font-bold uppercase text-slate-400">Nasc.:</span> {formatarData(data.paciente.data_nascimento)}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <p><span className="text-[9px] font-bold uppercase text-slate-400">Sexo:</span> {data.paciente.sexo || '—'}</p>
                <p><span className="text-[9px] font-bold uppercase text-slate-400">Naturalidade:</span> {data.paciente.naturalidade || '—'}</p>
                <p><span className="text-[9px] font-bold uppercase text-slate-400">Raça:</span> {data.paciente.raca_cor || '—'}</p>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="border border-slate-200 rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary mb-2 border-b border-slate-100 pb-1">2. Endereço e Localização</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
              <p><span className="text-[9px] font-bold uppercase text-slate-400">Rua/Logradouro:</span> {data.paciente.logradouro ? `${data.paciente.tipo_logradouro || ''} ${data.paciente.logradouro}` : '—'}</p>
              <div className="grid grid-cols-3 gap-2">
                <p><span className="text-[9px] font-bold uppercase text-slate-400">Nº:</span> {data.paciente.numero || '—'}</p>
                <p><span className="text-[9px] font-bold uppercase text-slate-400">Bairro:</span> {data.paciente.bairro || '—'}</p>
                <p><span className="text-[9px] font-bold uppercase text-slate-400">Município:</span> {data.paciente.municipio || 'Oriximiná'}</p>
              </div>
            </div>
          </div>

          {/* Contato */}
          <div className="border border-slate-200 rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary mb-2 border-b border-slate-100 pb-1">3. Contato</h3>
            <div className="grid grid-cols-3 gap-2">
              <p><span className="text-[9px] font-bold uppercase text-slate-400">Telefone:</span> {data.paciente.telefone || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-slate-400">Secundário:</span> {data.paciente.telefone_secundario || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-slate-400">Email:</span> {data.paciente.email || '—'}</p>
            </div>
          </div>

          {/* Dados Complementares */}
          <div className="border border-slate-200 rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary mb-2 border-b border-slate-100 pb-1">4. Dados Complementares</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
              <p><span className="text-[9px] font-bold uppercase text-slate-400">Responsável:</span> {data.paciente.nome_responsavel || 'O próprio'}</p>
              <p><span className="text-[9px] font-bold uppercase text-slate-400">Unidade Vinculada:</span> {data.paciente.unidade_vinculada || 'CER II'}</p>
            </div>
          </div>
          
          {/* Seção Clínica (Preview) */}
          {!somentePessoais && (
            <>
              <div className="border border-slate-200 rounded p-3">
                <h3 className="text-[10px] font-bold uppercase text-primary mb-2 border-b border-slate-100 pb-1">5. Dados do Atendimento</h3>
                <div className="grid grid-cols-2 gap-2">
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">Unidade:</span> {data.dadosClinicos.unidade_atendimento || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">Tipo:</span> {data.dadosClinicos.tipo_atendimento || '—'}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded p-3">
                <h3 className="text-[10px] font-bold uppercase text-primary mb-2 border-b border-slate-100 pb-1">6. Triagem / Sinais Vitais</h3>
                <div className="grid grid-cols-4 gap-2">
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">PA:</span> {data.sinaisVitais.pressao_arterial || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">FC:</span> {data.sinaisVitais.frequencia_cardiaca || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">FR:</span> {data.sinaisVitais.frequencia_respiratoria || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">Temp:</span> {data.sinaisVitais.temperatura || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">SpO2:</span> {data.sinaisVitais.saturacao || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">Peso:</span> {data.sinaisVitais.peso || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">Altura:</span> {data.sinaisVitais.altura || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-slate-400">Glicemia:</span> {data.sinaisVitais.glicemia || '—'}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
                <p className="text-[9px] text-center text-slate-500 uppercase font-bold">
                  Campos clínicos de 7 a 13 (Queixa, Evolução, Conduta, etc.) disponíveis na versão impressa.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-md">
        <Button onClick={handlePrint} className="flex-1" size="lg">
          <Printer className="w-4 h-4 mr-2" />
          Imprimir Ficha
        </Button>
      </div>
    </div>
  );
};


export default FichaImpressao;
