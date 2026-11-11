import AppShell from '@/components/AppShell';
import MotionRuntime from '@/components/shell/MotionRuntime';
import ServiceWorkerRegister from '@/components/shell/ServiceWorkerRegister';

// The shell (sidebar, top bar, palette, toasts) lives here once, so it never remounts when you move between modules.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MotionRuntime />
      <ServiceWorkerRegister />
      <AppShell>{children}</AppShell>
    </>
  );
}
