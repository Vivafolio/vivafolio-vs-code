# Vivafolio Runtime Path Helpers for R
#
# This module provides helper functions for creating VivafolioBlock notifications
# that work with the Vivafolio VS Code extension's runtime path.

library(jsonlite)

#' Extract gui_state from source code comments for the given block type
#'
#' @param source_lines Array of source code lines
#' @param block_type Type of block ("picker" or "square")
#' @return List: Extracted state or default state
extract_gui_state_from_source <- function(source_lines, block_type) {
  for (line in source_lines) {
    # Look for gui_state comments like: # gui_state: {"color": "#ff0000"}
    match <- regexec("# gui_state:\\s*(\\{.*\\})", line)[[1]]
    if (match[1] != -1) {
      tryCatch({
        json_str <- substr(line, match[2], match[2] + attr(match, "match.length")[2] - 1)
        return(fromJSON(json_str))
      }, error = function(e) {
        # Continue to next line if parsing fails
      })
    }
  }

  # Default states
  if (block_type == "picker") {
    return(list(properties = list(color = "#3700ff")))  # Default blue
  } else if (block_type == "square") {
    return(list(properties = list(color = "#3700ff")))  # Match picker default
  } else {
    return(list(properties = list()))
  }
}

#' Emit a VivafolioBlock notification to stdout for the Vivafolio extension
#'
#' @param block_id Unique identifier for this block instance
#' @param block_type Type of block (e.g., "color-picker", "color-square")
#' @param entity_id Entity identifier
#' @param initial_graph Initial graph data with entities and links
#' @param resources Optional list of resources (HTML files, etc.)
emit_vivafolioblock_notification <- function(block_id, block_type, entity_id, initial_graph, resources = NULL) {
  notification <- list(
    blockId = block_id,
    blockType = paste0("https://blockprotocol.org/@blockprotocol/types/block-type/", block_type, "/"),
    displayMode = "multi-line",
    entityId = entity_id,
    entityGraph = initial_graph,
    supportsHotReload = FALSE,
    initialHeight = 200
  )

  if (!is.null(resources)) {
    notification$resources <- resources
  }

  # Emit as JSON line to stdout
  cat(toJSON(notification, auto_unbox = TRUE), "\n")
}

#' Create a color picker block
#'
#' @param block_id Unique identifier for this picker instance (default: "picker-123")
vivafolio_picker <- function(block_id = "picker-123") {
  # For simplicity, use default color
  color <- "#3700ff"

  entity_id <- paste0("entity-", block_id)

  initial_graph <- list(
    entities = list(list(
      entityId = entity_id,
      properties = list(color = color)
    )),
    links = list()
  )

  # Find HTML resource file - use relative path from current working directory
  html_path <- file.path(getwd(), "../../resources/blocks/color-picker.html")
  if (file.exists(html_path)) {
    resources <- list(list(
      logicalName = "index.html",
      physicalPath = paste0("file://", normalizePath(html_path)),
      cachingTag = "picker-v1"
    ))
    emit_vivafolioblock_notification(block_id, "color-picker", entity_id, initial_graph, resources)
  } else {
    emit_vivafolioblock_notification(block_id, "color-picker", entity_id, initial_graph)
  }
}

#' Create a color square block that syncs with the picker
#'
#' @param block_id Unique identifier for this square instance (default: "square-456")
vivafolio_square <- function(block_id = "square-456") {
  # For simplicity, use default color
  color <- "#3700ff"

  entity_id <- paste0("entity-", block_id)

  initial_graph <- list(
    entities = list(list(
      entityId = entity_id,
      properties = list(color = color)
    )),
    links = list()
  )

  # Find HTML resource file - use relative path from current working directory
  html_path <- file.path(getwd(), "../../resources/blocks/color-square.html")
  if (file.exists(html_path)) {
    resources <- list(list(
      logicalName = "index.html",
      physicalPath = paste0("file://", normalizePath(html_path)),
      cachingTag = "square-v1"
    ))
    emit_vivafolioblock_notification(block_id, "color-square", entity_id, initial_graph, resources)
  } else {
    emit_vivafolioblock_notification(block_id, "color-square", entity_id, initial_graph)
  }
}

#' Helper to format gui_state for inclusion in source code
#'
#' @param state_dict State dictionary to format
#' @return String: Formatted state string for use in source code
gui_state <- function(state_dict) {
  return(paste0("# gui_state: ", toJSON(state_dict, auto_unbox = TRUE)))
}
