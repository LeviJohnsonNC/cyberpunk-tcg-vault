import type { DicePalette } from './diceMesh';

/** Canvas and resting artwork share the same semantic theme colors. */
export function dicePalette(element: Element, seat: 'player' | 'rival'): DicePalette {
  const styles = getComputedStyle(element);
  const read = (token: string): [number, number, number] => {
    const value = styles.getPropertyValue(token).trim();
    return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
  };
  const prefix = `--color-dice-${seat}`;
  return { resin: read(`${prefix}-body`), light: read(`${prefix}-light`), rim: read(`${prefix}-rim`),
    reflection: read(`${prefix}-reflection`), number: read('--color-dice-number') };
}
