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
          # Linux only: pin specific Insiders builds per-arch; fall back to upstream endpoint elsewhere.
          src =
            if pkgs.stdenv.hostPlatform.system == "x86_64-linux" then
              pkgs.fetchurl {
                url = "https://update.code.visualstudio.com/commit:f220831ea2d946c0dcb0f3eaa480eb435a2c1260/linux-x64/insider";
                name = "vscode-insiders-linux-x64.tar.gz";
                sha256 = "14i07ccd76dgi87ds2fp0x5i64n07hig779bsgn5d77qnbvy01hy";
              }
            else if pkgs.stdenv.hostPlatform.system == "aarch64-linux" then
              pkgs.fetchurl {
                url = "https://update.code.visualstudio.com/commit:d226a2a497b928d78aa654f74c8af5317d3becfb/linux-arm64/insider";
                name = "vscode-insiders-linux-arm64.deb";
                sha256 = "1c8lv3z13wc1rrcj5v9bgng0vvw4dl040jxbz030w8p0l92a6bij";
              }
            else old.src;
          pname = "vscode-insiders";
          name = "${pname}-${version}";
        });
    in
      let
        crystallineBin =
          if pkgs.stdenv.hostPlatform.system == "x86_64-linux" then
            pkgs.stdenvNoCC.mkDerivation {
              pname = "crystalline";
              version = "0.17.1";
              src = pkgs.fetchurl {
                url = "https://github.com/elbywan/crystalline/releases/download/v0.17.1/crystalline_x86_64-unknown-linux-musl.gz";
                sha256 = "sha256-21G0+fcIx6taXlzslEN4OkP+yrIzNy3VP3q9D+IPPA4=";
              };
              dontUnpack = true;
              nativeBuildInputs = [ pkgs.gzip ];
              installPhase = ''
                mkdir -p $out/bin
                gzip -dc $src > $out/bin/crystalline
                chmod +x $out/bin/crystalline
              '';
              meta = with pkgs.lib; {
                description = "Binary release of crystalline Crystal language server";
                platforms = [ "x86_64-linux" ];
                homepage = "https://github.com/elbywan/crystalline";
              };
            }
          else
            pkgs.crystalline;
        dcdBin =
          if pkgs.stdenv.hostPlatform.system == "x86_64-linux" then
            pkgs.stdenvNoCC.mkDerivation {
              pname = "dcd";
              version = "0.15.2";
              src = pkgs.fetchurl {
                url = "https://github.com/dlang-community/DCD/releases/download/v0.15.2/dcd-v0.15.2-linux-x86_64.tar.gz";
                sha256 = "1xg8irbwblaghgshcmjj1my33y09x3w3y2wilf4y2jq8b380nnfi";
              };
              dontUnpack = true;
              nativeBuildInputs = [ pkgs.gnutar pkgs.gzip ];
              installPhase = ''
                mkdir -p $out/bin
                tar -xzf $src -C $out/bin
                chmod +x $out/bin/dcd-server $out/bin/dcd-client
              '';
              meta = with pkgs.lib; {
                description = "Prebuilt D Completion Daemon binaries";
                homepage = "https://github.com/dlang-community/DCD";
                platforms = [ "x86_64-linux" ];
              };
            }
          else
            pkgs.dcd;
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
            dcdBin
            # Rust
            rust-analyzer
            cargo
            rustc
            # Zig
            zig
            zls
            # Crystal
            crystal
            crystallineBin
            shards
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
            chromium
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
