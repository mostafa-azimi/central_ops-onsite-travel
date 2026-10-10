"use client";

import { useState, type FormEvent } from "react";
import type { ManagedPerson } from "@/lib/types";

const COLORS = [
  ["Hero blue", "#3281fd"], ["Blood red", "#9f1d20"], ["Golden orange", "#d89116"],
  ["Green", "#32b76c"], ["Violet", "#8a5cf6"], ["Teal", "#008c95"],
  ["Brand red", "#ef5252"], ["Slate", "#6b7280"],
] as const;

const EMPTY = { email: "", name: "", isTraveler: true, isAdmin: false, color: "#3281fd" };

export function PeopleSettings({ initialPeople, currentEmail }: { initialPeople: ManagedPerson[]; currentEmail: string }) {
  const [people, setPeople] = useState(initialPeople);
  const [form, setForm] = useState(EMPTY);
  const [editingEmail, setEditingEmail] = useState("");
  const [confirmRemove, setConfirmRemove] = useState("");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error" | "working"; message: string } | null>(null);

  function edit(person: ManagedPerson) {
    setEditingEmail(person.email);
    setForm({ email: person.email, name: person.name, isTraveler: person.isTraveler, isAdmin: person.isAdmin, color: person.color });
    setConfirmRemove("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingEmail("");
    setForm(EMPTY);
    setConfirmRemove("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setStatus({ kind: "working", message: "Saving access…" });
    try {
      const response = await fetch("/api/admin/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json()) as { person?: ManagedPerson; message?: string };
      if (!response.ok || !result.person) throw new Error(result.message || "Access could not be saved.");
      setPeople((items) => [...items.filter((person) => person.email !== result.person!.email), result.person!].sort((a, b) => a.name.localeCompare(b.name)));
      setStatus({ kind: "success", message: `${result.person.name} was updated.` });
      reset();
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Access could not be saved." });
    } finally {
      setWorking(false);
    }
  }

  async function remove(person: ManagedPerson) {
    if (confirmRemove !== person.email) {
      setConfirmRemove(person.email);
      setStatus({ kind: "working", message: `Click Remove access again to confirm for ${person.name}.` });
      return;
    }
    setWorking(true);
    try {
      const response = await fetch("/api/admin/people", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: person.email }),
      });
      const result = (await response.json()) as { person?: ManagedPerson; message?: string };
      if (!response.ok || !result.person) throw new Error(result.message || "Access could not be removed.");
      setPeople((items) => items.map((item) => item.email === result.person!.email ? result.person! : item));
      setStatus({ kind: "success", message: `${person.name}'s access was removed.` });
      setConfirmRemove("");
      if (editingEmail === person.email) reset();
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Access could not be removed." });
    } finally {
      setWorking(false);
    }
  }

  const active = people.filter((person) => person.active);
  const inactive = people.filter((person) => !person.active);

  return (
    <div className="people-settings">
      {status && <div className={`submit-status ${status.kind}`} role="status">{status.message}</div>}
      <section className="settings-panel" aria-labelledby="person-form-heading">
        <div className="settings-panel-heading">
          <div><p className="eyebrow">Access directory</p><h2 id="person-form-heading">{editingEmail ? "Edit person" : "Add person"}</h2></div>
          {editingEmail && <button className="filter" type="button" onClick={reset}>Add someone else</button>}
        </div>
        <form className="people-form" onSubmit={save}>
          <label><span>Full name</span><input required maxLength={80} autoComplete="name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Full employee name" /></label>
          <label><span>ShipHero email</span><input required type="email" autoComplete="email" readOnly={Boolean(editingEmail)} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@shiphero.com" /></label>
          <fieldset className="role-options"><legend>Permissions</legend>
            <label><input type="checkbox" checked={form.isTraveler} onChange={(event) => setForm((current) => ({ ...current, isTraveler: event.target.checked }))} /><span><strong>Traveler</strong><small>Can be assigned to visits and shown in travel views.</small></span></label>
            <label><input type="checkbox" checked={form.isAdmin} onChange={(event) => setForm((current) => ({ ...current, isAdmin: event.target.checked }))} /><span><strong>Administrator</strong><small>Can approve visits and manage this directory.</small></span></label>
          </fieldset>
          <label><span>Map color</span><select value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}>{COLORS.map(([label, value]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <div className="person-color-preview"><span style={{ backgroundColor: form.color }} aria-hidden="true" /><span>Traveler marker preview</span></div>
          <div className="form-actions full"><button className="btn-primary" disabled={working || (!form.isTraveler && !form.isAdmin)}>{working ? "Saving…" : editingEmail ? "Save changes" : "Add person"}</button><span>Every change is recorded in the private audit log.</span></div>
        </form>
      </section>

      <section className="settings-panel" aria-labelledby="active-people-heading">
        <div className="settings-panel-heading"><div><p className="eyebrow">Current access</p><h2 id="active-people-heading">{active.length} active people</h2></div></div>
        <div className="people-list">
          {active.map((person) => <article className="person-row" key={person.email}>
            <span className="person-color" style={{ backgroundColor: person.color }} aria-hidden="true" />
            <div><h3>{person.name}{person.email === currentEmail ? " (you)" : ""}</h3><p>{person.email}</p><div className="role-badges">{person.isTraveler && <span>Traveler</span>}{person.isAdmin && <span>Administrator</span>}</div></div>
            <div className="person-actions"><button className="filter" type="button" onClick={() => edit(person)}>Edit</button><button className="danger-button" type="button" disabled={working} onClick={() => void remove(person)}>{confirmRemove === person.email ? "Confirm removal" : "Remove access"}</button></div>
          </article>)}
        </div>
      </section>

      {inactive.length > 0 && <details className="settings-panel inactive-people"><summary>{inactive.length} inactive {inactive.length === 1 ? "person" : "people"}</summary><div className="people-list">{inactive.map((person) => <article className="person-row" key={person.email}><span className="person-color" style={{ backgroundColor: person.color }} aria-hidden="true" /><div><h3>{person.name}</h3><p>{person.email}</p></div><button className="filter" type="button" onClick={() => edit(person)}>Restore or edit</button></article>)}</div></details>}
    </div>
  );
}
