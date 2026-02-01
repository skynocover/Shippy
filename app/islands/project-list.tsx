import { useState, useEffect } from "hono/jsx";

interface Project {
  id: string;
  name: string;
  subdomain: string;
  framework: string | null;
  status: string;
  deploymentUrl: string | null;
  customDomain: string | null;
  platform: string | null;
  createdAt: string;
}

const statusConfig: Record<
  string,
  { label: string; color: string; dot: string; glow: string }
> = {
  created: {
    label: "已建立",
    color: "rgba(156,163,175,1)",
    dot: "#9ca3af",
    glow: "none",
  },
  uploading: {
    label: "上傳中",
    color: "#facc15",
    dot: "#facc15",
    glow: "0 0 8px rgba(250,204,21,0.6)",
  },
  deploying: {
    label: "部署中",
    color: "#60a5fa",
    dot: "#60a5fa",
    glow: "0 0 8px rgba(96,165,250,0.6)",
  },
  live: {
    label: "已上線",
    color: "#34d399",
    dot: "#34d399",
    glow: "0 0 8px rgba(52,211,153,0.6)",
  },
  failed: {
    label: "部署失敗",
    color: "#ef4444",
    dot: "#ef4444",
    glow: "0 0 8px rgba(239,68,68,0.6)",
  },
};

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const weeks = Math.floor(days / 7);
  return `${weeks} 週前`;
}

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data: { projects: Project[] }) => {
        setProjects(data.projects);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div class="text-center py-12" style="color:rgba(255,255,255,0.4)">
        <div class="text-4xl mb-4 animate-float">📦</div>
        載入專案中...
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div
        class="card-vs p-16 text-center"
        style="border:2px dashed rgba(255,255,255,0.1);cursor:default"
      >
        <div class="text-5xl mb-5">📦</div>
        <h2 class="text-xl font-bold mb-3">還沒有任何專案</h2>
        <p class="mb-6" style="color:rgba(255,255,255,0.5)">
          部署你的第一個專案，只需要三分鐘
        </p>
        <a
          href="/dashboard/new"
          class="inline-flex items-center gap-2 bg-vs-gradient-btn rounded-xl px-8 py-3 text-white font-bold no-underline"
        >
          + 新增專案
        </a>
      </div>
    );
  }

  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {projects.map((project, i) => {
        const sc = statusConfig[project.status] || statusConfig.created;
        const displayUrl =
          project.customDomain ||
          project.deploymentUrl?.replace("https://", "") ||
          `${project.subdomain}.vibeship.dev`;

        return (
          <a
            key={project.id}
            href={`/dashboard/${project.id}`}
            class="card-vs p-6 block no-underline text-white"
            style={`animation:slideIn 0.4s ease ${i * 0.1}s both`}
          >
            {/* Status & Name */}
            <div class="flex items-center gap-2.5 mb-3">
              <div
                style={`width:10px;height:10px;border-radius:50%;background:${sc.dot};box-shadow:${sc.glow}`}
              />
              <h3 class="font-bold text-lg truncate">{project.name}</h3>
            </div>

            {/* URL */}
            <p
              class="font-mono text-sm mb-4 truncate"
              style={`color:${project.status === "live" ? "#34d399" : project.status === "failed" ? "#ef4444" : "rgba(255,255,255,0.5)"}`}
            >
              {project.status === "failed" ? "部署失敗" : displayUrl}
            </p>

            {/* Footer */}
            <div
              class="flex items-center justify-between pt-4"
              style="border-top:1px solid rgba(255,255,255,0.06)"
            >
              <div class="flex items-center gap-1.5">
                <span class="text-xs">
                  {project.platform === "cloudflare" ? "☁️" : "▲"}
                </span>
                <span class="text-sm" style="color:rgba(255,255,255,0.5)">
                  {timeAgo(project.createdAt)}
                </span>
              </div>
              <div class="flex gap-2">
                {project.status === "live" && project.deploymentUrl && (
                  <button
                    onClick={(e: Event) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(project.deploymentUrl!, "_blank");
                    }}
                    class="px-3 py-1.5 rounded-lg text-sm cursor-pointer border-none text-white transition-colors"
                    style="background:rgba(255,255,255,0.1)"
                  >
                    開啟
                  </button>
                )}
                {project.status === "failed" && (
                  <button
                    onClick={(e: Event) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.location.href = `/dashboard/${project.id}`;
                    }}
                    class="px-3 py-1.5 rounded-lg text-sm cursor-pointer"
                    style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.3);color:#ef4444"
                  >
                    重試
                  </button>
                )}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
