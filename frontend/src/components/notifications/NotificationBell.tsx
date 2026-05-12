"use client";

import { useState, type MouseEvent } from "react";
import { Badge, IconButton, Popover } from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markNotificationRead } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useRole } from "@/components/role/RoleContext";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";

// Header bell-icon. Owns:
//   1. An unread-count query for the badge — scoped to the current role
//      (recipientType + recipientId from RoleContext).
//   2. A separate full-list query for the popover panel, only enabled
//      while the popover is open (don't fetch ahead of need).
//   3. A markAsRead mutation, with cache invalidation so both queries
//      refresh together.
//
// Refetch policy: refetchOnWindowFocus=true (the QueryClient default),
// which means the badge stays roughly current without polling. A user
// switching tabs back sees the latest count without action.
//
// When no role is selected (home page, pre-picker) the bell returns null
// — the IconButton just isn't there. Avoids a "0 notifications for
// nobody" state.

export function NotificationBell() {
  const { current } = useRole();
  const queryClient = useQueryClient();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = anchorEl !== null;

  // Unread-count query: always live, drives the badge. Required for the
  // user to know there's something new without opening the popover.
  const unreadQuery = useQuery({
    queryKey:
      current !== null
        ? queryKeys.notifications({
            recipientType: current.role,
            recipientId: current.id,
            unreadOnly: true,
          })
        : ["notifications", "disabled"],
    queryFn: ({ signal }) => {
      if (current === null) throw new Error("no role");
      return listNotifications(
        {
          recipientType: current.role,
          recipientId: current.id,
          unreadOnly: true,
        },
        signal,
      );
    },
    enabled: current !== null,
  });

  // Full-list query: only fires while the popover is open so the panel can
  // show read + unread. Mounting cost is one extra request per open, but
  // closing+reopening hits the React Query cache as long as the staleTime
  // hasn't elapsed (30s — set in the QueryClient defaults).
  const listQuery = useQuery({
    queryKey:
      current !== null
        ? queryKeys.notifications({
            recipientType: current.role,
            recipientId: current.id,
            unreadOnly: false,
          })
        : ["notifications", "disabled"],
    queryFn: ({ signal }) => {
      if (current === null) throw new Error("no role");
      return listNotifications(
        {
          recipientType: current.role,
          recipientId: current.id,
          unreadOnly: false,
        },
        signal,
      );
    },
    enabled: current !== null && open,
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: number) => markNotificationRead(notificationId),
    onSuccess: () => {
      // Invalidate every notifications query for this recipient so both
      // the badge and the open panel refresh. The prefix shape from
      // queryKeys.notificationsForRecipient matches all unreadOnly
      // variants in one call.
      if (current !== null) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.notificationsForRecipient(current.role, current.id),
        });
      }
    },
  });

  if (current === null) return null;

  const unreadCount = unreadQuery.data?.length ?? 0;

  const handleOpen = (e: MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleOpen}
        aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
        aria-haspopup="dialog"
        sx={{ ml: 1 }}
      >
        <Badge
          badgeContent={unreadCount}
          color="error"
          overlap="circular"
          // showZero=false (default) hides the badge when count is 0,
          // which avoids visual noise during the empty state.
        >
          {unreadCount > 0 ? <NotificationsActiveIcon /> : <NotificationsNoneIcon />}
        </Badge>
      </IconButton>

      <Popover
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <NotificationPanel
          notifications={listQuery.data ?? []}
          isLoading={listQuery.isLoading}
          markingReadId={
            markReadMutation.isPending ? markReadMutation.variables ?? null : null
          }
          onMarkRead={(id) => markReadMutation.mutate(id)}
        />
      </Popover>
    </>
  );
}
