import { Html, Head, Main, NextScript } from 'next/document'
import { ThemeProvider } from '@/components/theme-provider'

export default function Document() {
  return (
    <Html lang="en">
      <title>HomeCloud</title>
      <Head />
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Main />
          <NextScript />
        </ThemeProvider>
      </body>
    </Html>
  )
}
