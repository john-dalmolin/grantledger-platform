import type {
  PaymentProvider,
  SubscriptionUseCaseDeps,
} from "@grantledger/application";
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
} from "@grantledger/contracts";
import {
  CryptoIdGenerator,
  SystemClock,
  type Clock,
  type IdGenerator,
} from "@grantledger/shared";

import {
  createStartCheckoutHandler,
  type StartCheckoutHandler,
} from "../handlers/checkout.js";
import {
  createInMemorySubscriptionUseCaseDeps,
  createSubscriptionHandlers,
  type SubscriptionHandlers,
} from "../handlers/subscription.js";

class FakePaymentProvider implements PaymentProvider {
  public readonly name = "fake" as const;

  constructor(
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  createCheckoutSession(
    _input: CreateCheckoutSessionInput,
  ): CreateCheckoutSessionResult {
    void _input;
    const token = this.idGenerator.next().replace(/-/g, "").slice(0, 12);
    const sessionId = `fake_chk_${token}`;

    return {
      provider: this.name,
      sessionId,
      checkoutUrl: `https://pay.local/checkout/${sessionId}`,
      createdAt: this.clock.nowIso(),
    };
  }
}

export interface ApiCompositionRootDeps {
  clock?: Clock;
  idGenerator?: IdGenerator;
  paymentProvider?: PaymentProvider;
  subscriptionUseCases?: SubscriptionUseCaseDeps;
}

export interface ApiCompositionRoot extends SubscriptionHandlers {
  handleStartCheckout: StartCheckoutHandler;
}

export function createApiCompositionRoot(
  deps: ApiCompositionRootDeps = {},
): ApiCompositionRoot {
  const clock = deps.clock ?? new SystemClock();
  const idGenerator = deps.idGenerator ?? new CryptoIdGenerator();
  const paymentProvider =
    deps.paymentProvider ?? new FakePaymentProvider(idGenerator, clock);

  const subscriptionUseCases =
    deps.subscriptionUseCases ?? createInMemorySubscriptionUseCaseDeps();

  const subscriptionHandlers = createSubscriptionHandlers({
    subscriptionUseCases,
    clock,
    idGenerator,
  });

  return {
    handleStartCheckout: createStartCheckoutHandler({ paymentProvider }),
    ...subscriptionHandlers,
  };
}
