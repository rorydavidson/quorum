import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        snomed: {
          blue:        '#009FE3',
          'blue-dark': '#0080C0',
          'blue-light':'#E6F6FC',
          grey:        '#4D5057',
          'grey-light':'#F5F6F7',
          border:      '#E2E4E7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
