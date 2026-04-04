export type TimingSnapshot = {
  count: number;
  last: number;
  min: number;
  max: number;
  sum: number;
  avg: number;
};

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly timings = new Map<string, TimingSnapshot>();

  increment(name: string, delta = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }

  setGauge(name: string, value: number): void {
    this.counters.set(name, value);
  }

  observeTiming(name: string, value: number): void {
    const current = this.timings.get(name);
    if (current === undefined) {
      this.timings.set(name, {
        count: 1,
        last: value,
        min: value,
        max: value,
        sum: value,
        avg: value
      });
      return;
    }

    const count = current.count + 1;
    const sum = current.sum + value;
    this.timings.set(name, {
      count,
      last: value,
      min: Math.min(current.min, value),
      max: Math.max(current.max, value),
      sum,
      avg: sum / count
    });
  }

  snapshot(): { counters: Record<string, number>; timings_ms: Record<string, TimingSnapshot> } {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      timings_ms: Object.fromEntries(this.timings.entries())
    };
  }
}
