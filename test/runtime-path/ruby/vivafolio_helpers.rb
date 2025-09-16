#!/usr/bin/env ruby
# Vivafolio Runtime Path Helpers for Ruby
#
# This module provides helper methods for creating VivafolioBlock notifications
# that work with the Vivafolio VS Code extension's runtime path.

require 'json'

module VivafolioHelpers
  def self.extract_gui_state_from_source(source_lines, block_type)
    """
    Extract gui_state from source code comments for the given block type.

    Args:
        source_lines: Array of source code lines
        block_type: Type of block ('picker' or 'square')

    Returns:
        Hash: Extracted state or default state
    """
    source_lines.each do |line|
      # Look for gui_state comments like: # gui_state: {"color": "#ff0000"}
      match = line.match(/# gui_state:\s*(\{.*\})/)
      if match
        begin
          return JSON.parse(match[1])
        rescue JSON::ParserError
          # Continue to next line if parsing fails
        end
      end
    end

    # Default states
    case block_type
    when 'picker'
      {"properties" => {"color" => "#3700ff"}}  # Default blue
    when 'square'
      {"properties" => {"color" => "#3700ff"}}  # Match picker default
    else
      {"properties" => {}}
    end
  end

  def self.emit_vivafolioblock_notification(block_id, block_type, entity_id, initial_graph, resources = nil)
    """
    Emit a VivafolioBlock notification to stdout for the Vivafolio extension.

    Args:
        block_id: Unique identifier for this block instance
        block_type: Type of block (e.g., 'color-picker', 'color-square')
        entity_id: Entity identifier
        initial_graph: Initial graph data with entities and links
        resources: Optional array of resources (HTML files, etc.)
    """
    notification = {
      "blockId" => block_id,
      "blockType" => "https://blockprotocol.org/@blockprotocol/types/block-type/#{block_type}/",
      "displayMode" => "multi-line",
      "entityId" => entity_id,
      "initialGraph" => initial_graph,
      "supportsHotReload" => false,
      "initialHeight" => 200
    }

    notification["resources"] = resources if resources

    # Emit as JSON line to stdout
    puts notification.to_json
    STDOUT.flush
  end

  def vivafolio_picker(block_id = "picker-123")
    """
    Create a color picker block.

    Args:
        block_id: Unique identifier for this picker instance
    """
    # Get the caller's source code to extract gui_state
    caller_location = caller_locations(1, 1).first
    source_lines = File.readlines(caller_location.absolute_path)

    # Extract current color from gui_state comment
    current_state = VivafolioHelpers.extract_gui_state_from_source(source_lines, 'picker')
    color = current_state.dig('properties', 'color') || '#3700ff'

    entity_id = "entity-#{block_id}"

    initial_graph = {
      "entities" => [{
        "entityId" => entity_id,
        "properties" => {
          "color" => color
        }
      }],
      "links" => []
    }

    # Find HTML resource file
    html_path = File.join(__dir__, "../../resources/blocks/color-picker.html")
    if File.exist?(html_path)
      resources = [{
        "logicalName" => "index.html",
        "physicalPath" => "file://#{File.absolute_path(html_path)}",
        "cachingTag" => "picker-v1"
      }]
      VivafolioHelpers.emit_vivafolioblock_notification(block_id, "color-picker", entity_id, initial_graph, resources)
    else
      VivafolioHelpers.emit_vivafolioblock_notification(block_id, "color-picker", entity_id, initial_graph)
    end
  end

  def vivafolio_square(block_id = "square-456")
    """
    Create a color square block that syncs with the picker.

    Args:
        block_id: Unique identifier for this square instance
    """
    # Get the caller's source code to extract gui_state
    caller_location = caller_locations(1, 1).first
    source_lines = File.readlines(caller_location.absolute_path)

    # Extract current color from gui_state comment
    current_state = VivafolioHelpers.extract_gui_state_from_source(source_lines, 'square')
    color = current_state.dig('properties', 'color') || '#3700ff'

    entity_id = "entity-#{block_id}"

    initial_graph = {
      "entities" => [{
        "entityId" => entity_id,
        "properties" => {
          "color" => color
        }
      }],
      "links" => []
    }

    # Find HTML resource file
    html_path = File.join(__dir__, "../../resources/blocks/color-square.html")
    if File.exist?(html_path)
      resources = [{
        "logicalName" => "index.html",
        "physicalPath" => "file://#{File.absolute_path(html_path)}",
        "cachingTag" => "square-v1"
      }]
      VivafolioHelpers.emit_vivafolioblock_notification(block_id, "color-square", entity_id, initial_graph, resources)
    else
      VivafolioHelpers.emit_vivafolioblock_notification(block_id, "color-square", entity_id, initial_graph)
    end
  end

  def gui_state(state_hash)
    """
    Helper to format gui_state for inclusion in source code.
    This is mainly for documentation - the actual state is stored in comments.

    Args:
        state_hash: State hash to format

    Returns:
        String: Formatted state string for use in source code
    """
    "# gui_state: #{state_hash.to_json}"
  end
end
