// The viewfinder covers the central 60% × 84% of a square, object-fit: cover preview.
export function scanCrop(width: number, height: number) {
  const side = Math.min(width, height);
  return { x: (width - side * 0.6) / 2, y: (height - side * 0.84) / 2, width: side * 0.6, height: side * 0.84 };
}

function frameDifference(before: Uint8ClampedArray, after: Uint8ClampedArray) {
  let difference = 0;
  for (let i = 0; i < after.length; i++) difference += Math.abs(before[i] - after[i]);
  return difference / after.length;
}

export function scanFrameChanged(before: Uint8ClampedArray, after: Uint8ClampedArray) {
  return frameDifference(before, after) >= 18;
}

export function createScanGate() {
  let previous: Uint8ClampedArray | undefined;
  let steady = 0;
  return (frame: Uint8ClampedArray) => {
    const stable = previous && frameDifference(previous, frame) <= 7;
    previous = frame;
    // Wait for three stable samples and skip dark or nearly featureless frames.
    const hasDetail = Math.max(...frame) >= 65 && Math.max(...frame) - Math.min(...frame) >= 40;
    steady = stable && hasDetail ? steady + 1 : 0;
    return steady >= 3;
  };
}
