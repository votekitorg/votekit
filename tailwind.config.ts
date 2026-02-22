import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00843D',
        'primary-dark': '#1B5E20',
        'primary-light': '#4CAF50',
        background: '#ffffff',
      },
    },
  },
  plugins: [],
}
export default config