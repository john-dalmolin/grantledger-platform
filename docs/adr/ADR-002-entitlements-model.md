# ADR-002: Entitlements Model (Capabilities + Limits)

- Status: Accepted
- Date: 2026-02-17
- Deciders: Platform Team

## Context

Entitlements precisam suportar evolução de planos, add-ons e exceções por tenant sem virar acoplamento caótico ou regras opacas.

## Decision

Adotaremos modelo híbrido de:

- Capabilities: habilita/desabilita features.
- Limits: quotas numéricas por recurso.

A resolução de entitlement seguirá precedência determinística:
`tenant override > add-ons ativos > plano ativo`.

## Consequences

### Positive

- Modelo flexível para produto e vendas sem código custom por cliente.
- Regras previsíveis, auditáveis e testáveis.
- Facilidade para adicionar novos planos e add-ons com baixo risco.

### Negative

- Exige engine de resolução e versionamento de snapshots.
- Pode aumentar complexidade de suporte sem observabilidade adequada.

## Guardrails

- Toda decisão de entitlement deve ser reprodutível por snapshot versionado.
- Nenhuma regra ad-hoc hardcoded por tenant fora de override explícito.
- Toda mudança de entitlement deve gerar evento de auditoria.
- Ordem de precedência é fixa e documentada.

## Domain Shape (alto nível)

- `entitlement_definitions`: catálogo de capabilities e limits.
- `plan_entitlements`: valores base por versão de plano.
- `addon_entitlements`: incrementos/overrides por add-on.
- `tenant_entitlement_overrides`: exceções explícitas por tenant.
- `entitlement_snapshots`: resultado resolvido versionado por ciclo de assinatura.
- `usage_counters`: consumo de quota por janela de tempo.

## Evaluation Rules

- Avaliação sempre por tenant e timestamp de referência.
- Resultado inclui `granted`, `source`, `effective_value`, `snapshot_version`.
- Limites devem suportar política de janela (ex.: mensal) e reconcilição.

## Limit Merge Semantics

- Cada `limit` deve declarar `merge_strategy` explícita: `sum`, `max` ou `override`.
- `plan` define o valor base do limite.
- `add-ons` aplicam merge conforme `merge_strategy`.
- `tenant override` sempre tem precedência final e substitui o valor efetivo.
- Capabilities seguem precedência booleana determinística (`override > add-on > plan`), sem regras ad-hoc por tenant.
- Toda avaliação deve registrar `source_chain` (ex.: `plan:pro -> addon:extra_seats -> override:sales_exception`).

## Failure Policy

- Operações de escrita sensíveis devem ser `fail-closed` se a avaliação de entitlement falhar.
- Operações de leitura não críticas podem usar snapshot em cache com TTL curto (ex.: 5 minutos) quando o avaliador estiver indisponível.
- Ausência de definição explícita de capability/limit deve negar acesso por padrão.
- Todo fallback deve emitir log estruturado e métrica de degradação.

## Alternatives Considered

- Apenas feature flags: simples, insuficiente para quotas reais.
- Regras totalmente custom por tenant: flexível, mas baixa governança e alto custo de manutenção.
