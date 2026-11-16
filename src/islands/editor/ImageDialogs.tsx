/**
 * Image dialogs.
 *  - BodyImageDialog: insert an image into the article, from the device (drag-drop, picker, paste) or a URL.
 *  - CoverDialog: choose a cover from the device or a URL; device images get a crop and reposition step locked to 1200 × 630.
 * Device images are compressed in the browser and uploaded to /api/media; alt text is required.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { ImagePlus, Link as LinkIcon, Upload, ZoomIn } from 'lucide-preact';
import Modal from './Modal';
import { ACCEPT, checkFile, COVER_H, COVER_W, coverGeometry, decode, drawCover, formatBytes, renderCover, resizeForBody, upload, type Crop } from './image';

type Tab = 'device' | 'url';

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div class="mb-4 flex gap-1 rounded-lg bg-line/60 p-0.5 text-sm" role="tablist">
      {(['device', 'url'] as Tab[]).map((t) => (
        <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} class={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-semibold ${tab === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
          {t === 'device' ? <Upload size={14} /> : <LinkIcon size={14} />} {t === 'device' ? 'Upload from device' : 'Image URL'}
        </button>
      ))}
    </div>
  );
}

function DropZone({ onFile, label }: { onFile: (f: File) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      class={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm ${over ? 'border-accent bg-accent/5' : 'border-line'}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer?.files?.[0];
        if (f) onFile(f);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
    >
      <ImagePlus size={28} class="text-muted" />
      <p class="font-semibold">{label}</p>
      <p class="text-xs text-muted">JPG, PNG or WebP, up to 20 MB. It is compressed before upload.</p>
      <input ref={input} type="file" accept={ACCEPT} class="sr-only" aria-label="Choose an image file" onChange={(e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) onFile(f);
        (e.target as HTMLInputElement).value = '';
      }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function BodyImageDialog({ initialFile, onInsert, onClose }: { initialFile?: File; onInsert: (src: string, alt: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('device');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (f: File) => {
    const bad = checkFile(f);
    if (bad) return setError(bad);
    setError('');
    setBusy(true);
    try {
      const bmp = await decode(f);
      const b = await resizeForBody(bmp);
      bmp.close();
      setBlob(b);
      setPreview(URL.createObjectURL(b));
      if (!alt) setAlt(f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 120));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initialFile) void pick(initialFile);
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!alt.trim()) return setError('Describe the image for readers who cannot see it.');
    if (tab === 'url') {
      if (!/^https:\/\//i.test(url.trim())) return setError('Use a full https:// image address.');
      onInsert(url.trim(), alt.trim());
      return;
    }
    if (!blob) return setError('Choose an image first.');
    setBusy(true);
    try {
      onInsert(await upload(blob, 'body'), alt.trim());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Insert image" onClose={onClose}>
      <form class="grid gap-3" onSubmit={submit}>
        <Tabs tab={tab} setTab={(t) => { setTab(t); setError(''); }} />
        {tab === 'device' ? (
          preview ? (
            <div class="grid gap-2">
              <img src={preview} alt="" class="max-h-60 w-full rounded-lg border border-line object-contain" />
              <p class="flex items-center justify-between text-xs text-muted">
                <span>Compressed to {blob ? formatBytes(blob.size) : ''}</span>
                <button type="button" class="underline" onClick={() => { setBlob(null); setPreview(''); }}>Choose another</button>
              </p>
            </div>
          ) : (
            <DropZone onFile={(f) => void pick(f)} label={busy ? 'Preparing image…' : 'Drop an image here or click to choose'} />
          )
        ) : (
          <>
            <input class="field" value={url} placeholder="https://… image address" inputMode="url" onInput={(e) => { setUrl((e.target as HTMLInputElement).value); setError(''); }} />
            {/^https:\/\//i.test(url) && <img src={url} alt="" class="max-h-48 w-full rounded-lg border border-line object-contain" referrerpolicy="no-referrer" />}
          </>
        )}
        <input class="field" value={alt} maxLength={200} placeholder="Describe the image (alt text, required)" onInput={(e) => { setAlt((e.target as HTMLInputElement).value); setError(''); }} />
        {error && <p class="text-sm text-red-700" role="alert">{error}</p>}
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" onClick={onClose}>Cancel</button>
          <button class="btn-primary" disabled={busy}>{busy && tab === 'device' && blob ? 'Uploading…' : 'Insert'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function Cropper({ bmp, crop, setCrop }: { bmp: ImageBitmap; crop: Crop; setCrop: (c: Crop) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  useEffect(() => {
    if (canvas.current) drawCover(canvas.current, bmp, crop);
  }, [bmp, crop]);
  const scale = () => (canvas.current ? COVER_W / canvas.current.clientWidth : 1);
  return (
    <div class="grid gap-2">
      <canvas
        ref={canvas}
        class="aspect-[1200/630] w-full cursor-grab touch-none rounded-lg border border-line active:cursor-grabbing"
        aria-label="Cover crop preview. Drag to reposition."
        onPointerDown={(e) => {
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const k = scale();
          const g = coverGeometry(bmp, { ...crop, x: drag.current.cx + (e.clientX - drag.current.x) * k, y: drag.current.cy + (e.clientY - drag.current.y) * k });
          setCrop({ ...crop, x: g.x, y: g.y });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <label class="flex items-center gap-3 text-sm">
        <ZoomIn size={16} class="text-muted" />
        <span class="sr-only">Zoom</span>
        <input type="range" min={1} max={3} step={0.01} value={crop.zoom} class="w-full accent-[var(--color-accent)]" onInput={(e) => {
          const zoom = Number((e.target as HTMLInputElement).value);
          const g = coverGeometry(bmp, { ...crop, zoom });
          setCrop({ zoom, x: g.x, y: g.y });
        }} />
      </label>
      <p class="text-xs text-muted">Drag to reposition, use the slider to zoom. Saved at {COVER_W} × {COVER_H}, the size social networks expect.</p>
    </div>
  );
}

export function CoverDialog({ current, currentAlt, onSave, onClose }: { current: string; currentAlt: string; onSave: (src: string, alt: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(current && !current.startsWith('/media/') ? 'url' : 'device');
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const [url, setUrl] = useState(current && !current.startsWith('/media/') ? current : '');
  const [urlOk, setUrlOk] = useState<boolean | null>(null);
  const [alt, setAlt] = useState(currentAlt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (f: File) => {
    const bad = checkFile(f);
    if (bad) return setError(bad);
    setError('');
    try {
      const b = await decode(f);
      setBmp(b);
      setCrop({ zoom: 1, x: 0, y: 0 });
      if (!alt) setAlt(f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 120));
      if (b.width < 600 || b.height < 315) setError('This image is small; it may look blurry. 1200 × 630 or larger works best.');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => () => bmp?.close(), [bmp]);

  const save = async (e: Event) => {
    e.preventDefault();
    if (!alt.trim()) return setError('Describe the cover image (alt text).');
    if (tab === 'url') {
      if (!/^https:\/\//i.test(url.trim())) return setError('Use a full https:// image address.');
      if (urlOk === false) return setError('That address did not load as an image.');
      onSave(url.trim(), alt.trim());
      return;
    }
    if (!bmp) return setError('Choose an image first.');
    setBusy(true);
    try {
      const blob = await renderCover(bmp, crop);
      onSave(await upload(blob, 'cover'), alt.trim());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Cover image" wide onClose={onClose}>
      <form class="grid gap-3" onSubmit={save}>
        <Tabs tab={tab} setTab={(t) => { setTab(t); setError(''); }} />
        {tab === 'device' ? (
          bmp ? (
            <>
              <Cropper bmp={bmp} crop={crop} setCrop={setCrop} />
              <button type="button" class="justify-self-start text-sm underline" onClick={() => setBmp(null)}>Choose another image</button>
            </>
          ) : (
            <DropZone onFile={(f) => void pick(f)} label="Drop a cover image here or click to choose" />
          )
        ) : (
          <>
            <input class="field" value={url} placeholder="https://… image address" inputMode="url" onInput={(e) => { setUrl((e.target as HTMLInputElement).value); setUrlOk(null); setError(''); }} />
            {/^https:\/\//i.test(url) && (
              <img src={url} alt="" referrerpolicy="no-referrer" class="aspect-[1200/630] w-full rounded-lg border border-line object-cover" onLoad={() => setUrlOk(true)} onError={() => setUrlOk(false)} />
            )}
            {urlOk === false && <p class="text-sm text-red-700">That address did not load as an image. Check the link, or upload the file instead.</p>}
          </>
        )}
        <input class="field" value={alt} maxLength={200} placeholder="Describe the image (alt text, required)" onInput={(e) => { setAlt((e.target as HTMLInputElement).value); setError(''); }} />
        {error && <p class="text-sm text-amber-800" role="alert">{error}</p>}
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" onClick={onClose}>Cancel</button>
          <button class="btn-primary" disabled={busy}>{busy ? 'Uploading…' : 'Use this cover'}</button>
        </div>
      </form>
    </Modal>
  );
}
