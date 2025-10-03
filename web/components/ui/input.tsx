import * as React from "react"

import { cn, isMacosTheme, isWin11Theme } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border-[0.5px] border-border/30 bg-secondary/30 focus-visible:bg-popover px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          isWin11Theme() && 'border-b-1 border-b-foreground/60 focus-visible:border-b-primary',
          isMacosTheme() && 'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
