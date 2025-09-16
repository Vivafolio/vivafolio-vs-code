#!/usr/bin/env python3
"""
Vivafolio Runtime Path Helpers for Python

This module provides helper functions for creating VivafolioBlock notifications
that work with the Vivafolio VS Code extension's runtime path.
"""

import json
import sys
import re
import inspect
import os

def extract_gui_state_from_source(source_lines, block_type):
    """
    Extract gui_state from source code comments for the given block type.

    Args:
        source_lines: List of source code lines
        block_type: Type of block ('picker' or 'square')

    Returns:
        dict: Extracted state or default state
    """
    for line in source_lines:
        # Look for gui_state comments like: # gui_state: {"color": "#ff0000"}
        match = re.search(r'# gui_state:\s*(\{.*\})', line)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

    # Default states
    if block_type == 'picker':
        return {"properties": {"color": "#3700ff"}}  # Default blue
    elif block_type == 'square':
        return {"properties": {"color": "#3700ff"}}  # Match picker default
    return {"properties": {}}

def emit_vivafolioblock_notification(block_id, block_type, entity_id, initial_graph, resources=None):
    """
    Emit a VivafolioBlock notification to stdout for the Vivafolio extension.

    Args:
        block_id: Unique identifier for this block instance
        block_type: Type of block (e.g., 'color-picker', 'color-square')
        entity_id: Entity identifier
        initial_graph: Initial graph data with entities and links
        resources: Optional list of resources (HTML files, etc.)
    """
    notification = {
        "blockId": block_id,
        "blockType": f"https://blockprotocol.org/@blockprotocol/types/block-type/{block_type}/",
        "displayMode": "multi-line",
        "entityId": entity_id,
        "initialGraph": initial_graph,
        "supportsHotReload": False,
        "initialHeight": 200
    }

    if resources:
        notification["resources"] = resources

    # Emit as JSON line to stdout
    print(json.dumps(notification), flush=True)

def vivafolio_picker(block_id="picker-123"):
    """
    Create a color picker block.

    Args:
        block_id: Unique identifier for this picker instance
    """
    # Get the caller's source code to extract gui_state
    frame = inspect.currentframe().f_back
    source_lines = inspect.getsourcelines(frame)[0]

    # Extract current color from gui_state comment
    current_state = extract_gui_state_from_source(source_lines, 'picker')
    color = current_state.get('properties', {}).get('color', '#3700ff')

    entity_id = f"entity-{block_id}"

    initial_graph = {
        "entities": [{
            "entityId": entity_id,
            "properties": {
                "color": color
            }
        }],
        "links": []
    }

    # Find HTML resource file
    html_path = os.path.join(os.path.dirname(__file__), "../../resources/blocks/color-picker.html")
    if os.path.exists(html_path):
        resources = [{
            "logicalName": "index.html",
            "physicalPath": f"file://{os.path.abspath(html_path)}",
            "cachingTag": "picker-v1"
        }]
        emit_vivafolioblock_notification(block_id, "color-picker", entity_id, initial_graph, resources)
    else:
        emit_vivafolioblock_notification(block_id, "color-picker", entity_id, initial_graph)

def vivafolio_square(block_id="square-456"):
    """
    Create a color square block that syncs with the picker.

    Args:
        block_id: Unique identifier for this square instance
    """
    # Get the caller's source code to extract gui_state
    frame = inspect.currentframe().f_back
    source_lines = inspect.getsourcelines(frame)[0]

    # Extract current color from gui_state comment
    current_state = extract_gui_state_from_source(source_lines, 'square')
    color = current_state.get('properties', {}).get('color', '#3700ff')

    entity_id = f"entity-{block_id}"

    initial_graph = {
        "entities": [{
            "entityId": entity_id,
            "properties": {
                "color": color
            }
        }],
        "links": []
    }

    # Find HTML resource file
    html_path = os.path.join(os.path.dirname(__file__), "../../resources/blocks/color-square.html")
    if os.path.exists(html_path):
        resources = [{
            "logicalName": "index.html",
            "physicalPath": f"file://{os.path.abspath(html_path)}",
            "cachingTag": "square-v1"
        }]
        emit_vivafolioblock_notification(block_id, "color-square", entity_id, initial_graph, resources)
    else:
        emit_vivafolioblock_notification(block_id, "color-square", entity_id, initial_graph)

def gui_state(state_dict):
    """
    Helper to format gui_state for inclusion in source code.
    This is mainly for documentation - the actual state is stored in comments.

    Args:
        state_dict: State dictionary to format

    Returns:
        str: Formatted state string for use in source code
    """
    return f"# gui_state: {json.dumps(state_dict)}"
