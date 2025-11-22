import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
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

