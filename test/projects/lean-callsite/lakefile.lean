import Lake
open Lake DSL

package «lean-callsite»

@[default_target]
lean_lib LeanCallsite where
  roots := #[`Defs, `Call]
