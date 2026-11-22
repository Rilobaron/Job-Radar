export class RateLimiter {
  private lastCallTimestamp: number = 0;

  constructor(private minIntervalMs: number = 500) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTimestamp;
    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastCallTimestamp = Date.now();
  }
}
