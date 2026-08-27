/** Config extendido para shadcn/ui (preset b2vP1JgrVi: base "neutral", tema "blue",
 * radius "large"). Los colores viven como variables CSS en src/index.css (:root),
 * acá solo se mapean a clases de Tailwind (bg-primary, text-muted-foreground, etc).
 * El resto de la app (pantallas todavia no migradas) sigue usando sus estilos
 * inline / baseStyles de siempre — esto no les afecta en nada. */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nunito Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['"Outfit"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          tint: 'hsl(var(--primary-tint))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          bg: 'hsl(var(--destructive-bg))',
          border: 'hsl(var(--destructive-border))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          bg: 'hsl(var(--success-bg))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          bg: 'hsl(var(--warning-bg))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      boxShadow: {
        // Sombras mas difusas/borrosas (mas blur, menos "linea dura" pegada al borde).
        card: '0 4px 16px -4px rgba(15,23,42,0.10), 0 2px 6px -2px rgba(15,23,42,0.06)',
        pop: '0 16px 40px -8px rgba(15,23,42,0.16), 0 4px 10px -2px rgba(15,23,42,0.08)',
      },
    },
  },
  plugins: [],
};
