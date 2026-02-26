import { utcNowIso } from "../time.js";

export interface Clock {
  now(): Date;
  nowIso(): string;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return utcNowIso();
  }
}
