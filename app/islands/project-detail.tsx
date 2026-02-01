import { useState, useEffect, useCallback } from 'hono/jsx';
import { shouldIgnore } from '../lib/constants';
import { timeAgo } from '../lib/time';
import { getStatusStyle } from '../lib/status';
import { readFileAsBase64, traverseEntry } from '../lib/file-reader';
import type { FileEntry } from '../lib/file-reader';

const CF_TOKEN_URL =
  'https://dash.cloudflare.com/profile/api-tokens?' +
  'permissionGroupKeys=' +
  encodeURIComponent('[{"key":"zone","type":"read"},{"key":"dns","type":"edit"}]') +
  '&name=VibeShip+DNS&accountId=*&zoneId=all';

interface ProjectData {
  id: string;
  name: string;
  subdomain: string;
  framework: string | null;
  status: string;
  deploymentUrl: string | null;
  customDomain: string | null;
  domainStatus: string | null;
  githubRepo: string | null;
  description: string | null;
  isPublic: boolean;
  platform: string | null;
  createdAt: string;
}

interface DeploymentData {
  id: string;
  status: string;
  url: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface Zone {
  id: string;
  name: string;
  status: string;
}

interface Props {
  project: ProjectData;
  deployments: DeploymentData[];
  hasVercel: boolean;
  hasCloudflare: boolean;
}

type TabKey = 'overview' | 'deploys' | 'domain' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '📊 概覽' },
  { key: 'deploys', label: '📦 部署' },
  { key: 'domain', label: '🌐 網域' },
  { key: 'settings', label: '⚙️ 設定' },
];

const ProjectDetail = ({ project, deployments, hasVercel, hasCloudflare }: Props) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [projectName, setProjectName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [isPublic, setIsPublic] = useState(project.isPublic);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Deploy status polling state
  const [liveStatus, setLiveStatus] = useState(project.status);
  const [liveUrl, setLiveUrl] = useState(project.deploymentUrl || '');
  const [deployError, setDeployError] = useState('');

  // Domain setup state
  const [zones, setZones] = useState<Zone[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [subdomain, setSubdomain] = useState('');
  const [settingDomain, setSettingDomain] = useState(false);
  const [domainError, setDomainError] = useState('');
  const [domain, setDomain] = useState(project.customDomain || '');
  const [domainStatus, setDomainStatus] = useState(project.domainStatus || '');
  const [domainStep, setDomainStep] = useState<'idle' | 'select' | 'preview' | 'done'>(
    project.customDomain ? 'done' : 'idle',
  );

  // Re-deploy state
  const [redeployFiles, setRedeployFiles] = useState<FileEntry[]>([]);
  const [redeployDragging, setRedeployDragging] = useState(false);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [isRedeploying, setIsRedeploying] = useState(false);
  const [redeployError, setRedeployError] = useState('');

  // Cloudflare connect state (for domain tab)
  const [cfConnected, setCfConnected] = useState(hasCloudflare);
  const [cfShowForm, setCfShowForm] = useState(false);
  const [cfToken, setCfToken] = useState('');
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState('');

  // QR code state
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const isLive = liveStatus === 'live';
  const isFailed = liveStatus === 'failed';
  const isActive = ['created', 'uploading', 'deploying'].includes(liveStatus);

  const currentStatus = getStatusStyle(liveStatus);
  const statusLabel = currentStatus.label;
  const statusColor = currentStatus.color;

  // Poll deploy status
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/status`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          project: { status: string; deploymentUrl: string | null };
          deployment: {
            status: string;
            url: string | null;
            errorMessage: string | null;
          } | null;
        };
        setLiveStatus(data.project.status);
        if (data.project.deploymentUrl) setLiveUrl(data.project.deploymentUrl);
        if (data.deployment?.errorMessage) setDeployError(data.deployment.errorMessage);
        if (!['created', 'uploading', 'deploying'].includes(data.project.status)) {
          clearInterval(interval);
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [project.id, isActive]);

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, isPublic }),
      });
      if (res.ok) {
        setSaveMsg('已儲存');
        setTimeout(() => setSaveMsg(''), 2000);
      } else {
        setSaveMsg('儲存失敗');
      }
    } catch {
      setSaveMsg('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除這個專案嗎？此操作無法復原。')) return;
    setDeleting(true);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      window.location.href = '/dashboard';
    } else {
      alert('刪除失敗');
      setDeleting(false);
    }
  };

  // Re-deploy: process uploaded files
  const processRedeployFiles = useCallback(async (allFiles: FileEntry[]) => {
    const roots = new Set(allFiles.map((f) => f.path.split('/')[0]));
    let processed = allFiles;
    if (roots.size === 1) {
      const root = [...roots][0];
      processed = allFiles
        .map((f) => ({ ...f, path: f.path.slice(root.length + 1) }))
        .filter((f) => f.path.length > 0);
    }
    setRedeployFiles(processed);
    setIsReadingFiles(false);
  }, []);

  const handleRedeployDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setRedeployDragging(false);
      setIsReadingFiles(true);
      setRedeployError('');
      try {
        const items = e.dataTransfer?.items;
        if (!items) return;
        const allFiles: FileEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) allFiles.push(...(await traverseEntry(entry)));
        }
        await processRedeployFiles(allFiles);
      } catch (err) {
        setRedeployError(`讀取檔案失敗: ${err}`);
        setIsReadingFiles(false);
      }
    },
    [processRedeployFiles],
  );

  const handleRedeployFolderSelect = useCallback(
    async (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (!input.files || input.files.length === 0) return;
      setIsReadingFiles(true);
      setRedeployError('');
      try {
        const allFiles: FileEntry[] = [];
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          const path =
            (file as unknown as { webkitRelativePath: string }).webkitRelativePath || file.name;
          if (shouldIgnore(path)) continue;
          allFiles.push({ path, content: await readFileAsBase64(file) });
        }
        await processRedeployFiles(allFiles);
      } catch (err) {
        setRedeployError(`讀取檔案失敗: ${err}`);
        setIsReadingFiles(false);
      }
      input.value = '';
    },
    [processRedeployFiles],
  );

  const handleRedeploy = useCallback(async () => {
    if (redeployFiles.length === 0) return;
    if (!hasVercel) {
      setRedeployError('請先連結 Vercel（前往新增專案頁面連結）');
      return;
    }
    setIsRedeploying(true);
    setRedeployError('');
    try {
      const pushRes = await fetch(`/api/projects/${project.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: redeployFiles }),
      });
      if (!pushRes.ok) {
        const err = (await pushRes.json()) as { error: string };
        throw new Error(err.error || '推送到 GitHub 失敗');
      }
      const deployRes = await fetch(`/api/projects/${project.id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!deployRes.ok) {
        const err = (await deployRes.json()) as { error: string };
        throw new Error(err.error || '部署失敗');
      }
      setLiveStatus('deploying');
      setRedeployFiles([]);
      setIsRedeploying(false);
    } catch (err) {
      setRedeployError(err instanceof Error ? err.message : String(err));
      setIsRedeploying(false);
    }
  }, [redeployFiles, project.id, hasVercel]);

  // Cloudflare connect handler
  const handleCfConnect = async () => {
    if (!cfToken.trim()) return;
    setCfLoading(true);
    setCfError('');
    try {
      const res = await fetch('/api/auth/cloudflare/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cfToken.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setCfError(data.error || '驗證 Token 失敗');
        return;
      }
      setCfConnected(true);
      setCfShowForm(false);
      setCfToken('');
    } catch {
      setCfError('網路錯誤，請重試。');
    } finally {
      setCfLoading(false);
    }
  };

  // Domain setup handlers
  const loadZones = async () => {
    setLoadingZones(true);
    setDomainError('');
    try {
      const res = await fetch('/api/cloudflare/zones');
      const data = (await res.json()) as { zones?: Zone[]; error?: string };
      if (!res.ok || !data.zones) {
        setDomainError(data.error || '載入網域失敗');
        return;
      }
      setZones(data.zones);
      setDomainStep('select');
    } catch {
      setDomainError('網路錯誤，請重試。');
    } finally {
      setLoadingZones(false);
    }
  };

  const handleDomainSetup = async () => {
    if (!selectedZone) return;
    setSettingDomain(true);
    setDomainError('');
    try {
      const res = await fetch(`/api/projects/${project.id}/domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId: selectedZone.id,
          zoneName: selectedZone.name,
          subdomain: subdomain.trim() || '@',
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        domain?: string;
        status?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setDomainError(data.error || '設定網域失敗');
        return;
      }
      setDomain(data.domain || '');
      setDomainStatus(data.status || 'active');
      setDomainStep('done');
    } catch {
      setDomainError('網路錯誤，請重試。');
    } finally {
      setSettingDomain(false);
    }
  };

  const previewDomain = selectedZone
    ? subdomain.trim() && subdomain.trim() !== '@'
      ? `${subdomain.trim()}.${selectedZone.name}`
      : selectedZone.name
    : '';

  const handleShowQr = async () => {
    const url = domain ? `https://${domain}` : liveUrl;
    if (!url) return;
    try {
      const { generateQrDataUrl } = await import('../lib/qr');
      const dataUrl = await generateQrDataUrl(url);
      setQrDataUrl(dataUrl);
      setShowQrModal(true);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      {/* Back + Header */}
      <div class="mb-8">
        <a
          href="/dashboard"
          class="inline-flex items-center gap-2 text-sm mb-5 no-underline transition-opacity hover:opacity-80"
          style="color:rgba(255,255,255,0.6)"
        >
          ← 返回專案列表
        </a>

        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <h1 class="text-2xl font-bold">{project.name}</h1>
              <div
                class="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm"
                style={`background:${statusColor}15;border:1px solid ${statusColor}30`}
              >
                <div class="w-2 h-2 rounded-full" style={`background:${statusColor}`} />
                <span style={`color:${statusColor}`}>{statusLabel}</span>
              </div>
            </div>
            {isLive && liveUrl && (
              <div class="flex items-center gap-2">
                <a
                  href={domain ? `https://${domain}` : liveUrl}
                  target="_blank"
                  rel="noopener"
                  class="font-mono text-sm no-underline"
                  style="color:#818cf8"
                >
                  {domain || liveUrl} ↗
                </a>
                <button
                  onClick={handleShowQr}
                  class="px-2 py-1 rounded-lg text-xs border-none cursor-pointer"
                  style="background:rgba(129,140,248,0.15);color:#818cf8"
                  title="QR Code"
                >
                  QR
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div class="flex gap-1 mb-8 p-1 rounded-xl w-fit" style="background:rgba(255,255,255,0.03)">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            class="px-5 py-2.5 rounded-lg border-none cursor-pointer text-sm transition-all"
            style={`background:${activeTab === tab.key ? 'rgba(255,255,255,0.1)' : 'transparent'};color:${activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.5)'};font-weight:${activeTab === tab.key ? '600' : '400'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div class="card-vs p-8" style="cursor:default">
        {/* ===== Overview ===== */}
        {activeTab === 'overview' && (
          <div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              {[
                {
                  label: '部署次數',
                  value: String(deployments.length),
                  icon: '🚀',
                },
                {
                  label: '平台',
                  value: project.platform === 'cloudflare' ? 'Cloudflare' : 'Vercel',
                  icon: project.platform === 'cloudflare' ? '☁️' : '▲',
                },
                {
                  label: '框架',
                  value: project.framework || '未偵測',
                  icon: '⚡',
                },
              ].map((stat, i) => (
                <div key={i} class="p-5 rounded-xl" style="background:rgba(0,0,0,0.2)">
                  <div class="flex items-center gap-2 mb-2">
                    <span>{stat.icon}</span>
                    <span class="text-sm" style="color:rgba(255,255,255,0.5)">
                      {stat.label}
                    </span>
                  </div>
                  <p class="text-2xl font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            <h3 class="font-semibold mb-4" style="color:rgba(255,255,255,0.8)">
              連結資訊
            </h3>
            <div class="flex flex-col gap-3">
              <div
                class="flex items-center justify-between p-4 rounded-xl"
                style="background:rgba(0,0,0,0.2)"
              >
                <div class="flex items-center gap-3">
                  <span>🐙</span>
                  <span>GitHub</span>
                </div>
                {project.githubRepo ? (
                  <a
                    href={`https://github.com/${project.githubRepo}`}
                    target="_blank"
                    rel="noopener"
                    class="font-mono text-sm no-underline"
                    style="color:rgba(255,255,255,0.6)"
                  >
                    github.com/{project.githubRepo}
                  </a>
                ) : (
                  <span class="text-sm" style="color:rgba(255,255,255,0.3)">
                    未連結
                  </span>
                )}
              </div>
              <div
                class="flex items-center justify-between p-4 rounded-xl"
                style="background:rgba(0,0,0,0.2)"
              >
                <div class="flex items-center gap-3">
                  <span>🌐</span>
                  <span>自訂網域</span>
                </div>
                {domain ? (
                  <span class="font-mono text-sm" style="color:#34d399">
                    {domain}
                  </span>
                ) : (
                  <button
                    onClick={() => setActiveTab('domain')}
                    class="px-4 py-1.5 rounded-lg text-sm border-none cursor-pointer text-white"
                    style="background:rgba(255,255,255,0.1)"
                  >
                    綁定網域
                  </button>
                )}
              </div>
            </div>

            {/* Inline deploy status for active deployments */}
            {isActive && (
              <div class="mt-6 card-vs p-6" style="cursor:default">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span
                      class="w-3 h-3 rounded-full animate-pulse"
                      style={`background:${statusColor}`}
                    />
                    <span class="font-semibold" style={`color:${statusColor}`}>
                      {statusLabel}
                    </span>
                    <span class="text-sm" style="color:rgba(255,255,255,0.4)">
                      每 3 秒檢查...
                    </span>
                  </div>
                  {liveUrl && (
                    <a
                      href={liveUrl}
                      target="_blank"
                      rel="noopener"
                      class="px-4 py-2 bg-vs-gradient-btn text-white text-sm font-medium rounded-lg no-underline"
                    >
                      開啟網站 →
                    </a>
                  )}
                </div>
                {deployError && (
                  <div
                    class="mt-4 px-4 py-2 rounded-lg text-sm"
                    style="background:rgba(239,68,68,0.1);color:#ef4444"
                  >
                    {deployError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== Deploys ===== */}
        {activeTab === 'deploys' && (
          <div>
            {/* Re-deploy section */}
            <h3 class="font-semibold mb-4">重新部署</h3>
            <div class="mb-8">
              <input
                type="file"
                id="redeploy-folder-input"
                // @ts-ignore webkitdirectory is non-standard
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleRedeployFolderSelect}
                style="display:none"
              />
              <div
                onDragOver={(e: DragEvent) => {
                  e.preventDefault();
                  setRedeployDragging(true);
                }}
                onDragLeave={() => setRedeployDragging(false)}
                onDrop={handleRedeployDrop}
                onClick={() => document.getElementById('redeploy-folder-input')?.click()}
                class="rounded-xl p-8 text-center cursor-pointer transition-all mb-4"
                style={`border:2px dashed ${redeployDragging ? '#818cf8' : 'rgba(255,255,255,0.15)'};background:${redeployDragging ? 'rgba(129,140,248,0.05)' : 'rgba(0,0,0,0.2)'}`}
              >
                <div class="text-3xl mb-2">
                  {redeployFiles.length > 0 ? '📦' : isReadingFiles ? '⏳' : '📁'}
                </div>
                <p class="text-sm font-semibold mb-1">
                  {redeployFiles.length > 0
                    ? `已讀取 ${redeployFiles.length} 個檔案`
                    : isReadingFiles
                      ? '正在讀取檔案...'
                      : '拖放資料夾到這裡，或點擊選擇'}
                </p>
                <p class="text-xs" style="color:rgba(255,255,255,0.4)">
                  上傳新版本的程式碼，將會推送到 GitHub 並重新部署
                </p>
              </div>

              {redeployError && (
                <div
                  class="mb-4 px-4 py-2 rounded-xl text-sm"
                  style="background:rgba(239,68,68,0.1);color:#ef4444"
                >
                  {redeployError}
                </div>
              )}

              {redeployFiles.length > 0 && (
                <button
                  onClick={handleRedeploy}
                  disabled={isRedeploying}
                  class="w-full py-3 rounded-xl text-white font-bold text-sm border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style="background:linear-gradient(135deg,#818cf8 0%,#6366f1 100%)"
                >
                  {isRedeploying ? '部署中...' : '推送並重新部署'}
                </button>
              )}
            </div>

            {/* Deploy history */}
            <h3 class="font-semibold mb-5">部署歷史</h3>
            {deployments.length === 0 ? (
              <div class="text-center py-10" style="color:rgba(255,255,255,0.4)">
                <div class="text-3xl mb-3">📦</div>
                <p>尚無部署記錄</p>
              </div>
            ) : (
              <div class="flex flex-col gap-3">
                {deployments.map((d) => (
                  <div
                    key={d.id}
                    class="flex items-center justify-between p-4 rounded-xl"
                    style="background:rgba(0,0,0,0.2)"
                  >
                    <div class="flex items-center gap-4">
                      <span class="text-lg">
                        {d.status === 'ready'
                          ? '✅'
                          : d.status === 'error'
                            ? '❌'
                            : d.status === 'building'
                              ? '🔨'
                              : '⏳'}
                      </span>
                      <div>
                        <p class="font-mono text-sm mb-1">{d.id.slice(0, 8)}</p>
                        {d.errorMessage && (
                          <p class="text-xs" style="color:#ef4444">
                            {d.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    <div class="flex items-center gap-4">
                      {d.url && (
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener"
                          class="text-sm no-underline"
                          style="color:#818cf8"
                        >
                          {d.url.replace('https://', '').slice(0, 30)}
                        </a>
                      )}
                      <span class="text-xs" style="color:rgba(255,255,255,0.4)">
                        {timeAgo(d.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== Domain ===== */}
        {activeTab === 'domain' && (
          <div>
            <h3 class="font-semibold mb-5">網域設定</h3>

            {!cfConnected ? (
              <div class="p-6 rounded-xl" style="background:rgba(0,0,0,0.2)">
                <div class="text-center mb-6">
                  <div class="text-4xl mb-3">🌐</div>
                  <p class="font-semibold mb-2">連結 Cloudflare 以設定自訂網域</p>
                  <p class="text-sm" style="color:rgba(255,255,255,0.5)">
                    你需要一個 Cloudflare API Token 來管理 DNS 記錄
                  </p>
                </div>

                <div
                  class="mb-5 p-4 rounded-xl text-sm space-y-2"
                  style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)"
                >
                  <p class="font-medium" style="color:rgba(255,255,255,0.8)">
                    建立步驟：
                  </p>
                  <ol class="list-decimal pl-5 space-y-1" style="color:rgba(255,255,255,0.5)">
                    <li>前往 Cloudflare Dashboard → My Profile → API Tokens</li>
                    <li>
                      點擊「Create Token」，使用{' '}
                      <span class="font-mono" style="color:#f38020">
                        Edit zone DNS
                      </span>{' '}
                      範本
                    </li>
                    <li>Zone Resources 選擇「Include → All zones」</li>
                    <li>建立後複製 Token，貼到下方</li>
                  </ol>
                </div>

                {cfError && (
                  <div
                    class="mb-4 px-4 py-2 rounded-xl text-sm"
                    style="background:rgba(239,68,68,0.1);color:#ef4444"
                  >
                    {cfError}
                  </div>
                )}

                {!cfShowForm ? (
                  <div class="flex justify-center">
                    <button
                      onClick={() => {
                        window.open(CF_TOKEN_URL, '_blank', 'noopener');
                        setCfShowForm(true);
                      }}
                      class="px-6 py-3 bg-vs-gradient-cf rounded-xl text-white font-semibold border-none cursor-pointer"
                    >
                      前往 Cloudflare 建立 Token
                    </button>
                  </div>
                ) : (
                  <div class="flex items-center gap-2">
                    <input
                      type="password"
                      value={cfToken}
                      onInput={(e) => setCfToken((e.target as HTMLInputElement).value)}
                      placeholder="貼上 Cloudflare API Token"
                      class="flex-1 px-3 py-2.5 rounded-lg text-sm text-white focus:outline-none"
                      style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCfConnect();
                      }}
                      disabled={cfLoading}
                    />
                    <button
                      onClick={handleCfConnect}
                      disabled={cfLoading || !cfToken.trim()}
                      class="px-5 py-2.5 bg-vs-gradient-cf rounded-lg text-white text-sm font-semibold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {cfLoading ? '驗證中...' : '連結'}
                    </button>
                    <button
                      onClick={() => {
                        setCfShowForm(false);
                        setCfError('');
                      }}
                      class="px-3 py-2.5 text-sm border-none cursor-pointer"
                      style="background:none;color:rgba(255,255,255,0.4)"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {domainError && (
                  <div
                    class="mb-4 px-4 py-2 rounded-xl text-sm"
                    style="background:rgba(239,68,68,0.1);color:#ef4444"
                  >
                    {domainError}
                  </div>
                )}

                {domainStep === 'done' && domain && (
                  <div
                    class="flex items-center justify-between p-5 rounded-xl"
                    style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2)"
                  >
                    <div class="flex items-center gap-3">
                      <span class="text-xl">✅</span>
                      <div>
                        <p class="font-semibold mb-1">網域已連結</p>
                        <a
                          href={`https://${domain}`}
                          target="_blank"
                          rel="noopener"
                          class="font-mono text-sm no-underline"
                          style="color:#34d399"
                        >
                          {domain}
                        </a>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setDomainStep('idle');
                        setSelectedZone(null);
                        setSubdomain('');
                        setDomainError('');
                      }}
                      class="text-xs border-none cursor-pointer"
                      style="background:none;color:rgba(255,255,255,0.4)"
                    >
                      變更
                    </button>
                  </div>
                )}

                {domainStep === 'idle' && (
                  <div class="text-center p-10 rounded-xl" style="background:rgba(0,0,0,0.2)">
                    <div class="text-4xl mb-4">🌐</div>
                    <p class="mb-5" style="color:rgba(255,255,255,0.5)">
                      綁定自訂網域，讓你的網站更專業
                    </p>
                    <button
                      onClick={loadZones}
                      disabled={loadingZones}
                      class="px-6 py-3 bg-vs-gradient-cf rounded-xl text-white font-semibold border-none cursor-pointer disabled:opacity-50"
                    >
                      {loadingZones ? '載入中...' : '綁定 Cloudflare 網域'}
                    </button>
                  </div>
                )}

                {domainStep === 'select' && (
                  <div class="space-y-4">
                    <div>
                      <label class="text-sm block mb-2" style="color:rgba(255,255,255,0.5)">
                        選擇網域
                      </label>
                      <div class="space-y-2">
                        {zones.length === 0 && (
                          <p class="text-sm" style="color:rgba(255,255,255,0.4)">
                            在你的 Cloudflare 帳戶中沒有找到可用的網域。
                          </p>
                        )}
                        {zones.map((zone) => (
                          <button
                            key={zone.id}
                            onClick={() => {
                              setSelectedZone(zone);
                              setDomainStep('preview');
                            }}
                            class="w-full text-left px-4 py-3 rounded-xl text-sm transition-colors border-none cursor-pointer"
                            style={`background:rgba(0,0,0,0.2);color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.06)`}
                          >
                            {zone.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setDomainStep('idle');
                        setDomainError('');
                      }}
                      class="text-sm border-none cursor-pointer"
                      style="background:none;color:rgba(255,255,255,0.4)"
                    >
                      取消
                    </button>
                  </div>
                )}

                {domainStep === 'preview' && selectedZone && (
                  <div class="space-y-5">
                    <div>
                      <label class="text-sm block mb-2" style="color:rgba(255,255,255,0.7)">
                        輸入你想要的網址前綴
                      </label>
                      <p class="text-xs mb-3" style="color:rgba(255,255,255,0.4)">
                        留空表示直接使用 {selectedZone.name} 作為網址
                      </p>
                      <div class="flex items-center gap-2">
                        <input
                          type="text"
                          value={subdomain}
                          onInput={(e) => setSubdomain((e.target as HTMLInputElement).value)}
                          placeholder="例如 app"
                          class="px-3 py-2.5 rounded-lg text-sm text-white focus:outline-none w-40"
                          style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
                        />
                        <span class="text-sm" style="color:rgba(255,255,255,0.4)">
                          .{selectedZone.name}
                        </span>
                      </div>
                    </div>

                    <div
                      class="px-4 py-4 rounded-xl"
                      style="background:rgba(129,140,248,0.08);border:1px solid rgba(129,140,248,0.2)"
                    >
                      <div class="text-xs mb-1.5" style="color:rgba(255,255,255,0.5)">
                        設定完成後，你的網站網址將會是
                      </div>
                      <div class="font-mono text-base font-semibold" style="color:#818cf8">
                        https://{previewDomain}
                      </div>
                    </div>

                    <p class="text-xs" style="color:rgba(255,255,255,0.35)">
                      系統會自動設定 DNS 和 SSL 憑證，完成後即可透過此網址訪問你的網站。
                    </p>

                    <div class="flex items-center gap-3">
                      <button
                        onClick={handleDomainSetup}
                        disabled={settingDomain}
                        class="px-6 py-2.5 bg-vs-gradient-cf rounded-xl text-white text-sm font-semibold border-none cursor-pointer disabled:opacity-50"
                      >
                        {settingDomain ? '設定中...' : '設定網域'}
                      </button>
                      <button
                        onClick={() => {
                          setDomainStep('select');
                          setSubdomain('');
                        }}
                        class="text-sm border-none cursor-pointer"
                        style="background:none;color:rgba(255,255,255,0.4)"
                      >
                        返回
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== Settings ===== */}
        {activeTab === 'settings' && (
          <div>
            <h3 class="font-semibold mb-5">專案設定</h3>
            <div class="flex flex-col gap-5">
              <div class="p-5 rounded-xl" style="background:rgba(0,0,0,0.2)">
                <label class="block mb-2 font-medium text-sm">專案名稱</label>
                <input
                  type="text"
                  value={projectName}
                  onInput={(e: Event) => setProjectName((e.target as HTMLInputElement).value)}
                  class="w-full px-4 py-3 rounded-lg text-white text-sm focus:outline-none"
                  style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
                />
              </div>

              <div class="p-5 rounded-xl" style="background:rgba(0,0,0,0.2)">
                <label class="block mb-2 font-medium text-sm">專案描述</label>
                <p class="text-xs mb-3" style="color:rgba(255,255,255,0.4)">
                  描述會顯示在 Gallery 頁面，讓其他人了解你的專案
                </p>
                <textarea
                  value={description}
                  onInput={(e: Event) => setDescription((e.target as HTMLTextAreaElement).value)}
                  placeholder="簡單介紹你的專案..."
                  rows={3}
                  class="w-full px-4 py-3 rounded-lg text-white text-sm focus:outline-none resize-none"
                  style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
                />
              </div>

              <div class="p-5 rounded-xl" style="background:rgba(0,0,0,0.2)">
                <div class="flex items-center justify-between">
                  <div>
                    <label class="block font-medium text-sm mb-1">公開到 Gallery</label>
                    <p class="text-xs" style="color:rgba(255,255,255,0.4)">
                      開啟後，專案會顯示在公開的 Gallery 頁面
                    </p>
                  </div>
                  <button
                    onClick={() => setIsPublic(!isPublic)}
                    class="relative w-12 h-7 rounded-full border-none cursor-pointer transition-colors"
                    style={`background:${isPublic ? '#6366f1' : 'rgba(255,255,255,0.15)'}`}
                  >
                    <span
                      class="absolute top-0.5 w-6 h-6 rounded-full transition-all"
                      style={`background:white;left:${isPublic ? '22px' : '2px'}`}
                    />
                  </button>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                class="w-full py-3 rounded-xl text-white font-bold text-sm border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style="background:linear-gradient(135deg,#818cf8 0%,#6366f1 100%)"
              >
                {saving ? '儲存中...' : saveMsg || '儲存設定'}
              </button>

              <div
                class="p-5 rounded-xl"
                style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2)"
              >
                <h4 class="font-semibold mb-2" style="color:#ef4444">
                  危險區域
                </h4>
                <p class="text-sm mb-4" style="color:rgba(255,255,255,0.5)">
                  刪除專案將會移除所有部署和設定，此操作無法復原。
                </p>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  class="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                  style="background:transparent;border:1px solid #ef4444;color:#ef4444"
                >
                  {deleting ? '刪除中...' : '刪除專案'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== QR Code Modal ==================== */}
      {showQrModal && qrDataUrl && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center"
          style="background:rgba(0,0,0,0.7);backdrop-filter:blur(4px)"
          onClick={() => setShowQrModal(false)}
        >
          <div
            class="card-vs p-8 text-center max-w-sm w-full mx-4"
            style="background:rgba(26,26,46,0.95);cursor:default"
            onClick={(e: Event) => e.stopPropagation()}
          >
            <h3 class="text-lg font-bold mb-4">QR Code</h3>
            <div class="inline-block p-4 rounded-xl mb-4" style="background:#ffffff">
              <img src={qrDataUrl} alt="QR Code" style="width:200px;height:200px" />
            </div>
            <p class="font-mono text-xs mb-6" style="color:rgba(255,255,255,0.5)">
              {domain ? `https://${domain}` : liveUrl}
            </p>
            <div class="flex gap-3">
              <a
                href={qrDataUrl}
                download={`${project.name}-qrcode.png`}
                class="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm no-underline text-center"
                style="background:linear-gradient(135deg,#818cf8 0%,#6366f1 100%)"
              >
                下載 QR Code
              </a>
              <button
                onClick={() => setShowQrModal(false)}
                class="px-5 py-2.5 rounded-xl text-sm font-medium border-none cursor-pointer"
                style="background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6)"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetail;
