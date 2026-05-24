/**
 * Electronic signature utility for clinical documents.
 * Generates SHA-256 hash and signature block HTML.
 */
import { getPublicIp } from '@/lib/clientInfo';

export interface SignatureData {
  documentId: string;
  hash: string;
  ip: string;
  timestamp: string;
  profissionalNome: string;
  conselho: string;
  numeroRegistro: string;
  uf: string;
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateSignature(
  conteudo: string,
  profissionalId: string,
  profissionalNome: string,
  conselho: string,
  numeroRegistro: string,
  uf: string
): Promise<SignatureData> {
  const documentId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const ip = await getPublicIp();
  const hash = await sha256(`${conteudo}|${profissionalId}|${timestamp}|${documentId}`);

  return {
    documentId,
    hash,
    ip,
    timestamp,
    profissionalNome,
    conselho,
    numeroRegistro,
    uf,
  };
}

export function formatSignatureBlock(sig: SignatureData): string {
  const dt = new Date(sig.timestamp);
  const dataFormatada = dt.toLocaleDateString('pt-BR');
  const horaFormatada = dt.toLocaleTimeString('pt-BR');
  const hashCurto = sig.hash.substring(0, 32).toUpperCase();

  return `
    <div class="e-signature-box">
      <div class="sig-title">ASSINATURA ELETRÔNICA</div>
      <div>Documento assinado eletronicamente por:</div>
      <div style="font-weight:600;font-size:10px;margin:4px 0;">${sig.profissionalNome} — ${sig.conselho} ${sig.numeroRegistro}/${sig.uf}</div>
      <div>Data/hora: ${dataFormatada} às ${horaFormatada}</div>
      <div>Código de verificação: <span style="font-family:monospace;font-size:8px;background:#e2e8f0;padding:1px 4px;border-radius:2px;">${hashCurto}</span></div>
      <div>ID do documento: <span style="font-family:monospace;font-size:8px;">${sig.documentId}</span></div>
      <div class="sig-legal">Este documento possui validade como assinatura eletrônica simples conforme Art. 10 da MP 2.200-2.</div>
    </div>`;
}

export interface CarimboData {
  tipo: 'digital' | 'imagem';
  nome: string;
  conselho: string;
  numero_registro: string;
  uf: string;
  especialidade: string;
  cargo: string;
  imagem_url: string;
}

export function formatCarimboBlock(carimbo: CarimboData | null): string {
  if (!carimbo) return '';

  if (carimbo.tipo === 'imagem' && carimbo.imagem_url) {
    return `<div class="carimbo-block-wrapper" style="text-align:center;display:inline-block;">
      <img src="${carimbo.imagem_url}" alt="Carimbo" style="max-width:240px;max-height:110px;object-fit:contain;" />
    </div>`;
  }

  if (carimbo.tipo === 'digital') {
    return `
      <div class="carimbo-digital" style="border: 1.5px solid #000; border-radius: 4px; padding: 6px 12px; text-align: center; display: inline-block; background: #fff; min-width: 200px;">
        <div class="carimbo-nome" style="font-weight: 700; font-size: 11pt; color: #000; text-transform: uppercase;">${carimbo.nome}</div>
        <div class="carimbo-info" style="font-size: 8.5pt; color: #334155; font-weight: 600;">${carimbo.conselho} / ${carimbo.numero_registro}${carimbo.uf ? '-' + carimbo.uf : ''}</div>
        ${carimbo.especialidade ? `<div class="carimbo-info" style="font-size: 8pt; color: #475569;">${carimbo.especialidade}</div>` : ''}
        ${carimbo.cargo ? `<div class="carimbo-info" style="font-size: 8pt; color: #475569;">${carimbo.cargo}</div>` : ''}
        <div style="font-size: 7pt; color: #94a3b8; margin-top: 2px; border-top: 0.5px solid #e2e8f0; padding-top: 2px;">CAPS II — ORIXIMINÁ/PA</div>
      </div>`;
  }

  return '';
}

/**
 * Fetch professional stamp data from the database.
 */
export async function fetchProfessionalCarimbo(
  supabase: any,
  professionalId: string
): Promise<CarimboData | null> {
  if (!professionalId) return null;
  try {
    const { data, error } = await supabase
      .from('profissionais_carimbo')
      .select('*')
      .eq('profissional_id', professionalId)
      .maybeSingle();

    if (error || !data) return null;
    return data as CarimboData;
  } catch (err) {
    console.error('Error fetching professional stamp:', err);
    return null;
  }
}
