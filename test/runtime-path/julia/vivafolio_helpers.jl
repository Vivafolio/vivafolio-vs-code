# Vivafolio Runtime Path Helpers for Julia
#
# This module provides helper functions for creating VivafolioBlock notifications
# that work with the Vivafolio VS Code extension's runtime path.

"""
    extract_gui_state_from_source(source_lines, block_type)

Extract gui_state from source code comments for the given block type.

# Arguments
- `source_lines`: Array of source code lines
- `block_type`: Type of block ("picker" or "square")

# Returns
- `Dict`: Extracted state or default state
"""
function extract_gui_state_from_source(source_lines, block_type)
  for line in source_lines
    # Look for gui_state comments like: # gui_state: {"color": "#ff0000"}
    m = match(r"# gui_state:\s*(\{.*\})", line)
    if m !== nothing
      # Simple parsing for our specific format - extract color value
      color_match = match(r"\"color\":\s*\"([^\"]+)\"", m[1])
      if color_match !== nothing
        return Dict("properties" => Dict("color" => color_match[1]))
      end
    end
  end

  # Default states
  if block_type == "picker"
    return Dict("properties" => Dict("color" => "#3700ff"))  # Default blue
  elseif block_type == "square"
    return Dict("properties" => Dict("color" => "#3700ff"))  # Match picker default
  else
    return Dict("properties" => Dict())
  end
end

"""
    emit_vivafolioblock_notification(block_id, block_type, entity_id, initial_graph, resources=nothing)

Emit a VivafolioBlock notification to stdout for the Vivafolio extension.

# Arguments
- `block_id`: Unique identifier for this block instance
- `block_type`: Type of block (e.g., "color-picker", "color-square")
- `entity_id`: Entity identifier
- `initial_graph`: Initial graph data with entities and links
- `resources`: Optional array of resources (HTML files, etc.)
"""
function emit_vivafolioblock_notification(block_id, block_type, entity_id, initial_graph, resources=nothing)
  # Manually construct JSON string
  json_str = """{"blockId":"$(block_id)","blockType":"https://blockprotocol.org/@blockprotocol/types/block-type/$(block_type)/","displayMode":"multi-line","entityId":"$(entity_id)","initialGraph":{"entities":[{"entityId":"$(entity_id)","properties":{"color":"$(initial_graph["entities"][1]["properties"]["color"])"}}],"links":[]},"supportsHotReload":false,"initialHeight":200"""

  if resources !== nothing
    json_str *= ""","resources":[{"logicalName":"$(resources[1]["logicalName"])","physicalPath":"$(resources[1]["physicalPath"])","cachingTag":"$(resources[1]["cachingTag"])"}]"""
  end

  json_str *= "}"

  # Emit as JSON to stdout
  println(json_str)
  flush(stdout)
end

"""
    vivafolio_picker(block_id="picker-123")

Create a color picker block.

# Arguments
- `block_id`: Unique identifier for this picker instance
"""
function vivafolio_picker(block_id="picker-123")
  # Get the caller's source code to extract gui_state
  stack = stacktrace()
  if length(stack) >= 2
    caller_frame = stack[2]
    source_file = string(caller_frame.file)
    if isfile(source_file)
      source_lines = readlines(source_file)
      # Extract current color from gui_state comment
      current_state = extract_gui_state_from_source(source_lines, "picker")
      color = get(get(current_state, "properties", Dict()), "color", "#3700ff")
    else
      color = "#3700ff"
    end
  else
    color = "#3700ff"
  end

  entity_id = "entity-$block_id"

  initial_graph = Dict(
    "entities" => [Dict(
      "entityId" => entity_id,
      "properties" => Dict("color" => color)
    )],
    "links" => []
  )

  # Find HTML resource file
  html_path = joinpath(@__DIR__, "../../resources/blocks/color-picker.html")
  if isfile(html_path)
    resources = [Dict(
      "logicalName" => "index.html",
      "physicalPath" => "file://$html_path",
      "cachingTag" => "picker-v1"
    )]
    emit_vivafolioblock_notification(block_id, "color-picker", entity_id, initial_graph, resources)
  else
    emit_vivafolioblock_notification(block_id, "color-picker", entity_id, initial_graph)
  end
end

"""
    vivafolio_square(block_id="square-456")

Create a color square block that syncs with the picker.

# Arguments
- `block_id`: Unique identifier for this square instance
"""
function vivafolio_square(block_id="square-456")
  # Get the caller's source code to extract gui_state
  stack = stacktrace()
  if length(stack) >= 2
    caller_frame = stack[2]
    source_file = string(caller_frame.file)
    if isfile(source_file)
      source_lines = readlines(source_file)
      # Extract current color from gui_state comment
      current_state = extract_gui_state_from_source(source_lines, "square")
      color = get(get(current_state, "properties", Dict()), "color", "#3700ff")
    else
      color = "#3700ff"
    end
  else
    color = "#3700ff"
  end

  entity_id = "entity-$block_id"

  initial_graph = Dict(
    "entities" => [Dict(
      "entityId" => entity_id,
      "properties" => Dict("color" => color)
    )],
    "links" => []
  )

  # Find HTML resource file
  html_path = joinpath(@__DIR__, "../../resources/blocks/color-square.html")
  if isfile(html_path)
    resources = [Dict(
      "logicalName" => "index.html",
      "physicalPath" => "file://$html_path",
      "cachingTag" => "square-v1"
    )]
    emit_vivafolioblock_notification(block_id, "color-square", entity_id, initial_graph, resources)
  else
    emit_vivafolioblock_notification(block_id, "color-square", entity_id, initial_graph)
  end
end

"""
    gui_state(state_dict)

Helper to format gui_state for inclusion in source code.
This is mainly for documentation - the actual state is stored in comments.

# Arguments
- `state_dict`: State dictionary to format

# Returns
- `String`: Formatted state string for use in source code
"""
function gui_state(state_dict)
  color = get(get(state_dict, "properties", Dict()), "color", "#3700ff")
  return "# gui_state: {\"properties\":{\"color\":\"$color\"}}"
end