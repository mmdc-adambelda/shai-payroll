/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#dde6ff',
          200: '#c3d1ff',
          300: '#9db3ff',
          400: '#7088ff',
          500: '#4a5fff',
          600: '#3040f5',
          700: '#2530d9',
          800: '#2029af',
          900: '#1f2789',
          950: '#131754',
        },
        slate: {
          850: '#172033',
          900: '#0f172a',
          950: '#080d1a',
        }
      }
    },
  },
  plugins: [],
}
