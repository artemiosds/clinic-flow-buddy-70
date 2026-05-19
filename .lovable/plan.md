# Padronização Global de Impressão / PDF / Pré-visualização

## 1. Mapeamento atual

**Camada compartilhada já existe** em `src/lib/printLayout.ts`:
- `loadDocumentConfig()` → lê `system_config.configuracoes.config_impressao`
- `buildInstitutionalCSS()` → CSS único (`@page`, header, footer, tabelas, seções)
- `docHeader()`, `docFooter()`, `docMeta()` → blocos HTML reutilizáveis
- `openPrintDocument(title, body, meta, opts)` → abre janela, injeta header+CSS+body+footer e chama `print()`

**Módulos que JÁ consomem o shell** (corretos):
Prontuário, Histórico Clínico, Histórico Timeline, Histórico Completo Modal, Workspace Prontuário, Relatório de Alta, Receituário, Solicitação de Exames, Encaminhamento UBS, Encam. Externo/Interno, Ficha Paciente (via `printFichaPaciente` + `fichaPacienteHtml`), Ficha Funcionário, Modelos de Documento, Gerar Documento Modal, Documentos Histórico, Modal Ver Encaminhamento, Auditoria, Encaminhamentos, Relatórios (parcial), Portal Paciente.

**Pontos fora do padrão** (causa raiz da divergência):
1. `src/components/ChartCard.tsx` — usa `window.open` próprio com CSS hardcoded para imprimir gráficos.
2. `src/pages/painel/Relatorios.tsx` linhas 1508 e 2363 — duas chamadas `window.open('', '_blank')` com HTML/CSS inline próprios.
3. `src/components/config/ConfigImpressaoDocumentos.tsx` — `handlePreview` abre janela direto, e botão "Imprimir teste" chama `window.print()` da página de configuração (imprime a UI, não um doc de teste).

## 2. Causa raiz do "configurado ≠ impresso"

O painel `Configurações > Impressão e Documentos` salva campos `cabecalho.fonte`, `cabecalho.tamanhoFonte`, `cabecalho.alinhamento`, `cabecalho.cor` em `system_config.configuracoes.config_impressao`. **`loadDocumentConfig()` em `printLayout.ts` nunca lê esses campos** — só lê logos, linhas 1/2 e rodapé. E `buildInstitutionalCSS()` **hardcoda** `font-family: Arial`, `font-size: 11pt`, cor `#0c4a6e` para o título.

Resultado: o usuário muda fonte/tamanho/cor no painel, salva com sucesso, e nenhum documento muda — porque os valores nunca chegam ao CSS. Esta é a fonte número 1 das reclamações "preview ≠ impressão" (na verdade os dois saem iguais, mas nenhum reflete o configurado).

Causas secundárias:
- `Relatorios.tsx` e `ChartCard.tsx` têm templates HTML/CSS próprios → ignoram totalmente a configuração.
- O preview do painel de configuração abre janela própria (não passa por `openPrintDocument`), então futuras alterações no shell podem divergir do preview.

## 3. Refatoração

### 3.1 Estender `DocumentConfig` e `loadDocumentConfig` (`src/lib/printLayout.ts`)
Adicionar campos lidos do JSON salvo:
```ts
fonte: string;            // 'Arial' | 'Times New Roman' | 'Calibri' | 'Helvetica' | 'Georgia'
tamanhoFonte: number;     // px no painel → convertido para pt no CSS
alinhamento: 'left'|'center'|'right';
corTitulo: string;        // hex
```
Com fallback seguro para os defaults atuais quando o JSON não tem o campo.

### 3.2 Tornar `buildInstitutionalCSS` consciente da config
Mudar assinatura para aceitar `config?: DocumentConfig` (mantendo backcompat) e usar as variáveis no CSS:
- `body { font-family: <fonte>; font-size: <tamanhoFonte * 0.75>pt; }` (px→pt)
- `.doc-header h1 { color: <corTitulo>; text-align: <alinhamento>; }`
- `.doc-header { border-bottom-color: <corTitulo>; }`
- `h2, .section-title { color: <corTitulo>; }`
- `.doc-footer { border-top-color: <corTitulo>; }`

`openPrintDocument` passa a injetar a config carregada no CSS:
```ts
const css = buildInstitutionalCSS(options, config);
```

### 3.3 Migrar `ChartCard.tsx`
Substituir `window.open + HTML inline` por `openPrintDocument(title, '<div>'+svgHTML+'</div>', undefined, { extraCSS: 'svg{max-width:100%;height:auto;}' })`. Gráfico passa a sair com cabeçalho/rodapé institucional.

### 3.4 Migrar os 2 pontos de `Relatorios.tsx`
Linhas 1508 e 2363: extrair o body HTML que já é construído inline e passar via `openPrintDocument(titulo, body, meta)`. Remover o `<html>/<head>/<style>` improvisado.

### 3.5 Corrigir preview e "imprimir teste" do painel de config
Em `ConfigImpressaoDocumentos.tsx`:
- `handlePreview` → substituir pelo `openPrintDocument('ATESTADO MÉDICO (PRÉ-VISUALIZAÇÃO)', body, meta)` para que o preview consuma exatamente o mesmo pipeline.
- Botão "Imprimir teste" → trocar `window.print()` por uma chamada ao mesmo `handlePreview()` (com auto-print). Hoje ele imprime a tela de configuração, o que é bug.
- Após `save()`, chamar `invalidateDocumentConfigCache()` para refletir mudanças imediatamente sem esperar TTL de 1min.

### 3.6 Garantir conversão correta de unidades
- Painel salva `tamanhoFonte` em **px**. CSS de impressão usa **pt**. Conversão: `pt = px * 0.75`.
- Logos: painel salva tamanho em **px**, `docHeader` já usa em px com `max-height`/`width`. Manter.
- Margens da `@page`: continuar 25mm (A4) / 12mm (A5). Não há campo no painel para isto hoje — fora do escopo.

### 3.7 Pré-visualização da Ficha (`FichaImpressao.tsx`)
Já usa `docHeader+docFooter+buildInstitutionalCSS` em iframe. Passar a `buildInstitutionalCSS(opts, config)` para refletir fonte/cor configuradas. Sem outras mudanças.

## 4. Arquivos a editar

- `src/lib/printLayout.ts` — estender `DocumentConfig`, `loadDocumentConfig`, `buildInstitutionalCSS`, `openPrintDocument`.
- `src/components/ChartCard.tsx` — migrar para `openPrintDocument`.
- `src/pages/painel/Relatorios.tsx` — substituir 2 `window.open` inline.
- `src/components/config/ConfigImpressaoDocumentos.tsx` — preview/imprimir teste via shell + invalidar cache no save.
- `src/components/FichaImpressao.tsx` — passar `config` ao `buildInstitutionalCSS`.

Nenhum arquivo novo. Nenhuma mudança em regra de negócio, dados, schema, agenda, BPA ou lógica clínica.

## 5. Critérios de aceite

- Alterar fonte/tamanho/cor em `Configurações > Impressão e Documentos` reflete imediatamente em:
  preview do painel, Ficha do Paciente, Prontuário, Histórico, Receituário, Solicitação de Exames, Encaminhamentos, Relatório de Alta, Relatórios, Auditoria, Documentos Histórico, Gerar Documento, Ficha Funcionário, Modelos, Gráficos (ChartCard).
- Preview, `window.print()` e "Salvar como PDF" do navegador produzem HTML idêntico (mesma fonte, mesmo CSS, mesmo header/footer) — porque todos passam pelo mesmo `openPrintDocument`.
- Não restam `window.open('','_blank')` com HTML inline próprio em src/ (validado por `rg`).
- Logos com 1/2/3 slots + opção redonda continuam funcionando.

## 6. Validação

```bash
rg -n "window\.open\(['\"]\s*['\"]" src --type ts --type tsx
```
Resultado esperado: somente `printLayout.ts` (legítimo) e links externos (`signedUrl`, WhatsApp).

Teste manual: alterar fonte para "Times New Roman" 14px e cor `#7e22ce`, imprimir 5 documentos diferentes → todos saem com Times 10.5pt e título roxo.

## Fora de escopo

Margens da página configuráveis, orientação configurável, templates por tipo de documento (atestado/receita) com layouts próprios, assinatura digital, Agenda/BPA, lógica clínica.
