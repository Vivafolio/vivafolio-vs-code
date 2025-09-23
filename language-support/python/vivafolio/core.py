#!/usr/bin/env python3
"""
Vivafolio Core Runtime Functions for Python

This module provides the main API for creating Vivafolio blocks in Python programs.
"""

import json
import sys
import inspect
import os
import hashlib
from typing import Any, Dict, List, Optional, Union


def emit_vivafolioblock_notification(
    block_id: str,
    block_type: str,
    entity_id: str,
    entity_graph: Dict[str, Any],
    resources: Optional[List[Dict[str, str]]] = None,
    display_mode: str = "multi-line",
    initial_height: int = 200
) -> None:
    """
    Emit a VivafolioBlock notification to stdout for the Vivafolio extension.

    Args:
        block_id: Unique identifier for this block instance
        block_type: Type of block (e.g., 'color-picker', 'color-square')
        entity_id: Entity identifier
        entity_graph: Initial graph data with entities and links
        resources: Optional list of resources (HTML files, etc.)
        display_mode: Display mode ('multi-line' or 'inline')
        initial_height: Initial height for the block
    """
    notification = {
        "blockId": block_id,
        "blockType": f"https://blockprotocol.org/@blockprotocol/types/block-type/{block_type}/",
        "displayMode": display_mode,
        "entityId": entity_id,
        "entityGraph": entity_graph,
        "supportsHotReload": False,
        "initialHeight": initial_height
    }

    if resources:
        notification["resources"] = resources

    # Emit as JSON line to stdout
    print(json.dumps(notification), flush=True)


def gui_state(value: Any) -> Any:
    """
    gui_state() - Store and retrieve GUI state values

    This function stores the provided value and returns it, allowing it to be used
    in variable assignments while also making the state available for GUI blocks.

    Args:
        value: The value to store and return

    Returns:
        The same value that was passed in
    """
    # Store the value in a global registry for later retrieval by GUI functions
    if not hasattr(gui_state, '_registry'):
        gui_state._registry = {}

    # Use caller location as a key to associate values with specific code locations
    frame = inspect.currentframe().f_back
    if frame:
        filename = frame.f_code.co_filename
        line_number = frame.f_lineno
        key = f"{filename}:{line_number}"
        gui_state._registry[key] = value

    return value


def color_picker(color_value: str) -> str:
    """
    color_picker() - Create an interactive color picker block

    This function takes a color value (from gui_state) and creates an interactive
    color picker block. As a side effect, it emits a VivafolioBlock notification.

    Args:
        color_value: Color value (e.g., "#ffffff" or "#ff0000")

    Returns:
        str: The color value (unchanged)
    """
    # Create deterministic IDs based on the color value
    color_hash = hashlib.md5(str(color_value).encode()).hexdigest()[:8]
    block_id = f'color-picker-{color_hash}'
    entity_id = f'color-entity-{color_hash}'

    entity_graph = {
        "entities": [{
            "entityId": entity_id,
            "properties": {"color": color_value}
        }],
        "links": []
    }

    # Find HTML resource file
    resources = None
    html_path = os.path.join(os.path.dirname(__file__), "../../../blocks/color-picker/dist/index.html")
    if os.path.exists(html_path):
        resources = [{
            "logicalName": "index.html",
            "physicalPath": f"file://{os.path.abspath(html_path)}",
            "cachingTag": "picker-v2"
        }]

    emit_vivafolioblock_notification(block_id, "color-picker", entity_id, entity_graph, resources)

    # Return the color value unchanged
    return color_value


def show_square(color_value: str) -> str:
    """
    show_square() - Display a color square block

    This function takes a color value and displays it in a color square block.
    As a side effect, it emits a VivafolioBlock notification.

    Args:
        color_value: Color value to display

    Returns:
        str: The color value (unchanged)
    """
    # Create deterministic IDs based on the color value
    color_hash = hashlib.md5(str(color_value).encode()).hexdigest()[:8]
    block_id = f'color-square-{color_hash}'
    entity_id = f'square-entity-{color_hash}'

    entity_graph = {
        "entities": [{
            "entityId": entity_id,
            "properties": {"color": color_value}
        }],
        "links": []
    }

    # Find HTML resource file
    resources = None
    html_path = os.path.join(os.path.dirname(__file__), "../../../blocks/color-square/dist/index.html")
    if os.path.exists(html_path):
        resources = [{
            "logicalName": "index.html",
            "physicalPath": f"file://{os.path.abspath(html_path)}",
            "cachingTag": "square-v2"
        }]

    emit_vivafolioblock_notification(block_id, "color-square", entity_id, entity_graph, resources)

    # Return the color value unchanged
    return color_value


def create_entity_graph(entity_id: str, properties: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a basic entity graph with a single entity.

    Args:
        entity_id: Unique identifier for the entity
        properties: Properties dictionary for the entity

    Returns:
        Dict containing entities and links
    """
    return {
        "entities": [{
            "entityId": entity_id,
            "properties": properties
        }],
        "links": []
    }


def create_block_resources(
    logical_name: str,
    physical_path: str,
    caching_tag: str
) -> List[Dict[str, str]]:
    """
    Create a resources array for a block.

    Args:
        logical_name: Logical name of the resource
        physical_path: Physical file path
        caching_tag: Cache busting tag

    Returns:
        List containing the resource definition
    """
    return [{
        "logicalName": logical_name,
        "physicalPath": physical_path,
        "cachingTag": caching_tag
    }]



