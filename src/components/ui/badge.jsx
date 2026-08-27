import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full text-[10.5px] font-bold px-2.5 py-0.5 font-sans', {
  variants: {
    variant: {
      blue: 'bg-primary-tint text-primary',
      destructive: 'bg-destructive-bg text-destructive',
      neutral: 'bg-muted text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
