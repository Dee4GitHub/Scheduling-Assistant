"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useQuery } from "@tanstack/react-query";
import { listManagers, listTechnicians, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useRole, type Role } from "@/components/role/RoleContext";

// Self-contained picker for the no-auth demo's "who am I?" question. Fetches
// managers + technicians via React Query, lets the user pick a role + a
// specific user under that role, then commits to the role context and
// navigates to the appropriate route.
//
// Used by the home page (/) on first landing AND by the in-app role-switch
// dropdown (RoleStrip in the header). The two callers share this single
// component — no duplicate UI — and the navigation target is decided here
// so callers don't need to know the route shape.

type DraftRole = Role | "";
type DraftId = number | "";

export function RolePicker() {
  const router = useRouter();
  const { setRole } = useRole();
  const [role, setDraftRole] = useState<DraftRole>("");
  const [id, setDraftId] = useState<DraftId>("");

  const managersQuery = useQuery({
    queryKey: queryKeys.managers(),
    queryFn: ({ signal }) => listManagers(signal),
  });

  const techniciansQuery = useQuery({
    queryKey: queryKeys.technicians(),
    queryFn: ({ signal }) => listTechnicians(signal),
  });

  const isLoading = managersQuery.isLoading || techniciansQuery.isLoading;
  const loadError = managersQuery.error ?? techniciansQuery.error;

  // Options shown in the User dropdown depend on which role is selected.
  // Returning an empty list when role is "" keeps the rendering branch
  // simple and disables the dropdown via the empty-options state.
  const userOptions =
    role === "manager"
      ? (managersQuery.data ?? []).map((m) => ({ value: m.id, label: m.name }))
      : role === "technician"
        ? (techniciansQuery.data ?? []).map((t) => ({
            value: t.id,
            label: `${t.name} · ${t.trade}`,
          }))
        : [];

  const handleRoleChange = (e: SelectChangeEvent<DraftRole>) => {
    setDraftRole(e.target.value as DraftRole);
    // Clear the user selection when role flips — id 1 means a different
    // person depending on role, so carrying it over would silently pick
    // the wrong user.
    setDraftId("");
  };

  const handleIdChange = (e: SelectChangeEvent<DraftId>) => {
    const raw = e.target.value;
    setDraftId(raw === "" ? "" : Number(raw));
  };

  const isComplete = role !== "" && id !== "";

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isComplete) return;
    setRole({ role, id });
    if (role === "manager") {
      router.push("/manager");
    } else {
      router.push(`/technician/${id}`);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (loadError) {
    const friendly =
      loadError instanceof ApiError && loadError.status === 0
        ? "Could not reach the backend. Is it running on port 4000?"
        : loadError.message;
    return (
      <Alert
        severity="error"
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              void managersQuery.refetch();
              void techniciansQuery.refetch();
            }}
          >
            Retry
          </Button>
        }
      >
        {friendly}
      </Alert>
    );
  }

  return (
    <Stack component="form" spacing={3} onSubmit={handleSubmit} noValidate>
      <FieldBlock label="Role" labelId="role-label">
        <FormControl fullWidth size="medium">
          <Select<DraftRole>
            id="role"
            value={role}
            displayEmpty
            renderValue={(value) =>
              value === "" ? (
                <Typography component="span" sx={{ color: "text.disabled" }}>
                  Manager or Technician?
                </Typography>
              ) : value === "manager" ? (
                <Typography component="span">Manager</Typography>
              ) : (
                <Typography component="span">Technician</Typography>
              )
            }
            onChange={handleRoleChange}
            inputProps={{ name: "role", "aria-labelledby": "role-label" }}
          >
            <MenuItem value="manager">Manager</MenuItem>
            <MenuItem value="technician">Technician</MenuItem>
          </Select>
        </FormControl>
      </FieldBlock>

      <FieldBlock
        label={role === "manager" ? "Manager" : role === "technician" ? "Technician" : "User"}
        labelId="user-label"
        hint={role === "" ? "Pick a role first" : undefined}
      >
        <FormControl fullWidth disabled={role === ""} size="medium">
          <Select<DraftId>
            id="user"
            value={id}
            displayEmpty
            renderValue={(value) =>
              value === "" ? (
                <Typography component="span" sx={{ color: "text.disabled" }}>
                  {role === ""
                    ? "Pick a role first"
                    : role === "manager"
                      ? "Select a manager"
                      : "Select a technician"}
                </Typography>
              ) : (
                renderUserOption(value, userOptions)
              )
            }
            onChange={handleIdChange}
            inputProps={{ name: "user", "aria-labelledby": "user-label" }}
          >
            {userOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FieldBlock>

      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={1.5}
        justifyContent="flex-end"
        sx={{ pt: 1 }}
      >
        <Button
          type="submit"
          variant="contained"
          disabled={!isComplete}
          endIcon={<ArrowForwardIcon />}
        >
          Continue
        </Button>
      </Stack>
    </Stack>
  );
}

// Tabular field block: tag (mono "01", "02") + UPPERCASE label + optional hint
// + the actual input. The tag numbers turn the form into a sequential
// document, which reads more deliberately than a stack of unlabelled selects.
// labelId is referenced by the wrapped Select via aria-labelledby — preserves
// screen-reader accessibility after we removed MUI's floating InputLabel.
function FieldBlock({
  label,
  labelId,
  hint,
  children,
}: {
  readonly label: string;
  readonly labelId: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ mb: 1 }}>
        <Typography
          id={labelId}
          component="span"
          sx={{
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "text.primary",
            lineHeight: 1.4,
          }}
        >
          {label}
        </Typography>
        {hint ? (
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", ml: "auto", letterSpacing: 0 }}
          >
            {hint}
          </Typography>
        ) : null}
      </Stack>
      {children}
    </Box>
  );
}

// Render the collapsed-state value for the User select. Looks up the option
// label so the selected display matches what the user saw in the list.
function renderUserOption(
  value: DraftId,
  options: ReadonlyArray<{ value: number; label: string }>,
): React.ReactNode {
  const opt = options.find((o) => o.value === value);
  if (!opt) return null;
  return <Typography component="span">{opt.label}</Typography>;
}
