import type { Logger } from '../utils/logger.js';
import { AllKeysUnavailableError } from '../utils/errors.js';

export interface KeyPoolConfig {
  keys: string[];
  perKeyConcurrency: number;
  cooldownMs: number;
}

export interface AcquiredKey {
  key: string;
  release: () => void;
}

interface KeyState {
  inFlight: number;
  cooldownUntil: number;
}

export class KeyPool {
  private readonly states = new Map<string, KeyState>();
  private cursor = 0;

  constructor(
    private readonly cfg: KeyPoolConfig,
    private readonly logger: Logger,
    private readonly now: () => number = () => Date.now(),
  ) {
    for (const k of cfg.keys) this.states.set(k, { inFlight: 0, cooldownUntil: 0 });
  }

  private isAvailable(key: string, t: number): boolean {
    const st = this.states.get(key);
    if (!st) return false;
    return st.cooldownUntil <= t && st.inFlight < this.cfg.perKeyConcurrency;
  }

  acquire(): AcquiredKey {
    const t = this.now();
    const n = this.cfg.keys.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const key = this.cfg.keys[idx] as string;
      if (this.isAvailable(key, t)) {
        const st = this.states.get(key)!;
        st.inFlight += 1;
        this.cursor = (idx + 1) % n;
        const released = false;
        let done = released;
        return {
          key,
          release: () => {
            if (done) return;
            done = true;
            st.inFlight = Math.max(0, st.inFlight - 1);
          },
        };
      }
    }
    throw new AllKeysUnavailableError('所有 API Key 暂时不可用，请稍后重试');
  }

  markUnavailable(key: string): void {
    const st = this.states.get(key);
    if (!st) return;
    st.cooldownUntil = this.now() + this.cfg.cooldownMs;
    this.logger.warn({ keyIndex: this.cfg.keys.indexOf(key), cooldownMs: this.cfg.cooldownMs }, 'key moved to cooldown');
  }

  stats(): { total: number; available: number; cooldown: number } {
    const t = this.now();
    let cooldown = 0;
    let available = 0;
    for (const [, st] of this.states) {
      if (st.cooldownUntil > t) cooldown++;
      else available++;
    }
    return { total: this.cfg.keys.length, available, cooldown };
  }
}
