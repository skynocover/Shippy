import { createRoute } from 'honox/factory';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { users } from '../../db/schema';
import { requireAuth } from '../../lib/auth-guard';
import Navbar from '../../components/navbar';
import DeployWizard from '../../islands/deploy-wizard';

export default createRoute(requireAuth, async (c) => {
  const session = c.get('session');
  const db = getDb(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, session.userId!)).get();

  const hasVercel = !!user?.vercelToken;
  const hasCloudflare = !!user?.cloudflareToken;

  return c.render(
    <div class="min-h-screen">
      <Navbar
        isLoggedIn={true}
        username={user?.username}
        avatarUrl={user?.avatarUrl ?? undefined}
        hasVercel={hasVercel}
        hasCloudflare={hasCloudflare}
      />

      <main class="max-w-3xl mx-auto px-6 py-10">
        <DeployWizard hasVercel={hasVercel} hasCloudflare={hasCloudflare} />
      </main>
    </div>,
    { title: '新增專案 - VibeShip' },
  );
});
