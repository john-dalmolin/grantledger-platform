# ADR-001: Tenancy Model (Single DB + tenant_id + RLS)

- Status: Accepted
- Date: 2026-02-17
- Deciders: Platform Team

## Context

A v1 da plataforma precisa de isolamento por tenant com baixo custo operacional, alta velocidade de entrega e caminho claro para evolução enterprise.

## Decision

Usaremos PostgreSQL único com `tenant_id` obrigatório em entidades multi-tenant e Row-Level Security (RLS) como camada de enforcement no banco.

No runtime, cada request autenticada deve propagar o contexto de tenant para a sessão SQL antes de qualquer acesso a dados de domínio.

## Consequences

### Positive

- Menor complexidade operacional na v1.
- Escala inicial com bom custo-benefício.
- Isolamento reforçado no banco, não apenas na aplicação.

### Negative

- Requer disciplina rígida de modelagem e query scoping.
- Políticas RLS incompletas podem gerar risco de vazamento cross-tenant.
- Consultas administrativas cross-tenant exigem trilha de auditoria clara.

## Guardrails

- Toda tabela multi-tenant deve ter `tenant_id UUID NOT NULL`.
- Toda PK/FK e índice relevante deve considerar `tenant_id` quando aplicável.
- Toda tabela multi-tenant deve ter `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.
- A role da aplicação não pode ser superuser e não pode ter `BYPASSRLS`.
- O contexto de tenant deve ser definido por request na sessão SQL (`SET LOCAL app.tenant_id = '<tenant_uuid>'`) antes de qualquer query de domínio.
- Qualquer operação sem `app.tenant_id` deve falhar por padrão (fail-closed).
- Operações cross-tenant são permitidas apenas por role de sistema dedicada e sempre auditadas com `actor`, `reason`, `ticket_id` e `trace_id`.
- Testes automatizados devem validar isolamento entre tenants e negativa de acesso cross-tenant.

## Alternatives Considered

- Schema por tenant: isolamento mais forte, maior complexidade de migração/versionamento e operação.
- Database por tenant: isolamento máximo, custo operacional elevado para v1.

## Migration Path

Se houver necessidade de isolamento dedicado (clientes enterprise), o domínio mantém contratos estáveis e permite migração progressiva para schema/database dedicado por tenant sem quebrar API pública.
