import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 font-sans',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-card hover:brightness-95',
        outline: 'border border-border bg-transparent text-foreground hover:bg-muted',
        ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
        destructiveOutline: 'border border-destructive-border bg-transparent text-destructive hover:bg-destructive-bg',
        icon: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground rounded-md',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
