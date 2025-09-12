import Lean
import «lean-callsite».Defs

-- At the call-site, trigger the diagnostic by using the macro from another module
#emit_warn "hello from callsite"

