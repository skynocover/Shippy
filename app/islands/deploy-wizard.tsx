import { useState, useCallback, useEffect } from 'hono/jsx';
import { shouldIgnore } from '../lib/constants';
import { readFileAsBase64, readFileAsText, traverseEntry } from '../lib/file-reader';
import type { FileEntry, EnvFileEntry } from '../lib/file-reader';
import { isEnvFile, parseEnvFile } from '../lib/env-parser';
import type { EnvVar } from '../lib/env-parser';

interface Props {
  isLoggedIn: boolean;
  hasVercel: boolean;
  hasCloudflare: boolean;
}

const STEPS = [
  { num: 1, label: '上傳專案', icon: '📁' },
  { num: 2, label: '連結 GitHub', icon: '🐙' },
  { num: 3, label: '部署網站', icon: '🚀' },
  { num: 4, label: '完成', icon: '🎉' },
];

const DEPLOY_STEPS = [
  '正在建立 Vercel 專案...',
  '正在連結 GitHub 倉庫...',
  '正在設定建置環境...',
  '正在部署...',
  '部署完成！',
];

export default function DeployWizard({ isLoggedIn, hasVercel, hasCloudflare }: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn);
  const [vercelConnected, setVercelConnected] = useState(hasVercel);
  const [authLoading, setAuthLoading] = useState(false);
  const [showGithubPrompt, setShowGithubPrompt] = useState(false);

  // Step 1 state
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [repoName, setRepoName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [detectedFramework, setDetectedFramework] = useState('');

  // Step 2 state
  const [projectId, setProjectId] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [isPushing, setIsPushing] = useState(false);

  // Step 3 state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState(0);
  const [deploymentUrl, setDeploymentUrl] = useState('');
  const [vercelProjectName, setVercelProjectName] = useState('');

  // Step 4 state
  const [showCelebration, setShowCelebration] = useState(false);

  // Error
  const [error, setError] = useState('');

  // Env vars state (collected silently from .env files)
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);

  // Listen for OAuth popup messages
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'github-connected') {
        setLoggedIn(true);
        setAuthLoading(false);
        setCurrentStep(2);
      }
      if (e.data?.type === 'vercel-connected') {
        setVercelConnected(true);
        setAuthLoading(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const openOAuthPopup = (url: string) => {
    const w = 600;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(url, 'oauth-popup', `width=${w},height=${h},left=${left},top=${top}`);
  };

  // Detect framework from file list
  const detectFramework = (fileList: FileEntry[]) => {
    const names = fileList.map((f) => f.path.split('/')[0] || f.path);
    const hasFile = (name: string) =>
      fileList.some((f) => f.path === name || f.path.endsWith('/' + name));

    if (hasFile('next.config.js') || hasFile('next.config.ts') || hasFile('next.config.mjs'))
      return 'Next.js';
    if (hasFile('nuxt.config.ts') || hasFile('nuxt.config.js')) return 'Nuxt';
    if (hasFile('svelte.config.js')) return 'SvelteKit';
    if (hasFile('astro.config.mjs') || hasFile('astro.config.ts')) return 'Astro';
    if (hasFile('vite.config.ts') || hasFile('vite.config.js')) return 'Vite';
    if (hasFile('package.json')) return 'Node.js';
    if (hasFile('index.html')) return 'Static HTML';
    return '';
  };

  const processFiles = useCallback(
    async (allFiles: FileEntry[]) => {
      const roots = new Set(allFiles.map((f) => f.path.split('/')[0]));
      let processed = allFiles;
      if (roots.size === 1) {
        const root = [...roots][0];
        processed = allFiles
          .map((f) => ({
            ...f,
            path: f.path.slice(root.length + 1),
          }))
          .filter((f) => f.path.length > 0);
        if (!repoName) setRepoName(root);
      }

      setFiles(processed);
      setDetectedFramework(detectFramework(processed));
      setIsReading(false);
      setUploadProgress(100);
    },
    [repoName],
  );

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      setIsReading(true);
      setError('');
      setUploadProgress(0);

      try {
        const items = e.dataTransfer?.items;
        if (!items) return;

        const allFiles: FileEntry[] = [];
        const envCollector: EnvFileEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) {
            const entryFiles = await traverseEntry(entry, '', envCollector);
            allFiles.push(...entryFiles);
          }
          setUploadProgress(Math.min(90, ((i + 1) / items.length) * 90));
        }

        // Parse collected env files
        const parsedVars: EnvVar[] = [];
        for (const envFile of envCollector) {
          parsedVars.push(...parseEnvFile(envFile.content));
        }
        // Deduplicate by key (last wins)
        const seen = new Map<string, EnvVar>();
        for (const v of parsedVars) seen.set(v.key, v);
        setEnvVars([...seen.values()]);

        await processFiles(allFiles);
      } catch (err) {
        setError(`讀取檔案失敗: ${err}`);
        setIsReading(false);
      }
    },
    [processFiles],
  );

  const handleFolderSelect = useCallback(
    async (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (!input.files || input.files.length === 0) return;

      setIsReading(true);
      setError('');
      setUploadProgress(0);

      try {
        const allFiles: FileEntry[] = [];
        const envCollector: EnvFileEntry[] = [];
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          const path =
            (file as unknown as { webkitRelativePath: string }).webkitRelativePath || file.name;
          const basename = path.split('/').pop() || path;
          // Collect env files before shouldIgnore skips them
          if (isEnvFile(basename)) {
            const content = await readFileAsText(file);
            envCollector.push({ path, content });
            continue;
          }
          if (shouldIgnore(path)) continue;
          const content = await readFileAsBase64(file);
          allFiles.push({ path, content });
          setUploadProgress(Math.min(90, ((i + 1) / input.files.length) * 90));
        }

        // Parse collected env files
        const parsedVars: EnvVar[] = [];
        for (const envFile of envCollector) {
          parsedVars.push(...parseEnvFile(envFile.content));
        }
        const seen = new Map<string, EnvVar>();
        for (const v of parsedVars) seen.set(v.key, v);
        setEnvVars([...seen.values()]);

        await processFiles(allFiles);
      } catch (err) {
        setError(`讀取檔案失敗: ${err}`);
        setIsReading(false);
      }
      input.value = '';
    },
    [processFiles],
  );

  // Step 2: Push to GitHub
  const handlePushToGitHub = useCallback(async () => {
    if (!repoName.trim()) {
      setError('請輸入倉庫名稱');
      return;
    }
    if (files.length === 0) {
      setError('請先選擇資料夾');
      return;
    }

    setIsPushing(true);
    setError('');

    try {
      // Create project
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repoName.trim() }),
      });
      if (!createRes.ok) {
        const err = (await createRes.json()) as { error: string };
        throw new Error(err.error || '建立專案失敗');
      }
      const { project } = (await createRes.json()) as { project: { id: string } };
      setProjectId(project.id);

      // Push to GitHub
      const pushRes = await fetch(`/api/projects/${project.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, repoName: repoName.trim() || undefined }),
      });
      if (!pushRes.ok) {
        const err = (await pushRes.json()) as { error: string };
        throw new Error(err.error || '推送到 GitHub 失敗');
      }
      const pushData = (await pushRes.json()) as {
        githubRepo: string;
        githubUrl: string;
        framework: string | null;
      };
      setGithubUrl(pushData.githubUrl);
      if (pushData.framework) setDetectedFramework(pushData.framework);

      setIsPushing(false);
      setCurrentStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsPushing(false);
    }
  }, [repoName, files]);

  // Step 3: Deploy to Vercel
  const handleDeployToVercel = useCallback(async () => {
    if (!vercelConnected) {
      setError('請先連結 Vercel');
      return;
    }

    setIsDeploying(true);
    setDeployStep(0);
    setError('');

    try {
      const deployRes = await fetch(`/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vercelProjectName: vercelProjectName.trim() || undefined,
          envVars: envVars.length > 0 ? envVars : undefined,
        }),
      });
      if (!deployRes.ok) {
        const err = (await deployRes.json()) as { error: string };
        throw new Error(err.error || '部署失敗');
      }

      // Poll for status
      const pollStatus = async () => {
        const statusRes = await fetch(`/api/projects/${projectId}/status`);
        if (!statusRes.ok) return null;
        return (await statusRes.json()) as {
          project: { status: string; deploymentUrl: string | null };
          deployment: { status: string; url: string | null; errorMessage: string | null } | null;
        };
      };

      // Progress animation + polling
      let foundUrl = '';

      // Steps 1-2: pure animation (no polling yet)
      for (let i = 1; i <= 2; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        setDeployStep(i);
      }

      // Steps 3+: poll until live
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));

        // Advance visual steps up to 4 (keep 5 for "完成")
        if (attempt < 2) setDeployStep(3 + attempt);

        const data = await pollStatus();
        if (data?.project.status === 'live' && data.project.deploymentUrl) {
          foundUrl = data.project.deploymentUrl;
          setDeploymentUrl(foundUrl);
          setDeployStep(5);
          break;
        }
        if (data?.project.status === 'failed') {
          throw new Error(data.deployment?.errorMessage || '部署失敗');
        }
      }

      setIsDeploying(false);
      setCurrentStep(4);
      setTimeout(() => setShowCelebration(true), 300);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsDeploying(false);
    }
  }, [projectId, vercelConnected, vercelProjectName, deploymentUrl, envVars]);

  return (
    <div class="animate-slide-up">
      {/* Progress indicator */}
      <div class="flex justify-center items-center gap-0 mb-12">
        {STEPS.map((step, index) => (
          <>
            <div class="flex flex-col items-center gap-2">
              <div
                class="w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all"
                style={
                  currentStep >= step.num
                    ? 'background:linear-gradient(135deg,#818cf8 0%,#6366f1 100%);box-shadow:0 4px 20px rgba(99,102,241,0.4)'
                    : 'background:rgba(255,255,255,0.1)'
                }
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
        <div
          class="mb-6 px-4 py-3 rounded-xl text-sm"
          style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.2)"
        >
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
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              if (!isReading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={isReading ? undefined : handleDrop}
            onClick={() => {
              if (!isReading) document.getElementById('folder-input')?.click();
            }}
            class="rounded-2xl p-12 text-center transition-all mb-6"
            style={`border:2px dashed ${dragging ? '#818cf8' : 'rgba(255,255,255,0.15)'};background:${isReading ? 'rgba(129,140,248,0.05)' : dragging ? 'rgba(129,140,248,0.05)' : 'rgba(0,0,0,0.2)'};cursor:${isReading ? 'default' : 'pointer'}`}
          >
            {isReading ? (
              <>
                <div class="flex justify-center mb-4">
                  <span class="animate-spin inline-block w-10 h-10 border-3 border-white/20 border-t-indigo-400 rounded-full"></span>
                </div>
                <p class="text-lg font-semibold mb-2">正在讀取檔案...</p>
                <p class="text-sm" style="color:rgba(255,255,255,0.4)">
                  請稍候，正在掃描你的專案
                </p>
              </>
            ) : (
              <>
                <div class="text-5xl mb-4">{files.length > 0 ? '📦' : '📁'}</div>
                <p class="text-lg font-semibold mb-2">
                  {files.length > 0 ? `已讀取 ${files.length} 個檔案` : '拖放資料夾到這裡'}
                </p>
                <p class="text-sm" style="color:rgba(255,255,255,0.4)">
                  {files.length > 0 ? '點擊重新選擇資料夾' : '或點擊選擇資料夾'}
                </p>
              </>
            )}
          </div>

          {/* Progress bar */}
          {(isReading || uploadProgress > 0) && uploadProgress < 100 && (
            <div
              class="mb-6 rounded-full overflow-hidden h-2"
              style="background:rgba(255,255,255,0.1)"
            >
              <div
                class="progress-bar-fill h-full rounded-full"
                style={`width:${Math.min(uploadProgress, 100)}%`}
              />
            </div>
          )}

          {/* Framework detection */}
          {detectedFramework && (
            <div
              class="flex items-center gap-2 mb-6 px-4 py-2.5 rounded-xl"
              style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2)"
            >
              <span class="text-vs-green font-medium text-sm">
                ⚡ 偵測到框架：{detectedFramework}
              </span>
            </div>
          )}

          {/* Repo name + next */}
          {files.length > 0 && (
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-2" style="color:rgba(255,255,255,0.7)">
                  倉庫名稱
                </label>
                <input
                  type="text"
                  value={repoName}
                  onInput={(e: Event) => setRepoName((e.target as HTMLInputElement).value)}
                  placeholder="my-awesome-app"
                  class="w-full px-4 py-3 rounded-xl text-white font-mono text-sm focus:outline-none"
                  style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
                />
              </div>
              {/* GitHub login prompt for non-logged-in users */}
              {showGithubPrompt && !loggedIn && (
                <div
                  class="rounded-xl px-5 py-4 space-y-3"
                  style="background:rgba(129,140,248,0.08);border:1px solid rgba(129,140,248,0.25)"
                >
                  <p class="text-sm leading-relaxed" style="color:rgba(255,255,255,0.7)">
                    我們會用 <strong style="color:#fff">GitHub</strong> 來存放你的程式碼。
                    <br />
                    如果你還沒有 GitHub 帳號，可以在彈出視窗中免費註冊。
                  </p>
                  <button
                    onClick={() => {
                      setAuthLoading(true);
                      openOAuthPopup('/api/auth/github?mode=popup');
                    }}
                    disabled={authLoading}
                    class="w-full py-3 rounded-xl text-white font-bold text-sm border-none cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    style="background:linear-gradient(135deg,#333 0%,#24292e 100%)"
                  >
                    {authLoading ? (
                      <>
                        <span class="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span>
                        等待登入中...
                      </>
                    ) : (
                      <>
                        <svg class="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                        </svg>
                        登入 GitHub 並繼續
                      </>
                    )}
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  if (!repoName.trim()) {
                    setError('請輸入倉庫名稱');
                    return;
                  }
                  setError('');
                  if (!loggedIn) {
                    setShowGithubPrompt(true);
                    return;
                  }
                  setCurrentStep(2);
                }}
                class="w-full py-3.5 bg-vs-gradient-btn rounded-xl text-white font-bold text-base border-none cursor-pointer transition-transform hover:-translate-y-0.5"
                style={showGithubPrompt && !loggedIn ? 'display:none' : ''}
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

          <div class="mb-6">
            <label class="block text-sm font-medium mb-2" style="color:rgba(255,255,255,0.7)">
              倉庫名稱
            </label>
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
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener"
                class="font-mono"
                style="color:#818cf8;text-decoration:none"
              >
                {githubUrl.replace('https://github.com/', '')}
              </a>
            </div>
          )}

          {!isDeploying && deployStep === 0 && (
            <div class="space-y-4">
              {/* Vercel connect or deploy */}
              {!vercelConnected ? (
                <button
                  onClick={() => {
                    setAuthLoading(true);
                    openOAuthPopup('/api/auth/vercel?mode=popup');
                  }}
                  disabled={authLoading}
                  class="w-full p-5 rounded-2xl text-left cursor-pointer flex items-center justify-between transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style="background:rgba(0,0,0,0.2);border:1px solid rgba(129,140,248,0.3)"
                >
                  <div class="flex items-center gap-4">
                    <span class="text-2xl">▲</span>
                    <div>
                      <div class="font-bold flex items-center gap-2">
                        連結 Vercel
                        <span class="text-xs px-2 py-0.5 rounded-full bg-vs-gradient-btn text-white">
                          必要
                        </span>
                      </div>
                      <div class="text-sm mt-1" style="color:rgba(255,255,255,0.5)">
                        {authLoading ? '等待連結中...' : '點擊連結你的 Vercel 帳號以開始部署'}
                      </div>
                    </div>
                  </div>
                  {authLoading ? (
                    <span class="animate-spin inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></span>
                  ) : (
                    <span style="color:rgba(255,255,255,0.3)">→</span>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleDeployToVercel}
                  class="w-full p-5 rounded-2xl text-left cursor-pointer flex items-center justify-between transition-all"
                  style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.1)"
                >
                  <div class="flex items-center gap-4">
                    <span class="text-2xl">▲</span>
                    <div>
                      <div class="font-bold flex items-center gap-2">
                        Vercel
                        <span class="text-xs px-2 py-0.5 rounded-full bg-vs-gradient-btn text-white">
                          推薦
                        </span>
                      </div>
                      <div class="text-sm mt-1" style="color:rgba(255,255,255,0.5)">
                        自動部署，全球 CDN
                      </div>
                    </div>
                  </div>
                  <span style="color:rgba(255,255,255,0.3)">→</span>
                </button>
              )}

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
                      <span
                        class="text-xs px-2 py-0.5 rounded-full text-white"
                        style="background:rgba(243,128,32,0.3);color:#f38020"
                      >
                        即將推出
                      </span>
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
                const stepNum = i + 1;
                const isDone = deployStep >= stepNum;
                const isCurrent = deployStep === i && isDeploying;
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
                );
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
          <p class="mb-6" style="color:rgba(255,255,255,0.5)">
            你的網站已經上線了
          </p>

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
            <a
              href={projectId ? `/dashboard/${projectId}` : '/dashboard'}
              class="block w-full py-3.5 bg-vs-gradient-btn rounded-xl text-white font-bold text-base text-center no-underline"
            >
              前往專案 Dashboard
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
                  setShowCelebration(false);
                  window.location.href = projectId ? `/dashboard/${projectId}` : '/dashboard';
                }}
                class="w-full py-3 rounded-xl font-semibold text-sm border-none cursor-pointer text-white bg-vs-gradient-btn"
              >
                前往專案 Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
