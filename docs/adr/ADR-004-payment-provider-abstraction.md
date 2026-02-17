# ADR-004: Payment Provider Abstraction (Stripe-first, Provider-agnostic Core)

- Status: Accepted
- Date: 2026-02-17
- Deciders: Platform Team

## Context

A v1 inicia com Stripe para acelerar entrega, mas o domínio de billing não pode ficar acoplado ao SDK/protocolo de um único provider.

## Decision

Adotaremos interface de provedor (`PaymentProvider`) no domínio de aplicação e adapter Stripe na borda de infraestrutura.

Webhooks entram por camada anti-corruption, são normalizados em eventos canônicos internos e somente então processados pelo domínio.

## Consequences

### Positive

- Reduz lock-in tecnológico.
- Mantém domínio estável mesmo com troca de provider.
- Facilita testes com doubles/fakes da interface.

### Negative

- Introduz complexidade inicial de abstração.
- Exige mapeamento cuidadoso de semântica entre provider externo e eventos internos.

## Guardrails

- Nenhum módulo de domínio pode importar SDK do Stripe.
- Todo webhook deve validar assinatura e deduplicar por `provider + event_id`.
- Payload bruto deve ser armazenado para auditoria e forense.
- Falhas de processamento devem seguir retry com DLQ e observabilidade.
- Todo evento canônico interno deve incluir `domain_event_version`.
- Mudanças quebradoras no contrato de evento exigem nova versão e janela de compatibilidade backward.

## Minimal Interface (conceitual)

- `createCustomer`
- `createSubscription`
- `updateSubscription`
- `cancelSubscription`
- `createCheckoutSession` ou equivalente
- `parseAndVerifyWebhook`
- `mapProviderEventToDomainEvent`

## Canonical Event Compatibility

- Estrutura mínima de evento canônico: `event_name`, `domain_event_version`, `occurred_at`, `provider`, `provider_event_id`, `tenant_id`, `payload`.
- Consumidores internos devem processar versões suportadas explicitamente.
- Depreciação de versão antiga deve seguir janela formal (ex.: 90 dias) com métricas de adoção.

## Alternatives Considered

- Acoplamento direto ao Stripe e abstrair depois: acelera hoje, gera refactor caro e risco de contaminação do domínio.
- Multi-provider completo na v1: complexidade prematura para estágio inicial.

## Migration Path

Quando houver necessidade de novo provider, implementa-se novo adapter mantendo os contratos de domínio e de API estáveis.
