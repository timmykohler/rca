/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary brand teal — #598A7D
        brand: {
          50:  '#edf4f2',
          100: '#d3e7e3',
          200: '#a8cfc7',
          300: '#7db6aa',
          400: '#6a9d90',
          500: '#598A7D',   // ← primary brand teal
          600: '#4a7468',
          700: '#3b5d53',
          800: '#2c463f',
          900: '#1e302a',
          950: '#0f1815',
        },
        // Secondary steel blue — #698D9F
        steel: {
          50:  '#eef3f6',
          100: '#d5e3ea',
          200: '#abc7d5',
          300: '#82aabf',
          400: '#7a9fb5',
          500: '#698D9F',   // ← secondary steel blue
          600: '#577886',
          700: '#45606d',
          800: '#334954',
          900: '#22313a',
          950: '#111820',
        },
        // Warm gold/tan accent — #CAB688
        gold: {
          100: '#f5f0e4',
          200: '#ecdfc8',
          300: '#dfd0aa',
          400: '#d4c098',
          500: '#CAB688',   // ← accent gold/tan
          600: '#b09a6a',
          700: '#8f7c52',
          800: '#6e5f3d',
          900: '#4d4229',
        },
        // Neutral grays from brand palette
        neutral: {
          50:  '#F9F9F9',   // ← off-white bg
          100: '#f0f0f0',
          200: '#e4e4e5',
          300: '#d0d0d1',
          400: '#b0b1b2',
          500: '#939598',   // ← medium gray
          600: '#808183',   // ← body text gray
          700: '#6b6c6e',
          800: '#555658',
          900: '#3f4041',
          950: '#2a2b2c',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
