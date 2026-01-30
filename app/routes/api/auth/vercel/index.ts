import { createRoute } from 'honox/factory'

export default createRoute((c) => {
  const slug = c.env.VERCEL_INTEGRATION_SLUG
  const redirectUri = new URL('/api/auth/vercel/callback', c.req.url).toString()
  const state = c.get('session').id

  const url = new URL(`https://vercel.com/integrations/${slug}/new`)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)

  return c.redirect(url.toString())
})
