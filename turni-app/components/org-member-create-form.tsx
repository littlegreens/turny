"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppToast } from "@/components/app-toast-provider";
import { ProfessionalRoleInput } from "@/components/professional-role-input";

type Props = {
  orgSlug: string;
  canManage: boolean;
  canAssignAdmin: boolean;
  professionalRoleSuggestions: string[];
};

export function OrgMemberCreateForm({ orgSlug, canManage, canAssignAdmin, professionalRoleSuggestions }: Props) {
  const { showToast } = useAppToast();
  const roleLabel: Record<string, string> = {
    ADMIN: "RESPONSABILE",
    MANAGER: "MANAGER",
    WORKER: "WORKER",
  };
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [professionalRole, setProfessionalRole] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>(["WORKER"]);
  const [loading, setLoading] = useState(false);

  function toggleRole(role: string) {
    if (roles.includes(role)) {
      if (roles.length === 1) return;
      setRoles(roles.filter((r) => r !== role));
      return;
    }
    setRoles([...roles, role]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setLoading(true);

    const response = await fetch(`/api/orgs/${orgSlug}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, username, professionalRole, email, password, roles }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      showToast("error", payload.error ?? "Invito non riuscito");
      setLoading(false);
      return;
    }

    setFirstName("");
    setLastName("");
    setUsername("");
    setProfessionalRole("");
    setEmail("");
    setPassword("");
    setRoles(["WORKER"]);
    setLoading(false);
    router.refresh();
  }

  return (
    <form className="row g-3 mt-2" onSubmit={handleSubmit}>
      <div className="col-md-4">
        <label className="form-label small mb-1">Nome</label>
        <input
          className="form-control input-underlined"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={!canManage || loading}
          required
        />
      </div>
      <div className="col-md-4">
        <label className="form-label small mb-1">Cognome (opzionale)</label>
        <input
          className="form-control input-underlined"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={!canManage || loading}
        />
      </div>
      <div className="col-md-4">
        <label className="form-label small mb-1">Username</label>
        <input
          className="form-control input-underlined"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={!canManage || loading}
          placeholder="Es. mario.rossi"
          required
        />
      </div>
      <div className="col-md-4">
        <label className="form-label small mb-1">Email utente</label>
        <input
          className="form-control input-underlined"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!canManage || loading}
          required
        />
      </div>
      <div className="col-md-6">
        <label className="form-label small mb-1">Ruolo professionale</label>
        <ProfessionalRoleInput
          name="professional-role-new-member"
          className="form-control input-underlined"
          value={professionalRole}
          onChange={setProfessionalRole}
          suggestions={professionalRoleSuggestions}
          disabled={!canManage || loading}
          placeholder="Es. Medico, Infermiere"
        />
      </div>
      <div className="col-md-6">
        <label className="form-label small mb-1">Password login</label>
        <input
          type="password"
          className="form-control input-underlined"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!canManage || loading}
          required
          minLength={8}
        />
      </div>
      <div className="col-12">
        <label className="form-label small mb-1 d-block">Ruoli (multipli)</label>
        <div className="d-flex flex-wrap gap-2">
          {(canAssignAdmin ? ["ADMIN", "MANAGER", "WORKER"] : ["MANAGER", "WORKER"]).map((role) => (
            <button
              key={role}
              type="button"
              className={`btn btn-sm ${roles.includes(role) ? "btn-success" : "btn-outline-success"}`}
              onClick={() => toggleRole(role)}
              disabled={!canManage || loading}
            >
              {roleLabel[role] ?? role}
            </button>
          ))}
        </div>
      </div>
      <div className="col-12 pt-2 pb-1 d-grid">
        <button className="btn btn-success" type="submit" disabled={!canManage || loading}>
          {loading ? "Creazione..." : "Crea membro"}
        </button>
      </div>
      {!canManage ? <p className="small text-secondary mb-0">Non hai permessi per gestire membri.</p> : null}
    </form>
  );
}
