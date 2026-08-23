import type {
  EngineEval,
  FeatureDeltaDto,
  MoveFlagsDto,
  MoveQuality,
  PositionFeatures
} from '@freechesscoach/shared';

export type SeverityQuality = Extract<MoveQuality, 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'>;

/** All pure facts needed by the §5 decision-order classifier. */
export interface MoveClassificationInput {
  ply: number;
  moveSan: string;
  moveUci: string;
  mover: 'white' | 'black';
  fenBefore: string;
  fenAfter: string;
  evalBefore: EngineEval;
  evalAfter: EngineEval;
  moveFlags: MoveFlagsDto;
  beforeWin: number;
  afterWin: number;
  drop: number;
  cpBefore: number;
  cpAfter: number;
  isBookMove?: boolean;
  brilliantSoundness?: boolean;
  bestLinePvSan?: string[];
  features?: PositionFeatures;
  featureDelta?: FeatureDeltaDto;
  previousQuality?: MoveQuality;
  isRecapture?: boolean;
}
