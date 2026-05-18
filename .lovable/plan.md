# Padrão Institucional Global — Cabeçalho/Rodapé únicos em todos os documentos

## Contexto atual
Já existe parte da base (`printLayout.ts`, `system_config.configuracoes.config_impressao_documentos`, suporte a 3 logos com tamanho/redondo, `PacienteFichaDocument`, `printFichaPaciente`). Falta: shell único realmente unificado (Preview = Impressão = PDF), aplicação consistente em TODOS módulos, e migração dos que ainda usam template próprio (Prontuário via jsPDF, Relatório de Alta, GerarDocumento, Avaliações, PTS, Triagem, etc.).

## Objetivo
Um único shell `DocumentShell` (header + footer institucionais) que TODO documento do sistema consome. Preview, impressão (`window.print()`) e exportação devem produzir HTML idêntico.

## Entregáveis

### 1. Núcleo unificado (`src/lib/institutionalDocument.ts` — NOVO)
- `buildInstitutionalHeaderHTML(config, { title, subtitle, emissionDate, unidade })`
- `buildInstitutionalFooterHTML(config, { pageInfo })`
- `getInstitutionalCSS({ paper, margins, fontFamily, fontSize })` com `@page A4`, `.document-page`, `.document-section { break-inside: avoid }`, `.no-print`
- Layouts: 1 logo → centralizado; 2 logos → space-between com texto entre; 3 logos → grid 3 colunas
- Suporte `rounded` por logo (`border-radius:9999px; object-fit:cover`)
- Fallback seguro quando config vazia

### 2. Refatorar `src/lib/printLayout.ts`
- `openPrintDocument(title, bodyHTML, meta, opts)` SEMPRE injeta header/footer via `institutionalDocument`
- Remove headers customizados antigos; aceita override futuro por tipo de documento
- Helper `buildDocumentHTML()` exportado para uso em React (preview compartilhado)

### 3. Componente React `<InstitutionalDocumentShell>` (NOVO `src/components/print/InstitutionalDocumentShell.tsx`)
- Renderiza HTML idêntico ao `openPrintDocument` (mesmo builder)
- Usado em previews on-screen e em portais de impressão (garante Preview = Print)

### 4. Configuração (já existe, ajustes finos)
- `ConfigImpressaoDocumentos.tsx`: confirmar campos `enabled`, `rounded`, tamanho independente, linhas 3/4 do cabeçalho, controle do rodapé
- `HeaderPreviewA4.tsx` → substituir por preview que usa o MESMO `InstitutionalDocumentShell` (single source of truth)
- Auditoria em `audit_logs` ao salvar config (motivo opcional)

### 5. Ficha do Paciente
- `PacienteFichaDocument.tsx` passa a envelopar conteúdo em `<InstitutionalDocumentShell>` (remove header/footer próprios)
- `FichaImpressao.tsx` e `printFichaPaciente.ts` continuam via portal — mesma fonte
- Confere blocos: Identificação, Endereço, Contato, Complementares/SUS, Documentos. Campos vazios → "Não informado"

### 6. Migração de TODOS os módulos para o shell único
Módulos a migrar (substituir header local por shell):
- **Prontuário Clínico** (`src/lib/prontuarioPdf.ts`) — atualmente jsPDF → rewrite usando `openPrintDocument`
- **Relatório de Alta** (`src/pages/painel/RelatorioAlta.tsx`) — título correto + shell
- **Gerar Documento** (`src/components/GerarDocumentoModal.tsx`)
- **Documentos Histórico** (`src/components/DocumentosHistorico.tsx`)
- **Histórico Clínico Timeline** ✅ já migrado — revalidar
- **Receituário** (`src/components/PrescricaoMedicamentos.tsx`) ✅ — revalidar
- **Solicitação de Exames** (`src/components/SolicitacaoExames.tsx`) ✅ — revalidar
- **Encaminhamento UBS** (`src/components/pacientes/EncaminhamentoUBSSection.tsx`) ✅ — revalidar
- **Encaminhamentos Externo/Interno** (`EncaminhamentoExternoModal.tsx`, `EncaminhamentoInternoModal.tsx`)
- **Ficha Funcionário** ✅ — revalidar
- **Relatórios** (`src/pages/painel/Relatorios.tsx`) ✅ — revalidar
- **Triagem / Avaliação Enfermagem / Avaliação Multi / PTS** — auditar e migrar onde houver impressão
- **Assinatura Eletrônica** (`src/lib/documentSignature.ts`) — usar shell para PDF assinado

Auditoria final: `rg "window.print\(\)|new Blob\(\[html"` para garantir 100% via shell único.

### 7. Storage
- Continuar bucket público `document-logos`
- Apenas URL no JSON (nada de base64)

### 8. Estados e UX
- Loading/erro/sucesso na config (toasts já existem)
- Console.error com prefixo `[DocumentConfig]`
- Auditoria: salvar config, upload/remover logo

## Arquivos a criar
- `src/lib/institutionalDocument.ts`
- `src/components/print/InstitutionalDocumentShell.tsx`

## Arquivos a editar
- `src/lib/printLayout.ts` (delega para institutionalDocument)
- `src/lib/prontuarioPdf.ts` (rewrite: jsPDF → openPrintDocument)
- `src/pages/painel/RelatorioAlta.tsx`
- `src/components/GerarDocumentoModal.tsx`
- `src/components/DocumentosHistorico.tsx`
- `src/components/EncaminhamentoExternoModal.tsx`
- `src/components/EncaminhamentoInternoModal.tsx`
- `src/components/config/ConfigImpressaoDocumentos.tsx`
- `src/components/config/sistema/HeaderPreviewA4.tsx` (passa a usar shell real)
- `src/components/pacientes/PacienteFichaDocument.tsx` (envelopa com shell)
- `src/lib/documentSignature.ts`
- Auditar: Triagem, Avaliações, PTS, Atendimentos

## Detalhes técnicos
- `@page { size: A4; margin: 16mm; }`
- `.document-page` 210×297mm, `.document-section { break-inside: avoid }`
- 1 logo → `justify-content: center`
- 2 logos → `justify-content: space-between`
- 3 logos → `grid-template-columns: auto 1fr auto`
- Logo redonda → `border-radius:9999px; object-fit:cover; width=height`
- Fallback config vazia → header com nome institucional simples, sem quebrar

## Fora de escopo
Lógica clínica, BPA, Agenda, dados de Pacientes.

## Validação
Executar os 14 testes do prompt (3 logos / 1 logo / 2 logos / Ficha / PDF Ficha / Prontuário / Alta / Atestado / Receita / Encaminhamento / Impressão=PDF / Logo redonda / Doc antigo).

## Tamanho
Grande: ~14 arquivos. Entrego em uma passada após aprovação.
