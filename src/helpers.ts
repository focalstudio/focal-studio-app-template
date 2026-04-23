export function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatMMSS(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad(m)}:${pad(s)}`;
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function keyUTCDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}
