import Lean
import «lean-callsite».Defs

open Lean in
def main : IO Unit := do
  -- Use the symbol that triggers diagnostics at call-site
  let _ := useEmitFromOtherModule
  pure ()

