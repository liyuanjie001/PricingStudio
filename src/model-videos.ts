import Decimal from 'decimal.js';

// 480P credits per complete video, supplied in the user's model comparison.
export const VIDEO_MODELS = [
  { id: 'seedance-2.5', name: 'Seedance 2.5', creditsPerVideo: 34 },
  { id: 'seedance-2.0', name: 'Seedance 2.0', creditsPerVideo: 23 },
  { id: 'seedance-fast', name: 'Seedance 2.0 Fast', creditsPerVideo: 18 },
  { id: 'seedance-mini', name: 'Seedance 2.0 Mini', creditsPerVideo: 12 },
  { id: 'wan-3.0', name: 'wan 3.0', creditsPerVideo: 11 },
] as const;

interface VideoAllocation {
  salePrice: number;
  credits: number;
  seatCredits?: number;
  seatCount?: number;
}

export function analyzeModelVideos(allocation: VideoAllocation) {
  const perSeat = allocation.seatCredits !== undefined && allocation.seatCount !== undefined;
  const credits = new Decimal(perSeat ? allocation.seatCredits! : allocation.credits);
  const seats = perSeat ? allocation.seatCount! : 1;
  return VIDEO_MODELS.map(model => {
    // Seats cannot pool leftover credits to produce another whole video.
    const count = credits.div(model.creditsPerVideo).floor().mul(seats);
    return {
      ...model,
      videoCount: count.toNumber(),
      unitPrice: count.isZero() ? null : new Decimal(allocation.salePrice).div(count).toNumber(),
    };
  });
}
