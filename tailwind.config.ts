import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F5F1EA',
        ink: '#1A1A1A',
        gold: '#B8956A',
        'gold-soft': '#D4B894',
        'warm-gray': '#A8A29E',
        'warm-gray-light': '#E7E2D9',
      },
      fontFamily: {
        serif: ['var(--font-cormorant)', 'Cormorant Garamond', 'serif'],
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        wider: '0.05em',
        widest: '0.2em',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'fade-up': 'fadeUp 0.7s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    // `short:` = very short viewports: Galaxy Z Flip cover screens
    // (~310-400px tall) and phones in landscape. The camera switches to an
    // overlay layout so the viewfinder keeps the whole screen. Defined as a
    // variant (not a `screens` entry) so min-[...]/max-[...] keep working.
    plugin(({ addVariant }) => {
      addVariant('short', '@media (max-height: 540px)');
    }),
  ],
};

export default config;
