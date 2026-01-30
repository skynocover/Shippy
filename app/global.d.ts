import type {} from 'hono'

type Bindings = {
  DB: D1Database
  SESSION: KVNamespace
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  VERCEL_CLIENT_ID: string
  VERCEL_CLIENT_SECRET: string
  VERCEL_INTEGRATION_SLUG: string
  ENCRYPTION_KEY: string
  SESSION_SECRET: string
}

type Variables = {
  session: {
    id: string
    userId?: string
    githubToken?: string
    vercelToken?: string
  }
}

declare module 'hono' {
  interface Env {
    Bindings: Bindings
    Variables: Variables
  }
}
