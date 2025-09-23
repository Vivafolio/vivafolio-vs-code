import macros

macro emitVivafolioBlock(info: static[tuple[filename: string, line: int, column: int]],
                         withRuntimeCode: static[bool] = false): untyped =
  let n = newLit(0)
  n.setLineInfo("/", 0, 0)
  hint("VivafolioBlock", n)

  result = if withRuntimeCode:
    newNimNode(nnkCall(bindSym "echo", ))
  else:
    newNimNode(nnkDiscardStmt).add(newNilLit())

template foo(): int =
  emitVivafolioBlock(instantiationInfo(-1, fullPaths = true), withRuntimeCode = false)
  10

proc main =
  echo foo()

main()
