export default function HomePage() {
  return (
    <main>
      <h1>Personal Experience Engine</h1>
      <p>
        P3-S1 runtime slice: first-experience streaming API at{' '}
        <code>POST /api/experience/stream</code>. S2 scope (PD-23, 2026-10-09):
        full Creation (multi-round branches + persistent creation state), full
        Correction (MODIFY + RESTORE_PREVIOUS_VERSION), complete WHAT_IF
        branching (CREATE / SWITCH / ABANDON / RETURN / ADOPT_BRANCH), Minimal
        Memory (short-term + explicit correction / withdrawal), DEEPEN /
        SIMPLIFY / REFRAME, SEARCH, First Experience presentation. Long-term
        memory and cross-session branch persistence: S3 scope
        (S3-SCOPE-PROPOSAL-01, staged 2026-10-10). Implementation authorized by
        P3-S1-IMPL-AUTH-01 + S2 implementation authorizations. Default mode:
        synthetic fixtures (no real LLM provider, no real user data).
      </p>
    </main>
  );
}
