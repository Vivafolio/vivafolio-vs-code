import Lean

open Lean Elab Command

syntax (name := emitVivWarn) "#emit_viv_warn " str : command
syntax (name := emitVivError) "#emit_viv_error " str : command

@[command_elab emitVivWarn] def elabEmitVivWarn : CommandElab := fun stx => do
  match stx with
  | `(command| #emit_viv_warn $msg:str) =>
      Lean.logWarningAt stx (Lean.MessageData.ofFormat s!"{msg.getString}")
  | _ => throwErrorAt stx "#emit_viv_warn expected a string literal"

@[command_elab emitVivError] def elabEmitVivError : CommandElab := fun stx => do
  match stx with
  | `(command| #emit_viv_error $msg:str) =>
      throwErrorAt stx (Lean.MessageData.ofFormat s!"{msg.getString}")
  | _ => throwErrorAt stx "#emit_viv_error expected a string literal"
