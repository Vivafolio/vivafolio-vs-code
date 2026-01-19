import Lean

open Lean Elab Command

namespace LeanDsl

structure VivBlock where
  blockType : String
  blockId   : String
  deriving Inhabited

private def throwGuiStateError (stx : Syntax) (cfg : VivBlock) (details : String) : CommandElabM Unit := do
  let err := Json.mkObj [
    ("error", Json.mkObj [
      ("kind", Json.str "gui_state_syntax_error"),
      ("details", Json.str details)
    ]),
    ("blockType", Json.str cfg.blockType),
    ("blockId", Json.str cfg.blockId)
  ]
  throwErrorAt stx s!"vivafolio: {err.compress}"

private def makeEntityGraph (cfg : VivBlock) (state : Json) : Json := Id.run do
  let entity := Json.mkObj [
    ("entityId", Json.str cfg.blockId),
    ("properties", state)
  ]
  Json.mkObj [
    ("entities", Json.arr #[entity]),
    ("links", Json.arr #[])
  ]

private def emitVivWarning (stx : Syntax) (cfg : VivBlock) (state : Json) : CommandElabM Unit := do
  let diag := Json.mkObj [
    ("blockType", Json.str cfg.blockType),
    ("blockId", Json.str cfg.blockId),
    ("languageId", Json.str "lean"),
    ("viewstate", state),
    ("entityGraph", makeEntityGraph cfg state)
  ]
  logWarningAt stx (MessageData.ofFormat s!"vivafolio: {diag.compress}")

private def handleGuiState (stx : Syntax) (cfg : VivBlock) (raw : TSyntax `str) : CommandElabM Unit := do
  let rawStr := raw.getString
  match Json.parse rawStr with
  | .error err => throwGuiStateError stx cfg err
  | .ok (.obj kvs) =>
      emitVivWarning stx cfg (.obj kvs)
  | .ok _ =>
      throwGuiStateError stx cfg "gui_state must be a JSON object"

syntax (name := vivPicker) "vivafolio_picker!()" "gui_state!" str : command

@[command_elab vivPicker] def elabVivPicker : CommandElab := fun stx => do
  match stx with
  | `(command| vivafolio_picker!() gui_state! $payload:str) =>
      handleGuiState stx { blockType := "picker", blockId := "lean/picker/demo" } payload
  | _ => throwErrorAt stx "invalid vivafolio_picker! invocation"

syntax (name := vivSquare) "vivafolio_square!()" "gui_state!" str : command

@[command_elab vivSquare] def elabVivSquare : CommandElab := fun stx => do
  match stx with
  | `(command| vivafolio_square!() gui_state! $payload:str) =>
      handleGuiState stx { blockType := "square", blockId := "lean/square/demo" } payload
  | _ => throwErrorAt stx "invalid vivafolio_square! invocation"

end LeanDsl
