import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script } from 'honox/server'

export default jsxRenderer(({ children, title }) => {
  return (
    <html lang="zh-TW">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'VibeShip - 三分鐘讓你的程式碼上線'}</title>
        <meta name="description" content="上傳專案、推到 GitHub、部署到 Vercel，三分鐘搞定。" />
        <link rel="icon" href="/favicon.ico" />
        <Link href="/app/style.css" rel="stylesheet" />
        <Script src="/app/client.ts" async />
      </head>
      <body class="min-h-screen bg-vs-gradient text-white font-sans relative overflow-x-hidden">
        {/* Background orbs */}
        <div
          style="position:fixed;top:-50%;right:-20%;width:800px;height:800px;background:radial-gradient(circle,rgba(99,102,241,0.12) 0%,transparent 70%);pointer-events:none;z-index:0"
        />
        <div
          style="position:fixed;bottom:-30%;left:-10%;width:600px;height:600px;background:radial-gradient(circle,rgba(16,185,129,0.08) 0%,transparent 70%);pointer-events:none;z-index:0"
        />
        <div class="relative z-10">
          {children}
        </div>
      </body>
    </html>
  )
})
