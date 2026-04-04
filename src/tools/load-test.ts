const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(Math.max(Math.ceil(ordered.length * ratio) - 1, 0), ordered.length - 1);
  return ordered[index] ?? 0;
};

export const loadTestMemorySearch = async ({
  baseUrl,
  orgId,
  projectId,
  query,
  totalRequests = 100,
  concurrency = 10,
  timeoutSeconds = 5
}: {
  baseUrl: string;
  orgId: string;
  projectId: string;
  query: string;
  totalRequests?: number;
  concurrency?: number;
  timeoutSeconds?: number;
}): Promise<{
  total_requests: number;
  concurrency: number;
  success_count: number;
  failure_count: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  max_latency_ms: number;
}> => {
  const limiter = Math.max(concurrency, 1);
  const timings: number[] = [];
  let failures = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= totalRequests) {
        return;
      }
      const started = performance.now();
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/memories/search`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            query,
            session_id: `${orgId}:${projectId}:load-test`,
            session_key: `${orgId}:${projectId}:load-test`,
            semantic_set_id: `${orgId}:${projectId}:load-test`,
            mode: "mixed",
            limit: 5,
            context_window: 1
          }),
          signal: AbortSignal.timeout(timeoutSeconds * 1000)
        });
        if (!response.ok) {
          failures += 1;
        }
      } catch {
        failures += 1;
      } finally {
        timings.push(performance.now() - started);
      }
    }
  };

  await Promise.all(Array.from({ length: limiter }, () => worker()));
  const successCount = totalRequests - failures;
  const average = timings.reduce((sum, value) => sum + value, 0) / Math.max(timings.length, 1);

  return {
    total_requests: totalRequests,
    concurrency: concurrency,
    success_count: successCount,
    failure_count: failures,
    avg_latency_ms: Number(average.toFixed(3)),
    p95_latency_ms: Number(percentile(timings, 0.95).toFixed(3)),
    max_latency_ms: Number((timings.length === 0 ? 0 : Math.max(...timings)).toFixed(3))
  };
};
