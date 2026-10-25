import { drawCoordinates, drawPieces, drawSquares, loadPieceImages, squareOrigin } from './board-canvas.js';

const PNG_SIZE = 1024;
/** Loaded on the first export, then kept: every board shares one piece set. */
let pieceImages: Promise<Map<string, HTMLImageElement>> | null = null;

/** The position as a PNG diagram (squares, coordinates, pieces), seen from `orientation`. */
export async function boardPng(fen: string, orientation: 'white' | 'black'): Promise<Blob> {
  pieceImages ??= loadPieceImages();
  const pieces = await pieceImages;
  const canvas = document.createElement('canvas');
  canvas.width = PNG_SIZE;
  canvas.height = PNG_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  const square = PNG_SIZE / 8;
  const at = squareOrigin(0, 0, square, orientation);
  drawSquares(ctx, at, square);
  drawCoordinates(ctx, at, square, orientation === 'black');
  drawPieces(ctx, at, square, fen, pieces);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))), 'image/png');
  });
}

/** "position-move-12-black.png": the move number and side to move, from the FEN. */
export function boardPngFileName(fen: string): string {
  const [, turn, , , , move] = fen.split(' ');
  return `position-move-${move ?? '1'}-${turn === 'b' ? 'black' : 'white'}.png`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
