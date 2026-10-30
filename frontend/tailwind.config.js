// Tokens del sistema de diseño Obsidian Signal (design.md / Stitch)
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#00e676', hover: '#10b981', soft: '#75ff9e', ink: '#0d0b14' },
        secondary: { DEFAULT: '#38bdf8', soft: '#7bd0ff' },
        tertiary: { DEFAULT: '#a855f7', soft: '#dfbaff' },
        danger: { DEFAULT: '#f43f5e', soft: '#ffb4ab' },
        warning: '#f59e0b',
        surface: {
          base: '#0d0b14',
          card: '#13101c',
          elevated: '#1a1626',
          subtle: '#221c33'
        },
        line: { DEFAULT: 'rgba(255, 255, 255, 0.08)', strong: 'rgba(255, 255, 255, 0.16)' },
        ink: { DEFAULT: '#f3f0fa', secondary: '#9c94b0', muted: '#605874' }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      fontSize: {
        'headline-xl': ['36px', { lineHeight: '44px', letterSpacing: '-0.03em', fontWeight: '700' }],
        'headline-lg': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-sm': ['16px', { lineHeight: '24px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        'body-md': ['14px', { lineHeight: '22px' }],
        'body-sm': ['12px', { lineHeight: '18px', letterSpacing: '0.01em' }],
        'label-lg': ['14px', { lineHeight: '20px', fontWeight: '500' }],
        'label-md': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '600' }]
      },
      borderRadius: { DEFAULT: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem', chip: '6px' },
      boxShadow: { pop: '0 12px 32px -4px rgba(0, 0, 0, 0.6)' }
    }
  }
};
