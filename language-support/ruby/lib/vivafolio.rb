# Vivafolio Ruby Runtime Library
#
# This library provides helper functions for creating VivafolioBlock notifications
# that work with the Vivafolio VS Code extension's runtime path.

require 'json'
require 'digest'

module Vivafolio
  VERSION = '0.1.0'

  class << self
    # Store GUI state values globally
    attr_accessor :state_registry

    def state_registry
      @state_registry ||= {}
    end
  end

  # gui_state() - Store and retrieve GUI state values
  #
  # This function stores the provided value and returns it, allowing it to be used
  # in variable assignments while also making the state available for GUI blocks.
  #
  # @param value [Object] The value to store and return
  # @return [Object] The same value that was passed in
  def self.gui_state(value)
    # Use caller location as a key to associate values with specific code locations
    caller_info = caller(1, 1).first
    if caller_info
      # Extract file and line from caller info
      if caller_info =~ /(.+?):(\d+):/
        key = "#{$1}:#{$2}"
        Vivafolio.state_registry[key] = value
      end
    end

    value
  end

  # Create an interactive color picker block
  #
  # @param color_value [String] Color value (e.g., "#ffffff" or "#ff0000")
  # @return [String] The color value (unchanged)
  def self.color_picker(color_value)
    # Create deterministic IDs based on the color value
    color_hash = Digest::MD5.hexdigest(color_value.to_s)[0...8]
    block_id = "color-picker-#{color_hash}"
    entity_id = "color-entity-#{color_hash}"

    entity_graph = {
      "entities" => [{
        "entityId" => entity_id,
        "properties" => {"color" => color_value}
      }],
      "links" => []
    }

    # Find HTML resource file
    resources = nil
    html_path = File.join(__dir__, '../../../blocks/color-picker/dist/index.html')
    if File.exist?(html_path)
      resources = [{
        "logicalName" => "index.html",
        "physicalPath" => "file://#{File.absolute_path(html_path)}",
        "cachingTag" => "picker-v2"
      }]
    end

    emit_vivafolioblock_notification(block_id, "color-picker", entity_id, entity_graph, resources)

    # Return the color value unchanged
    color_value
  end

  # Display a color square block
  #
  # @param color_value [String] Color value to display
  # @return [String] The color value (unchanged)
  def self.show_square(color_value)
    # Create deterministic IDs based on the color value
    color_hash = Digest::MD5.hexdigest(color_value.to_s)[0...8]
    block_id = "color-square-#{color_hash}"
    entity_id = "square-entity-#{color_hash}"

    entity_graph = {
      "entities" => [{
        "entityId" => entity_id,
        "properties" => {"color" => color_value}
      }],
      "links" => []
    }

    # Find HTML resource file
    resources = nil
    html_path = File.join(__dir__, '../../../blocks/color-square/dist/index.html')
    if File.exist?(html_path)
      resources = [{
        "logicalName" => "index.html",
        "physicalPath" => "file://#{File.absolute_path(html_path)}",
        "cachingTag" => "square-v2"
      }]
    end

    emit_vivafolioblock_notification(block_id, "color-square", entity_id, entity_graph, resources)

    # Return the color value unchanged
    color_value
  end

  # Emit a VivafolioBlock notification to stdout
  #
  # @param block_id [String] Unique identifier for this block instance
  # @param block_type [String] Type of block (e.g., 'color-picker', 'color-square')
  # @param entity_id [String] Entity identifier
  # @param entity_graph [Hash] Initial graph data with entities and links
  # @param resources [Array<Hash>] Optional list of resources
  # @param display_mode [String] Display mode ('multi-line' or 'inline')
  # @param initial_height [Integer] Initial height for the block
  private_class_method def self.emit_vivafolioblock_notification(
    block_id,
    block_type,
    entity_id,
    entity_graph,
    resources = nil,
    display_mode = "multi-line",
    initial_height = 200
  )
    notification = {
      "blockId" => block_id,
      "blockType" => "https://blockprotocol.org/@blockprotocol/types/block-type/#{block_type}/",
      "displayMode" => display_mode,
      "entityId" => entity_id,
      "entityGraph" => entity_graph,
      "supportsHotReload" => false,
      "initialHeight" => initial_height
    }

    notification["resources"] = resources if resources

    # Emit as JSON line to stdout
    puts notification.to_json
  end

  # Create a basic entity graph with a single entity
  #
  # @param entity_id [String] Unique identifier for the entity
  # @param properties [Hash] Properties dictionary for the entity
  # @return [Hash] Entity graph structure
  def self.create_entity_graph(entity_id, properties)
    {
      "entities" => [{
        "entityId" => entity_id,
        "properties" => properties
      }],
      "links" => []
    }
  end

  # Create block resources array
  #
  # @param logical_name [String] Logical name of the resource
  # @param physical_path [String] Physical file path
  # @param caching_tag [String] Cache busting tag
  # @return [Array<Hash>] Resources array
  def self.create_block_resources(logical_name, physical_path, caching_tag)
    [{
      "logicalName" => logical_name,
      "physicalPath" => physical_path,
      "cachingTag" => caching_tag
    }]
  end
end

# Convenience methods for direct access
def gui_state(value)
  Vivafolio.gui_state(value)
end

def color_picker(color_value)
  Vivafolio.color_picker(color_value)
end

def show_square(color_value)
  Vivafolio.show_square(color_value)
end



