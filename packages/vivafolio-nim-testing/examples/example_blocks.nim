import macros, vivafolio

type
  Color* = string

macro vivafolio_color_picker*(color: Color): Color =
  # Use emitVivafolioBlock to emit the diagnostic for a color picker block
  let blockType = "https://blockprotocol.org/@vivafolio/types/block-type/color-picker/"
  result = quote do:
    emitVivafolioBlock(`blockType`, "color-picker", `color`)

macro vivafolio_square*(color: Color) =
  # Use emitVivafolioBlock to emit the diagnostic for a color square block
  # Since we don't need to return the color, we can ignore it
  let blockType = "https://blockprotocol.org/@vivafolio/types/block-type/color-square/"
  result = quote do:
    discard emitVivafolioBlock(`blockType`, "color-square", `color`)
