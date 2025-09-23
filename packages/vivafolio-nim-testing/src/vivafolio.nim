# Vivafolio Nim Package
# Provides helpers for creating Vivafolio blocks in Nim source code

import macros, json, strformat, strutils

# Template that acts as identity function for gui_state
# This generates the gui_state! syntax that the LSP server can detect
template gui_state* (data: untyped): untyped =
  data

# Convert Nim values to JSON strings for gui_state
proc toJsonString*(value: string): string =
  if value.startsWith("#"):
    return "{\"color\":\"" & value & "\"}"
  else:
    return "{\"value\":\"" & value & "\"}"

proc toJsonString*(value: int): string =
  return "{\"value\":" & $value & "}"

proc toJsonString*(value: float): string =
  return "{\"value\":" & $value & "}"

proc toJsonString*(value: bool): string =
  return "{\"value\":" & $value & "}"

# Macro to create a well-typed VivafolioBlock notification string
proc createVivafolioBlockNotification*(
    blockId: string,
    blockType: string,
    displayMode: string,
    sourceUri: string,
    rangeStartLine: int,
    rangeStartChar: int,
    rangeEndLine: int,
    rangeEndChar: int,
    entityId: string,
    entityGraph: JsonNode,
    supportsHotReload: bool = false,
    initialHeight: int = 200,
    resources: JsonNode = nil,
    dslModule: JsonNode = nil,
    error: JsonNode = nil
): string =

  let rangeNode = %*{
    "start": {"line": rangeStartLine, "character": rangeStartChar},
    "end": {"line": rangeEndLine, "character": rangeEndChar}
  }

  let payload = %*{
    "blockId": blockId,
    "blockType": blockType,
    "displayMode": displayMode,
    "sourceUri": sourceUri,
    "range": rangeNode,
    "entityId": entityId,
    "entityGraph": entityGraph,
    "supportsHotReload": supportsHotReload,
    "initialHeight": initialHeight
  }

  # Add optional fields if present
  if resources != nil:
    payload["resources"] = resources
  if dslModule != nil:
    payload["dslModule"] = dslModule
  if error != nil:
    payload["error"] = error

  return "vivafolio: " & $payload

# Generic wrapper function that takes arbitrary Nim values and converts to entity data format
proc createVivafolioBlock*[T](
    blockId: string,
    blockType: string,
    displayMode: string,
    sourceUri: string,
    rangeStartLine: int,
    rangeStartChar: int,
    rangeEndLine: int,
    rangeEndChar: int,
    entityId: string,
    entityData: T,
    supportsHotReload: bool = false,
    initialHeight: int = 200,
    resources: JsonNode = nil,
    dslModule: JsonNode = nil,
    error: JsonNode = nil
): string =

  let properties: JsonNode = when T is string:
    if entityData.startsWith("#"):
      %*{"color": entityData}
    else:
      %*{"value": entityData}
  elif T is int:
    %*{"value": entityData}
  elif T is float:
    %*{"value": entityData}
  elif T is bool:
    %*{"value": entityData}
  else:
    %*{"value": $entityData}

  let entityGraph = %*{
    "entities": [
      {
        "entityId": entityId,
        "properties": properties
      }
    ],
    "links": []
  }

  return createVivafolioBlockNotification(
    blockId, blockType, displayMode, sourceUri,
    rangeStartLine, rangeStartChar, rangeEndLine, rangeEndChar,
    entityId, entityGraph, supportsHotReload, initialHeight,
    resources, dslModule, error
  )

# Helper function for use in macros to emit VivafolioBlock diagnostics
# This generates a {.hint:} pragma with the vivafolio message that can be detected by LSP
macro emitVivafolioBlock*(
    blockType: static[string],
    entityId: static[string],
    entityData: typed
): untyped =

  # Get location info from instantiation
  let info = instantiationInfo()
  let sourceUri = "file://" & info.filename

  # Create range (approximate)
  let rangeStartLine = info.line - 1
  let rangeStartChar = info.column
  let rangeEndLine = info.line - 1
  let rangeEndChar = info.column + 20

  # Create the notification string
  let notification = createVivafolioBlock(
    blockId = fmt"{entityId}-{info.line}",
    blockType = blockType,
    displayMode = "multi-line",
    sourceUri = sourceUri,
    rangeStartLine = rangeStartLine,
    rangeStartChar = rangeStartChar,
    rangeEndLine = rangeEndLine,
    rangeEndChar = rangeEndChar,
    entityId = entityId,
    entityData = entityData
  )

  # Return the entity data first
  result = entityData

  # Emit diagnostic directly during macro expansion
  let msg = "vivafolio: " & $notification
  when defined(vivafolioEmitDiagnostics):
    error(msg)
  else:
    warning(msg)
