// Base inicial RENAME — Relação Nacional de Medicamentos Essenciais
// Cada apresentação/dosagem é um item próprio para uso em prescrições estruturadas.

export interface RenameMedSeed {
  nome: string;              // nome de exibição
  principio_ativo: string;
  concentracao: string;      // ex.: "500 mg", "100 UI/mL"
  forma_farmaceutica: string; // ex.: "comprimido", "solução oral gotas"
  via_padrao: string;        // ex.: "oral", "subcutânea"
  classe_terapeutica: string;
  apresentacao: string;      // texto livre completo
  dosagem_padrao?: string;
}

export const RENAME_MEDICATIONS: RenameMedSeed[] = [
  // ANALGÉSICOS / ANTITÉRMICOS
  { nome: 'Dipirona sódica 500 mg comprimido', principio_ativo: 'Dipirona sódica', concentracao: '500 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Analgésico/Antitérmico', apresentacao: '500 mg comprimido' },
  { nome: 'Dipirona sódica 500 mg/mL solução oral gotas', principio_ativo: 'Dipirona sódica', concentracao: '500 mg/mL', forma_farmaceutica: 'solução oral gotas', via_padrao: 'oral', classe_terapeutica: 'Analgésico/Antitérmico', apresentacao: '500 mg/mL gotas' },
  { nome: 'Paracetamol 500 mg comprimido', principio_ativo: 'Paracetamol', concentracao: '500 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Analgésico/Antitérmico', apresentacao: '500 mg comprimido' },
  { nome: 'Paracetamol 200 mg/mL solução oral gotas', principio_ativo: 'Paracetamol', concentracao: '200 mg/mL', forma_farmaceutica: 'solução oral gotas', via_padrao: 'oral', classe_terapeutica: 'Analgésico/Antitérmico', apresentacao: '200 mg/mL gotas' },
  { nome: 'Ibuprofeno 300 mg comprimido', principio_ativo: 'Ibuprofeno', concentracao: '300 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Analgésico/Antitérmico', apresentacao: '300 mg comprimido' },
  { nome: 'Ibuprofeno 50 mg/mL suspensão oral', principio_ativo: 'Ibuprofeno', concentracao: '50 mg/mL', forma_farmaceutica: 'suspensão oral', via_padrao: 'oral', classe_terapeutica: 'Analgésico/Antitérmico', apresentacao: '50 mg/mL suspensão' },

  // ANTI-INFLAMATÓRIOS
  { nome: 'Diclofenaco sódico 50 mg comprimido', principio_ativo: 'Diclofenaco sódico', concentracao: '50 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-inflamatório', apresentacao: '50 mg comprimido' },
  { nome: 'Nimesulida 100 mg comprimido', principio_ativo: 'Nimesulida', concentracao: '100 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-inflamatório', apresentacao: '100 mg comprimido' },
  { nome: 'Naproxeno 500 mg comprimido', principio_ativo: 'Naproxeno', concentracao: '500 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-inflamatório', apresentacao: '500 mg comprimido' },
  { nome: 'Cetoprofeno 100 mg comprimido', principio_ativo: 'Cetoprofeno', concentracao: '100 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-inflamatório', apresentacao: '100 mg comprimido' },

  // ANTIBIÓTICOS
  { nome: 'Amoxicilina 500 mg cápsula', principio_ativo: 'Amoxicilina', concentracao: '500 mg', forma_farmaceutica: 'cápsula', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '500 mg cápsula' },
  { nome: 'Amoxicilina 50 mg/mL pó para suspensão oral', principio_ativo: 'Amoxicilina', concentracao: '50 mg/mL', forma_farmaceutica: 'pó para suspensão oral', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '50 mg/mL suspensão' },
  { nome: 'Amoxicilina + Clavulanato 500 mg + 125 mg comprimido', principio_ativo: 'Amoxicilina + Clavulanato', concentracao: '500 mg + 125 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '500/125 mg comprimido' },
  { nome: 'Azitromicina 500 mg comprimido', principio_ativo: 'Azitromicina', concentracao: '500 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '500 mg comprimido' },
  { nome: 'Azitromicina 40 mg/mL suspensão oral', principio_ativo: 'Azitromicina', concentracao: '40 mg/mL', forma_farmaceutica: 'suspensão oral', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '40 mg/mL suspensão' },
  { nome: 'Cefalexina 500 mg cápsula', principio_ativo: 'Cefalexina', concentracao: '500 mg', forma_farmaceutica: 'cápsula', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '500 mg cápsula' },
  { nome: 'Cefalexina 50 mg/mL suspensão oral', principio_ativo: 'Cefalexina', concentracao: '50 mg/mL', forma_farmaceutica: 'suspensão oral', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '50 mg/mL suspensão' },
  { nome: 'Ciprofloxacino 500 mg comprimido', principio_ativo: 'Ciprofloxacino', concentracao: '500 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '500 mg comprimido' },
  { nome: 'Metronidazol 250 mg comprimido', principio_ativo: 'Metronidazol', concentracao: '250 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '250 mg comprimido' },
  { nome: 'Metronidazol 40 mg/mL suspensão oral', principio_ativo: 'Metronidazol', concentracao: '40 mg/mL', forma_farmaceutica: 'suspensão oral', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '40 mg/mL suspensão' },
  { nome: 'Sulfametoxazol + Trimetoprima 400 mg + 80 mg comprimido', principio_ativo: 'Sulfametoxazol + Trimetoprima', concentracao: '400 mg + 80 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antibiótico', apresentacao: '400/80 mg comprimido' },

  // ANTI-HIPERTENSIVOS
  { nome: 'Losartana potássica 50 mg comprimido', principio_ativo: 'Losartana potássica', concentracao: '50 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-hipertensivo', apresentacao: '50 mg comprimido' },
  { nome: 'Captopril 25 mg comprimido', principio_ativo: 'Captopril', concentracao: '25 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-hipertensivo', apresentacao: '25 mg comprimido' },
  { nome: 'Enalapril 10 mg comprimido', principio_ativo: 'Enalapril', concentracao: '10 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-hipertensivo', apresentacao: '10 mg comprimido' },
  { nome: 'Hidroclorotiazida 25 mg comprimido', principio_ativo: 'Hidroclorotiazida', concentracao: '25 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-hipertensivo', apresentacao: '25 mg comprimido' },
  { nome: 'Furosemida 40 mg comprimido', principio_ativo: 'Furosemida', concentracao: '40 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Diurético', apresentacao: '40 mg comprimido' },
  { nome: 'Anlodipino 5 mg comprimido', principio_ativo: 'Anlodipino', concentracao: '5 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-hipertensivo', apresentacao: '5 mg comprimido' },
  { nome: 'Atenolol 50 mg comprimido', principio_ativo: 'Atenolol', concentracao: '50 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-hipertensivo', apresentacao: '50 mg comprimido' },
  { nome: 'Propranolol 40 mg comprimido', principio_ativo: 'Propranolol', concentracao: '40 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anti-hipertensivo', apresentacao: '40 mg comprimido' },

  // DIABETES
  { nome: 'Metformina 500 mg comprimido', principio_ativo: 'Metformina', concentracao: '500 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antidiabético', apresentacao: '500 mg comprimido' },
  { nome: 'Metformina 850 mg comprimido', principio_ativo: 'Metformina', concentracao: '850 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antidiabético', apresentacao: '850 mg comprimido' },
  { nome: 'Glibenclamida 5 mg comprimido', principio_ativo: 'Glibenclamida', concentracao: '5 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antidiabético', apresentacao: '5 mg comprimido' },
  { nome: 'Gliclazida 30 mg comprimido', principio_ativo: 'Gliclazida', concentracao: '30 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antidiabético', apresentacao: '30 mg comprimido' },
  { nome: 'Insulina humana NPH 100 UI/mL suspensão injetável', principio_ativo: 'Insulina humana NPH', concentracao: '100 UI/mL', forma_farmaceutica: 'suspensão injetável', via_padrao: 'subcutânea', classe_terapeutica: 'Antidiabético', apresentacao: '100 UI/mL injetável' },
  { nome: 'Insulina humana regular 100 UI/mL solução injetável', principio_ativo: 'Insulina humana regular', concentracao: '100 UI/mL', forma_farmaceutica: 'solução injetável', via_padrao: 'subcutânea', classe_terapeutica: 'Antidiabético', apresentacao: '100 UI/mL injetável' },

  // SAÚDE MENTAL / NEUROLÓGICOS
  { nome: 'Fluoxetina 20 mg cápsula', principio_ativo: 'Fluoxetina', concentracao: '20 mg', forma_farmaceutica: 'cápsula', via_padrao: 'oral', classe_terapeutica: 'Antidepressivo', apresentacao: '20 mg cápsula' },
  { nome: 'Amitriptilina 25 mg comprimido', principio_ativo: 'Amitriptilina', concentracao: '25 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antidepressivo', apresentacao: '25 mg comprimido' },
  { nome: 'Sertralina 50 mg comprimido', principio_ativo: 'Sertralina', concentracao: '50 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antidepressivo', apresentacao: '50 mg comprimido' },
  { nome: 'Diazepam 5 mg comprimido', principio_ativo: 'Diazepam', concentracao: '5 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Ansiolítico/Benzodiazepínico', apresentacao: '5 mg comprimido' },
  { nome: 'Clonazepam 2 mg comprimido', principio_ativo: 'Clonazepam', concentracao: '2 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Ansiolítico/Benzodiazepínico', apresentacao: '2 mg comprimido' },
  { nome: 'Haloperidol 5 mg comprimido', principio_ativo: 'Haloperidol', concentracao: '5 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antipsicótico', apresentacao: '5 mg comprimido' },
  { nome: 'Risperidona 1 mg comprimido', principio_ativo: 'Risperidona', concentracao: '1 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antipsicótico', apresentacao: '1 mg comprimido' },
  { nome: 'Carbamazepina 200 mg comprimido', principio_ativo: 'Carbamazepina', concentracao: '200 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Anticonvulsivante', apresentacao: '200 mg comprimido' },
  { nome: 'Ácido valproico 250 mg cápsula', principio_ativo: 'Ácido valproico', concentracao: '250 mg', forma_farmaceutica: 'cápsula', via_padrao: 'oral', classe_terapeutica: 'Anticonvulsivante', apresentacao: '250 mg cápsula' },

  // ANTIALÉRGICOS
  { nome: 'Loratadina 10 mg comprimido', principio_ativo: 'Loratadina', concentracao: '10 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antialérgico', apresentacao: '10 mg comprimido' },
  { nome: 'Loratadina 1 mg/mL xarope', principio_ativo: 'Loratadina', concentracao: '1 mg/mL', forma_farmaceutica: 'xarope', via_padrao: 'oral', classe_terapeutica: 'Antialérgico', apresentacao: '1 mg/mL xarope' },
  { nome: 'Dexclorfeniramina 2 mg comprimido', principio_ativo: 'Dexclorfeniramina', concentracao: '2 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antialérgico', apresentacao: '2 mg comprimido' },
  { nome: 'Dexclorfeniramina 0,4 mg/mL solução oral', principio_ativo: 'Dexclorfeniramina', concentracao: '0,4 mg/mL', forma_farmaceutica: 'solução oral', via_padrao: 'oral', classe_terapeutica: 'Antialérgico', apresentacao: '0,4 mg/mL solução' },
  { nome: 'Prometazina 25 mg comprimido', principio_ativo: 'Prometazina', concentracao: '25 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antialérgico', apresentacao: '25 mg comprimido' },

  // CORTICOIDES
  { nome: 'Prednisona 5 mg comprimido', principio_ativo: 'Prednisona', concentracao: '5 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Corticoide', apresentacao: '5 mg comprimido' },
  { nome: 'Prednisona 20 mg comprimido', principio_ativo: 'Prednisona', concentracao: '20 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Corticoide', apresentacao: '20 mg comprimido' },
  { nome: 'Prednisolona 3 mg/mL solução oral', principio_ativo: 'Prednisolona', concentracao: '3 mg/mL', forma_farmaceutica: 'solução oral', via_padrao: 'oral', classe_terapeutica: 'Corticoide', apresentacao: '3 mg/mL solução' },
  { nome: 'Dexametasona 4 mg comprimido', principio_ativo: 'Dexametasona', concentracao: '4 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Corticoide', apresentacao: '4 mg comprimido' },
  { nome: 'Hidrocortisona 100 mg pó para solução injetável', principio_ativo: 'Hidrocortisona', concentracao: '100 mg', forma_farmaceutica: 'pó para solução injetável', via_padrao: 'intravenosa', classe_terapeutica: 'Corticoide', apresentacao: '100 mg injetável' },

  // GASTROINTESTINAIS
  { nome: 'Omeprazol 20 mg cápsula', principio_ativo: 'Omeprazol', concentracao: '20 mg', forma_farmaceutica: 'cápsula', via_padrao: 'oral', classe_terapeutica: 'Gastrointestinal', apresentacao: '20 mg cápsula' },
  { nome: 'Pantoprazol 40 mg comprimido', principio_ativo: 'Pantoprazol', concentracao: '40 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Gastrointestinal', apresentacao: '40 mg comprimido' },
  { nome: 'Metoclopramida 10 mg comprimido', principio_ativo: 'Metoclopramida', concentracao: '10 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antiemético', apresentacao: '10 mg comprimido' },
  { nome: 'Bromoprida 10 mg cápsula', principio_ativo: 'Bromoprida', concentracao: '10 mg', forma_farmaceutica: 'cápsula', via_padrao: 'oral', classe_terapeutica: 'Antiemético', apresentacao: '10 mg cápsula' },
  { nome: 'Simeticona 75 mg/mL gotas', principio_ativo: 'Simeticona', concentracao: '75 mg/mL', forma_farmaceutica: 'solução oral gotas', via_padrao: 'oral', classe_terapeutica: 'Gastrointestinal', apresentacao: '75 mg/mL gotas' },
  { nome: 'Lactulose 667 mg/mL solução oral', principio_ativo: 'Lactulose', concentracao: '667 mg/mL', forma_farmaceutica: 'solução oral', via_padrao: 'oral', classe_terapeutica: 'Laxativo', apresentacao: '667 mg/mL solução' },
  { nome: 'Sais de reidratação oral pó para solução', principio_ativo: 'Sais de reidratação oral', concentracao: 'sachê', forma_farmaceutica: 'pó para solução oral', via_padrao: 'oral', classe_terapeutica: 'Reidratante', apresentacao: 'sachê pó' },

  // RESPIRATÓRIOS
  { nome: 'Salbutamol 100 mcg/dose aerossol', principio_ativo: 'Salbutamol', concentracao: '100 mcg/dose', forma_farmaceutica: 'aerossol', via_padrao: 'inalatória', classe_terapeutica: 'Broncodilatador', apresentacao: '100 mcg/dose aerossol' },
  { nome: 'Salbutamol 2 mg/5 mL xarope', principio_ativo: 'Salbutamol', concentracao: '2 mg/5 mL', forma_farmaceutica: 'xarope', via_padrao: 'oral', classe_terapeutica: 'Broncodilatador', apresentacao: '2 mg/5 mL xarope' },
  { nome: 'Ipratrópio 0,25 mg/mL solução para inalação', principio_ativo: 'Ipratrópio', concentracao: '0,25 mg/mL', forma_farmaceutica: 'solução para inalação', via_padrao: 'inalatória', classe_terapeutica: 'Broncodilatador', apresentacao: '0,25 mg/mL inalação' },
  { nome: 'Budesonida 50 mcg/dose spray nasal', principio_ativo: 'Budesonida', concentracao: '50 mcg/dose', forma_farmaceutica: 'spray nasal', via_padrao: 'nasal', classe_terapeutica: 'Corticoide inalatório', apresentacao: '50 mcg/dose spray' },
  { nome: 'Beclometasona 250 mcg/dose aerossol', principio_ativo: 'Beclometasona', concentracao: '250 mcg/dose', forma_farmaceutica: 'aerossol', via_padrao: 'inalatória', classe_terapeutica: 'Corticoide inalatório', apresentacao: '250 mcg/dose aerossol' },
  { nome: 'Acetilcisteína 600 mg granulado', principio_ativo: 'Acetilcisteína', concentracao: '600 mg', forma_farmaceutica: 'granulado', via_padrao: 'oral', classe_terapeutica: 'Mucolítico', apresentacao: '600 mg granulado' },

  // VITAMINAS / SUPLEMENTOS
  { nome: 'Sulfato ferroso 40 mg comprimido', principio_ativo: 'Sulfato ferroso', concentracao: '40 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Suplemento', apresentacao: '40 mg comprimido' },
  { nome: 'Sulfato ferroso 25 mg/mL solução oral', principio_ativo: 'Sulfato ferroso', concentracao: '25 mg/mL', forma_farmaceutica: 'solução oral', via_padrao: 'oral', classe_terapeutica: 'Suplemento', apresentacao: '25 mg/mL solução' },
  { nome: 'Ácido fólico 5 mg comprimido', principio_ativo: 'Ácido fólico', concentracao: '5 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Suplemento', apresentacao: '5 mg comprimido' },
  { nome: 'Vitamina D 7.000 UI cápsula', principio_ativo: 'Colecalciferol (Vitamina D)', concentracao: '7.000 UI', forma_farmaceutica: 'cápsula', via_padrao: 'oral', classe_terapeutica: 'Suplemento', apresentacao: '7.000 UI cápsula' },
  { nome: 'Complexo B comprimido', principio_ativo: 'Complexo B', concentracao: 'composto', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Suplemento', apresentacao: 'comprimido' },

  // TÓPICOS / DERMATOLÓGICOS
  { nome: 'Neomicina + Bacitracina pomada', principio_ativo: 'Neomicina + Bacitracina', concentracao: 'pomada', forma_farmaceutica: 'pomada', via_padrao: 'tópica', classe_terapeutica: 'Antibiótico tópico', apresentacao: 'pomada' },
  { nome: 'Cetoconazol 20 mg/g creme', principio_ativo: 'Cetoconazol', concentracao: '20 mg/g', forma_farmaceutica: 'creme', via_padrao: 'tópica', classe_terapeutica: 'Antifúngico', apresentacao: '20 mg/g creme' },
  { nome: 'Nistatina 100.000 UI/mL suspensão oral', principio_ativo: 'Nistatina', concentracao: '100.000 UI/mL', forma_farmaceutica: 'suspensão oral', via_padrao: 'oral', classe_terapeutica: 'Antifúngico', apresentacao: '100.000 UI/mL suspensão' },
  { nome: 'Sulfadiazina de prata 10 mg/g creme', principio_ativo: 'Sulfadiazina de prata', concentracao: '10 mg/g', forma_farmaceutica: 'creme', via_padrao: 'tópica', classe_terapeutica: 'Antibiótico tópico', apresentacao: '10 mg/g creme' },

  // OUTROS
  { nome: 'Ácido acetilsalicílico 100 mg comprimido', principio_ativo: 'Ácido acetilsalicílico', concentracao: '100 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antiagregante plaquetário', apresentacao: '100 mg comprimido' },
  { nome: 'Sinvastatina 20 mg comprimido', principio_ativo: 'Sinvastatina', concentracao: '20 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Hipolipemiante', apresentacao: '20 mg comprimido' },
  { nome: 'Albendazol 400 mg comprimido', principio_ativo: 'Albendazol', concentracao: '400 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antiparasitário', apresentacao: '400 mg comprimido' },
  { nome: 'Albendazol 40 mg/mL suspensão oral', principio_ativo: 'Albendazol', concentracao: '40 mg/mL', forma_farmaceutica: 'suspensão oral', via_padrao: 'oral', classe_terapeutica: 'Antiparasitário', apresentacao: '40 mg/mL suspensão' },
  { nome: 'Mebendazol 100 mg comprimido', principio_ativo: 'Mebendazol', concentracao: '100 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antiparasitário', apresentacao: '100 mg comprimido' },
  { nome: 'Ivermectina 6 mg comprimido', principio_ativo: 'Ivermectina', concentracao: '6 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antiparasitário', apresentacao: '6 mg comprimido' },
  { nome: 'Escopolamina 10 mg comprimido', principio_ativo: 'Escopolamina', concentracao: '10 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antiespasmódico', apresentacao: '10 mg comprimido' },
  { nome: 'Ondansetrona 4 mg comprimido', principio_ativo: 'Ondansetrona', concentracao: '4 mg', forma_farmaceutica: 'comprimido', via_padrao: 'oral', classe_terapeutica: 'Antiemético', apresentacao: '4 mg comprimido' },
];
