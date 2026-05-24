/**
 * Geração de PDF/impressão do Prontuário Clínico e do Histórico Completo
 * passando 100% pelo shell institucional global (openPrintDocument).
 */

import { openPrintDocument } from "@/lib/printLayout";
import { renderCustomFieldsHtml } from "@/lib/customFieldsPrint";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ProntuarioLike {
  id: string;
  paciente_id?: string;
  paciente_nome: string;
  profissional_id?: string;
  profissional_nome: string;
  data_atendimento: string;
  hora_atendimento?: string;
  setor?: string;
  queixa_principal?: string;
  anamnese?: string;
  sinais_sintomas?: string;
  exame_fisico?: string;
  hipotese?: string;
  conduta?: string;
  prescricao?: string;
  solicitacao_exames?: string;
  evolucao?: string;
  observacoes?: string;
  procedimentos_texto?: string;
  soap_subjetivo?: string;
  soap_objetivo?: string;
  soap_avaliacao?: string;
  soap_plano?: string;
  tipo_registro?: string;
  indicacao_retorno?: string;
  custom_data?: Record<string, any>;
  dados_acolhimento?: any;
  unidade_id?: string;
  especialidade?: string;
  tipo_prontuario?: string;
  episodio_id?: string;
}

const TIPO_LABELS: Record<string, string> = {
  avaliacao_inicial: "Avaliação/TR",
  retorno: "Retorno",
  sessao: "Sessão de Tratamento",
  urgencia: "Atendimento de Urgência",
  procedimento: "Procedimento",
};

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safe(str: string | undefined | null): string {
  if (!str) return "";
  const trimmed = str.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      
      // Handle prescriptions
      if (parsed?.medicamentos && Array.isArray(parsed.medicamentos)) {
        return parsed.medicamentos
          .map(
            (m: any, i: number) =>
              `${i + 1}. ${m.nome ?? ""} — ${m.dosagem || ""} ${m.via || ""} ${m.posologia || ""} ${m.duracao || ""}`.trim(),
          )
          .join("\n");
      }
      
      // Handle exams
      if (parsed?.exames && Array.isArray(parsed.exames)) {
        return parsed.exames
          .map(
            (e: any) =>
              `• ${e.nome ?? ""}${e.codigo_sus ? ` (${e.codigo_sus})` : ""}${e.indicacao ? ` — ${e.indicacao}` : ""}`,
          )
          .join("\n");
      }

      // Handle specialty fields (if they ended up here raw)
      if (parsed?.especialidade_fields && parsed?.texto !== undefined) {
        return parsed.texto || "";
      }
      
      // If it's just a general object with a 'texto' field
      if (parsed?.texto && typeof parsed.texto === 'string') {
        return parsed.texto;
      }
    } catch { /* não é JSON */ }
  }
  return str;
}

function section(label: string, raw: string | undefined): string {
  const value = safe(raw);
  if (!value || !value.trim()) return "";
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(label)}</div>
      <div class="section-content">${escapeHtml(value)}</div>
    </div>`;
}

async function fetchAnexosHtml(prontuarioId: string): Promise<string> {
  if (!prontuarioId || prontuarioId === 'rascunho') return '';
  try {
    const { data, error } = await (supabase as any)
      .from("prontuario_anexos")
      .select("nome_arquivo, categoria, criado_em")
      .eq("prontuario_id", prontuarioId);
    
    if (error || !data || data.length === 0) return '';

    const items = data.map((a: any) => `
      <div style="margin-bottom: 4px; font-size: 9pt;">
        • <strong>${escapeHtml(a.nome_arquivo)}</strong> 
        <span style="color: #64748b; font-size: 8pt;">(${escapeHtml(a.categoria)} — ${fmtDate(a.criado_em?.split('T')[0])})</span>
      </div>
    `).join('');

    return `
      <div class="section">
        <div class="section-title">Anexos e Documentos</div>
        <div class="section-content">
          ${items}
        </div>
      </div>`;
  } catch {
    return '';
  }
}

async function fetchTriagemHtml(pacienteId: string, dataAtendimento: string): Promise<string> {
  try {
    const { data, error } = await (supabase as any)
      .from("triagem")
      .select("*")
      .eq("paciente_id", pacienteId)
      .eq("data_atendimento", dataAtendimento)
      .maybeSingle();

    if (error || !data) return '';

    const triagemData = data as any;

    const fields = [
      { label: "Peso", value: triagemData.peso ? `${triagemData.peso} kg` : null },
      { label: "Altura", value: triagemData.altura ? `${triagemData.altura} m` : null },
      { label: "IMC", value: triagemData.imc ? `${Number(triagemData.imc).toFixed(1)}` : null },
      { label: "PA", value: triagemData.pressao_arterial },
      { label: "Temp", value: triagemData.temperatura ? `${triagemData.temperatura} °C` : null },
      { label: "FC", value: triagemData.frequencia_cardiaca ? `${triagemData.frequencia_cardiaca} bpm` : null },
      { label: "SpO2", value: triagemData.saturacao_oxigenio ? `${triagemData.saturacao_oxigenio}%` : null },
      { label: "Glicemia", value: triagemData.glicemia ? `${triagemData.glicemia} mg/dL` : null },
    ].filter(f => f.value);

    if (fields.length === 0 && !triagemData.queixa) return '';

    const triagemGrid = fields.map(f => `
      <div class="field">
        <span class="field-label">${escapeHtml(f.label)}</span>
        <div class="field-value">${escapeHtml(f.value)}</div>
      </div>
    `).join('');

    return `
      <div class="section">
        <div class="section-title">Triagem / Acolhimento</div>
        ${fields.length > 0 ? `<div class="section-content" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 15px; background: #f8fafc; padding: 8px; border-radius: 4px; margin-bottom: 8px;">
          ${triagemGrid}
        </div>` : ''}
        ${triagemData.queixa ? `<div class="section-content"><strong>Queixa (Acolhimento):</strong> ${escapeHtml(triagemData.queixa)}</div>` : ''}
      </div>`;
  } catch {
    return '';
  }
}

function renderAcolhimentoHtml(data: any): string {
  if (!data) return "";

  const row = (label: string, value: any) => {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return "";
    const displayValue = Array.isArray(value) ? value.join(', ') : String(value === 'sim' ? 'Sim' : value === 'nao' ? 'Não' : value);
    return `
      <div style="margin-bottom: 5px; display: flex; gap: 5px;">
        <span style="font-size: 8pt; color: #475569; text-transform: uppercase; font-weight: 700; min-width: 150px;">${escapeHtml(label)}:</span>
        <span style="font-size: 10pt; color: #000; font-weight: 400; text-align: justify; flex: 1;">${escapeHtml(displayValue)}</span>
      </div>
    `;
  };

  const section = (title: string, content: string) => {
    if (!content) return "";
    return `
      <div style="margin-top: 8px; border-top: 0.5px solid #cbd5e1; padding-top: 5px;">
        <div style="font-size: 8.5pt; color: #000; font-weight: 800; margin-bottom: 4px; text-transform: uppercase;">${escapeHtml(title)}</div>
        ${content}
      </div>
    `;
  };

  const s3 = section("Motivo da Procura", 
    row("Queixa Principal", data.secao3?.queixa) + 
    row("Outros", data.secao3?.outros)
  );
  
  const s4 = section("Sintomas (30 dias)", 
    row("Sintomas", data.secao4?.sintomas)
  );
  
  const s5 = section("Antecedentes Pessoais", 
    row("Descrição", data.secao5?.antecedentes) +
    row("Psicofármacos", data.secao5?.uso_psicofarmacos) +
    row("Medic. Anterior", data.secao5?.medicacao_anterior) +
    row("Medic. Atual", data.secao5?.medicacao_atual)
  );

  const s6 = section("Substâncias", 
    row("Álcool", data.secao6?.uso_alcool) +
    row("Álcool Detalhes", data.secao6?.alcool_qual || data.secao6?.alcool_frequencia ? `${data.secao6.alcool_qual || ''} ${data.secao6.alcool_frequencia ? `(${data.secao6.alcool_frequencia})` : ''}` : null) +
    row("Drogas", data.secao6?.uso_droga) +
    row("Tabaco", data.secao6?.habito_fumar)
  );

  const s7 = section("Risco Suicídio", 
    row("Ideação", data.secao7?.ideacao_suicida) +
    row("Tentativa Recente", data.secao7?.tentativa_suicidio_6meses)
  );

  const s15 = section("Parecer Profissional", 
    row("Parecer", data.secao15?.parecer)
  );

  return `
    <div style="border: 0.8px solid #000; padding: 10px; margin-bottom: 12px; page-break-inside: avoid;">
      <div style="font-size: 9pt; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 6px;">Acolhimento em Saúde Mental</div>
      ${s3}${s4}${s5}${s6}${s7}${s15}
    </div>
  `;
}

async function buildProntuarioBody(p: ProntuarioLike, extraHtml = ""): Promise<string> {
  const sections: Array<[string, string | undefined]> = [
    ["Queixa Principal", p.queixa_principal],
    ["S — Subjetivo", p.soap_subjetivo],
    ["O — Objetivo", p.soap_objetivo],
    ["A — Avaliação", p.soap_avaliacao],
    ["P — Plano", p.soap_plano],
    ["Anamnese", p.anamnese],
    ["Sinais e Sintomas", p.sinais_sintomas],
    ["Exame Físico", p.exame_fisico],
    ["Hipótese Diagnóstica", p.hipotese],
    ["Conduta / Orientações", p.conduta],
    ["Procedimentos Efetuados", p.procedimentos_texto],
    ["Prescrição / Medicamentos", p.prescricao],
    ["Solicitação de Exames", p.solicitacao_exames],
    ["Evolução Clínica", p.evolucao],
  ];

  if (p.indicacao_retorno && p.indicacao_retorno !== "no_indication") {
    sections.push(["Indicação de Retorno", p.indicacao_retorno]);
  }

  let obsHtml = "";
  const obsValue = p.observacoes?.trim() || "";
  if (obsValue.startsWith("{")) {
    try {
      const parsed = JSON.parse(obsValue);
      if (parsed.especialidade_fields) {
        const fieldEntries = Object.entries(parsed.especialidade_fields)
          .filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== "")
          .map(([k, v]) => {
            const label = k.replace(/^esp_/, "").replace(/_/g, " ").toUpperCase();
            let displayValue = String(v);
            if (displayValue === "true") displayValue = "Sim";
            if (displayValue === "false") displayValue = "Não";
            return `
              <div style="margin-bottom: 2px;">
                <span style="font-size: 8pt; color: #475569; font-weight: 700; text-transform: uppercase;">${escapeHtml(label)}:</span>
                <span style="font-size: 10pt; color: #000; font-weight: 400;">${escapeHtml(displayValue)}</span>
              </div>`;
          })
          .join("");
        
        if (fieldEntries) {
          obsHtml = `
            <div class="section">
              <div class="section-title">Avaliação Especializada</div>
              <div class="section-content" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 15px;">
                ${fieldEntries}
              </div>
            </div>`;
        }
        if (parsed.texto?.trim()) {
          sections.push(["Observações Adicionais", parsed.texto]);
        }
      } else {
        sections.push(["Observações", p.observacoes]);
      }
    } catch {
      sections.push(["Observações", p.observacoes]);
    }
  } else {
    sections.push(["Observações", p.observacoes]);
  }

  const sectionsHtml = sections
    .map(([label, value]) => section(label, value))
    .join("");

  let anexosHtml = "";
  if (p.id) {
    anexosHtml = await fetchAnexosHtml(p.id);
  }

  let triagemHtml = "";
  if (p.paciente_id && p.data_atendimento) {
    triagemHtml = await fetchTriagemHtml(p.paciente_id, p.data_atendimento);
  }

  const signature = `
    <div class="signature" style="margin-top: 30px;">
      <div class="signature-line" style="width: 280px;"></div>
      <div class="name">${escapeHtml(p.profissional_nome || "Profissional responsável")}</div>
      ${p.setor ? `<div class="role">${escapeHtml(p.setor)}</div>` : ""}
    </div>`;

  const tipoLabel = TIPO_LABELS[p.tipo_registro || ""] || p.tipo_registro || "Atendimento Clínico";
  const acolhimentoHtml = p.dados_acolhimento ? renderAcolhimentoHtml(p.dados_acolhimento) : "";

  return `
    <div class="info-grid" style="margin-bottom: 8px; grid-template-columns: 2fr 1fr; padding: 8px; border-width: 0.8px; border-color: #000;">
      <div>
        <span class="info-label">Paciente</span>
        <div class="info-value" style="font-weight: 700; font-size: 11pt;">${escapeHtml(p.paciente_nome || "—")}</div>
      </div>
      <div>
        <span class="info-label">Tipo de Registro</span>
        <div class="info-value" style="font-weight: 700;">${escapeHtml(tipoLabel)}</div>
      </div>
      <div>
        <span class="info-label">Profissional / Setor</span>
        <div class="info-value">${escapeHtml(p.profissional_nome || "—")} ${p.setor ? `— ${escapeHtml(p.setor)}` : ""}</div>
      </div>
      <div>
        <span class="info-label">Data e Hora</span>
        <div class="info-value">${escapeHtml(fmtDate(p.data_atendimento))} ${p.hora_atendimento ? `às ${escapeHtml(p.hora_atendimento)}` : ""}</div>
      </div>
    </div>
    
    <div class="doc-content">
      ${triagemHtml}
      ${acolhimentoHtml}
      ${sectionsHtml}
      ${obsHtml}
      ${extraHtml}
      ${anexosHtml}
    </div>
    
    ${signature}
  `;
}

export function downloadProntuarioPdf(p: ProntuarioLike): void {
  void (async () => {
    try {
      const extraHtml = await renderCustomFieldsHtml('prontuario', p.custom_data || {}, {
        unidadeId: p.unidade_id,
        contexto: { especialidade: p.especialidade, tipoProntuario: p.tipo_prontuario },
        titulo: 'Informações Complementares',
      }).catch(() => '');
      
      const body = await buildProntuarioBody(p, extraHtml);
      
      await openPrintDocument(
        `PRONTUÁRIO CLÍNICO — ${p.paciente_nome}`,
        body,
        {
          Paciente: p.paciente_nome || "—",
          Profissional: p.profissional_nome || "—",
          Data: fmtDate(p.data_atendimento),
        },
      );
    } catch (err: any) {
      console.error("[Prontuário] Falha ao abrir impressão", err);
      toast.error("Não foi possível gerar o prontuário para impressão.");
    }
  })();
}

interface TimelineEntry {
  date: string;
  type?: string;
  professional?: string;
  specialty?: string;
  summary?: string;
  unidade?: string;
  sessionInfo?: string;
}

function buildHistoryBody(pacienteNome: string, entries: TimelineEntry[]): string {
  const rows = [...entries]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(
      (e) => `
        <tr>
          <td style="white-space: nowrap;">${escapeHtml(fmtDate(e.date))}</td>
          <td><strong>${escapeHtml([e.type || "—", e.sessionInfo].filter(Boolean).join(" "))}</strong></td>
          <td>${escapeHtml(e.professional || "—")}</td>
          <td>${escapeHtml(e.specialty || "—")}</td>
          <td><div style="font-size: 8.5pt; max-height: 120px; overflow: hidden; line-height: 1.2;">${escapeHtml(e.summary || "")}</div></td>
        </tr>`,
    )
    .join("");

  return `
    <div class="info-grid" style="margin-bottom: 15px; grid-template-columns: 3fr 1fr; border-width: 0.5px;">
      <div><span class="info-label">Paciente</span><div class="info-value" style="font-weight: 700; font-size: 11pt;">${escapeHtml(pacienteNome)}</div></div>
      <div><span class="info-label">Total de Registros</span><div class="info-value" style="font-weight: 700;">${entries.length}</div></div>
    </div>

    <h2 style="margin-top: 15px; margin-bottom: 8px; font-size: 11pt;">Linha do Tempo Clínica</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
      <thead>
        <tr style="background-color: #f8fafc;">
          <th style="width:12%; border: 0.5px solid #e2e8f0; padding: 4px;">Data</th>
          <th style="width:18%; border: 0.5px solid #e2e8f0; padding: 4px;">Tipo</th>
          <th style="width:20%; border: 0.5px solid #e2e8f0; padding: 4px;">Profissional</th>
          <th style="width:15%; border: 0.5px solid #e2e8f0; padding: 4px;">Especialidade</th>
          <th style="border: 0.5px solid #e2e8f0; padding: 4px;">Resumo Clínico</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#64748b;">Nenhum registro encontrado no histórico.</td></tr>'}</tbody>
    </table>
  `;
}

export function downloadFullHistoryPdf(pacienteNome: string, entries: TimelineEntry[]): void {
  void (async () => {
    try {
      await openPrintDocument(
        `HISTÓRICO CLÍNICO — ${pacienteNome}`,
        buildHistoryBody(pacienteNome, entries),
        { Paciente: pacienteNome, Eventos: String(entries.length) },
      );
    } catch (err: any) {
      console.error("[HistóricoClínico] Falha ao abrir impressão", err);
      toast.error("Não foi possível gerar o histórico para impressão.");
    }
  })();
}






