import { ImageResponse } from 'next/og';
import { BRAND } from './pwa-icons/brand';

// Link-preview card for texts, social posts and search results.
export const alt = 'GlanceCam by Golden Glance Studio: a QR code wedding camera for your guests';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: BRAND.cream,
          color: BRAND.ink,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 56, color: BRAND.gold, transform: 'skewX(-12deg)', letterSpacing: -4 }}>
            GG
          </div>
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: 6, color: '#6b655c' }}>GOLDEN GLANCE STUDIO</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 84, lineHeight: 1.05, transform: 'skewX(-8deg)' }}>your moments, together</div>
          <div style={{ display: 'flex', marginTop: 28, fontSize: 34, color: '#4a4640' }}>
            A QR code wedding camera for your guests. No app to download.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 22, letterSpacing: 4, color: '#6b655c' }}>
          <div style={{ display: 'flex' }}>PHOTOS · FILMS · VOICE NOTES · LIVE SLIDESHOW</div>
          <div style={{ display: 'flex', color: BRAND.gold }}>CAM.GOLDENGLANCESTUDIO.COM</div>
        </div>
      </div>
    ),
    size,
  );
}
