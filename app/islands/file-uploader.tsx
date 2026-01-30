import { useState, useCallback } from 'hono/jsx'
import { shouldIgnore } from '../lib/constants'

interface FileEntry {
  path: string
  content: string // base64
}

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

export default function FileUploader({ hasVercel }: { hasVercel: boolean }) {
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [repoName, setRepoName] = useState('')
  const [status, setStatus] = useState<'idle' | 'reading' | 'pushing' | 'deploying' | 'pushed' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  // After GitHub push, store these for the deploy step
  const [projectId, setProjectId] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [vercelProjectName, setVercelProjectName] = useState('')

  const processFiles = useCallback(async (allFiles: FileEntry[]) => {
    const roots = new Set(allFiles.map(f => f.path.split('/')[0]))
    let processed = allFiles
    if (roots.size === 1) {
      const root = [...roots][0]
      processed = allFiles.map(f => ({
        ...f,
        path: f.path.slice(root.length + 1),
      })).filter(f => f.path.length > 0)

      if (!repoName) {
        setRepoName(root)
      }
    }

    setFiles(processed)
    setStatus('idle')
    setMessage(`${processed.length} files ready`)
  }, [repoName])

  const handleFolderSelect = useCallback(async (e: Event) => {
    const input = e.target as HTMLInputElement
    if (!input.files || input.files.length === 0) return

    setStatus('reading')
    setMessage('Reading files...')

    try {
      const allFiles: FileEntry[] = []
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i]
        const path = (file as any).webkitRelativePath || file.name
        if (shouldIgnore(path)) continue
        const content = await readFileAsBase64(file)
        allFiles.push({ path, content })
      }
      await processFiles(allFiles)
    } catch (err) {
      setStatus('error')
      setMessage(`Error reading files: ${err}`)
    }

    input.value = ''
  }, [processFiles])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    setStatus('reading')
    setMessage('Reading files...')

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
      }
      await processFiles(allFiles)
    } catch (err) {
      setStatus('error')
      setMessage(`Error reading files: ${err}`)
    }
  }, [processFiles])

  // Step 1: Create project + upload + push to GitHub
  const handlePushToGitHub = useCallback(async () => {
    if (!repoName.trim()) {
      setMessage('Please enter a repository name')
      return
    }
    if (files.length === 0) {
      setMessage('Please select a folder first')
      return
    }

    try {
      setStatus('pushing')
      setMessage('Creating project...')

      // Create project
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repoName.trim() }),
      })
      if (!createRes.ok) {
        const err = await createRes.json() as { error: string }
        throw new Error(err.error || 'Failed to create project')
      }
      const { project } = await createRes.json() as { project: { id: string } }
      setProjectId(project.id)

      // Push files directly to GitHub
      setMessage('Pushing to GitHub...')
      const pushRes = await fetch(`/api/projects/${project.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, repoName: repoName.trim() || undefined }),
      })
      if (!pushRes.ok) {
        const err = await pushRes.json() as { error: string }
        throw new Error(err.error || 'Failed to push to GitHub')
      }
      const pushData = await pushRes.json() as { githubRepo: string; githubUrl: string; framework: string | null }
      setGithubUrl(pushData.githubUrl)

      setStatus('pushed')
      setMessage(`Pushed to GitHub (${pushData.framework || 'unknown framework'})`)
    } catch (err) {
      setStatus('error')
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [repoName, files])

  // Step 2: Deploy to Vercel
  const handleDeployToVercel = useCallback(async () => {
    if (!hasVercel) {
      setMessage('Please connect Vercel first')
      return
    }

    try {
      setStatus('deploying')
      setMessage('Deploying to Vercel...')

      const deployRes = await fetch(`/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vercelProjectName: vercelProjectName.trim() || undefined }),
      })
      if (!deployRes.ok) {
        const err = await deployRes.json() as { error: string }
        throw new Error(err.error || 'Failed to deploy')
      }

      setStatus('done')
      setMessage('Deployment started! Redirecting...')
      window.location.href = `/dashboard/${projectId}`
    } catch (err) {
      setStatus('error')
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [projectId, hasVercel, vercelProjectName])

  // Reset to upload a new project
  const handleReset = useCallback(() => {
    setFiles([])
    setRepoName('')
    setProjectId('')
    setGithubUrl('')
    setVercelProjectName('')
    setStatus('idle')
    setMessage('')
  }, [])

  return (
    <div class="space-y-4">
      {/* Drop zone + hidden input - only show when not yet pushed */}
      {status !== 'pushed' && status !== 'done' && (
        <>
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
            class={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
              dragging
                ? 'border-indigo-400 bg-indigo-400/5'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div class="space-y-2">
              <div class="text-4xl">
                {files.length > 0 ? '&#128230;' : '&#128193;'}
              </div>
              <p class="text-gray-300 font-medium">
                {files.length > 0
                  ? `${files.length} files ready`
                  : 'Drop or click to select a folder'
                }
              </p>
              <p class="text-sm text-gray-500">
                Drag and drop, or click to browse
              </p>
            </div>
          </div>
        </>
      )}

      {/* Step 1: Name + Push to GitHub */}
      {files.length > 0 && status !== 'pushed' && status !== 'done' && (
        <div class="flex items-end gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-300 mb-1.5">Repository name</label>
            <input
              type="text"
              value={repoName}
              onInput={(e: Event) => setRepoName((e.target as HTMLInputElement).value)}
              placeholder="my-awesome-app"
              class="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-400"
            />
          </div>
          <button
            onClick={handlePushToGitHub}
            disabled={status === 'pushing'}
            class="px-6 py-2.5 bg-gray-100 text-gray-900 font-semibold rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            {status === 'pushing' ? 'Pushing...' : 'Push to GitHub'}
          </button>
        </div>
      )}

      {/* Step 2: GitHub link + Deploy to Vercel */}
      {status === 'pushed' && (
        <div class="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="w-3 h-3 bg-green-400 rounded-full"></span>
              <span class="text-green-400 font-medium">Pushed to GitHub</span>
            </div>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener"
              class="text-sm text-indigo-400 hover:underline font-mono"
            >
              {githubUrl.replace('https://github.com/', '')} &rarr;
            </a>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1.5">Vercel project name (optional)</label>
            <input
              type="text"
              value={vercelProjectName}
              onInput={(e: Event) => setVercelProjectName((e.target as HTMLInputElement).value)}
              placeholder={`vibeship-${repoName.trim() || 'project'}`}
              class="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div class="flex items-center gap-3">
            <button
              onClick={handleDeployToVercel}
              disabled={!hasVercel || status === 'deploying'}
              class="px-6 py-2.5 bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Deploy to Vercel
            </button>
            {!hasVercel && (
              <a href="/api/auth/vercel" class="text-sm text-yellow-400 hover:underline">
                Connect Vercel first
              </a>
            )}
            <button
              onClick={handleReset}
              class="px-4 py-2.5 text-gray-400 hover:text-gray-200 text-sm transition-colors"
            >
              Upload another
            </button>
          </div>
        </div>
      )}

      {/* Status message */}
      {message && (
        <div class={`text-sm px-4 py-2 rounded-lg ${
          status === 'error' ? 'bg-red-400/10 text-red-400' :
          status === 'done' ? 'bg-green-400/10 text-green-400' :
          status === 'pushed' ? 'bg-green-400/10 text-green-400' :
          'bg-gray-800 text-gray-300'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}
