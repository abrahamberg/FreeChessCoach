/** Word-based eval phrasing shared by every in-browser engine readout
 * (Explore panel's useWasmEngine, the JIT bot-play hint panel) — never sent
 * to the server, always relative to the side to move in the FEN the raw
 * cp/mateIn came from. */
export function cpToWords(cp: number, sideToMove: 'w' | 'b'): string {
  const whiteCp = sideToMove === 'w' ? cp : -cp;
  const abs = Math.abs(whiteCp);
  const side = whiteCp >= 0 ? 'White' : 'Black';
  if (abs < 50) return 'The position is roughly equal';
  if (abs < 150) return `${side} is slightly better`;
  if (abs < 400) return `${side} is better`;
  if (abs < 900) return `${side} is much better`;
  return `${side} is winning`;
}

export function mateToWords(mateIn: number, sideToMove: 'w' | 'b'): string {
  const whiteMateIn = sideToMove === 'w' ? mateIn : -mateIn;
  const side = whiteMateIn > 0 ? 'White' : 'Black';
  return `${side} has a forced mate in ${Math.abs(whiteMateIn)}`;
}
