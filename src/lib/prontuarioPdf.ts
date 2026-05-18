/**
 * Geração de PDF/impressão do Prontuário Clínico e do Histórico Completo
 * passando 100% pelo shell institucional global (openPrintDocument).
 *
 * Antes este módulo gerava PDF diretamente com jsPDF, produzindo um cabeçalho
 * próprio (faixa azul + texto solto) totalmente fora do padrão institucional.
 * Agora a impressão herda automaticamente:
 *  - logos (esquerda / centro / direita) com tamanho e formato configurados
 *  - linhas institucionais (linha1, linha2)
 *  - rodapé global com data/hora e endereço institucional
 *
 * As chamadas existentes (`downloadProntuarioPdf`, `downloadFullHistoryPdf`)
 * continuam funcionando — internamente abrem a janela de impressão usando o
 * mesmo template usado pelos outros documentos.
 */

import { openPrintDocument } from "@/lib/printLayout";
import { toast } from "sonner";

interface ProntuarioLike {
  id: string;
  paciente_nome: string;
  profissional_nome: string;
  data_atendimento: string;
  hora_atendimento?: string;
  setor?: string;
  queixa_principal?: string;
  anamnese?: string;
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
}

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

/**
 * Tenta interpretar campos que vieram como JSON estruturado
 * (medicamentos, exames, relatório de alta) e renderiza de forma legível.
 */
function safe(str: string | undefined | null): string {
  if (!str) return "";
  const trimmed = str.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.medicamentos && Array.isArray(parsed.medicamentos)) {
        return parsed.medicamentos
          .map(
            (m: any, i: number) =>
              `${i + 1}. ${m.nome ?? ""} — ${m.dosagem || ""} ${m.via || ""} ${m.posologia || ""} ${m.duracao || ""}`.trim(),
          )
          .join("\n");
      }
      if (parsed?.exames && Array.isArray(parsed.exames)) {
        return parsed.exames
          .map(
            (e: any) =>
              `• ${e.nome ?? ""}${e.codigo_sus ? ` (${e.codigo_sus})` : ""}${e.indicacao ? ` — ${e.indicacao}` : ""}`,
          )
          .join("\n");
      }
      if (
        parsed?.diagCid ||
        parsed?.cid10 ||
        parsed?.profissionais ||
        parsed?.motivoAlta ||
        parsed?.motivo
      ) {
        return "Este registro é um Relatório de Alta. Utilize a tela do Relatório de Alta para imprimir o documento estruturado.";
      }
    } catch {
      /* não é JSON — segue como texto */
    }
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

function buildProntuarioBody(p: ProntuarioLike): string {
  const sections: Array<[string, string | undefined]> = [
    ["Queixa Principal", p.queixa_principal],
    ["S — Subjetivo", p.soap_subjetivo],
    ["O — Objetivo", p.soap_objetivo],
    ["A — Avaliação", p.soap_avaliacao],
    ["P — Plano", p.soap_plano],
    ["Anamnese", p.anamnese],
    ["Exame Físico", p.exame_fisico],
    ["Hipótese Diagnóstica", p.hipotese],
    ["Conduta", p.conduta],
    ["Procedimentos", p.procedimentos_texto],
    ["Prescrição", p.prescricao],
    ["Solicitação de Exames", p.solicitacao_exames],
    ["Evolução", p.evolucao],
    ["Observações", p.observacoes],
  ];

  const sectionsHtml = sections.map(([label, value]) => section(label, value)).join("");

  const signature = `
    <div class="signature">
      <div class="signature-line"></div>
      <div class="name">${escapeHtml(p.profissional_nome || "Profissional responsável")}</div>
      ${p.setor ? `<div class="role">${escapeHtml(p.setor)}</div>` : ""}
    </div>`;

  return `
    <div class="info-grid">
      <div><span class="info-label">Paciente</span><div class="info-value">${escapeHtml(p.paciente_nome || "—")}</div></div>
      <div><span class="info-label">Data do atendimento</span><div class="info-value">${escapeHtml(fmtDate(p.data_atendimento))}</div></div>
      <div><span class="info-label">Profissional</span><div class="info-value">${escapeHtml(p.profissional_nome || "—")}</div></div>
      <div><span class="info-label">Hora</span><div class="info-value">${escapeHtml(p.hora_atendimento || "—")}</div></div>
      <div><span class="info-label">Setor</span><div class="info-value">${escapeHtml(p.setor || "—")}</div></div>
      <div><span class="info-label">ID</span><div class="info-value">${escapeHtml((p.id || "").slice(0, 8))}</div></div>
    </div>
    ${sectionsHtml || '<div class="section"><div class="section-content">Sem conteúdo clínico registrado.</div></div>'}
    ${signature}
  `;
}

/**
 * Mantém a assinatura pública anterior (`downloadProntuarioPdf(p)`).
 * Em vez de gerar um PDF jsPDF próprio, abre o documento institucional
 * unificado e dispara a impressão (o usuário escolhe "Salvar como PDF"
 * no diálogo do navegador, garantindo PDF = Preview = Impressão).
 */
export function downloadProntuarioPdf(
  p: ProntuarioLike,
  _clinica = "Secretaria Municipal de Saúde — Oriximiná",
): void {
  void (async () => {
    try {
      await openPrintDocument(
        `PRONTUÁRIO CLÍNICO — ${fmtDate(p.data_atendimento)}`,
        buildProntuarioBody(p),
        {
          Paciente: p.paciente_nome || "—",
          Profissional: p.profissional_nome || "—",
          Data: fmtDate(p.data_atendimento),
        },
      );
    } catch (err: any) {
      if (err?.message === "POPUP_BLOCKED") {
        toast.error("Bloqueio de pop-up impediu abrir o documento. Permita pop-ups e tente novamente.");
      } else {
        console.error("[Prontuário] Falha ao abrir impressão", err);
        toast.error("Não foi possível gerar o prontuário para impressão.");
      }
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
  const sorted = [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const first = sorted[0]?.date ? fmtDate(sorted[0].date) : "—";
  const last = sorted[sorted.length - 1]?.date ? fmtDate(sorted[sorted.length - 1].date) : "—";

  const rows = [...entries]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(
      (e) => `
        <tr>
          <td>${escapeHtml(fmtDate(e.date))}</td>
          <td>${escapeHtml([e.type || "—", e.sessionInfo].filter(Boolean).join(" "))}</td>
          <td>${escapeHtml(e.professional || "—")}</td>
          <td>${escapeHtml(e.specialty || "—")}</td>
          <td>${escapeHtml((e.summary || "").slice(0, 320))}</td>
        </tr>`,
    )
    .join("");

  return `
    <div class="info-grid">
      <div><span class="info-label">Paciente</span><div class="info-value">${escapeHtml(pacienteNome)}</div></div>
      <div><span class="info-label">Total de eventos</span><div class="info-value">${entries.length}</div></div>
      <div><span class="info-label">Primeiro registro</span><div class="info-value">${escapeHtml(first)}</div></div>
      <div><span class="info-label">Último registro</span><div class="info-value">${escapeHtml(last)}</div></div>
    </div>

    <h2>Linha do tempo clínica</h2>
    <table>
      <thead>
        <tr>
          <th style="width:14%">Data</th>
          <th style="width:16%">Tipo</th>
          <th style="width:22%">Profissional</th>
          <th style="width:16%">Especialidade</th>
          <th>Resumo</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#64748b;">Sem registros encontrados.</td></tr>'}</tbody>
    </table>
  `;
}

/**
 * Mesma assinatura anterior — `downloadFullHistoryPdf(nome, entries)` —
 * mas usando o shell institucional unificado.
 */
export function downloadFullHistoryPdf(
  pacienteNome: string,
  entries: TimelineEntry[],
  _clinica = "Secretaria Municipal de Saúde — Oriximiná",
): void {
  void (async () => {
    try {
      await openPrintDocument(
        `HISTÓRICO CLÍNICO COMPLETO — ${pacienteNome}`,
        buildHistoryBody(pacienteNome, entries),
        { Paciente: pacienteNome, Eventos: String(entries.length) },
      );
    } catch (err: any) {
      if (err?.message === "POPUP_BLOCKED") {
        toast.error("Bloqueio de pop-up impediu abrir o documento. Permita pop-ups e tente novamente.");
      } else {
        console.error("[HistóricoClínico] Falha ao abrir impressão", err);
        toast.error("Não foi possível gerar o histórico para impressão.");
      }
    }
  })();
}
