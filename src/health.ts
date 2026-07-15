import type { ServerResponse } from 'node:http';
import type { KeyPool } from './services/key-pool.js';
import type { ConcurrencyLimiter } from './services/concurrency.js';

export interface HealthDeps {
  keyPool: KeyPool;
  limiter: ConcurrencyLimiter;
}

export function createHealthHandler(deps: HealthDeps): (res: ServerResponse) => void {
  return (res) => {
    const body = {
      status: 'ok',
      keys: deps.keyPool.stats(),
      concurrency: deps.limiter.stats(),
    };
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
}
