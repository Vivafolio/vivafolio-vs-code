import contextlib
import io
import json
import unittest

from vivafolio_helpers import emit_vivafolioblock_notification


class VivafolioHelperTests(unittest.TestCase):
    def test_emit_notification_includes_entity_graph(self):
        buffer = io.StringIO()
        entity_graph = {
            "entities": [{"entityId": "entity-1", "properties": {"color": "#ffffff"}}],
            "links": []
        }
        resources = [{"logicalName": "index.html", "physicalPath": "file:///tmp/index.html"}]

        with contextlib.redirect_stdout(buffer):
            emit_vivafolioblock_notification(
                "block-1",
                "color-picker",
                "entity-1",
                entity_graph,
                resources=resources
            )

        payload = json.loads(buffer.getvalue().strip())
        self.assertEqual(payload["entityGraph"], entity_graph)
        self.assertEqual(payload["resources"], resources)
        self.assertEqual(
            payload["blockType"],
            "https://blockprotocol.org/@blockprotocol/types/block-type/color-picker/"
        )


if __name__ == "__main__":
    unittest.main()
