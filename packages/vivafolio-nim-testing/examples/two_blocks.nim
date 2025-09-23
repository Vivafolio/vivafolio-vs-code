import example_blocks, vivafolio

# Vivafolio two blocks interaction demo in Nim
# This file demonstrates interaction between a color picker and color square

var color = vivafolio_color_picker gui_state"#aabbcc"
# Color square that will reflect the picker's color
vivafolio_square color

# Regular code below
proc main() =
  echo "Vivafolio blocks above will show interactive editors!"

when isMainModule:
  main()
