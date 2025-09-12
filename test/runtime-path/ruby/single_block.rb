#!/usr/bin/env ruby
# Vivafolio Ruby Runtime Path Demo - Single Block
#
# This program demonstrates a single color picker block using the Vivafolio runtime path.
#
# Usage:
# 1. Open this file in VS Code with Vivafolio extension
# 2. Press Ctrl+Shift+R to execute
# 3. Interactive color picker will appear inline

require_relative 'vivafolio_helpers'

# Include the helper methods
include VivafolioHelpers

# Vivafolio single block demo
vivafolio_picker()  # gui_state: {"properties":{"color":"#ff0000"}}

# Regular Ruby code below
if __FILE__ == $0
  puts "Vivafolio color picker above will show interactive editor!"
  puts "Pick a color and see the gui_state comment update automatically."
end
