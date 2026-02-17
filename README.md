# GrantLedger Platform

Monorepo TypeScript para uma plataforma SaaS multi-tenant de grants, billing e entitlements, construída com foco em arquitetura limpa, baixo acoplamento e evolução orientada por issues.

## Objetivo

Construir uma base técnica sólida para operações críticas de assinatura e controle de acesso por tenant, com previsibilidade de entrega e qualidade de engenharia.

## Estado atual

- GL-001: bootstrap do monorepo e baseline de engenharia
- GL-002: auth, memberships e tenant request context
- GL-003: baseline de idempotência para operações de escrita
- GL-004: abstração inicial de payment provider

## Arquitetura

Princípios adotados:

- Domain-first: regras de negócio no core, sem dependência de framework
- Ports and adapters: integrações externas entram por abstrações
- Contratos explícitos entre camadas para reduzir acoplamento
- Evolução incremental com rastreabilidade via ADR e board

Dependências por camada:

- `packages/domain`: não depende de framework
- `packages/application`: depende de `domain` e `contracts`
- `apps/*`: dependem de `application` e `contracts`

## Estrutura do monorepo

Raiz do projeto:
`/Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform`

- `apps/api` -> adapter HTTP e composição dos casos de uso
- `apps/worker` -> processamento assíncrono (baseline)
- `apps/admin` -> aplicação administrativa (baseline)
- `packages/contracts` -> tipos e contratos compartilhados
- `packages/domain` -> entidades e políticas de domínio
- `packages/application` -> casos de uso
- `packages/shared` -> utilitários transversais
- `docs/adr` -> decisões arquiteturais

## Fluxos implementados

Auth + Tenant Context (GL-002):

- sem usuário autenticado -> 401
- sem tenant informado -> 400
- sem membership ativa para tenant -> 403
- contexto válido -> 200

Idempotência (GL-003):

- sem idempotency key -> 400
- primeira execução válida -> 201
- replay com mesmo payload -> 200
- mesma key com payload diferente -> 409

Payment Provider Abstraction (GL-004):

- porta de provider definida
- adapter fake para validar comportamento
- base pronta para integração real (ex.: Stripe) sem quebrar o core

## Stack técnica

- Node.js 22.x
- TypeScript (strict + exactOptionalPropertyTypes + project references)
- ESLint
- NPM Workspaces

## Setup local

Pré-requisitos:

- Node.js >= 22
- npm >= 10

Instalação:

- `npm ci`

Validação técnica:

- `npm run typecheck`
- `npm run build`
- `npm run lint`

## Qualidade e fluxo de trabalho

- 1 issue = 1 branch = 1 PR
- branches: `feat/*`, `fix/*`, `chore/*`
- merge: Squash and Merge
- sem commit direto em `main`

Checklist mínimo para merge:

- escopo aderente à issue
- diff focado e sem ruído
- typecheck/build/lint verdes
- riscos e decisões documentados no PR

## Documentação de arquitetura

ADRs em:
`/Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/docs/adr`

## Links

- Repositório: https://github.com/john-dalmolin/grantledger-platform
- Board: https://github.com/users/john-dalmolin/projects/6

## Destaques para entrevista técnica

- aplicação de Clean Architecture em projeto real
- boundaries explícitos entre camadas
- modelagem de idempotência e contexto multi-tenant
- abstração de payment provider com baixo acoplamento

## Próximos passos

- integrar provider real com webhook handling
- adicionar suíte de testes automatizados por camada
- evoluir observabilidade, retries e reconciliação
- hardening de segurança e controles operacionais
