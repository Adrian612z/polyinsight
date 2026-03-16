/** @type {import('tailwindcss').Config} */

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        'warm-white': 'rgb(var(--c-warm-white) / <alpha-value>)',
        'sand': 'rgb(var(--c-sand) / <alpha-value>)',
        'terracotta': 'rgb(var(--c-accent) / <alpha-value>)',
        'charcoal': 'rgb(var(--c-ink) / <alpha-value>)',
        'stone-gray': 'rgb(var(--c-stone-gray) / <alpha-value>)',
        'soft-border': 'rgb(var(--c-soft-border) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        serif: ['Space Grotesk', 'sans-serif'],
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
