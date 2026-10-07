import { MANUS_PROFILES, MANUS_PROFILE_LABEL } from "@shared/models.ts";

/** The Manus agent_profile <option>s every picker shares. Drop it inside a <select>. */
export default function ManusProfileOptions() {
  return (
    <>
      {MANUS_PROFILES.map((p) => (
        <option key={p} value={p}>
          {MANUS_PROFILE_LABEL[p]}
        </option>
      ))}
    </>
  );
}
