import macros

macro emitVivafolioBlock(info: static[tuple[filename: string, line: int, column: int]]): untyped =
  let n = newLit(0)
  n.setLineInfo("/", 0, 0)
  hint("VivafolioBlock", n)

  result = newNimNode(nnkDiscardStmt).add(newNilLit())

template foo(): int =
  emitVivafolioBlock instantiationInfo(-1, fullPaths = true)
  10

proc main =
  echo foo()

main()
