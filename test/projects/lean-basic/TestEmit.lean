import Lean
open Lean Elab Command
syntax (name := emitErrorCmd) "#emit_error " str : command
 @[command_elab emitErrorCmd]
 def elabEmitErrorCmd : CommandElab := fun stx => do
   match stx with
   | `(command| #emit_error $s:str) =>
     throwError (.ofFormat (format s.getString))
   | _ => throwError "invalid syntax"

 #emit_error "vivafolio: { \"viewstate\": { \"value\": 7 }, \"height\": 120 }"
