import type { SwipeDirection } from '../types';

/** Unit vector of the finger's movement for a swipe (screen coordinates: +y is down). */
export function swipeVector(direction: SwipeDirection): [number, number] {
  switch (direction) {
    case 'up': return [0, -1];
    case 'down': return [0, 1];
    case 'left': return [-1, 0];
    case 'right': return [1, 0];
  }
}
