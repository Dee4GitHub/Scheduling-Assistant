import type { ListNotificationsQuery, QuoteStatus } from "@/lib/types";

// React Query cache keys, defined once so every useQuery + queryClient
// invalidation across the app references the same tuple shape. Avoids the
// classic "I invalidated ['quotes'] but the consumer was watching
// ['quotes', 'unscheduled']" footgun — type the helpers, not the consumers.
//
// Convention: the first element is the resource name; subsequent elements
// narrow the scope. Invalidating the prefix invalidates all narrowed forms.

export const queryKeys = {
  managers: () => ["managers"] as const,
  technicians: () => ["technicians"] as const,

  // Quotes: 'all' is the unscoped list, 'byStatus' narrows. Invalidate
  // queryKeys.quotes() (the prefix) after an assignment so both forms refetch.
  quotes: () => ["quotes"] as const,
  quotesByStatus: (status: QuoteStatus | undefined) =>
    ["quotes", status ?? "all"] as const,

  schedule: (technicianId: number, date: string | undefined) =>
    ["schedule", technicianId, date ?? "all"] as const,

  notifications: (query: ListNotificationsQuery) =>
    [
      "notifications",
      query.recipientType,
      query.recipientId,
      query.unreadOnly ?? false,
    ] as const,

  // Prefix used to invalidate every notifications query for a recipient,
  // regardless of unreadOnly state. After marking-as-read or after a new
  // notification is created upstream, call queryClient.invalidateQueries
  // with this prefix.
  notificationsForRecipient: (
    recipientType: ListNotificationsQuery["recipientType"],
    recipientId: number,
  ) => ["notifications", recipientType, recipientId] as const,
} as const;
