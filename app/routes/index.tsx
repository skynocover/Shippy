import { createRoute } from 'honox/factory'
import Navbar from '../components/navbar'

export default createRoute((c) => {
  const session = c.get('session')
  if (session?.userId) {
    return c.redirect('/dashboard')
  }

  const steps = [
    { num: 1, label: '上傳專案', icon: '📁' },
    { num: 2, label: '連結 GitHub', icon: '🐙' },
    { num: 3, label: '部署網站', icon: '🚀' },
    { num: 4, label: '綁定網域', icon: '🌐' },
  ]

  const features = [
    { icon: '⚡', title: '自動偵測框架', desc: 'React, Vue, Next.js, 純 HTML 都支援' },
    { icon: '🔒', title: '免費 SSL', desc: '自動啟用 HTTPS，無需設定' },
    { icon: '🌍', title: '自訂網域', desc: '一鍵綁定 Cloudflare DNS' },
  ]

  return c.render(
    <div class="min-h-screen">
      <Navbar isLoggedIn={false} />

      <div class="px-6 py-16 max-w-[900px] mx-auto animate-slide-up">
        {/* Hero */}
        <div class="text-center mb-16">
          <h1 class="text-5xl md:text-6xl font-extrabold mb-4 leading-tight">
            <span class="text-vs-gradient">三分鐘</span>
            <br />
            讓你的程式碼上線
          </h1>
          <p class="text-xl mb-10" style="color:rgba(255,255,255,0.6);max-width:500px;margin-left:auto;margin-right:auto">
            上傳專案 → 推到 GitHub → 部署到 Vercel
            <br />
            就這麼簡單，不需要任何設定
          </p>

          <a
            href="/api/auth/github"
            class="inline-flex items-center gap-3 bg-vs-gradient-btn border-none rounded-2xl px-12 py-5 text-white text-xl font-bold cursor-pointer no-underline animate-glow transition-transform hover:-translate-y-1"
            style="box-shadow:0 8px 32px rgba(99,102,241,0.35)"
          >
            開始部署
            <span class="text-2xl">🚀</span>
          </a>
        </div>

        {/* Step flow preview */}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20">
          {steps.map((step, i) => (
            <div
              key={step.num}
              class="card-vs p-6 text-center relative"
              style="cursor:default"
            >
              {i < 3 && (
                <div
                  class="hidden md:block absolute -right-5 top-1/2 -translate-y-1/2 text-xl z-10"
                  style="color:rgba(255,255,255,0.2)"
                >
                  →
                </div>
              )}
              <div class="text-4xl mb-3">{step.icon}</div>
              <p class="font-semibold" style="color:rgba(255,255,255,0.8)">{step.label}</p>
            </div>
          ))}
        </div>

        {/* Features */}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((item, i) => (
            <div key={i} class="card-vs p-7" style="cursor:default">
              <div class="text-3xl mb-3">{item.icon}</div>
              <h3 class="font-bold mb-2">{item.title}</h3>
              <p style="color:rgba(255,255,255,0.5);font-size:0.95rem;line-height:1.5">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})
