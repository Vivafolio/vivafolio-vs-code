import LeanDsl.VivDsl

open LeanDsl

/-
  Demonstrates valid Vivafolio DSL usage in Lean.
-/
vivafolio_picker!() gui_state! r##"{"height":160,"color":"#19dee1"}"##

vivafolio_square!() gui_state! r##"{"color":"#19dee1","height":200}"##
