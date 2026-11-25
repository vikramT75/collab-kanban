import { Task } from '../types';

export function computeNewPosition(above: Task | null, below: Task | null): number {
  if (!above && !below) return 1000;
  if (!above) return below!.position > 0 ? below!.position / 2 : below!.position - 1000;
  if (!below) return above.position + 1000;
  return (above.position + below.position) / 2;
}
