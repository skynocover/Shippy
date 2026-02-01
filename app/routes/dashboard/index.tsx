import { createRoute } from 'honox/factory';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { users } from '../../db/schema';
import { requireAuth } from '../../lib/auth-guard';
import Navbar from '../../components/navbar';
import ProjectList from '../../islands/project-list';

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

      <main class="max-w-6xl mx-auto px-6 py-10 animate-slide-up">
        <div class="mb-10">
          <h1 class="text-3xl font-bold mb-1">👋 歡迎回來</h1>
          <p style="color:rgba(255,255,255,0.5)">管理你的專案</p>
        </div>

        <ProjectList />
      </main>
    </div>,
    { title: 'Dashboard - VibeShip' },
  );
});
