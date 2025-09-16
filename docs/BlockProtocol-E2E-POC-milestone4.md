# Block Protocol Milestone 4 – Integration Report (2025-09-16)

## Goal
Integrate an official Block Protocol block (e.g., `@blocks/feature-showcase`) into the Vivafolio POC so the iframe scenario loads the same assets and initialization flow described in `docs/spec/BlockProtocol-in-Vivafolio.md`.

## Environment Summary
- Host project dev shell: `flake.nix` (includes Node.js 22, added Yarn 1.22 in `flake.nix:70`).
- Block Protocol source: vendored git submodule `third_party/blockprotocol` (commit `c76b0dea` as checked out locally).
- Target block workspace: `third_party/blockprotocol/blocks/feature-showcase`.

## Actions Attempted
1. **Direct npm install inside the block workspace**  
   ```bash
   cd third_party/blockprotocol/blocks/feature-showcase
   npm install
   ```
   - Result: dependency resolution failure (`@twind/next` peer‑depends on `next@<=12`, but the workspace pins `next@13.1.6`).  
     See `2025-09-16T15_13_58_767Z-eresolve-report.txt` under `~/.npm/_logs/`.

2. **npm workspaces install from the monorepo root**  (`npm install --workspaces --legacy-peer-deps`)  
   - Result: continues past peer dependency warnings but fails because workspace build steps invoke Yarn scripts (`yarn build`) and Yarn was not in the environment (`command sh -c yarn build`).  
   - Output reference: `2025-09-16T15_14_56_766Z-debug-0.log`.

3. **Add Yarn to the Nix shell (`flake.nix:70`)** and retry the workspace install under `nix develop`.  
   Command:  
   ```bash
   nix develop -c bash -lc 'cd third_party/blockprotocol && npm install --workspaces --legacy-peer-deps'
   ```
   - Result: Yarn is invoked automatically but the monorepo build fails during `yarn build` in `libs/@local/internal-api-client-generator/typescript`.  
   - TypeScript errors cite mismatched global typings (`@types/mocha`, `DomElement`, `ParentNode` missing).  
   - Log reference: `~/.npm/_logs/2025-09-16T15_19_20_281Z-debug-0.log` lines 16367‑16367.

4. **Attempt Yarn install across the monorepo** (`yarn install --ignore-engines --frozen-lockfile`).  
   - Added `.npmrc` overrides had no effect; the command fails for the same reasons as step 3 (TypeScript compilation in the internal API generator).

## Current Blockers
- The Block Protocol monorepo builds internal tooling during install; the TypeScript projects expect browser DOM typings and Mocha globals that clash with the default `tsconfig` when compiled under Node 22.
- Without completing the workspace build, we cannot easily grab prebuilt block bundles (e.g., `dist/index.js`, manifest JSON) for reuse in the Vivafolio host.

## Options & Questions for Guidance
1. **Use published packagesinstead?**  
   Should we skip the monorepo build and rely on the published npm packages (`@blockprotocol/core`, `@blocks/feature-showcase`)? This would avoid the workspace install entirely, but we need to confirm the expected asset structure and any build steps to produce static `dist/` bundles.

2. **Partial workspace build?**  
   Is there a supported way to build only the `blocks/feature-showcase` package without compiling the entire monorepo tooling (e.g., bootstrapping with `yarn workspaces focus` or `pnpm`)? Any documentation on recommended workflow would help.

3. **TypeScript typing conflicts**  
   The failure logs show duplicate global declarations (`@types/mocha` vs. block tooling). Guidance on patching or pinning the expected toolchain (e.g., using `yarn berry` or specific Node version) would unblock the monorepo build path.

4. **Prebuilt artefacts**  
   Does the Block Protocol repo ship prebuilt block bundles (e.g., under GitHub releases) that we can vendor directly without building from source?

## Next Steps (Pending Guidance)
- Clarify which of the above approaches the Block Protocol maintainers recommend for sandbox usage.
- Once artefacts are available, update the Milestone 3 scenario to load real resources and implement the spec-defined `initialize` / `capabilities` handshake.

Please advise on the preferred path forward or provide instructions for building the `feature-showcase` block in isolation.
