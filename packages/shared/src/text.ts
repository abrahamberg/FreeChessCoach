/** The word with its first letter in capitals ("white" → "White"). */
export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
