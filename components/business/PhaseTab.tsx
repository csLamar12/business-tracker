"use client";

import { useState } from "react";
import { apiJson } from "@/lib/apiClient";
import MentionInput from "../MentionInput";
import { PHASES } from "@/lib/types";
import type { Business, Phase } from "@/lib/types";

export default function PhaseTab({
  business,
  names,
  onChanged,
}: {
  business: Business;
  names: string[];
  onChanged: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(business.phase);
  const [notes, setNotes] = useState(business.phaseNotes);
  const [saved, setSaved] = useState(false);

  async function save() {
    await apiJson(`/api/businesses/${business._id}`, "PATCH", {
      phase,
      phaseNotes: notes,
    }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onChanged();
  }

  return (
    <div className="max-w-2xl p-6">
      <h3 className="mb-2 font-semibold">Current Phase of Operations</h3>
      <select className="input mb-4 max-w-xs" value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>
        {PHASES.map((p) => <option key={p}>{p}</option>)}
      </select>

      <label className="label">Notes / what&apos;s happening now (@ to mention)</label>
      <MentionInput value={notes} onChange={setNotes} names={names} multiline />

      <div className="mt-4 flex items-center gap-3">
        <button className="btn" onClick={save}>Save Phase</button>
        {saved && <span className="text-sm" style={{ color: "var(--green-text)" }}>Saved</span>}
      </div>
    </div>
  );
}
