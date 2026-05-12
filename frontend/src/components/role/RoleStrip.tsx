"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Divider,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { useQuery } from "@tanstack/react-query";
import { listManagers, listTechnicians } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useRole, type Role } from "@/components/role/RoleContext";

// Header "Viewing as: …" indicator + role-switch dropdown. Clicking opens
// a Menu listing all managers and all technicians; picking one updates the
// role context and routes to the matching page.
//
// Owns its own queries for managers + technicians. React Query deduplicates
// by queryKey, so when the home page or manager dashboard already loaded
// these lists this is a cache hit. The strip never blocks layout — when
// the names haven't resolved yet, it falls back to "Manager #1" so the
// header doesn't jump width on first paint.

export function RoleStrip() {
  const router = useRouter();
  const { current, setRole } = useRole();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const managersQuery = useQuery({
    queryKey: queryKeys.managers(),
    queryFn: ({ signal }) => listManagers(signal),
    // Strip renders on every page but the lists rarely change. Don't refetch
    // on focus for this query specifically — managers and technicians are
    // effectively static for the demo session.
    refetchOnWindowFocus: false,
  });
  const techniciansQuery = useQuery({
    queryKey: queryKeys.technicians(),
    queryFn: ({ signal }) => listTechnicians(signal),
    refetchOnWindowFocus: false,
  });

  if (!current) return null;

  const managers = managersQuery.data ?? [];
  const technicians = techniciansQuery.data ?? [];

  const displayName = resolveDisplayName(current, managers, technicians);

  const handleOpen = (e: MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const switchTo = (role: Role, id: number) => {
    setRole({ role, id });
    setAnchorEl(null);
    if (role === "manager") {
      router.push("/manager");
    } else {
      router.push(`/technician/${id}`);
    }
  };

  return (
    <>
      <Button
        onClick={handleOpen}
        color="inherit"
        endIcon={<ArrowDropDownIcon />}
        size="small"
        sx={{
          textTransform: "none",
          color: "rgba(255,255,255,0.95)",
          // Subtle separation from the rest of the AppBar without screaming.
          borderRadius: 999,
          px: 1.5,
          py: 0.5,
          "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
        }}
        aria-label="Switch viewing role"
        aria-haspopup="menu"
        aria-expanded={anchorEl !== null}
      >
        <Stack direction="row" spacing={0.75} alignItems="baseline">
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.7)" }}>
            Viewing as:
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {displayName}
          </Typography>
        </Stack>
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={anchorEl !== null}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { minWidth: 280, maxHeight: 480 },
          },
        }}
      >
        <ListSubheader
          sx={{
            bgcolor: "background.paper",
            lineHeight: "32px",
            fontWeight: 600,
            color: "text.secondary",
          }}
        >
          Managers
        </ListSubheader>
        {managers.length === 0 ? (
          <MenuItem disabled>Loading...</MenuItem>
        ) : (
          managers.map((m) => (
            <MenuItem
              key={`mgr-${m.id}`}
              onClick={() => switchTo("manager", m.id)}
              selected={current.role === "manager" && current.id === m.id}
            >
              {m.name}
            </MenuItem>
          ))
        )}
        <Divider />
        <ListSubheader
          sx={{
            bgcolor: "background.paper",
            lineHeight: "32px",
            fontWeight: 600,
            color: "text.secondary",
          }}
        >
          Technicians
        </ListSubheader>
        {technicians.length === 0 ? (
          <MenuItem disabled>Loading...</MenuItem>
        ) : (
          technicians.map((t) => (
            <MenuItem
              key={`tech-${t.id}`}
              onClick={() => switchTo("technician", t.id)}
              selected={current.role === "technician" && current.id === t.id}
            >
              {t.name}
              <Typography
                component="span"
                variant="body2"
                sx={{ color: "text.secondary", ml: 1 }}
              >
                ({t.trade})
              </Typography>
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
}

// Resolve "Manager - Aisha Khan" from { role: 'manager', id: 1 } given the
// loaded list. Falls back to "Manager #1" while the list is still loading
// (or if the id is somehow not in the list — e.g. user manually edited
// localStorage). The fallback keeps layout width stable on first paint.
function resolveDisplayName(
  current: { role: Role; id: number },
  managers: ReadonlyArray<{ id: number; name: string }>,
  technicians: ReadonlyArray<{ id: number; name: string }>,
): string {
  if (current.role === "manager") {
    const m = managers.find((x) => x.id === current.id);
    return m ? `Manager - ${m.name}` : `Manager #${current.id}`;
  }
  const t = technicians.find((x) => x.id === current.id);
  return t ? `Technician - ${t.name}` : `Technician #${current.id}`;
}
