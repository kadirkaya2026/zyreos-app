/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { primary: '#0f1923', secondary: '#1a2535', card: '#1e2d3d', hover: '#243347' },
        accent: { primary: '#f97316', secondary: '#ea580c', green: '#22c55e', red: '#ef4444', blue: '#3b82f6' },
        text: { primary: '#e2e8f0', secondary: '#94a3b8', muted: '#64748b' },
        border: { default: '#2d3f55', light: '#374f6b' }
      }
    }
  },
  plugins: []
}
