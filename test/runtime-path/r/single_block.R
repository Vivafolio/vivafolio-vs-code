# Vivafolio R Runtime Path Demo - Single Block
#
# This program demonstrates a single color picker block using the Vivafolio runtime path.
#
# Usage:
# 1. Open this file in VS Code with Vivafolio extension
# 2. Press Ctrl+Shift+R to execute
# 3. Interactive color picker will appear inline

source("vivafolio_helpers.R")

# Vivafolio single block demo
vivafolio_picker()  # gui_state: {"properties":{"color":"#ff0000"}}

# Regular R code below
cat("Vivafolio color picker above will show interactive editor!\n")
cat("Pick a color and see the gui_state comment update automatically.\n")
