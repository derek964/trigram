/**
 * Undo history for Hitman GO — snapshots of full GoState (player + E1 + animals).
 * Undo undoes the player's last 1 step; enemies roll back with the player.
 */
import type { GoState } from "./logic";
import { cloneGoState } from "./solvability";

/** Max undo depth (configurable). */
export const UNDO_MAX = 20;

export class UndoStack {
  private stack: GoState[] = [];
  readonly max: number;

  constructor(max = UNDO_MAX) {
    this.max = max;
  }

  clear(): void {
    this.stack = [];
  }

  get size(): number {
    return this.stack.length;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }

  /** Push a deep snapshot taken *before* a successful move. */
  push(state: GoState): void {
    this.stack.push(cloneGoState(state));
    while (this.stack.length > this.max) this.stack.shift();
  }

  /** Pop and return previous state, or null if empty. */
  pop(): GoState | null {
    return this.stack.pop() ?? null;
  }
}
