import { pins } from '../tactic-pins.js';
import type { TacticDetector } from './types.js';

export const pinDetector: TacticDetector = {
  type: 'pin',
  priority: 20,
  detect: (ctx) => ctx.after !== null && ctx.destination !== null && pins(ctx.after).some((hit) => hit.by === ctx.destination)
};
