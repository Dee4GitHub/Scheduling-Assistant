"use client";

import { useRole } from "@/components/role/RoleContext";

// Bell-icon component. Owns its own data subscription (refetch-on-focus) so
// pages don't need to thread notification state through their props.
//
// PR #6 scaffold: stub. Real implementation lands with the notification panel
// work. The render-prop shape (children: (unreadCount) => ReactNode) is the
// shape AppShell expects, so the header doesn't change when this fills in.
// Returns null when no role is selected so the bell doesn't render on /.

export function NotificationBell({
  children,
}: {
  readonly children: (unreadCount: number) => React.ReactNode;
}) {
  const { current } = useRole();
  if (!current) return null;
  return <>{children(0)}</>;
}
