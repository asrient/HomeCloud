import * as React from "react"

import { cn, isMacosTheme, isWin11Theme } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        isWin11Theme() && 'border-b-1 border-b-foreground/50 focus-visible:border-b-primary rounded-sm',
        isMacosTheme() && 'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset rounded-md',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
