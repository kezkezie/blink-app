// Server-only test-mode authorization.
//
// Two hard rules, both required to close the production fixture/backdoor risk:
//   1. It is NEVER active in a production runtime. `NODE_ENV === "production"`
//      short-circuits to false regardless of any env var or request header, so a
//      production build ignores the fixture header and the signup auto-sign-in.
//   2. Authorization comes from a server-only env var (`BLINKSPOT_TEST_MODE`),
//      never a `NEXT_PUBLIC_*` variable (which is inlined into the client bundle)
//      and never a client-supplied header on its own. A header can only *select*
//      fixture behaviour inside an already-authorized non-production runtime.
//
// This is intentionally not a shared secret and not a persistent backdoor: there
// is no value a client can send that turns test behaviour on in production.

export function testModeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.BLINKSPOT_TEST_MODE === "1";
}

type HeaderReader = { get(name: string): string | null };

export function isTestFixtureRequest(headers: HeaderReader): boolean {
  return testModeEnabled() && headers.get("x-blinkspot-test-fixture") === "1";
}
