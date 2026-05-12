"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  type SelectChangeEvent,
} from "@mui/material";
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
            label: `${t.name} - ${t.trade}`,
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
        <CircularProgress size={32} />
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
    <Stack component="form" spacing={2.5} onSubmit={handleSubmit} noValidate>
      <FormControl fullWidth>
        <InputLabel id="role-label">Role</InputLabel>
        <Select<DraftRole>
          labelId="role-label"
          id="role"
          value={role}
          label="Role"
          onChange={handleRoleChange}
          inputProps={{ name: "role" }}
        >
          <MenuItem value="manager">Manager</MenuItem>
          <MenuItem value="technician">Technician</MenuItem>
        </Select>
      </FormControl>

      <FormControl fullWidth disabled={role === ""}>
        <InputLabel id="user-label">
          {role === "manager"
            ? "Manager"
            : role === "technician"
              ? "Technician"
              : "User"}
        </InputLabel>
        <Select<DraftId>
          labelId="user-label"
          id="user"
          value={id}
          label={
            role === "manager"
              ? "Manager"
              : role === "technician"
                ? "Technician"
                : "User"
          }
          onChange={handleIdChange}
          inputProps={{ name: "user" }}
        >
          {userOptions.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={1.5}
        justifyContent="flex-end"
        sx={{ pt: 1 }}
      >
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={!isComplete}
        >
          Continue
        </Button>
      </Stack>
    </Stack>
  );
}
