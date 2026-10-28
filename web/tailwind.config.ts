import type { Config } from 'tailwindcss';

// Tokens del sistema "Obsidian Signal" (DESIGN.md). Mantener sincronizado con ese archivo.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#14121b',
          base: '#0d0b14',
          card: '#13101c',
          elevated: '#1a1626',
          subtle: '#221c33',
          'container-lowest': '#0f0d16',
          'container-low': '#1c1a24',
          container: '#211e28',
          'container-high': '#2b2933',
          'container-highest': '#36333e',
        },
        primary: { DEFAULT: '#75ff9e', container: '#00e676', on: '#003918' },
        secondary: { DEFAULT: '#7bd0ff', container: '#00a6e0', on: '#00354a' },
        tertiary: { DEFAULT: '#f2ddff', container: '#dfbaff', on: '#40225c' },
        error: { DEFAULT: '#ffb4ab', container: '#93000a', on: '#690005' },
        outline: { DEFAULT: '#859585', variant: '#3b4a3d' },
        text: { primary: '#f3f0fa', secondary: '#9c94b0', muted: '#605874' },
        border: { subtle: 'rgba(255, 255, 255, 0.08)', strong: 'rgba(255, 255, 255, 0.16)' },
        'vote-down': '#f43f5e',
      },
      fontFamily: {
        headline: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'headline-xl': ['36px', { lineHeight: '44px', letterSpacing: '-0.03em', fontWeight: '700' }],
        'headline-xl-mobile': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-lg-mobile': ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-sm': ['16px', { lineHeight: '24px', letterSpacing: '0em', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        'body-md': ['14px', { lineHeight: '22px', letterSpacing: '0em' }],
        'body-sm': ['12px', { lineHeight: '18px', letterSpacing: '0.01em' }],
        'label-lg': ['14px', { lineHeight: '20px', letterSpacing: '-0.005em', fontWeight: '500' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0em', fontWeight: '500' }],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '600' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      spacing: {
        gutter: '1.25rem',
        'gutter-mobile': '0.75rem',
        margin: '2rem',
        'margin-mobile': '1rem',
        'space-xs': '0.25rem',
        'space-sm': '0.5rem',
        'space-md': '1rem',
        'space-lg': '1.5rem',
        'space-xl': '2.5rem',
      },
    },
  },
  plugins: [],
};

export default config;
