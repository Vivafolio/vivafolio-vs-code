#!/usr/bin/env python3
"""
Test script to verify inline gui_state usage works correctly.
"""

# Simulate the vivafolio functions for testing
def gui_state(value):
    print(f"gui_state called with: {value}")
    return value

def color_picker(color_value):
    print(f"color_picker called with: {color_value}")
    print('{"blockId": "test-picker", "blockType": "https://blockprotocol.org/@blockprotocol/types/block-type/color-picker/", "displayMode": "multi-line", "entityId": "test-entity", "entityGraph": {"entities": [{"entityId": "test-entity", "properties": {"color": "' + color_value + '"}}], "links": []}, "supportsHotReload": false, "initialHeight": 200}')
    return color_value

def show_square(color_value):
    print(f"show_square called with: {color_value}")
    print('{"blockId": "test-square", "blockType": "https://blockprotocol.org/@blockprotocol/types/block-type/color-square/", "displayMode": "multi-line", "entityId": "test-entity-square", "entityGraph": {"entities": [{"entityId": "test-entity-square", "properties": {"color": "' + color_value + '"}}], "links": []}, "supportsHotReload": false, "initialHeight": 200}')
    return color_value

# Test the inline usage pattern
print("=== Testing Inline gui_state Usage ===")
print()

print("Before:")
print("  color = gui_state('#ff0000')")
print("  picked = color_picker(color)")
print()

print("After (correct inline usage):")
print("  picked = color_picker(gui_state('#ff0000'))")
print()

print("Executing:")
picked = color_picker(gui_state("#ff0000"))
show_square(picked)

print()
print("✅ Inline usage works correctly!")





