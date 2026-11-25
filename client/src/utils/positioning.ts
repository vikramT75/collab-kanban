import { Task } from '../types';

export function computeNewPosition(above: Task | null, below: Task | null): number {
  if (!above && !below) return 1000;
  if (!above) return below!.position / 2;
  if (!below) return above.position + 1000;
  return (above.position + below.position) / 2;
}
