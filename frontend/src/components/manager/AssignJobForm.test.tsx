import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { AssignJobForm } from "./AssignJobForm";
import type { Quote, Technician, AssignJobInput } from "@/lib/types";

// Tests for AssignJobForm — the form is pure presentational so we can
// render it without the parent's React Query / mutation context. We
// stub the lists and the onSubmit callback, drive the inputs via RTL,
// and assert on the emitted payload (or the absence of one).

const technicians: readonly Technician[] = [
  { id: 1, name: "Alice Chen", trade: "hvac", createdAt: "2026-01-01T00:00:00Z" },
  {
    id: 2,
    name: "Ben Mitchell",
    trade: "hvac",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const quotes: readonly Quote[] = [
  {
    id: 10,
    reference: "Q-1042",
    summary: "Replace condenser, Smith residence",
    status: "unscheduled",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: 11,
    reference: "Q-1051",
    summary: "Annual service, Patel home",
    status: "unscheduled",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

interface RenderOptions {
  readonly quotes?: readonly Quote[];
  readonly resetCounter?: number;
  readonly submitting?: boolean;
}

function renderForm(onSubmit: (input: AssignJobInput) => void, opts: RenderOptions = {}) {
  return render(
    <AssignJobForm
      technicians={technicians}
      quotes={opts.quotes ?? quotes}
      managerId={100}
      submitting={opts.submitting ?? false}
      lastError={null}
      resetCounter={opts.resetCounter ?? 0}
      onSubmit={onSubmit}
    />,
  );
}

// MUI Select renders as a button-styled combobox. Each Select's value
// container is the element with role="combobox" plus an id matching
// the field — "technician", "quote", "manager", "slot". We find them
// by id so the query is unambiguous regardless of the field label text
// (which can collide with placeholders like "Select a technician").
function getCombobox(id: "technician" | "quote" | "slot"): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`No combobox with id ${id}`);
  return el;
}

async function pickFromCombobox(
  user: ReturnType<typeof userEvent.setup>,
  id: "technician" | "quote" | "slot",
  optionText: string | RegExp,
) {
  await user.click(getCombobox(id));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByText(optionText));
}

async function typeDate(user: ReturnType<typeof userEvent.setup>, ddmmyyyy: string) {
  const input = screen.getByPlaceholderText("DD/MM/YYYY") as HTMLInputElement;
  await user.click(input);
  await user.keyboard(ddmmyyyy);
}

describe("AssignJobForm", () => {
  it("disables submit until every field is filled", () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);
    const submit = screen.getByRole("button", { name: /assign job/i });
    expect(submit).toBeDisabled();
  });

  it("emits the expected payload on a complete happy-path submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    await pickFromCombobox(user, "technician", "Alice Chen");
    await pickFromCombobox(user, "quote", "Q-1042");
    await typeDate(user, "15/05/2026");
    await pickFromCombobox(user, "slot", "9:00 AM to 11:00 AM");

    const submit = screen.getByRole("button", { name: /assign job/i });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      technicianId: 1,
      quoteId: 10,
      managerId: 100,
      scheduledDate: "2026-05-15",
      slot: "09:00-11:00",
    });
  });

  it("clears the draft when resetCounter changes (post-success reset)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = renderForm(onSubmit, { resetCounter: 0 });

    await pickFromCombobox(user, "technician", "Alice Chen");
    expect(getCombobox("technician")).toHaveTextContent(/Alice Chen/);

    // Parent bumps the counter — form should snap back to empty.
    rerender(
      <AssignJobForm
        technicians={technicians}
        quotes={quotes}
        managerId={100}
        submitting={false}
        lastError={null}
        resetCounter={1}
        onSubmit={onSubmit}
      />,
    );

    expect(getCombobox("technician")).toHaveTextContent(/Select a technician/);
  });

  it("drops a previously selected quote when it vanishes from the unscheduled list", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = renderForm(onSubmit);

    await pickFromCombobox(user, "quote", "Q-1042");
    expect(getCombobox("quote")).toHaveTextContent(/Q-1042/);

    // Quote 10 just got assigned somewhere else — parent refetches and
    // it disappears from the list. The form's stale-id guard should
    // clear the drafted quoteId in the same render.
    rerender(
      <AssignJobForm
        technicians={technicians}
        quotes={quotes.filter((q) => q.id !== 10)}
        managerId={100}
        submitting={false}
        lastError={null}
        resetCounter={0}
        onSubmit={onSubmit}
      />,
    );

    expect(getCombobox("quote")).toHaveTextContent(/Select an unscheduled quote/);
  });

  it("renders a disabled 'Assigning…' button while submitting=true", () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit, { submitting: true });

    const submit = screen.getByRole("button", { name: /assigning/i });
    expect(submit).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
