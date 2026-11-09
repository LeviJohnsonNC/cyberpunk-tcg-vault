import { useEffect, useRef, useState } from 'react';
import { CardImg } from '../components/bits';
import { IntakeIcon } from '../components/IntakeIcon';
import { VaultSelect } from '../components/VaultSelect';
import { BY_SLUG, printingLabel, unspecifiedId } from '../lib/data';
import { createScanGate, scanCrop, scanFrameChanged } from '../lib/liveScan';
import { useStore } from '../lib/store';
import { cloudEnabled } from '../lib/supabase';

type ScanStep =
  | { kind: 'opening' | 'aiming' | 'next' | 'no-match' }
  | { kind: 'reading'; image: string; token?: string }
  | { kind: 'review'; slug: string; printingId: string }
  | { kind: 'retry' | 'camera-error'; message: string };

const SCAN_STATUS = {
  opening: 'Opening your camera…',
  aiming: 'Line up one card and hold it steady.',
  reading: 'Identifying card…',
  next: 'Swap in the next card.',
  'no-match': 'No clear match. Reposition one card inside the guide and tilt away from glare.',
  review: 'Check the match before adding.',
};

function captureFrame(video: HTMLVideoElement) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
  const crop = scanCrop(video.videoWidth, video.videoHeight);
  const scale = Math.min(1, 1200 / crop.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width * scale);
  canvas.height = Math.round(crop.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export function LiveScanIntake() {
  const { session } = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const supported = !!navigator.mediaDevices?.getUserMedia;
  const canScan = !cloudEnabled || !!session;

  useEffect(() => {
    if (!canScan) dialog.current?.close();
  }, [canScan]);

  return (
    <section className="panel intake-panel live-scan-entry" aria-labelledby="live-scan-entry-title">
      <div className="live-scan-entry-copy">
        <IntakeIcon name="scan" />
        <div>
          <h2 className="intake-heading" id="live-scan-entry-title">Live camera <span>Beta</span></h2>
          <p className="intake-description">Point at one card at a time and tap Add 1 when the match appears.</p>
          <p className="tiny muted">The scanner sends a cropped still for recognition.</p>
        </div>
      </div>
      {!supported ? <p className="tiny muted">Live camera is unavailable in this browser. You can upload a photo below.</p>
        : !canScan ? <p className="tiny muted">Sign in to use the live camera.</p>
          : <button type="button" className="btn" aria-haspopup="dialog" onClick={() => {
            dialog.current?.showModal();
            setOpen(true);
          }}>Start camera</button>}
      <dialog ref={dialog} className="al-dialog live-scan-dialog" aria-labelledby="live-scan-title" onClose={() => setOpen(false)}>
        <div className="al-dialog-body">
          <header className="live-scan-header">
            <h2 id="live-scan-title">Live camera</h2>
            <form method="dialog"><button type="submit" className="btn quiet">Close camera</button></form>
          </header>
          {open && canScan && <LiveCamera key={`${session?.user.id ?? 'local'}:${attempt}`} token={session?.access_token}
            restart={() => setAttempt((n) => n + 1)} />}
        </div>
      </dialog>
    </section>
  );
}

function LiveCamera({ token, restart }: { token?: string; restart: () => void }) {
  const { addMany, collectionReady } = useStore();
  const video = useRef<HTMLVideoElement>(null);
  const lastCapture = useRef<Uint8ClampedArray>(undefined);
  const saveLock = useRef(false);
  const [step, setStep] = useState<ScanStep>({ kind: 'opening' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [added, setAdded] = useState(0);

  useEffect(() => {
    const preview = video.current;
    if (!preview) return;
    let stream: MediaStream | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
      preview.srcObject = null;
    };
    const fail = (message: string) => {
      stop();
      setStep({ kind: 'camera-error', message });
    };
    const onHidden = () => {
      if (document.hidden && !stopped) fail('Camera paused while this tab was in the background.');
    };
    const start = window.setTimeout(async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
          if (!stopped) fail('The camera disconnected. Reopen it to keep scanning.');
        }, { once: true }));
        preview.srcObject = stream;
        await preview.play();
        if (!stopped) setStep({ kind: 'aiming' });
      } catch (error) {
        if (stopped) return;
        fail(error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera access is blocked. Allow it in your browser settings, or upload a photo.'
          : 'Couldn’t open the camera. Check that it’s available, or upload a photo.');
      }
    }, 0);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.clearTimeout(start);
      document.removeEventListener('visibilitychange', onHidden);
      stop();
    };
  }, []);

  const kind = step.kind;
  useEffect(() => {
    if (kind !== 'aiming' && kind !== 'next' && kind !== 'no-match') return;
    const preview = video.current;
    if (!preview) return;
    const sample = document.createElement('canvas');
    sample.width = 24;
    sample.height = 34;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const ready = createScanGate();
    const loop = window.setInterval(() => {
      if (preview.readyState < 2 || !preview.videoWidth || !preview.videoHeight || document.hidden) return;
      const crop = scanCrop(preview.videoWidth, preview.videoHeight);
      ctx.drawImage(preview, crop.x, crop.y, crop.width, crop.height, 0, 0, sample.width, sample.height);
      const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
      const frame = new Uint8ClampedArray(sample.width * sample.height);
      for (let i = 0; i < frame.length; i++) {
        const pixel = i * 4;
        frame[i] = 0.299 * data[pixel] + 0.587 * data[pixel + 1] + 0.114 * data[pixel + 2];
      }
      if (kind !== 'aiming') {
        if (lastCapture.current && !scanFrameChanged(lastCapture.current, frame)) return;
        window.clearInterval(loop);
        setStep({ kind: 'aiming' });
      } else if (ready(frame)) {
        const image = captureFrame(preview);
        if (!image) return;
        lastCapture.current = frame;
        window.clearInterval(loop);
        setStep({ kind: 'reading', image, token });
      }
    }, 150);
    return () => window.clearInterval(loop);
  }, [kind, token]);

  useEffect(() => {
    if (step.kind !== 'reading') return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setStep({ kind: 'retry', message: 'The scan took too long. Try again.' });
    }, 22000);
    async function recognize(image: string, accessToken?: string) {
      try {
        const response = await fetch('/api/scan', {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify({ image, mode: 'single' }),
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          const message = response.status === 429 && typeof data.error === 'string'
            ? data.error : 'The scan service is unavailable. Try again or upload a photo.';
          setStep({ kind: 'retry', message });
          return;
        }
        const match = data.matches?.[0];
        if (data.matches?.length === 1 && match.qty === 1 && match.confidence >= 0.65 && BY_SLUG.has(match.slug)
          && !data.unidentified && !data.unmatched?.length) {
          setStep({ kind: 'review', slug: match.slug, printingId: unspecifiedId(match.slug) });
        } else {
          setStep({ kind: 'no-match' });
        }
      } catch {
        if (!controller.signal.aborted) setStep({ kind: 'retry', message: 'Couldn’t reach the scanner. Check your connection and try again.' });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void recognize(step.image, step.token);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [step]);

  async function addOne() {
    if (step.kind !== 'review' || !collectionReady || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      if (!await addMany([{ slug: step.slug, printingId: step.printingId, qty: 1 }], 'add')) {
        setSaveError(true);
        return;
      }
      setAdded((count) => count + 1);
      // Keep an interruption that occurred while the collection save was pending.
      setStep((current) => current === step ? { kind: 'next' } : current);
    } catch {
      setSaveError(true);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const card = step.kind === 'review' ? BY_SLUG.get(step.slug) : undefined;
  const status = 'message' in step ? step.message : SCAN_STATUS[step.kind];

  return (
    <>
      <div className="live-scan-stage" data-step={step.kind} hidden={step.kind === 'camera-error'}>
        <video ref={video} autoPlay playsInline muted aria-hidden="true" />
        <span className="live-scan-guide" aria-hidden="true" />
      </div>
      <p className="live-scan-status" role="status">{status}{added > 0 && <strong>{added} added this session</strong>}</p>
      {step.kind === 'review' && card ? (
        <div className="live-scan-review">
          <CardImg slug={card.slug} alt="" className="live-scan-card-art" priority />
          <div className="live-scan-match">
            <strong>{card.display}</strong>
            <VaultSelect aria-label="Printing to add" value={step.printingId} onValueChange={(printingId) => setStep({ ...step, printingId })}
              disabled={saving} options={[{ value: unspecifiedId(card.slug), label: 'Printing unspecified' },
                ...card.printings.map((printing) => ({ value: printing.id, label: printingLabel(printing.id) }))]} />
          </div>
          <div className="live-scan-actions">
            <button type="button" className="btn" disabled={saving || !collectionReady} onClick={() => void addOne()}>{saving ? 'Saving…' : 'Add 1'}</button>
            <button type="button" className="btn quiet" disabled={saving} onClick={() => { setSaveError(false); setStep({ kind: 'aiming' }); }}>Rescan</button>
          </div>
          {saveError && <p className="danger-text" role="alert">Couldn’t save the card. Try Add 1 again.</p>}
        </div>
      ) : step.kind === 'camera-error' ? <button type="button" className="btn quiet" onClick={restart}>Reopen camera</button>
        : step.kind === 'retry' || step.kind === 'next' || step.kind === 'no-match' ? <button type="button" className="btn quiet" onClick={() => setStep({ kind: 'aiming' })}>
          {step.kind === 'next' ? 'Scan another copy' : 'Try again'}
        </button> : null}
      <p className="live-scan-note tiny muted">Choose the printing if you know it. You can also set it later in your collection.</p>
    </>
  );
}
