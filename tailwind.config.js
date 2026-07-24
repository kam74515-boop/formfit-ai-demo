/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0A0C10',
          900: '#0F1218',
          800: '#151923',
          700: '#1C2230',
        },
        volt: {
          300: '#E4FF6A',
          400: '#D4FF3F',
          500: '#BEE83A',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"PingFang SC"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        body: ['"PingFang SC"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(212, 255, 63, 0.15)',
        card: '0 8px 30px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
}
