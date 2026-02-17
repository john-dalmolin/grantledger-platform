# ADR-003: Idempotency Strategy (Persistent Keys)

- Status: Accepted
- Date: 2026-02-17
- Deciders: Platform Team

## Context

APIs de escrita e webhooks de pagamento sofrem retries/reenvios por natureza. Precisamos evitar duplicidade de efeitos (cobrança, fatura, grants) e garantir auditabilidade.

## Decision

Usaremos duas estratégias complementares de idempotência:

- API commands: chave composta `tenant_id + operation + idempotency_key`.
- Webhook ingress: deduplicação primária por `provider + event_id` antes da resolução de tenant.

Cada registro guarda:

- hash do payload canônico,
- status (`processing`, `succeeded`, `failed`),
- resposta final (`status_code`, `response_body`) quando aplicável,
- `processing_expires_at` para recuperação de execução interrompida,
- timestamps e expiração (TTL).

## Consequences

### Positive

- Segurança contra duplicidade em cenários reais de retry.
- Auditoria completa de decisões de idempotência.
- Comportamento consistente entre API e processamento assíncrono.

### Negative

- Mais I/O e armazenamento.
- Exige canonicalização consistente de payload para hash confiável.

## Guardrails

- Mesma chave com payload diferente deve retornar `409 Conflict`.
- Reexecução com mesma chave e mesmo payload deve retornar resposta previamente persistida.
- Criação da chave deve ser atômica via constraint única e insert transacional.
- Registros em `processing` vencidos por `processing_expires_at` podem ser retomados com segurança por worker elegível.
- Webhook deve ser deduplicado por `provider + event_id` mesmo sem `tenant_id` resolvido.
- TTL deve ser definido por operação e política de retenção (API e webhook com janelas distintas).

## Scope

- Obrigatório para comandos de escrita críticos:
  - criação/alteração de assinatura,
  - geração de invoice,
  - aplicação de pagamento,
  - processamento de webhook.
- Opcional para operações sem efeito colateral.

## Alternatives Considered

- Redis-only: rápido, mas frágil para auditoria e recuperação pós-incidente.
- Idempotência apenas no provider externo: insuficiente para consistência interna do domínio.
