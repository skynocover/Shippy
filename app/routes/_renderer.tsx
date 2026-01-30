import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script } from 'honox/server'

export default jsxRenderer(({ children, title }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'VibeShip - Deploy Your Code in One Click'}</title>
        <meta name="description" content="Ship your vibe-coded projects to production in one click. No DevOps required." />
        <link rel="icon" href="/favicon.ico" />
        <Link href="/app/style.css" rel="stylesheet" />
        <Script src="/app/client.ts" async />
      </head>
      <body class="min-h-screen bg-gray-950 text-gray-100">
        {children}
      </body>
    </html>
  )
})
