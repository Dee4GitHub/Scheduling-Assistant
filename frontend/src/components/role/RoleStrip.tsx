"use client";

import { useRole } from "@/components/role/RoleContext";
import { Typography } from "@mui/material";

// Visible "Viewing as: …" indicator + dropdown to switch role.
//
// PR #6 scaffold: stub. Real implementation lands with the role-picker work
// (after API client + types). The stub renders only the static text so we
// can verify the AppBar layout is correct in the browser before adding the
// dropdown logic. Returns null when there's no selection so the home-page
// picker isn't visually duplicated in the header.

export function RoleStrip() {
  const { current } = useRole();
  if (!current) return null;
  return (
    <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.85)" }}>
      Viewing as: {current.role === "manager" ? "Manager" : "Technician"} #{current.id}
    </Typography>
  );
}
