export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad(m)}:${pad(s)}`;
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function keyUTCDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}
