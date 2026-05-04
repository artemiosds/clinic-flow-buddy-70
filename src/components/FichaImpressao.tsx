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
    margin-top: 10px;
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
    padding: 8px 10px;
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
    width: 12.5%;
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
    margin-top: 30px;
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

    const evolucaoHTML = data.evoluciones.length > 0
      ? data.evoluciones.map(evo => `
        <div class="evo-item">
          <div class="evo-meta">${formatarData(evo.data)} &mdash; ${val(evo.profissional)}</div>
          <div class="evo-text">${val(evo.observacao)}</div>
        </div>
      `).join('')
      : Array.from({ length: 8 }, () => '<div class="evo-line"></div>').join('');

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
      <div class="ficha-tipo">FICHA CADASTRAL DO PACIENTE</div>
    </div>
    <div class="header-logo">
      <img src="${logoRight}" alt="Logo CER II" />
    </div>
    <div class="header-right">
      <div><b>Data:</b> ${dataAtual}</div>
      <div><b>Hora:</b> ${horaAtual}</div>
      <div><b>Prontuário:</b> ${val(data.dadosClinicos.numero_prontuario, 'NOVO')}</div>
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

  <!-- SEÇÃO 4: COMPLEMENTARES / RESPONSÁVEL -->
  <div class="bloco">
    <div class="bloco-titulo">4. Dados Complementares / Responsável</div>
    <div class="bloco-body">
      <div class="grid-2">
        <div class="campo"><b>Nome do Responsável</b><span>${val(p.nome_responsavel, 'O próprio')}</span></div>
        <div class="campo"><b>CPF do Responsável</b><span>${val(p.cpf_responsavel, '—')}</span></div>
        <div class="campo"><b>Vínculo / Parentesco</b><span>${val(p.parentesco, '—')}</span></div>
        <div class="campo"><b>Unidade Vinculada</b><span>${val(p.unidade_vinculada, 'CER II')}</span></div>
      </div>
      <div class="campo" style="margin-top:4px"><b>Observações Cadastrais</b><span>${val(p.observacoes, 'Nenhuma observação registrada.')}</span></div>
    </div>
  </div>

  ${!somentePessoais ? `
  <!-- SEÇÃO 5: DADOS CLÍNICOS (Somente na versão completa) -->
  <div class="bloco">
    <div class="bloco-titulo">5. Triagem e Sinais Vitais</div>
    <div class="bloco-body">
      <table class="vitais-table">
        <tr>
          <td><b>PA (Pressão)</b><span>${val(data.sinaisVitais.pressao_arterial)}</span></td>
          <td><b>FC (BPM)</b><span>${val(data.sinaisVitais.frequencia_cardiaca)}</span></td>
          <td><b>Temp (°C)</b><span>${val(data.sinaisVitais.temperatura)}</span></td>
          <td><b>SpO2 (%)</b><span>${val(data.sinaisVitais.saturacao)}</span></td>
          <td><b>Peso (kg)</b><span>${val(data.sinaisVitais.peso)}</span></td>
          <td><b>Altura (m)</b><span>${val(data.sinaisVitais.altura)}</span></td>
          <td><b>Glicemia</b><span>${val(data.sinaisVitais.glicemia)}</span></td>
          <td><b>FR (resp)</b><span>${val(data.sinaisVitais.frequencia_respiratoria)}</span></td>
        </tr>
      </table>
    </div>
  </div>

  <div class="bloco">
    <div class="bloco-titulo">6. Evoluções Recentes</div>
    <div class="bloco-body">
      ${evolucaoHTML}
    </div>
  </div>
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

  const idade = calcIdade(data.paciente.data_nascimento);

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="w-full border rounded-lg bg-white p-6 shadow-sm max-h-[60vh] overflow-y-auto">
        <div className="text-center mb-3 border-b-2 border-foreground/20 pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h2>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">CENTRO ESPECIALIZADO EM REABILITAÇÃO II - CER II</p>
          <p className="text-[10px] uppercase text-muted-foreground">{somentePessoais ? 'FICHA CADASTRAL DO PACIENTE' : 'FICHA DE ATENDIMENTO / PRONTUÁRIO'}</p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="border rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary-foreground bg-primary -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Dados do Paciente</h3>
            <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Nome:</span> {data.paciente.nome_completo || '—'}</p>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CPF:</span> {data.paciente.cpf || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CNS:</span> {data.paciente.cns || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Nasc.:</span> {formatarData(data.paciente.data_nascimento)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Idade:</span> {idade}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Tel.:</span> {data.paciente.telefone || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Resp.:</span> {data.paciente.responsavel || data.paciente.nome_mae || '—'}</p>
            </div>
          </div>

          <div className="border rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary-foreground bg-primary -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Atendimento</h3>
            <div className="grid grid-cols-2 gap-2">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Tipo:</span> {somentePessoais ? '___' : (data.dadosClinicos.tipo_atendimento || '—')}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CID:</span> {somentePessoais ? '___' : (data.dadosClinicos.cid || '—')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Profissional:</span> {somentePessoais ? '___' : (data.profissional.nome || '—')}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Especialidade:</span> {somentePessoais ? '___' : (data.dadosClinicos.especialidade || data.profissional.cargo || '—')}</p>
            </div>
          </div>

          <div className="border rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary-foreground bg-primary -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Triagem / Sinais Vitais</h3>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <p><strong>PA:</strong> {somentePessoais ? '___' : (data.sinaisVitais.pressao_arterial || '—')}</p>
              <p><strong>FC:</strong> {somentePessoais ? '___' : (data.sinaisVitais.frequencia_cardiaca || '—')}</p>
              <p><strong>Temp:</strong> {somentePessoais ? '___' : (data.sinaisVitais.temperatura || '—')}</p>
              <p><strong>SpO₂:</strong> {somentePessoais ? '___' : (data.sinaisVitais.saturacao || '—')}</p>
              <p><strong>Peso:</strong> {somentePessoais ? '___' : (data.sinaisVitais.peso || '—')}</p>
              <p><strong>Altura:</strong> {somentePessoais ? '___' : (data.sinaisVitais.altura || '—')}</p>
              <p><strong>Glicemia:</strong> {somentePessoais ? '___' : (data.sinaisVitais.glicemia || '—')}</p>
              <p><strong>FR:</strong> {somentePessoais ? '___' : (data.sinaisVitais.frequencia_respiratoria || '—')}</p>
            </div>
          </div>

          <div className="border rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary-foreground bg-primary -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Evolução Clínica</h3>
            {somentePessoais ? (
              <p className="text-xs text-muted-foreground italic">Em branco para preenchimento manual</p>
            ) : data.evoluciones.length > 0 ? (
              data.evoluciones.map((evo, i) => (
                <div key={i} className="border-b last:border-0 pb-2 mb-2 last:mb-0 last:pb-0">
                  <p className="text-xs text-muted-foreground">{formatarData(evo.data)} — {evo.profissional || '—'}</p>
                  <p className="text-xs">{evo.observacao || '—'}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic">Sem registros</p>
            )}
          </div>
        </div>
      </div>

      <Button onClick={handlePrint} className="w-full max-w-xs" size="lg">
        <Printer className="w-4 h-4 mr-2" />
        Imprimir Ficha
      </Button>
    </div>
  );
};

export default FichaImpressao;
