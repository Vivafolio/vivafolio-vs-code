import Lean
open Lean Elab Command
syntax (name := emitWarn) "#emit_warn " str : command
@[command_elab emitWarn] def elabEmitWarn : CommandElab := fun stx => do match stx with | `(command| #emit_warn $s:str) => Lean.logWarning (.ofFormat (format s.getString)) | _ => throwError "invalid"
#emit_warn "hello from connectivity"
