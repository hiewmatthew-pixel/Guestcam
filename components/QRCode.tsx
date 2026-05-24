'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { useRef } from 'react';

type Props = {
  value: string;
  size?: number;
  label?: string;
  fileName?: string;
};

export default function QRCode({ value, size = 240, label, fileName = 'glancecam-qr.png' }: Props) {
  const wrap = useRef<HTMLDivElement>(null);

  function downloadPng(highRes = 1024) {
    const node = wrap.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!node) return;
    // re-render at high resolution via an offscreen canvas
    const off = document.createElement('canvas');
    off.width = highRes;
    off.height = highRes;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#F5F1EA';
    ctx.fillRect(0, 0, highRes, highRes);
    ctx.drawImage(node, 0, 0, highRes, highRes);
    off.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={wrap}
        className="rounded-md bg-cream p-5 border border-warm-gray-light"
        style={{ boxShadow: '0 1px 0 rgba(26,26,26,0.04)' }}
      >
        <QRCodeCanvas
          value={value}
          size={size}
          bgColor="#F5F1EA"
          fgColor="#1A1A1A"
          level="H"
          includeMargin={false}
        />
      </div>
      {label && (
        <p className="font-serif italic text-ink/70 text-center">{label}</p>
      )}
      <button
        onClick={() => downloadPng(1024)}
        className="text-xs uppercase tracking-widest text-ink/70 underline-offset-4 underline decoration-gold/60"
      >
        download high-res png
      </button>
    </div>
  );
}
