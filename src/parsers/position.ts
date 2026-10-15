/**
 * Offset <-> line/column conversion.
 *
 * Every parser works on a *fragment* (the whole file for `.css`/`.scss`, a
 * single `<style>` block for `.vue`) but reports positions relative to the
 * *file*. Keeping that translation in one place is what makes Vue navigation
 * land on the right line.
 */
export class LineIndex {
  /** Offset at which each 0-based line starts. */
  private readonly lineStarts: number[];

  constructor(private readonly text: string) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10 /* \n */) {
        starts.push(i + 1);
      }
    }
    this.lineStarts = starts;
  }

  /** Converts a 0-based offset into a 1-based line/column pair. */
  positionAt(offset: number): { line: number; column: number } {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.lineStarts[mid] <= clamped) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { line: low + 1, column: clamped - this.lineStarts[low] + 1 };
  }

  /** Text of the 1-based line containing `offset`, without the line break. */
  lineTextAt(offset: number): string {
    const { line } = this.positionAt(offset);
    const start = this.lineStarts[line - 1];
    const end = line < this.lineStarts.length ? this.lineStarts[line] : this.text.length;
    return this.text.slice(start, end).replace(/\r?\n$/, '');
  }
}
