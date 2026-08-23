import { BARE_SAN, MOVE_TOKEN } from '../features/chat/moveMention.js';

const PIECE_NAMES: Record<string, string> = {
  K: 'King',
  Q: 'Queen',
  R: 'Rook',
  B: 'Bishop',
  N: 'Knight'
};

const CASTLE_QUEENSIDE = /^O-O-O([+#])?$/;
const CASTLE_KINGSIDE = /^O-O([+#])?$/;
const PIECE_MOVE = /^([KQRBN])([a-h]|[1-8]|[a-h][1-8])?(x)?([a-h][1-8])(=([QRBN]))?([+#])?$/;
const PAWN_CAPTURE = /^([a-h])x([a-h][1-8])(=([QRBN]))?([+#])?$/;
const PAWN_MOVE = /^([a-h][1-8])(=([QRBN]))?([+#])?$/;

function suffixWord(suffix: string | undefined): string {
  if (suffix === '+') return ' check';
  if (suffix === '#') return ' checkmate';
  return '';
}

function promotionWord(piece: string | undefined): string {
  return piece ? ` promoting to ${PIECE_NAMES[piece] ?? piece}` : '';
}

/** Converts one SAN token ("Qxh5+", "exd5=Q#", "O-O") into natural spoken
 * English ("Queen takes h5 check", "e takes d5 promoting to Queen
 * checkmate", "castles kingside"). Falls back to the token itself for
 * anything that doesn't match a known SAN shape — this only ever runs on
 * text a coach already produced, so a miss should degrade to "read the
 * letters as written" rather than throw. */
export function sanToSpokenWords(san: string): string {
  const castleQueenside = CASTLE_QUEENSIDE.exec(san);
  if (castleQueenside) return `castles queenside${suffixWord(castleQueenside[1])}`;

  const castleKingside = CASTLE_KINGSIDE.exec(san);
  if (castleKingside) return `castles kingside${suffixWord(castleKingside[1])}`;

  const pieceMove = PIECE_MOVE.exec(san);
  if (pieceMove) {
    const [, piece, disambiguation, capture, dest, , promo, suffix] = pieceMove;
    const pieceName = (piece && PIECE_NAMES[piece]) ?? piece ?? '';
    const from = disambiguation ? ` from ${disambiguation}` : '';
    const verb = capture ? ' takes' : '';
    return `${pieceName}${from}${verb} ${dest}${promotionWord(promo)}${suffixWord(suffix)}`;
  }

  const pawnCapture = PAWN_CAPTURE.exec(san);
  if (pawnCapture) {
    const [, file, dest, , promo, suffix] = pawnCapture;
    return `${file} takes ${dest}${promotionWord(promo)}${suffixWord(suffix)}`;
  }

  const pawnMove = PAWN_MOVE.exec(san);
  if (pawnMove) {
    const [, dest, , promo, suffix] = pawnMove;
    return `${dest}${promotionWord(promo)}${suffixWord(suffix)}`;
  }

  return san;
}

/** "24." (or "24-", the coach's occasional typo) is White's move — no
 * spoken color marker, matching PGN convention where the bare number
 * implies White. "26..." is Black's move stated alone; spoken audio has no
 * visual ellipsis to carry that, so it's said explicitly. */
function moveTokenToSpokenWords(moveNumber: string, separator: string, san: string): string {
  const colorPrefix = separator === '...' ? "black's move, " : '';
  return `move ${moveNumber}, ${colorPrefix}${sanToSpokenWords(san)}`;
}

function translateBareSanIn(segment: string): string {
  return segment.replace(BARE_SAN, (_match, san: string) => sanToSpokenWords(san));
}

/** Rewrites chess notation embedded in coach prose into natural spoken
 * English, e.g. "Qh5+" -> "Queen h5 check", "24. a4" -> "move 24, a4",
 * "26...c6" -> "move 26, black's move, c6". Model-independent: this is pure
 * text-in/text-out, run once in getSpeakableText.ts before either TTS
 * backend (OpenAI or the browser's Kokoro) ever sees the text, so neither
 * needs its own notation-reading logic.
 *
 * Numbered move tokens are translated first, exactly the same "consume the
 * matched region, only re-scan what's left" two-tier walk moveMention.ts
 * uses for rendering — a numbered move's SAN is never re-processed by the
 * bare-SAN pass afterward, so a destination square like "h5" left over in
 * "Queen h5 check" can't accidentally get "translated" a second time. */
export function translateChessNotationForSpeech(text: string): string {
  let result = '';
  let lastIndex = 0;

  for (const match of text.matchAll(MOVE_TOKEN)) {
    const index = match.index;
    result += translateBareSanIn(text.slice(lastIndex, index));
    const [full, number, separator, san] = match;
    result += moveTokenToSpokenWords(number ?? '', separator ?? '', san ?? '');
    lastIndex = index + (full?.length ?? 0);
  }
  result += translateBareSanIn(text.slice(lastIndex));

  return result;
}
