import * as React from "react"
import { cn } from "@/lib/utils"

export interface TruncatedTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Maximum number of lines before truncating. Defaults to 1 (single-line ellipsis). */
  lines?: number;
  /** Optional max width (CSS value, e.g. '200px', '100%', '20rem'). */
  maxWidth?: string;
}

const TruncatedText = React.forwardRef<HTMLSpanElement, TruncatedTextProps>(
  ({ className, lines = 1, maxWidth, style, ...props }, ref) => {
    if (lines === 1) {
      return (
        <span
          ref={ref}
          className={cn("block overflow-hidden text-ellipsis whitespace-nowrap", className)}
          style={{ maxWidth, ...style }}
          {...props}
        />
      )
    }

    return (
      <span
        ref={ref}
        className={cn("block overflow-hidden", className)}
        style={{
          display: '-webkit-box',
          WebkitLineClamp: lines,
          WebkitBoxOrient: 'vertical',
          maxWidth,
          ...style,
        }}
        {...props}
      />
    )
  }
)
TruncatedText.displayName = "TruncatedText"

export { TruncatedText }
