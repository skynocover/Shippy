import { useState, useCallback, useEffect } from 'hono/jsx'
import { shouldIgnore } from '../lib/constants'
import type { FileEntry } from '../lib/file-reader'

// Re-declare file reading functions inline for client-side island
async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function traverseEntry(entry: FileSystemEntry, basePath: string = ''): Promise<FileEntry[]> {
  const files: FileEntry[] = []
  const path = basePath ? `${basePath}/${entry.name}` : entry.name
  if (shouldIgnore(entry.name)) return files
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject)
    })
    const content = await readFileAsBase64(file)
    files.push({ path, content })
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const reader = dirEntry.createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    for (const child of entries) {
      const childFiles = await traverseEntry(child, path)
      files.push(...childFiles)
    }
  }
  return files
}

interface Props {
  hasVercel: boolean
  hasCloudflare: boolean
}

const STEPS = [
  { num: 1, label: '上傳專案', icon: '📁' },
  { num: 2, label: '連結 GitHub', icon: '🐙' },
  { num: 3, label: '部署網站', icon: '🚀' },
  { num: 4, label: '完成', icon: '🎉' },
]

const DEPLOY_STEPS = [
  '正在建立 Vercel 專案...',
  '正在連結 GitHub 倉庫...',
  '正在設定建置環境...',
  '正在部署...',
  '部署完成！',
]

export default function DeployWizard({ hasVercel, hasCloudflare }: Props) {
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1 state
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [repoName, setRepoName] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isReading, setIsReading] = useState(false)
  const [detectedFramework, setDetectedFramework] = useState('')

  // Step 2 state
  const [projectId, setProjectId] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [isPushing, setIsPushing] = useState(false)

  // Step 3 state
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployStep, setDeployStep] = useState(0)
  const [deploymentUrl, setDeploymentUrl] = useState('')
  const [vercelProjectName, setVercelProjectName] = useState('')

  // Step 4 state
  const [showCelebration, setShowCelebration] = useState(false)

  // Error
  const [error, setError] = useState('')

  // Detect framework from file list
  const detectFramework = (fileList: FileEntry[]) => {
    const names = fileList.map(f => f.path.split('/')[0] || f.path)
    const hasFile = (name: string) => fileList.some(f => f.path === name || f.path.endsWith('/' + name))

    if (hasFile('next.config.js') || hasFile('next.config.ts') || hasFile('next.config.mjs')) return 'Next.js'
    if (hasFile('nuxt.config.ts') || hasFile('nuxt.config.js')) return 'Nuxt'
    if (hasFile('svelte.config.js')) return 'SvelteKit'
    if (hasFile('astro.config.mjs') || hasFile('astro.config.ts')) return 'Astro'
    if (hasFile('vite.config.ts') || hasFile('vite.config.js')) return 'Vite'
    if (hasFile('package.json')) return 'Node.js'
    if (hasFile('index.html')) return 'Static HTML'
    return ''
  }

  const processFiles = useCallback(async (allFiles: FileEntry[]) => {
    const roots = new Set(allFiles.map(f => f.path.split('/')[0]))
    let processed = allFiles
    if (roots.size === 1) {
      const root = [...roots][0]
      processed = allFiles.map(f => ({
        ...f,
        path: f.path.slice(root.length + 1),
      })).filter(f => f.path.length > 0)
      if (!repoName) setRepoName(root)
    }

    setFiles(processed)
    setDetectedFramework(detectFramework(processed))
    setIsReading(false)
    setUploadProgress(100)
  }, [repoName])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    setIsReading(true)
    setError('')
    setUploadProgress(0)

    try {
      const items = e.dataTransfer?.items
      if (!items) return

      const allFiles: FileEntry[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) {
          const entryFiles = await traverseEntry(entry)
          allFiles.push(...entryFiles)
        }
        setUploadProgress(Math.min(90, ((i + 1) / items.length) * 90))
      }
      await processFiles(allFiles)
    } catch (err) {
      setError(`讀取檔案失敗: ${err}`)
      setIsReading(false)
    }
  }, [processFiles])

  const handleFolderSelect = useCallback(async (e: Event) => {
    const input = e.target as HTMLInputElement
    if (!input.files || input.files.length === 0) return

    setIsReading(true)
    setError('')
    setUploadProgress(0)

    try {
      const allFiles: FileEntry[] = []
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        const path = (file as any).webkitRelativePath || file.name
        if (shouldIgnore(path)) continue
        const content = await readFileAsBase64(file)
        allFiles.push({ path, content })
        setUploadProgress(Math.min(90, ((i + 1) / input.files.length) * 90))
      }
      await processFiles(allFiles)
    } catch (err) {
      setError(`讀取檔案失敗: ${err}`)
      setIsReading(false)
    }
    input.value = ''
  }, [processFiles])

  // Step 2: Push to GitHub
  const handlePushToGitHub = useCallback(async () => {
    if (!repoName.trim()) {
      setError('請輸入倉庫名稱')
      return
    }
    if (files.length === 0) {
      setError('請先選擇資料夾')
      return
    }

    setIsPushing(true)
    setError('')

    try {
      // Create project
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repoName.trim() }),
      })
      if (!createRes.ok) {
        const err = await createRes.json() as { error: string }
        throw new Error(err.error || '建立專案失敗')
      }
      const { project } = await createRes.json() as { project: { id: string } }
      setProjectId(project.id)

      // Push to GitHub
      const pushRes = await fetch(`/api/projects/${project.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, repoName: repoName.trim() || undefined }),
      })
      if (!pushRes.ok) {
        const err = await pushRes.json() as { error: string }
        throw new Error(err.error || '推送到 GitHub 失敗')
      }
      const pushData = await pushRes.json() as { githubRepo: string; githubUrl: string; framework: string | null }
      setGithubUrl(pushData.githubUrl)
      if (pushData.framework) setDetectedFramework(pushData.framework)

      setIsPushing(false)
      setCurrentStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsPushing(false)
    }
  }, [repoName, files])

  // Step 3: Deploy to Vercel
  const handleDeployToVercel = useCallback(async () => {
    if (!hasVercel) {
      setError('請先連結 Vercel')
      return
    }

    setIsDeploying(true)
    setDeployStep(0)
    setError('')

    try {
      const deployRes = await fetch(`/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vercelProjectName: vercelProjectName.trim() || undefined }),
      })
      if (!deployRes.ok) {
        const err = await deployRes.json() as { error: string }
        throw new Error(err.error || '部署失敗')
      }

      // Poll for status
      const pollStatus = async () => {
        const statusRes = await fetch(`/api/projects/${projectId}/status`)
        if (!statusRes.ok) return null
        return await statusRes.json() as {
          project: { status: string; deploymentUrl: string | null }
          deployment: { status: string; url: string | null; errorMessage: string | null } | null
        }
      }

      // Simulate deploy steps with polling
      for (let i = 1; i <= 5; i++) {
        await new Promise(r => setTimeout(r, 1200))
        setDeployStep(i)

        if (i >= 3) {
          const data = await pollStatus()
          if (data?.project.status === 'live' && data.project.deploymentUrl) {
            setDeploymentUrl(data.project.deploymentUrl)
            setDeployStep(5)
            break
          }
          if (data?.project.status === 'failed') {
            throw new Error(data.deployment?.errorMessage || '部署失敗')
          }
        }
      }

      // Final poll if no URL yet
      if (!deploymentUrl) {
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise(r => setTimeout(r, 3000))
          const data = await pollStatus()
          if (data?.project.status === 'live' && data.project.deploymentUrl) {
            setDeploymentUrl(data.project.deploymentUrl)
            break
          }
          if (data?.project.status === 'failed') {
            throw new Error(data.deployment?.errorMessage || '部署失敗')
          }
        }
      }

      setIsDeploying(false)
      setCurrentStep(4)
      setTimeout(() => setShowCelebration(true), 300)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsDeploying(false)
    }
  }, [projectId, hasVercel, vercelProjectName, deploymentUrl])

  return (
    <div class="animate-slide-up">
      {/* Progress indicator */}
      <div class="flex justify-center items-center gap-0 mb-12">
        {STEPS.map((step, index) => (
          <>
            <div class="flex flex-col items-center gap-2">
              <div
                class="w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all"
                style={currentStep >= step.num
                  ? 'background:linear-gradient(135deg,#818cf8 0%,#6366f1 100%);box-shadow:0 4px 20px rgba(99,102,241,0.4)'
                  : 'background:rgba(255,255,255,0.1)'}
              >
                {currentStep > step.num ? '✓' : step.icon}
              </div>
              <span
                class="text-xs"
                style={`color:${currentStep >= step.num ? '#fff' : 'rgba(255,255,255,0.4)'};font-weight:${currentStep === step.num ? '700' : '400'}`}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                class="w-16 h-0.5 mx-2 mb-6"
                style={`background:${currentStep > step.num ? 'linear-gradient(90deg,#818cf8,#6366f1)' : 'rgba(255,255,255,0.1)'}`}
              />
            )}
          </>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div class="mb-6 px-4 py-3 rounded-xl text-sm" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.2)">
          {error}
        </div>
      )}

      {/* ==================== Step 1: Upload ==================== */}
      {currentStep === 1 && (
        <div class="card-vs p-8" style="cursor:default">
          <h2 class="text-xl font-bold mb-6">📁 上傳你的專案</h2>

          <input
            type="file"
            id="folder-input"
            // @ts-ignore webkitdirectory is non-standard
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFolderSelect}
            style="display:none"
          />

          <div
            onDragOver={(e: DragEvent) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('folder-input')?.click()}
            class="rounded-2xl p-12 text-center cursor-pointer transition-all mb-6"
            style={`border:2px dashed ${dragging ? '#818cf8' : 'rgba(255,255,255,0.15)'};background:${dragging ? 'rgba(129,140,248,0.05)' : 'rgba(0,0,0,0.2)'}`}
          >
            <div class="text-5xl mb-4">
              {files.length > 0 ? '📦' : isReading ? '⏳' : '📁'}
            </div>
            <p class="text-lg font-semibold mb-2">
              {files.length > 0
                ? `已讀取 ${files.length} 個檔案`
                : isReading
                ? '正在讀取檔案...'
                : '拖放資料夾到這裡'}
            </p>
            <p class="text-sm" style="color:rgba(255,255,255,0.4)">
              或點擊選擇資料夾
            </p>
          </div>

          {/* Progress bar */}
          {(isReading || uploadProgress > 0) && uploadProgress < 100 && (
            <div class="mb-6 rounded-full overflow-hidden h-2" style="background:rgba(255,255,255,0.1)">
              <div
                class="progress-bar-fill h-full rounded-full"
                style={`width:${Math.min(uploadProgress, 100)}%`}
              />
            </div>
          )}

          {/* Framework detection */}
          {detectedFramework && (
            <div class="flex items-center gap-2 mb-6 px-4 py-2.5 rounded-xl" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2)">
              <span class="text-vs-green font-medium text-sm">⚡ 偵測到框架：{detectedFramework}</span>
            </div>
          )}

          {/* Repo name + next */}
          {files.length > 0 && (
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-2" style="color:rgba(255,255,255,0.7)">倉庫名稱</label>
                <input
                  type="text"
                  value={repoName}
                  onInput={(e: Event) => setRepoName((e.target as HTMLInputElement).value)}
                  placeholder="my-awesome-app"
                  class="w-full px-4 py-3 rounded-xl text-white font-mono text-sm focus:outline-none"
                  style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
                />
              </div>
              <button
                onClick={() => {
                  if (!repoName.trim()) { setError('請輸入倉庫名稱'); return }
                  setError('')
                  setCurrentStep(2)
                }}
                class="w-full py-3.5 bg-vs-gradient-btn rounded-xl text-white font-bold text-base border-none cursor-pointer transition-transform hover:-translate-y-0.5"
              >
                下一步 →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== Step 2: GitHub ==================== */}
      {currentStep === 2 && (
        <div class="card-vs p-8" style="cursor:default">
          <h2 class="text-xl font-bold mb-6">🐙 連結 GitHub</h2>

          <div class="flex items-center gap-3 mb-6 px-4 py-3 rounded-xl" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2)">
            <span class="w-2.5 h-2.5 rounded-full bg-vs-green"></span>
            <span class="text-vs-green font-medium text-sm">GitHub 已連結</span>
          </div>

          <div class="mb-6">
            <label class="block text-sm font-medium mb-2" style="color:rgba(255,255,255,0.7)">倉庫名稱</label>
            <input
              type="text"
              value={repoName}
              onInput={(e: Event) => setRepoName((e.target as HTMLInputElement).value)}
              class="w-full px-4 py-3 rounded-xl text-white font-mono text-sm focus:outline-none"
              style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
            />
          </div>

          <div class="mb-4 text-sm" style="color:rgba(255,255,255,0.5)">
            📦 {files.length} 個檔案準備上傳
            {detectedFramework && <span> · ⚡ {detectedFramework}</span>}
          </div>

          <div class="flex gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              class="px-6 py-3 rounded-xl text-sm font-medium border-none cursor-pointer"
              style="background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6)"
            >
              ← 上一步
            </button>
            <button
              onClick={handlePushToGitHub}
              disabled={isPushing}
              class="flex-1 py-3 rounded-xl text-white font-bold text-base border-none cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style="background:linear-gradient(135deg,#34d399 0%,#10b981 100%)"
            >
              {isPushing ? (
                <>
                  <span class="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span>
                  正在推送...
                </>
              ) : (
                <>上傳到 GitHub</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================== Step 3: Deploy ==================== */}
      {currentStep === 3 && (
        <div class="card-vs p-8" style="cursor:default">
          <h2 class="text-xl font-bold mb-2">🚀 部署網站</h2>

          {githubUrl && (
            <div class="flex items-center gap-2 mb-6 text-sm" style="color:rgba(255,255,255,0.5)">
              <span class="w-2 h-2 rounded-full bg-vs-green"></span>
              <span>已推送到</span>
              <a href={githubUrl} target="_blank" rel="noopener" class="font-mono" style="color:#818cf8;text-decoration:none">
                {githubUrl.replace('https://github.com/', '')}
              </a>
            </div>
          )}

          {!isDeploying && deployStep === 0 && (
            <div class="space-y-4">
              {/* Vercel option */}
              <button
                onClick={handleDeployToVercel}
                disabled={!hasVercel}
                class="w-full p-5 rounded-2xl text-left cursor-pointer flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.1)"
              >
                <div class="flex items-center gap-4">
                  <span class="text-2xl">▲</span>
                  <div>
                    <div class="font-bold flex items-center gap-2">
                      Vercel
                      <span class="text-xs px-2 py-0.5 rounded-full bg-vs-gradient-btn text-white">推薦</span>
                    </div>
                    <div class="text-sm mt-1" style="color:rgba(255,255,255,0.5)">
                      {hasVercel ? '自動部署，全球 CDN' : '請先在導航列連結 Vercel'}
                    </div>
                  </div>
                </div>
                <span style="color:rgba(255,255,255,0.3)">→</span>
              </button>

              {/* Cloudflare Pages option - disabled */}
              <button
                disabled
                class="w-full p-5 rounded-2xl text-left flex items-center justify-between opacity-50 cursor-not-allowed"
                style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06)"
              >
                <div class="flex items-center gap-4">
                  <span class="text-2xl">☁️</span>
                  <div>
                    <div class="font-bold flex items-center gap-2">
                      Cloudflare Pages
                      <span class="text-xs px-2 py-0.5 rounded-full text-white" style="background:rgba(243,128,32,0.3);color:#f38020">即將推出</span>
                    </div>
                    <div class="text-sm mt-1" style="color:rgba(255,255,255,0.4)">
                      邊緣運算，超快速度
                    </div>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Deploy progress */}
          {(isDeploying || deployStep > 0) && (
            <div class="mt-6 space-y-3">
              {DEPLOY_STEPS.map((label, i) => {
                const stepNum = i + 1
                const isDone = deployStep >= stepNum
                const isCurrent = deployStep === i && isDeploying
                return (
                  <div
                    key={i}
                    class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                    style={`background:${isDone ? 'rgba(52,211,153,0.1)' : isCurrent ? 'rgba(129,140,248,0.1)' : 'rgba(0,0,0,0.1)'};opacity:${stepNum <= deployStep + 1 ? '1' : '0.3'}`}
                  >
                    <div class="w-6 h-6 flex items-center justify-center text-sm">
                      {isDone ? (
                        <span style="color:#34d399">✓</span>
                      ) : isCurrent ? (
                        <span class="animate-spin inline-block w-4 h-4 border-2 border-vs-indigo-light/30 border-t-vs-indigo-light rounded-full"></span>
                      ) : (
                        <span style="color:rgba(255,255,255,0.3)">{stepNum}</span>
                      )}
                    </div>
                    <span
                      class="text-sm"
                      style={`color:${isDone ? '#34d399' : isCurrent ? '#818cf8' : 'rgba(255,255,255,0.4)'};font-weight:${isCurrent ? '600' : '400'}`}
                    >
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== Step 4: Complete ==================== */}
      {currentStep === 4 && (
        <div class="card-vs p-8 text-center animate-slide-up" style="cursor:default">
          <div class="text-6xl mb-4 animate-celebrate">🎉</div>
          <h2 class="text-2xl font-extrabold mb-2">部署成功！</h2>
          <p class="mb-6" style="color:rgba(255,255,255,0.5)">你的網站已經上線了</p>

          {deploymentUrl && (
            <a
              href={deploymentUrl}
              target="_blank"
              rel="noopener"
              class="inline-block font-mono text-lg mb-8 no-underline transition-opacity hover:opacity-80"
              style="color:#818cf8"
            >
              {deploymentUrl} ↗
            </a>
          )}

          <div class="flex flex-col gap-3 max-w-sm mx-auto">
            {projectId && (
              <a
                href={`/dashboard/${projectId}`}
                class="block w-full py-3.5 bg-vs-gradient-btn rounded-xl text-white font-bold text-base text-center no-underline"
              >
                查看專案
              </a>
            )}
            <a
              href="/dashboard"
              class="block w-full py-3.5 rounded-xl text-center font-medium text-sm no-underline"
              style="background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.7)"
            >
              前往 Dashboard
            </a>
          </div>
        </div>
      )}

      {/* ==================== Celebration Modal ==================== */}
      {showCelebration && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center"
          style="background:rgba(0,0,0,0.7);backdrop-filter:blur(4px)"
          onClick={() => setShowCelebration(false)}
        >
          {/* Confetti particles */}
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              class="confetti-particle"
              style={`left:${Math.random() * 100}%;top:-10px;background:${['#818cf8', '#34d399', '#f38020', '#60a5fa', '#facc15'][i % 5]};animation-delay:${Math.random() * 1.5}s;animation-duration:${1.5 + Math.random()}s`}
            />
          ))}

          <div
            class="card-vs p-10 text-center max-w-md animate-celebrate"
            style="background:rgba(26,26,46,0.95);cursor:default"
            onClick={(e: Event) => e.stopPropagation()}
          >
            <div class="text-6xl mb-4">🎊</div>
            <h2 class="text-2xl font-extrabold mb-2">恭喜！</h2>
            <p class="mb-6" style="color:rgba(255,255,255,0.5)">
              你的專案已經成功部署到全球
            </p>

            {deploymentUrl && (
              <a
                href={deploymentUrl}
                target="_blank"
                rel="noopener"
                class="block font-mono text-sm mb-6 no-underline"
                style="color:#818cf8"
              >
                {deploymentUrl}
              </a>
            )}

            <div class="flex flex-col gap-3">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`我剛用 VibeShip 三分鐘就把網站部署上線了！🚀 ${deploymentUrl || ''}`)}`}
                target="_blank"
                rel="noopener"
                class="w-full py-3 rounded-xl text-white font-semibold text-sm no-underline text-center"
                style="background:rgba(29,161,242,0.2);border:1px solid rgba(29,161,242,0.3);color:#1da1f2"
              >
                分享到 Twitter
              </a>
              <button
                onClick={() => {
                  setShowCelebration(false)
                  window.location.href = '/dashboard'
                }}
                class="w-full py-3 rounded-xl font-semibold text-sm border-none cursor-pointer text-white bg-vs-gradient-btn"
              >
                前往 Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
