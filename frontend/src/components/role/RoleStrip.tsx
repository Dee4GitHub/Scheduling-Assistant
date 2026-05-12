"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
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
// Visual treatment: pill-shaped button with a mono "VIEWING AS" tag set
// against the dark teal AppBar. The tag uses the same uppercase tracked
// pattern as the form field labels elsewhere — consistent editorial
// vocabulary across the app. The role label is set in display weight so
// it reads as the primary information.

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

  const display = resolveDisplay(current, managers, technicians);

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
        endIcon={<ArrowDropDownIcon sx={{ color: "rgba(255,255,255,0.7)" }} />}
        sx={{
          textTransform: "none",
          color: "#FFFFFF",
          borderRadius: 999,
          pl: 1.75,
          pr: 1.25,
          py: 0.75,
          border: "1px solid rgba(255,255,255,0.18)",
          bgcolor: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(2px)",
          "&:hover": {
            bgcolor: "rgba(255,255,255,0.12)",
            borderColor: "rgba(255,255,255,0.3)",
          },
        }}
        aria-label="Switch viewing role"
        aria-haspopup="menu"
        aria-expanded={anchorEl !== null}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.62rem",
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
              borderRight: "1px solid rgba(255,255,255,0.2)",
              pr: 1.25,
              py: 0.25,
            }}
          >
            {display.kind}
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            {display.name}
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
            elevation: 4,
            sx: {
              minWidth: 300,
              maxHeight: 480,
              mt: 1,
              border: "1px solid",
              borderColor: "divider",
            },
          },
        }}
      >
        <ListSubheader
          sx={{
            bgcolor: "background.paper",
            lineHeight: "28px",
            pt: 1,
            pb: 0.5,
            color: "text.secondary",
            fontFamily: "var(--font-display)",
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Managers
        </ListSubheader>
        {managers.length === 0 ? (
          <MenuItem disabled>Loading…</MenuItem>
        ) : (
          managers.map((m) => (
            <MenuItem
              key={`mgr-${m.id}`}
              onClick={() => switchTo("manager", m.id)}
              selected={current.role === "manager" && current.id === m.id}
              sx={{
                "&.Mui-selected": {
                  bgcolor: "rgba(15, 76, 92, 0.08)",
                  borderLeft: "3px solid",
                  borderLeftColor: "primary.main",
                  pl: "13px",
                },
              }}
            >
              {m.name}
            </MenuItem>
          ))
        )}
        <Divider sx={{ my: 0.5 }} />
        <ListSubheader
          sx={{
            bgcolor: "background.paper",
            lineHeight: "28px",
            pt: 1,
            pb: 0.5,
            color: "text.secondary",
            fontFamily: "var(--font-display)",
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Technicians
        </ListSubheader>
        {technicians.length === 0 ? (
          <MenuItem disabled>Loading…</MenuItem>
        ) : (
          technicians.map((t) => (
            <MenuItem
              key={`tech-${t.id}`}
              onClick={() => switchTo("technician", t.id)}
              selected={current.role === "technician" && current.id === t.id}
              sx={{
                "&.Mui-selected": {
                  bgcolor: "rgba(15, 76, 92, 0.08)",
                  borderLeft: "3px solid",
                  borderLeftColor: "primary.main",
                  pl: "13px",
                },
              }}
            >
              <Stack direction="row" alignItems="baseline" spacing={1} sx={{ flexGrow: 1 }}>
                <Typography component="span" sx={{ fontWeight: 500 }}>
                  {t.name}
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    color: "text.secondary",
                    letterSpacing: "0.04em",
                  }}
                >
                  {t.trade.toUpperCase()}
                </Typography>
              </Stack>
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
}

interface RoleDisplay {
  kind: "Manager" | "Tech";
  name: string;
}

// Resolve { kind: 'Manager', name: 'Aisha Khan' } from the role context plus
// the loaded lists. Fallback names ("Manager #1") keep header width stable
// before the lists hydrate.
function resolveDisplay(
  current: { role: Role; id: number },
  managers: ReadonlyArray<{ id: number; name: string }>,
  technicians: ReadonlyArray<{ id: number; name: string }>,
): RoleDisplay {
  if (current.role === "manager") {
    const m = managers.find((x) => x.id === current.id);
    return { kind: "Manager", name: m ? m.name : `#${current.id}` };
  }
  const t = technicians.find((x) => x.id === current.id);
  return { kind: "Tech", name: t ? t.name : `#${current.id}` };
}
