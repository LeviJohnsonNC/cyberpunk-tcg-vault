// The viewfinder covers the central 60% × 84% of a square, object-fit: cover preview.
export function scanCrop(width: number, height: number, padding = 0) {
  const side = Math.min(width, height);
  const cropWidth = side * (0.6 + padding * 2);
  const cropHeight = side * (0.84 + padding * 2);
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
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
  let detailedSamples = 0;
  return (frame: Uint8ClampedArray) => {
    const motion = previous ? frameDifference(previous, frame) : Infinity;
    previous = frame;
    const brightest = Math.max(...frame);
    const hasDetail = brightest >= 65 && brightest - Math.min(...frame) >= 40;
    detailedSamples = hasDetail ? detailedSamples + 1 : 0;
    steady = hasDetail && motion <= 12 ? steady + 1 : 0;
    // After roughly two seconds on a detailed subject, tolerate moderate handheld movement.
    return steady >= 3 || (detailedSamples >= 12 && motion <= 17);
  };
}
