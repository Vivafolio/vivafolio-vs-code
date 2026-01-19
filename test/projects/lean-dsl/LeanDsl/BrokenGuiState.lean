import LeanDsl.VivDsl

open LeanDsl

/-
  Intentionally malformed gui_state payload to exercise syntax-error diagnostics.
-/
vivafolio_picker!() gui_state! r##"{"value":{"color":"#123456"},}"##
