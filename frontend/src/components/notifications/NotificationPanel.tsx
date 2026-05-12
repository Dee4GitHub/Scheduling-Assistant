"use client";

import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DoneIcon from "@mui/icons-material/Done";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { enAU } from "date-fns/locale";
import type { Notification } from "@/lib/types";

// Pure presentation for the notification bell's Popover content.
//
// Visual treatment: editorial inbox. Type-coded icon avatars on the left
// (terracotta for assignments, success-green for completions), the message
// in display weight, a mono-set relative time below, and a tucked "mark as
// read" button on the right edge for unread items. Unread rows have a thin
// terracotta left-stripe so they read as data not chrome.

interface NotificationPanelProps {
  readonly notifications: readonly Notification[];
  readonly isLoading: boolean;
  readonly markingReadId: number | null;
  onMarkRead(notificationId: number): void;
}

const DISPLAY_LIMIT = 10;

export function NotificationPanel({
  notifications,
  isLoading,
  markingReadId,
  onMarkRead,
}: NotificationPanelProps) {
  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 5, minWidth: 360 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (notifications.length === 0) {
    return (
      <Box
        sx={{
          p: 4,
          minWidth: 360,
          textAlign: "center",
        }}
      >
        <NotificationsNoneIcon
          sx={{ fontSize: 36, color: "text.disabled", mb: 1.5 }}
        />
        <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
          You're all caught up.
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "text.disabled",
            mt: 0.5,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.04em",
          }}
        >
          No new notifications
        </Typography>
      </Box>
    );
  }

  const visible = notifications.slice(0, DISPLAY_LIMIT);
  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  return (
    <Box sx={{ minWidth: 380, maxWidth: 440 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2.5, py: 1.75 }}
      >
        <Typography
          variant="overline"
          sx={{ color: "text.primary", lineHeight: 1 }}
        >
          Notifications
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.04em",
          }}
        >
          {unreadCount > 0 ? (
            <>
              <Box
                component="span"
                sx={{ color: "secondary.main", fontWeight: 700 }}
              >
                {unreadCount}
              </Box>
              {` unread · `}
            </>
          ) : null}
          {visible.length} of {notifications.length}
        </Typography>
      </Stack>
      <Divider />
      <List dense disablePadding>
        {visible.map((n, i) => (
          <Box key={n.id}>
            <NotificationRow
              notification={n}
              marking={markingReadId === n.id}
              onMarkRead={onMarkRead}
            />
            {i < visible.length - 1 ? <Divider component="li" /> : null}
          </Box>
        ))}
      </List>
    </Box>
  );
}

function NotificationRow({
  notification,
  marking,
  onMarkRead,
}: {
  readonly notification: Notification;
  readonly marking: boolean;
  onMarkRead(id: number): void;
}) {
  const isUnread = notification.readAt === null;
  const isAssignment = notification.type === "job_assigned";

  return (
    <ListItem
      alignItems="flex-start"
      sx={{
        bgcolor: isUnread ? "rgba(194, 65, 12, 0.04)" : "transparent",
        position: "relative",
        py: 1.5,
        pl: isUnread ? 2.5 : 2.5,
        pr: 2,
        transition: "background-color 120ms ease",
        // Unread indicator: thin terracotta left-stripe — same accent
        // language as the page document stripes.
        "&::before": isUnread
          ? {
              content: '""',
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: 3,
              bgcolor: "secondary.main",
            }
          : undefined,
        "&:hover": {
          bgcolor: isUnread ? "rgba(194, 65, 12, 0.07)" : "rgba(15, 76, 92, 0.03)",
        },
      }}
      secondaryAction={
        isUnread ? (
          <Tooltip title="Mark as read" placement="left">
            <span>
              <IconButton
                edge="end"
                size="small"
                onClick={() => onMarkRead(notification.id)}
                disabled={marking}
                aria-label="Mark notification as read"
                sx={{
                  color: "text.disabled",
                  "&:hover": { color: "secondary.main" },
                }}
              >
                {marking ? <CircularProgress size={16} /> : <DoneIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        ) : null
      }
    >
      <Stack direction="row" spacing={1.75} sx={{ width: "100%" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            pt: 0.25,
            flexShrink: 0,
          }}
        >
          {isAssignment ? (
            <AssignmentIndIcon
              sx={{
                fontSize: 22,
                color: isUnread ? "secondary.main" : "text.disabled",
              }}
            />
          ) : (
            <CheckCircleOutlineIcon
              sx={{
                fontSize: 22,
                color: isUnread ? "success.main" : "text.disabled",
              }}
            />
          )}
        </Box>

        <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0, pr: isUnread ? 4 : 0 }}>
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography
              component="span"
              sx={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: isAssignment ? "secondary.main" : "success.main",
              }}
            >
              {isAssignment ? "ASSIGNED" : "COMPLETED"}
            </Typography>
          </Stack>
          <Typography
            variant="body2"
            sx={{
              fontWeight: isUnread ? 600 : 400,
              color: isUnread ? "text.primary" : "text.secondary",
              lineHeight: 1.4,
            }}
          >
            {notification.message}
          </Typography>
          <Tooltip title={formatAbsolute(notification.createdAt)} placement="bottom-start">
            <Typography
              component="span"
              sx={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                color: "text.disabled",
                letterSpacing: "0.02em",
                width: "fit-content",
              }}
            >
              {formatRelative(notification.createdAt)}
            </Typography>
          </Tooltip>
        </Stack>
      </Stack>
    </ListItem>
  );
}

function formatRelative(iso: string): string {
  try {
    const normalised = iso.includes("T") ? iso : iso.replace(" ", "T");
    return formatDistanceToNow(parseISO(normalised), {
      addSuffix: true,
      locale: enAU,
    });
  } catch {
    return iso;
  }
}

function formatAbsolute(iso: string): string {
  try {
    const normalised = iso.includes("T") ? iso : iso.replace(" ", "T");
    return format(parseISO(normalised), "dd/MM/yyyy HH:mm");
  } catch {
    return iso;
  }
}
