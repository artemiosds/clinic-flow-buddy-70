// Base RENAME — Relação Nacional de Medicamentos Essenciais (curada)
// Cobertura ampla por área (analgésicos, antibióticos, cardio, endócrino, saúde
// mental, respiratório, GI, dermato, oftalmo, pediátrico, hormônios, etc.).
// Cada apresentação/dosagem é um item próprio para uso em prescrições estruturadas.

export type MedTipo = 'comum' | 'controlado' | 'psicotropico' | 'antibiotico';

export interface RenameMedSeed {
  nome: string;
  principio_ativo: string;
  concentracao: string;
  forma_farmaceutica: string;
  via_padrao: string;
  classe_terapeutica: string;
  apresentacao: string;
  dosagem_padrao?: string;
  nome_comercial?: string;
  codigo_rename?: string;
  tipo?: MedTipo;
}

// Helper para encurtar declarações repetidas
const M = (
  principio_ativo: string,
  concentracao: string,
  forma_farmaceutica: string,
  via_padrao: string,
  classe_terapeutica: string,
  extras: Partial<RenameMedSeed> = {},
): RenameMedSeed => ({
  nome: `${principio_ativo} ${concentracao} ${forma_farmaceutica}`,
  principio_ativo,
  concentracao,
  forma_farmaceutica,
  via_padrao,
  classe_terapeutica,
  apresentacao: `${concentracao} ${forma_farmaceutica}`,
  ...extras,
});

export const RENAME_MEDICATIONS: RenameMedSeed[] = [
  // ============ ANALGÉSICOS / ANTITÉRMICOS ============
  M('Dipirona sódica', '500 mg', 'comprimido', 'oral', 'Analgésico/Antipirético', { nome_comercial: 'Novalgina', codigo_rename: 'RN0001' }),
  M('Dipirona sódica', '500 mg/mL', 'solução oral gotas', 'oral', 'Analgésico/Antipirético', { nome_comercial: 'Novalgina', codigo_rename: 'RN0002' }),
  M('Dipirona sódica', '500 mg/mL', 'solução injetável', 'intravenosa', 'Analgésico/Antipirético', { codigo_rename: 'RN0003' }),
  M('Paracetamol', '500 mg', 'comprimido', 'oral', 'Analgésico/Antipirético', { nome_comercial: 'Tylenol', codigo_rename: 'RN0004' }),
  M('Paracetamol', '750 mg', 'comprimido', 'oral', 'Analgésico/Antipirético', { codigo_rename: 'RN0005' }),
  M('Paracetamol', '200 mg/mL', 'solução oral gotas', 'oral', 'Analgésico/Antipirético', { codigo_rename: 'RN0006' }),
  M('Ácido acetilsalicílico', '100 mg', 'comprimido', 'oral', 'Antiagregante plaquetário', { nome_comercial: 'AAS', codigo_rename: 'RN0007' }),
  M('Ácido acetilsalicílico', '500 mg', 'comprimido', 'oral', 'Analgésico/Antipirético', { nome_comercial: 'AAS', codigo_rename: 'RN0008' }),

  // ============ AINEs / ANTI-INFLAMATÓRIOS ============
  M('Ibuprofeno', '300 mg', 'comprimido', 'oral', 'Anti-inflamatório', { codigo_rename: 'RN0010' }),
  M('Ibuprofeno', '600 mg', 'comprimido', 'oral', 'Anti-inflamatório', { codigo_rename: 'RN0011' }),
  M('Ibuprofeno', '50 mg/mL', 'suspensão oral', 'oral', 'Anti-inflamatório', { codigo_rename: 'RN0012' }),
  M('Diclofenaco sódico', '50 mg', 'comprimido', 'oral', 'Anti-inflamatório', { nome_comercial: 'Voltaren', codigo_rename: 'RN0013' }),
  M('Diclofenaco sódico', '25 mg/mL', 'solução injetável', 'intramuscular', 'Anti-inflamatório', { codigo_rename: 'RN0014' }),
  M('Diclofenaco potássico', '50 mg', 'comprimido', 'oral', 'Anti-inflamatório', { codigo_rename: 'RN0015' }),
  M('Nimesulida', '100 mg', 'comprimido', 'oral', 'Anti-inflamatório', { codigo_rename: 'RN0016' }),
  M('Naproxeno', '500 mg', 'comprimido', 'oral', 'Anti-inflamatório', { codigo_rename: 'RN0017' }),
  M('Cetoprofeno', '100 mg', 'comprimido', 'oral', 'Anti-inflamatório', { codigo_rename: 'RN0018' }),
  M('Cetoprofeno', '100 mg', 'pó liofilizado injetável', 'intravenosa', 'Anti-inflamatório', { codigo_rename: 'RN0019' }),
  M('Meloxicam', '15 mg', 'comprimido', 'oral', 'Anti-inflamatório', { codigo_rename: 'RN0020' }),
  M('Piroxicam', '20 mg', 'comprimido', 'oral', 'Anti-inflamatório', { codigo_rename: 'RN0021' }),

  // ============ CORTICOSTEROIDES ============
  M('Prednisona', '5 mg', 'comprimido', 'oral', 'Corticosteroide', { codigo_rename: 'RN0030' }),
  M('Prednisona', '20 mg', 'comprimido', 'oral', 'Corticosteroide', { codigo_rename: 'RN0031' }),
  M('Prednisolona', '3 mg/mL', 'solução oral', 'oral', 'Corticosteroide', { codigo_rename: 'RN0032' }),
  M('Dexametasona', '4 mg', 'comprimido', 'oral', 'Corticosteroide', { codigo_rename: 'RN0033' }),
  M('Dexametasona', '4 mg/mL', 'solução injetável', 'intravenosa', 'Corticosteroide', { codigo_rename: 'RN0034' }),
  M('Hidrocortisona', '100 mg', 'pó para solução injetável', 'intravenosa', 'Corticosteroide', { codigo_rename: 'RN0035' }),
  M('Hidrocortisona', '500 mg', 'pó para solução injetável', 'intravenosa', 'Corticosteroide', { codigo_rename: 'RN0036' }),
  M('Betametasona', '0,5 mg', 'comprimido', 'oral', 'Corticosteroide', { codigo_rename: 'RN0037' }),
  M('Beclometasona', '50 mcg/dose', 'spray nasal', 'nasal', 'Corticosteroide', { codigo_rename: 'RN0038' }),
  M('Budesonida', '200 mcg/dose', 'aerossol inalatório', 'inalatória', 'Corticosteroide', { codigo_rename: 'RN0039' }),

  // ============ ANTIBIÓTICOS ============
  M('Amoxicilina', '500 mg', 'cápsula', 'oral', 'Antibiótico', { nome_comercial: 'Amoxil', codigo_rename: 'RN0050', tipo: 'antibiotico' }),
  M('Amoxicilina', '50 mg/mL', 'pó para suspensão oral', 'oral', 'Antibiótico', { codigo_rename: 'RN0051', tipo: 'antibiotico' }),
  M('Amoxicilina + Clavulanato', '500 mg + 125 mg', 'comprimido', 'oral', 'Antibiótico', { nome_comercial: 'Clavulin', codigo_rename: 'RN0052', tipo: 'antibiotico' }),
  M('Amoxicilina + Clavulanato', '875 mg + 125 mg', 'comprimido', 'oral', 'Antibiótico', { codigo_rename: 'RN0053', tipo: 'antibiotico' }),
  M('Ampicilina', '500 mg', 'cápsula', 'oral', 'Antibiótico', { codigo_rename: 'RN0054', tipo: 'antibiotico' }),
  M('Azitromicina', '500 mg', 'comprimido', 'oral', 'Antibiótico', { nome_comercial: 'Zitromax', codigo_rename: 'RN0055', tipo: 'antibiotico' }),
  M('Azitromicina', '40 mg/mL', 'suspensão oral', 'oral', 'Antibiótico', { codigo_rename: 'RN0056', tipo: 'antibiotico' }),
  M('Benzilpenicilina benzatina', '1.200.000 UI', 'pó para suspensão injetável', 'intramuscular', 'Antibiótico', { nome_comercial: 'Benzetacil', codigo_rename: 'RN0057', tipo: 'antibiotico' }),
  M('Benzilpenicilina benzatina', '600.000 UI', 'pó para suspensão injetável', 'intramuscular', 'Antibiótico', { codigo_rename: 'RN0058', tipo: 'antibiotico' }),
  M('Cefalexina', '500 mg', 'cápsula', 'oral', 'Antibiótico', { codigo_rename: 'RN0059', tipo: 'antibiotico' }),
  M('Cefalexina', '50 mg/mL', 'suspensão oral', 'oral', 'Antibiótico', { codigo_rename: 'RN0060', tipo: 'antibiotico' }),
  M('Cefalotina', '1 g', 'pó para solução injetável', 'intravenosa', 'Antibiótico', { codigo_rename: 'RN0061', tipo: 'antibiotico' }),
  M('Ceftriaxona', '1 g', 'pó para solução injetável', 'intravenosa', 'Antibiótico', { codigo_rename: 'RN0062', tipo: 'antibiotico' }),
  M('Ceftriaxona', '500 mg', 'pó para solução injetável', 'intramuscular', 'Antibiótico', { codigo_rename: 'RN0063', tipo: 'antibiotico' }),
  M('Ciprofloxacino', '500 mg', 'comprimido', 'oral', 'Antibiótico', { codigo_rename: 'RN0064', tipo: 'antibiotico' }),
  M('Ciprofloxacino', '250 mg', 'comprimido', 'oral', 'Antibiótico', { codigo_rename: 'RN0065', tipo: 'antibiotico' }),
  M('Claritromicina', '500 mg', 'comprimido', 'oral', 'Antibiótico', { codigo_rename: 'RN0066', tipo: 'antibiotico' }),
  M('Clindamicina', '300 mg', 'cápsula', 'oral', 'Antibiótico', { codigo_rename: 'RN0067', tipo: 'antibiotico' }),
  M('Doxiciclina', '100 mg', 'comprimido', 'oral', 'Antibiótico', { codigo_rename: 'RN0068', tipo: 'antibiotico' }),
  M('Eritromicina', '500 mg', 'comprimido', 'oral', 'Antibiótico', { codigo_rename: 'RN0069', tipo: 'antibiotico' }),
  M('Gentamicina', '40 mg/mL', 'solução injetável', 'intramuscular', 'Antibiótico', { codigo_rename: 'RN0070', tipo: 'antibiotico' }),
  M('Metronidazol', '250 mg', 'comprimido', 'oral', 'Antibiótico', { codigo_rename: 'RN0071', tipo: 'antibiotico' }),
  M('Metronidazol', '400 mg', 'comprimido', 'oral', 'Antibiótico', { codigo_rename: 'RN0072', tipo: 'antibiotico' }),
  M('Metronidazol', '40 mg/mL', 'suspensão oral', 'oral', 'Antibiótico', { codigo_rename: 'RN0073', tipo: 'antibiotico' }),
  M('Metronidazol', '5 mg/mL', 'solução injetável', 'intravenosa', 'Antibiótico', { codigo_rename: 'RN0074', tipo: 'antibiotico' }),
  M('Nitrofurantoína', '100 mg', 'cápsula', 'oral', 'Antibiótico', { codigo_rename: 'RN0075', tipo: 'antibiotico' }),
  M('Norfloxacino', '400 mg', 'comprimido', 'oral', 'Antibiótico', { codigo_rename: 'RN0076', tipo: 'antibiotico' }),
  M('Oxacilina', '500 mg', 'pó para solução injetável', 'intravenosa', 'Antibiótico', { codigo_rename: 'RN0077', tipo: 'antibiotico' }),
  M('Sulfametoxazol + Trimetoprima', '400 mg + 80 mg', 'comprimido', 'oral', 'Antibiótico', { nome_comercial: 'Bactrim', codigo_rename: 'RN0078', tipo: 'antibiotico' }),
  M('Sulfametoxazol + Trimetoprima', '40 mg/mL + 8 mg/mL', 'suspensão oral', 'oral', 'Antibiótico', { codigo_rename: 'RN0079', tipo: 'antibiotico' }),
  M('Tetraciclina', '500 mg', 'cápsula', 'oral', 'Antibiótico', { codigo_rename: 'RN0080', tipo: 'antibiotico' }),

  // ============ ANTIFÚNGICOS ============
  M('Cetoconazol', '200 mg', 'comprimido', 'oral', 'Antifúngico', { codigo_rename: 'RN0090' }),
  M('Cetoconazol', '20 mg/g', 'creme dermatológico', 'tópica', 'Antifúngico', { codigo_rename: 'RN0091' }),
  M('Fluconazol', '150 mg', 'cápsula', 'oral', 'Antifúngico', { codigo_rename: 'RN0092' }),
  M('Fluconazol', '100 mg', 'cápsula', 'oral', 'Antifúngico', { codigo_rename: 'RN0093' }),
  M('Itraconazol', '100 mg', 'cápsula', 'oral', 'Antifúngico', { codigo_rename: 'RN0094' }),
  M('Miconazol', '20 mg/g', 'creme', 'tópica', 'Antifúngico', { codigo_rename: 'RN0095' }),
  M('Nistatina', '100.000 UI/mL', 'suspensão oral', 'oral', 'Antifúngico', { codigo_rename: 'RN0096' }),
  M('Terbinafina', '250 mg', 'comprimido', 'oral', 'Antifúngico', { codigo_rename: 'RN0097' }),

  // ============ ANTIVIRAIS / ANTIPARASITÁRIOS ============
  M('Aciclovir', '200 mg', 'comprimido', 'oral', 'Antiviral', { codigo_rename: 'RN0100' }),
  M('Aciclovir', '400 mg', 'comprimido', 'oral', 'Antiviral', { codigo_rename: 'RN0101' }),
  M('Aciclovir', '50 mg/g', 'creme', 'tópica', 'Antiviral', { codigo_rename: 'RN0102' }),
  M('Albendazol', '400 mg', 'comprimido mastigável', 'oral', 'Antiparasitário', { codigo_rename: 'RN0103' }),
  M('Albendazol', '40 mg/mL', 'suspensão oral', 'oral', 'Antiparasitário', { codigo_rename: 'RN0104' }),
  M('Ivermectina', '6 mg', 'comprimido', 'oral', 'Antiparasitário', { codigo_rename: 'RN0105' }),
  M('Mebendazol', '100 mg', 'comprimido', 'oral', 'Antiparasitário', { codigo_rename: 'RN0106' }),
  M('Praziquantel', '600 mg', 'comprimido', 'oral', 'Antiparasitário', { codigo_rename: 'RN0107' }),
  M('Tinidazol', '500 mg', 'comprimido', 'oral', 'Antiparasitário', { codigo_rename: 'RN0108' }),

  // ============ ANTI-HIPERTENSIVOS / CARDIOVASCULARES ============
  M('Captopril', '12,5 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0120' }),
  M('Captopril', '25 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0121' }),
  M('Captopril', '50 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0122' }),
  M('Enalapril', '5 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0123' }),
  M('Enalapril', '10 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0124' }),
  M('Enalapril', '20 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0125' }),
  M('Losartana potássica', '25 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0126' }),
  M('Losartana potássica', '50 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0127' }),
  M('Losartana potássica', '100 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0128' }),
  M('Hidroclorotiazida', '25 mg', 'comprimido', 'oral', 'Diurético', { codigo_rename: 'RN0129' }),
  M('Hidroclorotiazida', '50 mg', 'comprimido', 'oral', 'Diurético', { codigo_rename: 'RN0130' }),
  M('Furosemida', '40 mg', 'comprimido', 'oral', 'Diurético', { codigo_rename: 'RN0131' }),
  M('Furosemida', '10 mg/mL', 'solução injetável', 'intravenosa', 'Diurético', { codigo_rename: 'RN0132' }),
  M('Espironolactona', '25 mg', 'comprimido', 'oral', 'Diurético', { codigo_rename: 'RN0133' }),
  M('Espironolactona', '100 mg', 'comprimido', 'oral', 'Diurético', { codigo_rename: 'RN0134' }),
  M('Anlodipino besilato', '5 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0135' }),
  M('Anlodipino besilato', '10 mg', 'comprimido', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0136' }),
  M('Nifedipino', '20 mg', 'comprimido retard', 'oral', 'Anti-hipertensivo', { codigo_rename: 'RN0137' }),
  M('Atenolol', '25 mg', 'comprimido', 'oral', 'Beta-bloqueador', { codigo_rename: 'RN0138' }),
  M('Atenolol', '50 mg', 'comprimido', 'oral', 'Beta-bloqueador', { codigo_rename: 'RN0139' }),
  M('Atenolol', '100 mg', 'comprimido', 'oral', 'Beta-bloqueador', { codigo_rename: 'RN0140' }),
  M('Propranolol', '40 mg', 'comprimido', 'oral', 'Beta-bloqueador', { codigo_rename: 'RN0141' }),
  M('Propranolol', '80 mg', 'comprimido', 'oral', 'Beta-bloqueador', { codigo_rename: 'RN0142' }),
  M('Metoprolol', '50 mg', 'comprimido', 'oral', 'Beta-bloqueador', { codigo_rename: 'RN0143' }),
  M('Carvedilol', '6,25 mg', 'comprimido', 'oral', 'Beta-bloqueador', { codigo_rename: 'RN0144' }),
  M('Carvedilol', '25 mg', 'comprimido', 'oral', 'Beta-bloqueador', { codigo_rename: 'RN0145' }),
  M('Digoxina', '0,25 mg', 'comprimido', 'oral', 'Cardiotônico', { codigo_rename: 'RN0146' }),
  M('Isossorbida', '5 mg', 'comprimido sublingual', 'sublingual', 'Vasodilatador', { codigo_rename: 'RN0147' }),
  M('Isossorbida (mononitrato)', '20 mg', 'comprimido', 'oral', 'Vasodilatador', { codigo_rename: 'RN0148' }),

  // ============ HIPOLIPEMIANTES ============
  M('Sinvastatina', '10 mg', 'comprimido', 'oral', 'Hipolipemiante', { codigo_rename: 'RN0160' }),
  M('Sinvastatina', '20 mg', 'comprimido', 'oral', 'Hipolipemiante', { codigo_rename: 'RN0161' }),
  M('Sinvastatina', '40 mg', 'comprimido', 'oral', 'Hipolipemiante', { codigo_rename: 'RN0162' }),
  M('Atorvastatina', '10 mg', 'comprimido', 'oral', 'Hipolipemiante', { codigo_rename: 'RN0163' }),
  M('Atorvastatina', '20 mg', 'comprimido', 'oral', 'Hipolipemiante', { codigo_rename: 'RN0164' }),
  M('Ciprofibrato', '100 mg', 'comprimido', 'oral', 'Hipolipemiante', { codigo_rename: 'RN0165' }),

  // ============ ANTIDIABÉTICOS ============
  M('Metformina', '500 mg', 'comprimido', 'oral', 'Antidiabético', { codigo_rename: 'RN0170' }),
  M('Metformina', '850 mg', 'comprimido', 'oral', 'Antidiabético', { codigo_rename: 'RN0171' }),
  M('Metformina', '1000 mg', 'comprimido', 'oral', 'Antidiabético', { codigo_rename: 'RN0172' }),
  M('Glibenclamida', '5 mg', 'comprimido', 'oral', 'Antidiabético', { codigo_rename: 'RN0173' }),
  M('Gliclazida', '30 mg', 'comprimido', 'oral', 'Antidiabético', { codigo_rename: 'RN0174' }),
  M('Gliclazida', '60 mg', 'comprimido', 'oral', 'Antidiabético', { codigo_rename: 'RN0175' }),
  M('Insulina humana NPH', '100 UI/mL', 'suspensão injetável', 'subcutânea', 'Antidiabético', { codigo_rename: 'RN0176' }),
  M('Insulina humana regular', '100 UI/mL', 'solução injetável', 'subcutânea', 'Antidiabético', { codigo_rename: 'RN0177' }),

  // ============ ANTITROMBÓTICOS ============
  M('Varfarina sódica', '5 mg', 'comprimido', 'oral', 'Anticoagulante', { codigo_rename: 'RN0180' }),
  M('Heparina sódica', '5.000 UI/mL', 'solução injetável', 'subcutânea', 'Anticoagulante', { codigo_rename: 'RN0181' }),
  M('Enoxaparina sódica', '40 mg/0,4 mL', 'solução injetável', 'subcutânea', 'Anticoagulante', { codigo_rename: 'RN0182' }),
  M('Clopidogrel', '75 mg', 'comprimido', 'oral', 'Antiagregante plaquetário', { codigo_rename: 'RN0183' }),

  // ============ SAÚDE MENTAL / NEUROLÓGICOS ============
  M('Fluoxetina', '20 mg', 'cápsula', 'oral', 'Antidepressivo', { nome_comercial: 'Prozac', codigo_rename: 'RN0200', tipo: 'psicotropico' }),
  M('Sertralina', '50 mg', 'comprimido', 'oral', 'Antidepressivo', { codigo_rename: 'RN0201', tipo: 'psicotropico' }),
  M('Sertralina', '100 mg', 'comprimido', 'oral', 'Antidepressivo', { codigo_rename: 'RN0202', tipo: 'psicotropico' }),
  M('Amitriptilina', '25 mg', 'comprimido', 'oral', 'Antidepressivo', { codigo_rename: 'RN0203', tipo: 'psicotropico' }),
  M('Amitriptilina', '75 mg', 'comprimido', 'oral', 'Antidepressivo', { codigo_rename: 'RN0204', tipo: 'psicotropico' }),
  M('Nortriptilina', '25 mg', 'cápsula', 'oral', 'Antidepressivo', { codigo_rename: 'RN0205', tipo: 'psicotropico' }),
  M('Imipramina', '25 mg', 'comprimido', 'oral', 'Antidepressivo', { codigo_rename: 'RN0206', tipo: 'psicotropico' }),
  M('Clomipramina', '25 mg', 'comprimido', 'oral', 'Antidepressivo', { codigo_rename: 'RN0207', tipo: 'psicotropico' }),
  M('Diazepam', '5 mg', 'comprimido', 'oral', 'Benzodiazepínico', { codigo_rename: 'RN0208', tipo: 'psicotropico' }),
  M('Diazepam', '10 mg', 'comprimido', 'oral', 'Benzodiazepínico', { codigo_rename: 'RN0209', tipo: 'psicotropico' }),
  M('Diazepam', '5 mg/mL', 'solução injetável', 'intravenosa', 'Benzodiazepínico', { codigo_rename: 'RN0210', tipo: 'psicotropico' }),
  M('Clonazepam', '2 mg', 'comprimido', 'oral', 'Benzodiazepínico', { nome_comercial: 'Rivotril', codigo_rename: 'RN0211', tipo: 'psicotropico' }),
  M('Clonazepam', '2,5 mg/mL', 'solução oral gotas', 'oral', 'Benzodiazepínico', { codigo_rename: 'RN0212', tipo: 'psicotropico' }),
  M('Midazolam', '15 mg', 'comprimido', 'oral', 'Benzodiazepínico', { codigo_rename: 'RN0213', tipo: 'psicotropico' }),
  M('Midazolam', '5 mg/mL', 'solução injetável', 'intravenosa', 'Benzodiazepínico', { codigo_rename: 'RN0214', tipo: 'psicotropico' }),
  M('Haloperidol', '5 mg', 'comprimido', 'oral', 'Antipsicótico', { codigo_rename: 'RN0215', tipo: 'psicotropico' }),
  M('Haloperidol', '2 mg/mL', 'solução oral gotas', 'oral', 'Antipsicótico', { codigo_rename: 'RN0216', tipo: 'psicotropico' }),
  M('Haloperidol decanoato', '50 mg/mL', 'solução injetável', 'intramuscular', 'Antipsicótico', { codigo_rename: 'RN0217', tipo: 'psicotropico' }),
  M('Risperidona', '1 mg', 'comprimido', 'oral', 'Antipsicótico', { codigo_rename: 'RN0218', tipo: 'psicotropico' }),
  M('Risperidona', '2 mg', 'comprimido', 'oral', 'Antipsicótico', { codigo_rename: 'RN0219', tipo: 'psicotropico' }),
  M('Olanzapina', '10 mg', 'comprimido', 'oral', 'Antipsicótico', { codigo_rename: 'RN0220', tipo: 'psicotropico' }),
  M('Quetiapina', '25 mg', 'comprimido', 'oral', 'Antipsicótico', { codigo_rename: 'RN0221', tipo: 'psicotropico' }),
  M('Quetiapina', '100 mg', 'comprimido', 'oral', 'Antipsicótico', { codigo_rename: 'RN0222', tipo: 'psicotropico' }),
  M('Clorpromazina', '100 mg', 'comprimido', 'oral', 'Antipsicótico', { codigo_rename: 'RN0223', tipo: 'psicotropico' }),
  M('Carbonato de lítio', '300 mg', 'comprimido', 'oral', 'Estabilizador de humor', { codigo_rename: 'RN0224', tipo: 'psicotropico' }),
  M('Carbamazepina', '200 mg', 'comprimido', 'oral', 'Anticonvulsivante', { codigo_rename: 'RN0225', tipo: 'psicotropico' }),
  M('Ácido valproico', '250 mg', 'cápsula', 'oral', 'Anticonvulsivante', { codigo_rename: 'RN0226', tipo: 'psicotropico' }),
  M('Ácido valproico', '500 mg', 'comprimido', 'oral', 'Anticonvulsivante', { codigo_rename: 'RN0227', tipo: 'psicotropico' }),
  M('Fenitoína sódica', '100 mg', 'comprimido', 'oral', 'Anticonvulsivante', { codigo_rename: 'RN0228', tipo: 'psicotropico' }),
  M('Fenobarbital', '100 mg', 'comprimido', 'oral', 'Anticonvulsivante', { codigo_rename: 'RN0229', tipo: 'psicotropico' }),
  M('Fenobarbital', '40 mg/mL', 'solução oral gotas', 'oral', 'Anticonvulsivante', { codigo_rename: 'RN0230', tipo: 'psicotropico' }),
  M('Levetiracetam', '500 mg', 'comprimido', 'oral', 'Anticonvulsivante', { codigo_rename: 'RN0231' }),
  M('Gabapentina', '300 mg', 'cápsula', 'oral', 'Anticonvulsivante', { codigo_rename: 'RN0232' }),

  // ============ OPIOIDES (CONTROLADOS) ============
  M('Tramadol', '50 mg', 'cápsula', 'oral', 'Opioide/Analgésico', { codigo_rename: 'RN0240', tipo: 'controlado' }),
  M('Tramadol', '100 mg/2 mL', 'solução injetável', 'intramuscular', 'Opioide/Analgésico', { codigo_rename: 'RN0241', tipo: 'controlado' }),
  M('Codeína', '30 mg', 'comprimido', 'oral', 'Opioide/Analgésico', { codigo_rename: 'RN0242', tipo: 'controlado' }),
  M('Morfina', '10 mg', 'comprimido', 'oral', 'Opioide/Analgésico', { codigo_rename: 'RN0243', tipo: 'controlado' }),
  M('Morfina', '10 mg/mL', 'solução injetável', 'intravenosa', 'Opioide/Analgésico', { codigo_rename: 'RN0244', tipo: 'controlado' }),
  M('Metilfenidato', '10 mg', 'comprimido', 'oral', 'Estimulante SNC', { nome_comercial: 'Ritalina', codigo_rename: 'RN0245', tipo: 'controlado' }),

  // ============ GASTROINTESTINAIS ============
  M('Omeprazol', '20 mg', 'cápsula', 'oral', 'Inibidor de bomba de prótons', { codigo_rename: 'RN0260' }),
  M('Omeprazol', '40 mg', 'pó liofilizado injetável', 'intravenosa', 'Inibidor de bomba de prótons', { codigo_rename: 'RN0261' }),
  M('Pantoprazol', '40 mg', 'comprimido', 'oral', 'Inibidor de bomba de prótons', { codigo_rename: 'RN0262' }),
  M('Ranitidina', '150 mg', 'comprimido', 'oral', 'Antagonista H2', { codigo_rename: 'RN0263' }),
  M('Ranitidina', '50 mg/2 mL', 'solução injetável', 'intravenosa', 'Antagonista H2', { codigo_rename: 'RN0264' }),
  M('Hidróxido de alumínio + magnésio', '60 mg/mL + 40 mg/mL', 'suspensão oral', 'oral', 'Antiácido', { codigo_rename: 'RN0265' }),
  M('Bromoprida', '4 mg/mL', 'solução oral gotas', 'oral', 'Procinético', { codigo_rename: 'RN0266' }),
  M('Metoclopramida', '10 mg', 'comprimido', 'oral', 'Antiemético', { codigo_rename: 'RN0267' }),
  M('Metoclopramida', '5 mg/mL', 'solução injetável', 'intravenosa', 'Antiemético', { codigo_rename: 'RN0268' }),
  M('Ondansetrona', '4 mg', 'comprimido', 'oral', 'Antiemético', { codigo_rename: 'RN0269' }),
  M('Ondansetrona', '2 mg/mL', 'solução injetável', 'intravenosa', 'Antiemético', { codigo_rename: 'RN0270' }),
  M('Dimenidrinato', '25 mg', 'comprimido', 'oral', 'Antiemético', { codigo_rename: 'RN0271' }),
  M('Hioscina', '10 mg', 'comprimido', 'oral', 'Antiespasmódico', { codigo_rename: 'RN0272' }),
  M('Hioscina + Dipirona', '6,67 mg + 333,4 mg/mL', 'solução oral gotas', 'oral', 'Antiespasmódico', { codigo_rename: 'RN0273' }),
  M('Loperamida', '2 mg', 'cápsula', 'oral', 'Antidiarreico', { codigo_rename: 'RN0274' }),
  M('Soro de reidratação oral', '20,5 g', 'pó para solução oral', 'oral', 'Reidratante', { codigo_rename: 'RN0275' }),
  M('Dimeticona', '40 mg', 'comprimido', 'oral', 'Antiflatulento', { codigo_rename: 'RN0276' }),
  M('Lactulose', '667 mg/mL', 'xarope', 'oral', 'Laxativo', { codigo_rename: 'RN0277' }),

  // ============ RESPIRATÓRIOS ============
  M('Salbutamol', '100 mcg/dose', 'aerossol inalatório', 'inalatória', 'Broncodilatador', { codigo_rename: 'RN0290' }),
  M('Salbutamol', '5 mg/mL', 'solução para nebulização', 'inalatória', 'Broncodilatador', { codigo_rename: 'RN0291' }),
  M('Salbutamol', '2 mg', 'comprimido', 'oral', 'Broncodilatador', { codigo_rename: 'RN0292' }),
  M('Brometo de ipratrópio', '0,25 mg/mL', 'solução para nebulização', 'inalatória', 'Broncodilatador', { codigo_rename: 'RN0293' }),
  M('Aminofilina', '100 mg', 'comprimido', 'oral', 'Broncodilatador', { codigo_rename: 'RN0294' }),
  M('Loratadina', '10 mg', 'comprimido', 'oral', 'Anti-histamínico', { codigo_rename: 'RN0295' }),
  M('Loratadina', '1 mg/mL', 'xarope', 'oral', 'Anti-histamínico', { codigo_rename: 'RN0296' }),
  M('Dexclorfeniramina', '2 mg', 'comprimido', 'oral', 'Anti-histamínico', { codigo_rename: 'RN0297' }),
  M('Dexclorfeniramina', '0,4 mg/mL', 'xarope', 'oral', 'Anti-histamínico', { codigo_rename: 'RN0298' }),
  M('Hidroxizina', '25 mg', 'comprimido', 'oral', 'Anti-histamínico', { codigo_rename: 'RN0299' }),
  M('Cetirizina', '10 mg', 'comprimido', 'oral', 'Anti-histamínico', { codigo_rename: 'RN0300' }),
  M('Ambroxol', '6 mg/mL', 'xarope', 'oral', 'Mucolítico', { codigo_rename: 'RN0301' }),
  M('Acetilcisteína', '600 mg', 'comprimido efervescente', 'oral', 'Mucolítico', { codigo_rename: 'RN0302' }),
  M('Cloreto de sódio 0,9%', '0,9%', 'solução nasal', 'nasal', 'Higiene nasal', { codigo_rename: 'RN0303' }),

  // ============ HORMÔNIOS / SAÚDE DA MULHER ============
  M('Levotiroxina sódica', '25 mcg', 'comprimido', 'oral', 'Hormônio tireoidiano', { codigo_rename: 'RN0320' }),
  M('Levotiroxina sódica', '50 mcg', 'comprimido', 'oral', 'Hormônio tireoidiano', { codigo_rename: 'RN0321' }),
  M('Levotiroxina sódica', '100 mcg', 'comprimido', 'oral', 'Hormônio tireoidiano', { codigo_rename: 'RN0322' }),
  M('Etinilestradiol + Levonorgestrel', '0,03 mg + 0,15 mg', 'comprimido', 'oral', 'Contraceptivo', { codigo_rename: 'RN0323' }),
  M('Noretisterona', '0,35 mg', 'comprimido', 'oral', 'Contraceptivo', { codigo_rename: 'RN0324' }),
  M('Acetato de medroxiprogesterona', '150 mg/mL', 'suspensão injetável', 'intramuscular', 'Contraceptivo', { codigo_rename: 'RN0325' }),
  M('Ácido fólico', '5 mg', 'comprimido', 'oral', 'Vitamina B9', { codigo_rename: 'RN0326' }),
  M('Sulfato ferroso', '40 mg Fe2+', 'comprimido', 'oral', 'Suplemento de Ferro', { codigo_rename: 'RN0327' }),
  M('Sulfato ferroso', '25 mg/mL', 'solução oral', 'oral', 'Suplemento de Ferro', { codigo_rename: 'RN0328' }),

  // ============ VITAMINAS / SUPLEMENTOS ============
  M('Vitamina A (palmitato)', '200.000 UI', 'cápsula', 'oral', 'Vitamina', { codigo_rename: 'RN0340' }),
  M('Vitamina D (colecalciferol)', '7.000 UI', 'cápsula', 'oral', 'Vitamina', { codigo_rename: 'RN0341' }),
  M('Vitamina D (colecalciferol)', '50.000 UI', 'cápsula', 'oral', 'Vitamina', { codigo_rename: 'RN0342' }),
  M('Complexo B', '—', 'comprimido', 'oral', 'Vitamina', { codigo_rename: 'RN0343' }),
  M('Cianocobalamina (B12)', '1.000 mcg/mL', 'solução injetável', 'intramuscular', 'Vitamina', { codigo_rename: 'RN0344' }),
  M('Carbonato de cálcio + Vitamina D', '500 mg + 400 UI', 'comprimido', 'oral', 'Suplemento', { codigo_rename: 'RN0345' }),

  // ============ DERMATOLÓGICOS / TÓPICOS ============
  M('Permetrina', '50 mg/g', 'creme', 'tópica', 'Escabicida', { codigo_rename: 'RN0360' }),
  M('Permetrina', '10 mg/mL', 'loção', 'tópica', 'Pediculicida', { codigo_rename: 'RN0361' }),
  M('Neomicina + Bacitracina', '5 mg/g + 250 UI/g', 'pomada', 'tópica', 'Antibiótico tópico', { codigo_rename: 'RN0362' }),
  M('Sulfadiazina de prata', '10 mg/g', 'creme', 'tópica', 'Antibiótico tópico', { codigo_rename: 'RN0363' }),
  M('Clotrimazol', '10 mg/g', 'creme vaginal', 'vaginal', 'Antifúngico', { codigo_rename: 'RN0364' }),
  M('Óxido de zinco', '100 mg/g', 'pomada', 'tópica', 'Protetor de pele', { codigo_rename: 'RN0365' }),

  // ============ OFTALMOLÓGICOS ============
  M('Tobramicina', '3 mg/mL', 'colírio', 'ocular', 'Antibiótico oftálmico', { codigo_rename: 'RN0380', tipo: 'antibiotico' }),
  M('Cloranfenicol', '5 mg/mL', 'colírio', 'ocular', 'Antibiótico oftálmico', { codigo_rename: 'RN0381', tipo: 'antibiotico' }),
  M('Carmelose sódica', '5 mg/mL', 'colírio', 'ocular', 'Lubrificante ocular', { codigo_rename: 'RN0382' }),

  // ============ EMERGÊNCIA / OUTROS ============
  M('Adrenalina (epinefrina)', '1 mg/mL', 'solução injetável', 'intramuscular', 'Vasopressor', { codigo_rename: 'RN0400' }),
  M('Atropina', '0,25 mg/mL', 'solução injetável', 'intravenosa', 'Anticolinérgico', { codigo_rename: 'RN0401' }),
  M('Glicose hipertônica 50%', '50%', 'solução injetável', 'intravenosa', 'Solução parenteral', { codigo_rename: 'RN0402' }),
  M('Cloreto de sódio 0,9%', '0,9%', 'solução injetável', 'intravenosa', 'Solução parenteral', { codigo_rename: 'RN0403' }),
  M('Ringer com lactato', '—', 'solução injetável', 'intravenosa', 'Solução parenteral', { codigo_rename: 'RN0404' }),
  M('Bicarbonato de sódio 8,4%', '8,4%', 'solução injetável', 'intravenosa', 'Alcalinizante', { codigo_rename: 'RN0405' }),
  M('Lidocaína', '20 mg/mL', 'solução injetável', 'subcutânea', 'Anestésico local', { codigo_rename: 'RN0406' }),
  M('Lidocaína', '20 mg/g', 'gel', 'tópica', 'Anestésico local', { codigo_rename: 'RN0407' }),
];
