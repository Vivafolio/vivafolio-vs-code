# Call-site module intentionally triggering a type mismatch when invoking the
# provider proc from bad_provider.nim.

import bad_provider

proc main() =
  let strValue = "oops"     # wrong type: needsInt expects an int
  discard needsInt(strValue)

main()
