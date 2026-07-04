import { getUser } from '@/lib/auth';
import { Shell } from '@/components/layout/Shell';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return (
    <Shell user={user}>
      <AnalyticsTracker />
      {children}
    </Shell>
  );
}
