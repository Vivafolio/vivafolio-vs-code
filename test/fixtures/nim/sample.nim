import std/strformat

## Emit a compile-time error with a Vivafolio payload to ensure diagnostic
static:
  {.error: "vivafolio: {\\\"viewstate\\\": {\\\"value\\\": 123}, \\\"height\\\": 100}".}

proc main() =
  echo fmt"Hello Nim"

when isMainModule:
  main()


