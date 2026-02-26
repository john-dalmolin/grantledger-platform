import { randomUUID } from "node:crypto";

export interface IdGenerator {
  next(): string;
}

export class CryptoIdGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
