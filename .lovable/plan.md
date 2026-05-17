## Objetivo
Expandir o módulo de Medicamentos (base, busca, classificação, alertas, estoque) e refletir tudo no Prontuário, sem quebrar nada existente.

---

## 1. Banco de dados (1 migration)

Adicionar colunas à tabela `medications` (sem apagar dados):

- `nome_comercial text default ''`
- `codigo_rename text` (UNIQUE quando não nulo)
- `codigo_reme text`
- `tipo text default 'comum'` — `comum | controlado | psicotropico | antibiotico`
- `estoque_quantidade integer default 0`
- `estoque_minimo integer default 0`
- `estoque_unidade text default ''` — comprimidos, ampolas, frascos…
- `estoque_localizacao text default ''`

Índices de busca (pg_trgm):
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_medications_nome_trgm        ON medications USING GIN (nome gin_trgm_ops);
CREATE INDEX idx_medications_principio_trgm   ON medications USING GIN (principio_ativo gin_trgm_ops);
CREATE INDEX idx_medications_comercial_trgm   ON medications USING GIN (nome_comercial gin_trgm_ops);
CREATE INDEX idx_medications_classe_trgm      ON medications USING GIN (classe_terapeutica gin_trgm_ops);
CREATE INDEX idx_medications_tipo             ON medications (tipo);
```

Backfill: marcar `tipo='antibiotico'` onde `classe_terapeutica ILIKE '%antibió%'`, `tipo='psicotropico'` onde classe ILIKE '%psicotrop%' ou principio em {diazepam, clonazepam, fluoxetina, amitriptilina, sertralina, haloperidol, carbamazepina, fenobarbital}.

---

## 2. Seeds RENAME e REME

- `src/data/seedRenameMedications.ts`: expandir de ~84 para ~250 itens curados da RENAME (cobertura ampla: cardio, endócrino, infecto, dor, saúde mental, respiratório, GI, dermato, oftalmo, pediátrico, hormônios, vacinas/imunobiológicos comuns, antineoplásicos básicos). Cada item passa a ter `tipo`, `codigo_rename`, `nome_comercial` (quando aplicável).
- Novo `src/data/seedRemeMedications.ts`: ~80 itens REME complementares (foco municipal — fitoterápicos, suplementos, soluções básicas, kits curativo, antissépticos).
- Deduplicação por `codigo_rename`/`codigo_reme` quando existir, senão pela chave atual (principio+concentração+forma+via).

> ⚠️ Observação importante: não existe API oficial pública estável da RENAME completa. Vou entregar uma lista curada substancial (~250 RENAME + ~80 REME). Se você tiver um CSV oficial, podemos importar depois pelo mesmo botão.

---

## 3. UI — ConfigMedicamentosExames

- Botão **"Carregar / Restaurar base REME"** ao lado do RENAME.
- Listagem: badges
  - Origem: `RENAME` / `REME` / `PERSONALIZADO`
  - Tipo: `CONTROLADO` (vermelho), `PSICOTRÓPICO` (vermelho), `ANTIBIÓTICO` (laranja)
  - Estoque: verde (disponível) / amarelo (baixo) / vermelho (indisponível) / cinza (não controlado)
- Filtros: classe terapêutica (select), tipo, origem, status de estoque.
- Form de edição: novos campos (nome comercial, código RENAME/REME, tipo, estoque quantidade/mínimo/unidade/localização).

---

## 4. UI — PrescricaoMedicamentos (Prontuário)

- Busca passa a casar com: nome, principio_ativo, nome_comercial, classe_terapeutica, codigo_rename, forma_farmaceutica, tipo.
- Filtro por classe terapêutica na busca.
- Cada resultado mostra badges (tipo + estoque).
- Ao selecionar:
  - Controlado/Psicotrópico → toast/alert "Medicamento controlado — exige receita especial".
  - Antibiótico → toast "Exige receituário".
  - Estoque 0 → alert "Medicamento sem estoque disponível na unidade".
- Sem alterar a estrutura de salvamento da prescrição.

---

## 5. Notificação de estoque baixo

- Registro em `notification_logs` quando `estoque_quantidade <= estoque_minimo` (disparado no update via UI; sem trigger novo para evitar tocar schemas reservados).
- Painel já existente de notificações exibirá. (Sem novo canal.)

---

## Arquivos afetados
- migration nova
- `src/data/seedRenameMedications.ts` (expandir)
- `src/data/seedRemeMedications.ts` (novo)
- `src/components/config/ConfigMedicamentosExames.tsx` (UI + import REME + badges + filtros + estoque)
- `src/components/PrescricaoMedicamentos.tsx` (busca + badges + alertas)
- `src/integrations/supabase/types.ts` (regen automática após migration)

---

## Perguntas rápidas antes de começar

1. **Volume RENAME**: ~250 itens curados está OK, ou prefere que eu tente carregar uma lista bem maior (com risco de itens menos relevantes)?
2. **REME**: posso entregar uma lista genérica municipal (~80 itens). Você tem a lista oficial REME de Oriximiná em algum lugar?
3. **Estoque por unidade?** Hoje `medications` é global. O estoque deve ser **por unidade de saúde** (criar tabela `medication_stock` por `unidade_id`) ou **global** (campos direto em `medications`, como descrito acima)?