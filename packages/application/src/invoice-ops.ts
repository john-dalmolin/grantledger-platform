import type { InvoiceGenerationJob, InvoiceJobObserver } from "./invoice.js";

type RuntimeJobState = "queued" | "processing" | "completed" | "dead_lettered";

export interface InvoiceOpsSnapshot {
  queueDepth: number;
  processingCount: number;
  completedCount: number;
  retryScheduledCount: number;
  deadLetterCount: number;
  terminalFailureRate: number;
}

export interface InvoiceOpsMonitor {
  observer: InvoiceJobObserver;
  snapshot(): InvoiceOpsSnapshot;
}

function countState(
  states: Map<string, RuntimeJobState>,
  target: RuntimeJobState,
): number {
  let count = 0;
  for (const state of states.values()) {
    if (state === target) count += 1;
  }
  return count;
}

export function createInMemoryInvoiceOpsMonitor(): InvoiceOpsMonitor {
  const states = new Map<string, RuntimeJobState>();
  let retryScheduledCount = 0;

  const observer: InvoiceJobObserver = {
    onJobEnqueued(job: InvoiceGenerationJob) {
      states.set(job.id, "queued");
    },
    onJobClaimed(job: InvoiceGenerationJob) {
      states.set(job.id, "processing");
    },
    onJobCompleted(job: InvoiceGenerationJob) {
      states.set(job.id, "completed");
    },
    onJobRetryScheduled(job: InvoiceGenerationJob) {
      retryScheduledCount += 1;
      states.set(job.id, "queued");
    },
    onJobDeadLettered(job: InvoiceGenerationJob) {
      states.set(job.id, "dead_lettered");
    },
  };

  return {
    observer,
    snapshot(): InvoiceOpsSnapshot {
      const queueDepth = countState(states, "queued");
      const processingCount = countState(states, "processing");
      const completedCount = countState(states, "completed");
      const deadLetterCount = countState(states, "dead_lettered");
      const terminalTotal = completedCount + deadLetterCount;

      return {
        queueDepth,
        processingCount,
        completedCount,
        retryScheduledCount,
        deadLetterCount,
        terminalFailureRate:
          terminalTotal === 0 ? 0 : deadLetterCount / terminalTotal,
      };
    },
  };
}
