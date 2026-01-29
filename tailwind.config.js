/** @type {import('tailwindcss').Config} */

export default {
  // darkMode: "class", // Removed for minimalist design
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        'warm-white': '#F9F7F5', // Main background
        'sand': '#F4F1DE', // Secondary bg / Cards
        'terracotta': '#D97757', // Primary Action (modified from #E07A5F for slightly deeper tone)
        'charcoal': '#3D405B', // Primary Text
        'stone-gray': '#8D8D8D', // Secondary Text
        'soft-border': '#EAEAEA',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Merriweather', 'serif'],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme('colors.charcoal'),
            a: {
              color: theme('colors.terracotta'),
              '&:hover': {
                color: '#C05638',
              },
            },
            h1: { fontFamily: theme('fontFamily.serif') },
            h2: { fontFamily: theme('fontFamily.serif') },
            h3: { fontFamily: theme('fontFamily.serif') },
            h4: { fontFamily: theme('fontFamily.serif') },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
