import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn, isMacosTheme, isWin11Theme } from "@/lib/utils"
import { useUIFlag } from "../hooks/useUIFlag"

const buttonVariants = cva(
  cn("inline-flex items-center justify-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    isMacosTheme() ? 'font-medium' : 'font-normal',
  ),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          isMacosTheme()
            ? "bg-secondary text-destructive hover:bg-secondary/80"
            : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-secondary-foreground/40 bg-transparent hover:bg-secondary text-foreground",
        secondary:
          isWin11Theme()
            ? "bg-white text-secondary-foreground border border-border hover:bg-neutral-50 dark:bg-secondary dark:hover:bg-secondary/80"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8 md:w-full",
        icon: "h-9 w-9",
        platform: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean,
  rounded?: boolean,
  stretch?: boolean,
  useGlass?: boolean,
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, rounded, stretch, useGlass, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    useGlass = useGlass !== false; // default to true if not provided
    let roundedClass = isWin11Theme() ? 'rounded-sm' : isMacosTheme() ? 'rounded-full' : 'rounded-md';
    if (rounded !== undefined) {
      roundedClass = rounded ? 'rounded-full' : 'rounded-md';
    }
    if (size === 'platform') {
      size = isMacosTheme() ? 'sm' : isWin11Theme() ? 'lg' : 'default';
    }
    const { supportLiquidGlass } = useUIFlag();
    return (
      <Comp
        className={cn(buttonVariants({
          variant,
          size,
          className: cn(
            roundedClass,
            isMacosTheme() && 'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset font-medium',
            useGlass && supportLiquidGlass && (variant === 'default' || variant === 'secondary' || variant === 'destructive') && cn(
              'shadow-2xl backdrop-blur-sm backdrop-saturate-150',
              variant === 'default' ? 
              'border-primary border' :  
              'bg-white/75 dark:bg-background/60 border-white dark:border-zinc-500/40 border dark:hover:bg-muted/50',
            ),
            (stretch === true || size === 'lg') && 'w-full max-w-[12rem]',
            className
          )
        }),
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
