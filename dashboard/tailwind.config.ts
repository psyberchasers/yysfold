import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    borderRadius: {
      none: '0px',
      sm: '0px',
      DEFAULT: '0px',
      md: '0px',
      lg: '0px',
      xl: '0px',
      '2xl': '0px',
      '3xl': '0px',
      full: '0px',
    },
    extend: {
      colors: {
        canvas: '#ffffff',
        surface: '#f5f6f8',
        accent: '#0b5fff',
        'accent-muted': '#1d4ed8',
      },
    },
  },
  plugins: [],
};

export default config;

