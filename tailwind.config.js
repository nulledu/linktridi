/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        'ig-bg': '#ffffff',
        'ig-border': '#dbdbdb',
        'ig-gray': '#8e8e8e',
        'ig-blue': '#0095f6',
        'ig-text': '#262626',
      },
    },
  },
  plugins: [],
}
