// 측정 도구 — 지연 표본(저수지 표집)과 백분위. 순수 모듈.

/** 정렬된 배열의 p 백분위(0~100) — 비면 NaN */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i] ?? Number.NaN;
}

/**
 * 지연 표본 — cap 개까지만 들고, 넘치면 저수지 표집으로 고르게 바꿔 넣는다.
 * 움직임마다 시각을 싣는 대상(화이트보드)은 초당 수만 개가 들어오므로 다 모으면 메모리가 끝없이 는다
 */
export class Sampler {
  private readonly buf: number[] = [];
  private seenCount = 0;
  private readonly cap: number;
  private readonly random: () => number;

  constructor(cap: number, random: () => number = Math.random) {
    this.cap = cap;
    this.random = random;
  }

  /** 지금까지 들어온 수 (버린 것 포함) */
  get seen(): number {
    return this.seenCount;
  }

  add(v: number): void {
    this.seenCount++;
    if (this.buf.length < this.cap) {
      this.buf.push(v);
      return;
    }
    const j = Math.floor(this.random() * this.seenCount);
    if (j < this.cap) this.buf[j] = v;
  }

  sorted(): number[] {
    return [...this.buf].sort((a, b) => a - b);
  }
}

/** 한 구간의 집계 — 보낸·받은 메시지 수, 받은 바이트, 지연 표본 */
export class Window {
  sent = 0;
  recv = 0;
  bytes = 0;
  readonly lat: Sampler;

  constructor(latCap = 20_000) {
    this.lat = new Sampler(latCap);
  }
}
