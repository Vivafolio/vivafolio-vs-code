{
  description = "Vivafolio VS Code extension dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    # Alternative Nim LSP and toolchain overlay (nimlangserver via metacraft-labs)
    nix-nim-dev.url = "github:metacraft-labs/nix-nim-development";
    # TODO: Consider pinning additional Nim versions and nimlangserver variants for matrix testing,
    # to mitigate nimsuggest/langserver version mismatches.
  };

  outputs = { self, nixpkgs, flake-utils, nix-nim-dev }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
        overlays = [ nix-nim-dev.overlays.default ];
        };
      lib = pkgs.lib;
      # Explicit Insiders derivation on Linux; keep upstream override on macOS where it works.
      vscodeInsiders = if pkgs.stdenv.isDarwin then
        pkgs.vscode.override { isInsiders = true; }
      else
        (pkgs.vscode.override { isInsiders = true; }).overrideAttrs (old: rec {
          version = "latest";
          # Linux only: pin x86_64 to a specific dbazure snapshot, fall back to upstream endpoint if needed.
          src =
            if pkgs.stdenv.hostPlatform.system == "x86_64-linux" then
              pkgs.fetchurl {
                urls = [
                  "https://vscode.download.prss.microsoft.com/dbazure/download/insider/828519ca2437c1d96a6ad4923754ac666377ac99/code-insider-x64-1762508289.tar.gz"
                  "https://code.visualstudio.com/sha/download?build=insider&os=linux-x64"
                ];
                name = "vscode-insiders-linux-x64.tar.gz";
                sha256 = "sha256-a98/l2AKSaZNQ1Bu/Kh+Woxa/3NbgORGc+LhooM0Suw=";
              }
            else (
              let
                isAarch64 = pkgs.stdenv.hostPlatform.isAarch64 or (pkgs.system == "aarch64-linux");
                osParam = if isAarch64 then "linux-arm64" else "linux-x64";
                name = "vscode-insiders-${osParam}.tar.gz";
                url = "https://code.visualstudio.com/sha/download?build=insider&os=${osParam}";
              in pkgs.fetchurl ({ inherit url name; } //
                   (if pkgs.stdenv.hostPlatform.system == "aarch64-linux" then {
                     sha256 = "sha256-pryuJPBxDvxS+pkrDWioiFghs+QNqge+iQvcwCUB0dg=";
                   } else {
                     sha256 = lib.fakeSha256;
                   }))
            );
          pname = "vscode-insiders";
          name = "${pname}-${version}";
        });
    in
      let
        playwrightLibs = with pkgs; [
          glib
          gtk3
          nspr
          nss
          dbus
          atk
          at-spi2-atk
          at-spi2-core
          expat
          xorg.libX11
          xorg.libXcomposite
          xorg.libXdamage
          xorg.libXext
          xorg.libXfixes
          xorg.libXrandr
          mesa
          libxcb
          libxkbcommon
          udev
          alsa-lib
        ];
      in {
        devShells.default = pkgs.mkShell {
          packages = (with pkgs; [
            nodejs_22
            typescript
            bashInteractive
            gdb
            # Lean toolchain (lake, lean4) to run lean connectivity
            lean4
            # Nim runtime and tools (nim/nimsuggest). We may need multiple Nim versions in CI.
            nim
            nimble
            nimlsp
            # Nim language server from overlay
            pkgs.metacraft-labs.langserver
          ] ++ [
            # D toolchain + serve-d
            ldc
            dub
            serve-d
            # Rust
            rust-analyzer
            cargo
            rustc
            # Zig
            zig
            zls
            # Crystal
            crystal
            crystalline
            # Python for runtime path testing
            python3
            python3Packages.pip
            # Ruby for runtime path testing
            ruby
            bundler
            # Julia for runtime path testing
            julia-bin
            # R for runtime path testing
            R
            rPackages.devtools
            # JavaScript/Node.js for runtime path testing (already have nodejs_22 above)
            # WebdriverIO testing dependencies
            chromedriver
            chromium
            selenium-server-standalone
            xorg.xorgserver # provides Xvfb for headless VS Code on Linux
            # Virtual framebuffer for headless GUI testing in CI (Linux only)
            # xvfb-run  # Not available on macOS
            # VS Code Insiders is used only for manual testing
            # @vscode/test-electron downloads VS Code for the automated tests.
            vscodeInsiders
            yarn
          ]) ++ playwrightLibs;
          shellHook = ''
            echo "Vivafolio dev shell: Node $(node -v)"
            # Agents note: This shell is intentionally minimal and self-contained for Vivafolio tests.
            # In CI we may instantiate multiple shells to test different Nim versions and LSP variants.
            export DC=ldc2
            export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath playwrightLibs}:$LD_LIBRARY_PATH
            export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=${pkgs.chromium}/bin/chromium
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
          '';
      };
    });
}
