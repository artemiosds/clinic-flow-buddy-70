// Base REME — Relação Municipal de Medicamentos (curada — complementa a RENAME)
// Itens típicos de saúde básica municipal: fitoterápicos, soluções de curativo,
// antissépticos e medicamentos comuns na atenção primária.

import type { RenameMedSeed } from './seedRenameMedications';

const R = (
  principio_ativo: string,
  concentracao: string,
  forma_farmaceutica: string,
  via_padrao: string,
  classe_terapeutica: string,
  codigo_reme: string,
  extras: Partial<RenameMedSeed> = {},
): RenameMedSeed & { codigo_reme: string } => ({
  nome: `${principio_ativo} ${concentracao} ${forma_farmaceutica}`,
  principio_ativo,
  concentracao,
  forma_farmaceutica,
  via_padrao,
  classe_terapeutica,
  apresentacao: `${concentracao} ${forma_farmaceutica}`,
  codigo_reme,
  ...extras,
});

export const REME_MEDICATIONS: (RenameMedSeed & { codigo_reme: string })[] = [
  // FITOTERÁPICOS
  R('Espinheira-santa (Maytenus ilicifolia)', '380 mg', 'cápsula', 'oral', 'Fitoterápico', 'RM0001'),
  R('Guaco (Mikania glomerata)', '35 mg/mL', 'xarope', 'oral', 'Fitoterápico', 'RM0002'),
  R('Cáscara-sagrada (Rhamnus purshiana)', '125 mg', 'cápsula', 'oral', 'Fitoterápico/Laxativo', 'RM0003'),
  R('Hortelã (Mentha piperita)', '0,2 mL', 'cápsula gastrorresistente', 'oral', 'Fitoterápico', 'RM0004'),
  R('Garra do diabo (Harpagophytum)', '400 mg', 'cápsula', 'oral', 'Fitoterápico', 'RM0005'),
  R('Soja (isoflavonas)', '150 mg', 'cápsula', 'oral', 'Fitoterápico', 'RM0006'),
  R('Babosa (Aloe vera)', '100 mg/g', 'gel tópico', 'tópica', 'Fitoterápico', 'RM0007'),
  R('Salgueiro branco (Salix alba)', '100 mg', 'comprimido', 'oral', 'Fitoterápico/Analgésico', 'RM0008'),

  // ANTISSÉPTICOS / CURATIVO
  R('Clorexidina', '2%', 'solução aquosa', 'tópica', 'Antisséptico', 'RM0020'),
  R('Clorexidina', '0,12%', 'solução bucal', 'oral', 'Antisséptico bucal', 'RM0021'),
  R('PVPI tópico', '10%', 'solução aquosa', 'tópica', 'Antisséptico', 'RM0022'),
  R('PVPI degermante', '10%', 'solução degermante', 'tópica', 'Antisséptico', 'RM0023'),
  R('Álcool 70%', '70%', 'solução tópica', 'tópica', 'Antisséptico', 'RM0024'),
  R('Permanganato de potássio', '100 mg', 'comprimido para diluição', 'tópica', 'Antisséptico', 'RM0025'),
  R('Soro fisiológico 0,9%', '0,9%', 'solução tópica', 'tópica', 'Higienização de feridas', 'RM0026'),
  R('Água oxigenada', '10 vol', 'solução tópica', 'tópica', 'Antisséptico', 'RM0027'),

  // SUPLEMENTAÇÃO PEDIÁTRICA / NUTRICIONAL
  R('Vitamina A', '100.000 UI', 'cápsula', 'oral', 'Vitamina', 'RM0040'),
  R('Zinco (sulfato)', '20 mg', 'comprimido', 'oral', 'Suplemento mineral', 'RM0041'),
  R('Zinco (sulfato)', '4 mg/mL', 'solução oral', 'oral', 'Suplemento mineral', 'RM0042'),
  R('Polivitamínico pediátrico', '—', 'solução oral gotas', 'oral', 'Vitamina', 'RM0043'),
  R('Carbonato de cálcio', '1250 mg', 'comprimido', 'oral', 'Suplemento mineral', 'RM0044'),
  R('Magnésio (cloreto)', '500 mg', 'comprimido', 'oral', 'Suplemento mineral', 'RM0045'),
  R('Vitamina C (ácido ascórbico)', '500 mg', 'comprimido', 'oral', 'Vitamina', 'RM0046'),

  // SAÚDE BUCAL / TÓPICOS
  R('Flúor (fluoreto de sódio)', '0,2%', 'solução bocheche', 'oral', 'Saúde bucal', 'RM0060'),
  R('Cariostático', '12%', 'solução tópica', 'tópica', 'Saúde bucal', 'RM0061'),
  R('Lidocaína gel', '2%', 'gel oral', 'oral', 'Anestésico tópico', 'RM0062'),

  // ANTI-HEMORROIDÁRIO / TÓPICOS RETAIS
  R('Tribenosida + Lidocaína', '50 mg/g + 20 mg/g', 'pomada retal', 'retal', 'Anti-hemorroidário', 'RM0070'),
  R('Glicerina', '12%', 'supositório', 'retal', 'Laxativo', 'RM0071'),

  // DERMATOLÓGICOS COMPLEMENTARES
  R('Vaselina sólida', '100%', 'pomada', 'tópica', 'Hidratante/Veículo', 'RM0080'),
  R('Pasta d\'água', '—', 'pasta', 'tópica', 'Protetor de pele', 'RM0081'),
  R('Ureia', '10%', 'creme', 'tópica', 'Hidratante', 'RM0082'),
  R('Hidrocortisona creme', '10 mg/g', 'creme', 'tópica', 'Corticosteroide tópico', 'RM0083'),
  R('Dexametasona creme', '1 mg/g', 'creme', 'tópica', 'Corticosteroide tópico', 'RM0084'),
  R('Calamina loção', '8%', 'loção', 'tópica', 'Protetor de pele', 'RM0085'),

  // OUTROS COMUNS NA APS
  R('Solução fisiológica 0,9% (frasco 500 mL)', '0,9%', 'solução parenteral', 'intravenosa', 'Solução parenteral', 'RM0100'),
  R('Glicose 5% (frasco 500 mL)', '5%', 'solução parenteral', 'intravenosa', 'Solução parenteral', 'RM0101'),
  R('Soro glicofisiológico', '—', 'solução parenteral', 'intravenosa', 'Solução parenteral', 'RM0102'),
  R('Sulfato de magnésio', '50%', 'solução injetável', 'intravenosa', 'Eletrólito', 'RM0103'),
  R('Cloreto de potássio', '10%', 'solução injetável', 'intravenosa', 'Eletrólito', 'RM0104'),
  R('Gluconato de cálcio', '10%', 'solução injetável', 'intravenosa', 'Eletrólito', 'RM0105'),
  R('Água destilada', '—', 'solução injetável', 'intravenosa', 'Diluente', 'RM0106'),

  // CONTRACEPÇÃO COMPLEMENTAR
  R('Levonorgestrel (emergência)', '1,5 mg', 'comprimido', 'oral', 'Contraceptivo de emergência', 'RM0120'),
  R('Camisinha masculina', '—', 'preservativo látex', 'tópica', 'Preservativo', 'RM0121'),
  R('Camisinha feminina', '—', 'preservativo poliuretano', 'tópica', 'Preservativo', 'RM0122'),

  // ANTIPARASITÁRIOS COMPLEMENTARES
  R('Nitazoxanida', '500 mg', 'comprimido', 'oral', 'Antiparasitário', 'RM0140'),
  R('Secnidazol', '1 g', 'comprimido', 'oral', 'Antiparasitário', 'RM0141'),

  // ANTIESPASMÓDICOS / ANALGÉSICOS COMBINADOS
  R('Dipirona + Cafeína + Orfenadrina', '300 mg + 50 mg + 35 mg', 'comprimido', 'oral', 'Analgésico/Antipirético', 'RM0150'),
  R('Paracetamol + Codeína', '500 mg + 30 mg', 'comprimido', 'oral', 'Opioide/Analgésico', 'RM0151', { tipo: 'controlado' }),

  // ANTIVERTIGINOSOS / RINOLOGIA
  R('Betaistina', '24 mg', 'comprimido', 'oral', 'Antivertiginoso', 'RM0160'),
  R('Flunarizina', '10 mg', 'comprimido', 'oral', 'Antivertiginoso', 'RM0161'),
  R('Oximetazolina nasal', '0,05%', 'spray nasal', 'nasal', 'Descongestionante nasal', 'RM0162'),

  // OUTROS COMPLEMENTARES
  R('Permanganato 1:60.000', '—', 'solução tópica', 'tópica', 'Antisséptico', 'RM0170'),
  R('Mupirocina', '20 mg/g', 'pomada', 'tópica', 'Antibiótico tópico', 'RM0171', { tipo: 'antibiotico' }),
  R('Aciclovir oftálmico', '30 mg/g', 'pomada oftálmica', 'ocular', 'Antiviral oftálmico', 'RM0172'),
];
