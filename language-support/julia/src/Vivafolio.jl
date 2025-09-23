"""
Vivafolio Julia Runtime Library

This package provides helper functions for creating VivafolioBlock notifications
that work with the Vivafolio VS Code extension's runtime path.
"""

module Vivafolio

using JSON

export gui_state, color_picker, show_square
export emit_vivafolioblock_notification, create_entity_graph, create_block_resources

# Global registry for GUI state
const STATE_REGISTRY = Dict{String, Any}()

"""
    gui_state(value)

Store and retrieve GUI state values.

This function stores the provided value and returns it, allowing it to be used
in variable assignments while also making the state available for GUI blocks.

# Arguments
- `value`: The value to store and return

# Returns
The same value that was passed in
"""
function gui_state(value)
    # Use caller location as a key to associate values with specific code locations
    stacktrace = stacktrace()
    if length(stacktrace) > 1
        frame = stacktrace[2]
        filename = string(frame.file)
        line_number = frame.line
        key = "$(filename):$(line_number)"
        STATE_REGISTRY[key] = value
    end

    return value
end

"""
    color_picker(color_value::String) -> String

Create an interactive color picker block.

This function takes a color value (from gui_state) and creates an interactive
color picker block. As a side effect, it emits a VivafolioBlock notification.

# Arguments
- `color_value`: Color value (e.g., "#ffffff" or "#ff0000")

# Returns
The color value (unchanged)
"""
function color_picker(color_value::String)::String
    # Create deterministic IDs based on the color value
    color_hash = bytes2hex(sha256(color_value))[1:8]
    block_id = "color-picker-$(color_hash)"
    entity_id = "color-entity-$(color_hash)"

    entity_graph = Dict(
        "entities" => [Dict(
            "entityId" => entity_id,
            "properties" => Dict("color" => color_value)
        )],
        "links" => []
    )

    # Find HTML resource file
    resources = nothing
    html_path = joinpath(@__DIR__, "../../../blocks/color-picker/dist/index.html")
    if isfile(html_path)
        resources = [Dict(
            "logicalName" => "index.html",
            "physicalPath" => "file://$(abspath(html_path))",
            "cachingTag" => "picker-v2"
        )]
    end

    emit_vivafolioblock_notification(block_id, "color-picker", entity_id, entity_graph, resources)

    # Return the color value unchanged
    return color_value
end

"""
    show_square(color_value::String) -> String

Display a color square block.

This function takes a color value and displays it in a color square block.
As a side effect, it emits a VivafolioBlock notification.

# Arguments
- `color_value`: Color value to display

# Returns
The color value (unchanged)
"""
function show_square(color_value::String)::String
    # Create deterministic IDs based on the color value
    color_hash = bytes2hex(sha256(color_value))[1:8]
    block_id = "color-square-$(color_hash)"
    entity_id = "square-entity-$(color_hash)"

    entity_graph = Dict(
        "entities" => [Dict(
            "entityId" => entity_id,
            "properties" => Dict("color" => color_value)
        )],
        "links" => []
    )

    # Find HTML resource file
    resources = nothing
    html_path = joinpath(@__DIR__, "../../../blocks/color-square/dist/index.html")
    if isfile(html_path)
        resources = [Dict(
            "logicalName" => "index.html",
            "physicalPath" => "file://$(abspath(html_path))",
            "cachingTag" => "square-v2"
        )]
    end

    emit_vivafolioblock_notification(block_id, "color-square", entity_id, entity_graph, resources)

    # Return the color value unchanged
    return color_value
end

"""
    emit_vivafolioblock_notification(block_id, block_type, entity_id, entity_graph, resources=nothing, display_mode="multi-line", initial_height=200)

Emit a VivafolioBlock notification to stdout for the Vivafolio extension.

# Arguments
- `block_id`: Unique identifier for this block instance
- `block_type`: Type of block (e.g., 'color-picker', 'color-square')
- `entity_id`: Entity identifier
- `entity_graph`: Initial graph data with entities and links
- `resources`: Optional list of resources (HTML files, etc.)
- `display_mode`: Display mode ('multi-line' or 'inline')
- `initial_height`: Initial height for the block
"""
function emit_vivafolioblock_notification(
    block_id::String,
    block_type::String,
    entity_id::String,
    entity_graph::Dict,
    resources=nothing,
    display_mode::String="multi-line",
    initial_height::Int=200
)
    notification = Dict(
        "blockId" => block_id,
        "blockType" => "https://blockprotocol.org/@blockprotocol/types/block-type/$(block_type)/",
        "displayMode" => display_mode,
        "entityId" => entity_id,
        "entityGraph" => entity_graph,
        "supportsHotReload" => false,
        "initialHeight" => initial_height
    )

    if resources !== nothing
        notification["resources"] = resources
    end

    # Emit as JSON line to stdout
    println(json(notification))
end

"""
    create_entity_graph(entity_id, properties)

Create a basic entity graph with a single entity.

# Arguments
- `entity_id`: Unique identifier for the entity
- `properties`: Properties dictionary for the entity

# Returns
Dict containing entities and links
"""
function create_entity_graph(entity_id::String, properties::Dict)
    return Dict(
        "entities" => [Dict(
            "entityId" => entity_id,
            "properties" => properties
        )],
        "links" => []
    )
end

"""
    create_block_resources(logical_name, physical_path, caching_tag)

Create a resources array for a block.

# Arguments
- `logical_name`: Logical name of the resource
- `physical_path`: Physical file path
- `caching_tag`: Cache busting tag

# Returns
Array containing the resource definition
"""
function create_block_resources(logical_name::String, physical_path::String, caching_tag::String)
    return [Dict(
        "logicalName" => logical_name,
        "physicalPath" => physical_path,
        "cachingTag" => caching_tag
    )]
end

end # module





