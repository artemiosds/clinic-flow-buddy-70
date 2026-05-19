# Personalização Dinâmica do Prontuário — o que falta

O sistema **já tem** uma base sólida e não precisa ser refeito. Falta unificar, adicionar dimensões (especialidade/tipo), regras condicionais, validações ricas e reflexo na impressão.

## 1. O que já existe (manter)

- **Fonte única**: `system_config.configuracoes.custom_fields_config` (lido via `useCustomFields`), com resolução por `screen` × `unidade` (global + override por unidade).
- **Estrutura `ScreenConfig`**: `fields` (custom), `hiddenNative` (ocultar nativos), `labelOverrides` (renomear), `orderedNames` (ordem unificada nativo+custom).
- **Renderer compartilhado**: `CustomFieldsRenderer` (todas telas) e `DynamicProntuarioFields` (prontuário com SOAP/builtin).
- **UI de configuração**: `ConfigPersonalizarCampos` com DnD, criar/editar/excluir, ocultar/renomear nativos.
- **Persistência**: `custom_data jsonb` em `pacientes`, `agendamentos`, `prontuarios`, etc. — campos antigos sobrevivem como chaves órfãs no JSON.
- **Tipos atuais**: text, number, date, checkbox, radio, select, textarea.

## 2. O que falta (entregar)

### 2.1 Estender `CustomFieldDef` (não-quebra: tudo opcional)

```ts
export interface CustomFieldDef {
  // ... já existentes
  // NOVO
  secao?: string;                          // agrupamento visual ("Anamnese", "Exame Físico"…)
  especialidades?: string[];               // [] = todas; senão filtra por profissao/specialty
  tiposProntuario?: string[];              // ['avaliacao_inicial','retorno',...]; [] = todos
  validacao?: {
    minLength?: number; maxLength?: number;
    min?: number; max?: number;
    pattern?: string;                      // regex
    mascara?: 'cpf'|'cnpj'|'telefone'|'cep'|'data'|'custom';
    mascaraCustom?: string;                // '999.999.999-99'
  };
  condicional?: {
    campo: string;                         // nome de outro campo (nativo ou custom)
    operador: 'eq'|'neq'|'in'|'notin'|'gt'|'lt'|'filled'|'empty';
    valor?: any;
  }[];                                     // AND entre regras
  placeholder?: string;
  ajuda?: string;                          // tooltip / helpText
}
```

Novos `CustomFieldType`: `phone`, `cpf`, `cnpj`, `cep`, `email`, `url`, `time`, `currency`, `file` (upload via Storage).

### 2.2 Unificar prontuário em uma só configuração

Hoje há **duas** fontes para o prontuário:
- `custom_fields_config['prontuario']` (genérica)
- `config_prontuario_tipos` (`useProntuarioTiposConfig` — tem `tiposProntuario` + `soapLabels`)

**Ação**: migrar `useProntuarioTiposConfig` para ler de `custom_fields_config['prontuario']` aplicando filtro `especialidades + tiposProntuario`. Manter leitura legada como fallback (lê uma vez, grava no novo formato — zero quebra).

### 2.3 Engine de regras condicionais

Criar `src/lib/customFieldRules.ts`:
```ts
export function evaluateCondition(rules, allValues): boolean
export function filterVisibleFields(fields, allValues, ctx: {especialidade?, tipoProntuario?}): CustomFieldDef[]
```
Usado por `CustomFieldsRenderer` e `DynamicProntuarioFields` (uma chamada, todo lugar).

### 2.4 Engine de validação

`src/lib/customFieldValidation.ts` com `validateField(field, value)` e `applyMask(field, raw)`. Plugar em `onChange` dos renderers e em `onSubmit` (bloqueia salvar se inválido).

### 2.5 Reflexo em impressão / PDF

Adicionar `src/lib/customFieldsPrint.ts` → `renderCustomFieldsHtml(screen, customData, unidadeId)` que devolve HTML institucional (`.ficha-section` por `secao`). Plugar em:
- `fichaPacienteHtml.ts` (Ficha Paciente — seção "Dados Complementares")
- `prontuarioPdf.ts` (Prontuário — após SOAP, agrupado por seção)
- `HistoricoCompletoModal` e visualização do prontuário (mesmo helper, modo `mode:'view'`).

Resultado: **um único helper** alimenta criação, edição, visualização e impressão.

### 2.6 UI — ampliar `ConfigPersonalizarCampos`

No modal "Novo Campo Personalizado" adicionar (collapsibles para não poluir):
- **Seção** (combobox livre, autocomplete das seções já criadas)
- **Especialidades** (multi-select; vazio = todas)
- **Tipos de prontuário** (chips: avaliação, retorno, sessão, urgência, procedimento — só aparece para screen `prontuario`)
- **Validação** (min/max, máscara pré-definida ou regex)
- **Regras condicionais** (linhas: "Mostrar quando [campo] [operador] [valor]", AND)
- Novos tipos: telefone, CPF, CNPJ, CEP, email, hora, moeda, arquivo

### 2.7 Compatibilidade retroativa

- Campos antigos em `custom_data` que não existem mais na config: continuam armazenados (não apagamos JSON), mostrados em modo view como "Campos legados" (read-only collapsible).
- Renomear `nome` de um campo: gerar `legacyNames: string[]` para o renderer fazer fallback de leitura.
- Migração silenciosa de `config_prontuario_tipos` → `custom_fields_config['prontuario']` na primeira carga (Master only).

## 3. Arquivos a tocar

**Novos**
- `src/lib/customFieldRules.ts`
- `src/lib/customFieldValidation.ts`
- `src/lib/customFieldsPrint.ts`

**Editados (incremental, sem quebra)**
- `src/hooks/useCustomFields.ts` — estender tipo + helper `getFieldsForContext({especialidade, tipoProntuario})`
- `src/components/CustomFieldsRenderer.tsx` — novos tipos, máscaras, validação, condicionais, agrupamento por seção
- `src/components/DynamicProntuarioFields.tsx` — usar o filtro unificado
- `src/components/config/ConfigPersonalizarCampos.tsx` — UI estendida no modal
- `src/hooks/useProntuarioTiposConfig.ts` — adapter para nova fonte (migração suave)
- `src/lib/fichaPacienteHtml.ts`, `src/lib/prontuarioPdf.ts` — injetar `renderCustomFieldsHtml`

## 4. Garantias

| Requisito | Como |
|---|---|
| Fonte única | `system_config.custom_fields_config` (já existe) |
| Reflexo em todas telas | `CustomFieldsRenderer` + `customFieldsPrint.ts` compartilhados |
| Por especialidade | filtro `especialidades` no resolver |
| Por tipo de prontuário | filtro `tiposProntuario` no resolver |
| Condicional | `evaluateCondition` em runtime |
| Ordem / seção | `orderedNames` + `secao` agrupador |
| Validação | `validateField` no submit |
| Sem quebrar dados antigos | `custom_data jsonb` preserva tudo + `legacyNames` |

## 5. Extras sugeridos

- Botão **"Duplicar campo"** e **"Importar/Exportar JSON"** da configuração de uma tela.
- **Preview ao vivo** no modal de criação (renderiza o campo com o tipo escolhido).
- **Marcar como "destacado"** → renderiza em card próprio no topo da seção.
- **Histórico de alterações** da config (já temos `auditService.log`, basta exibir).
- **Templates prontos** ("Fisioterapia respiratória", "Triagem pediátrica") aplicáveis com 1 clique.

---

Posso implementar tudo na sequência: (a) tipos + engines, (b) renderers, (c) UI, (d) impressão. Confirmar para começar.
