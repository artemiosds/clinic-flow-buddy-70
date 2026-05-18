# Plano — Cabeçalho/Rodapé Institucional Global em todos os documentos

## Objetivo
Unificar TODOS os documentos impressos e PDFs do sistema sob um único template institucional global, com 3 logos configuráveis (esquerda, centro, direita) — cada uma com tamanho próprio, formato redondo opcional e on/off independente. Preview, impressão e PDF devem ser idênticos. Inclui correção crítica da Ficha do Paciente na página Pacientes.

## Escopo

### 1. Expandir configuração global
- Estender `system_config.configuracoes.config_impressao_documentos` (já existente) com:
  - `logos.left/center/right`: `{ enabled, url, size, rounded }`
  - `header`: linha1, linha2, linha3 (opcional), linha4 (opcional), fonte, tamanho, cor, alinhamento
  - `footer`: enabled, texto, mostrarPaginacao, mostrarDataGeracao
  - `layout`: paper (A4 default), margens
- Manter compatibilidade com chaves antigas (`logoEsquerda`, `logoDireita`, `logoCentro` já adicionada).

### 2. UI de Configuração (`ConfigImpressaoDocumentos.tsx` + `HeaderPreviewA4.tsx`)
- Adicionar toggle **"Logo redonda"** por logo (esquerda, centro, direita).
- Adicionar campos opcionais de linhas 3 e 4 no cabeçalho (ex.: Unidade/Setor, CNES).
- Refinar preview A4 para usar o MESMO componente render do print (single source of truth) via iframe ou render compartilhado.
- Validações: tamanho 32–160px, máx 2MB upload, manter proporção.

### 3. Componente compartilhado de template
Criar `src/lib/institutionalDocument.ts`:
- `buildInstitutionalHeaderHTML(config, { documentTitle, unidade, emissionDate })`
- `buildInstitutionalFooterHTML(config, { pageInfo })`
- `getInstitutionalCSS({ paper, margins, fontFamily, fontSize })`
- Lógica de reorganização para 1, 2 ou 3 logos (flex justify dinâmico).
- Logo redonda: `border-radius: 9999px; object-fit: cover`.

### 4. Refatorar `src/lib/printLayout.ts`
- `openPrintDocument(title, body, meta, opts)` passa a SEMPRE injetar header/footer institucionais via `buildInstitutionalHeaderHTML/Footer`.
- Remover headers customizados antigos; aceitar override opcional por documento (futuro).
- CSS A4 padronizado com `@page`, `.document-page`, `break-inside: avoid`.

### 5. Ficha do Paciente — correção crítica
Localizar e refatorar:
- `src/lib/printFichaPaciente.ts` (Imprimir Ficha na página Pacientes)
- `src/components/FichaImpressao.tsx`
- Botão "Imprimir Ficha" em `src/pages/painel/Pacientes.tsx`

Novo template `printFichaPaciente`:
- Usa `openPrintDocument` (herda header/footer global).
- Título: **"FICHA CADASTRAL DO PACIENTE"**.
- 5 blocos estruturados: Identificação, Endereço, Contato, Complementares/SUS, Documentos.
- Campos vazios → "Não informado" (sem `null`/`undefined`).
- A4, sem botões, sem tela crua.

### 6. Aplicar a todos os documentos
Garantir que estes módulos passem por `openPrintDocument` (sem header próprio):
- Prontuário (`prontuarioPdf.ts`, `WorkspaceProntuario`)
- Histórico Clínico (`HistoricoClinicoTimeline.tsx`) ✅ já migrado
- Receituário (`PrescricaoMedicamentos.tsx`) ✅ já migrado
- Solicitação de Exames (`SolicitacaoExames.tsx`) ✅ já migrado
- Encaminhamento UBS (`EncaminhamentoUBSSection.tsx`) ✅ já migrado
- Ficha do Funcionário ✅ já migrado
- Relatórios (`Relatorios.tsx`) ✅ já migrado
- Relatório de Alta (`RelatorioAlta.tsx`) — verificar título correto
- Documentos gerados (`GerarDocumentoModal.tsx`, `DocumentosHistorico.tsx`)
- Atestados/Declarações via `documentSignature`

Auditar imports de `window.print()` e `new Blob([html])` para garantir 100% via shell único.

### 7. Storage de logos
- Continuar usando bucket existente `document-logos` (já em uso em `InstituicaoSection`).
- Não salvar base64 no JSON; salvar apenas URL pública.

### 8. Loading/erro/auditoria
- Toasts em salvar configuração ✅ já existem.
- Log de auditoria em `audit_logs` ao salvar config institucional (motivo_alteracao opcional).
- Console.error em falhas com prefixo `[DocumentConfig]`.

## Arquivos a criar/editar
- **Criar:** `src/lib/institutionalDocument.ts`
- **Criar:** `src/lib/printFichaPaciente.ts` (rewrite)
- **Editar:** `src/lib/printLayout.ts` — usar institutionalDocument
- **Editar:** `src/components/config/ConfigImpressaoDocumentos.tsx` — adicionar toggle redondo + linhas extras
- **Editar:** `src/components/config/sistema/HeaderPreviewA4.tsx` — refletir formato redondo
- **Editar:** `src/pages/painel/Pacientes.tsx` — apontar para novo printFichaPaciente
- **Editar:** `src/components/FichaImpressao.tsx` — migrar para shell único
- **Editar:** `src/lib/prontuarioPdf.ts` — usar openPrintDocument
- **Editar:** `src/pages/painel/RelatorioAlta.tsx` — título correto + shell único
- **Editar:** `src/components/GerarDocumentoModal.tsx` — shell único
- **Auditar:** demais módulos com `window.print()` isolado

## Detalhes técnicos
- 1 logo ativa → `justify-content: center`
- 2 logos ativas → `justify-content: space-between` (texto entre elas)
- 3 logos ativas → grid 3 colunas com texto sobre logo central
- Print CSS: `@page { size: A4; margin: 16mm; }`, `.no-print { display: none !important; }`
- `running()` headers/footers para paginação X de Y quando suportado pelo browser.

## Fora de escopo (mantido como está)
- Lógica clínica, BPA, Agenda, dados de Pacientes.
- Personalização por unidade/profissional (arquitetura preparada, mas não ativada).

## Validação
Executar os 14 testes do prompt: 3 logos, 1 logo, 2 logos, Imprimir Ficha, PDF Ficha, Prontuário, Relatório Alta, Atestado, Receita, Encaminhamento, Impressão x PDF idênticos, logo redonda, fallback documento antigo.

## Estimativa
Trabalho grande (~10-12 arquivos). Posso entregar em uma única passada após sua aprovação.
