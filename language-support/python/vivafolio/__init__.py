"""
Vivafolio Python Runtime Library

This package provides helper functions for creating VivafolioBlock notifications
that work with the Vivafolio VS Code extension's runtime path.
"""

from .core import gui_state, color_picker, show_square, emit_vivafolioblock_notification
from .legacy import vivafolio_picker, vivafolio_square

__version__ = "0.1.0"
__all__ = [
    'gui_state',
    'color_picker',
    'show_square',
    'emit_vivafolioblock_notification',
    'vivafolio_picker',
    'vivafolio_square'
]



