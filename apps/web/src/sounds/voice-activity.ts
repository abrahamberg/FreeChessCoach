/** Which voices are speaking now (the coach's reply, a course note), so a
 * board sound can step aside instead of talking over them. */
const speaking = new Set<string>();

export function setVoiceSpeaking(source: string, isSpeaking: boolean): void {
  if (isSpeaking) speaking.add(source);
  else speaking.delete(source);
}

export function isVoiceSpeaking(): boolean {
  return speaking.size > 0;
}
