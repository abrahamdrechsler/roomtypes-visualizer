from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


DEFAULT_JSON_PATH = Path(r"c:\Users\abrah\Documents\GitHub\product\room_types.json")


class RoomTypesHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, room_types_path: Path, **kwargs):
        self.room_types_path = room_types_path
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.path in ("/room_types.json", "/room_types.json?"):
            self._serve_room_types_json()
            return
        super().do_GET()

    def _serve_room_types_json(self):
        if not self.room_types_path.exists():
            self.send_error(
                HTTPStatus.NOT_FOUND,
                f"room_types.json not found at {self.room_types_path}",
            )
            return

        try:
            with self.room_types_path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
            body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        except Exception as exc:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server(port: int, room_types_path: Path):
    def handler_factory(*args, **kwargs):
        return RoomTypesHandler(*args, room_types_path=room_types_path, **kwargs)

    server = ThreadingHTTPServer(("127.0.0.1", port), handler_factory)
    print(f"Serving at http://127.0.0.1:{port}")
    print(f"Auto-loading room types from: {room_types_path}")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5500)
    parser.add_argument("--room-types-path", type=Path, default=DEFAULT_JSON_PATH)
    args = parser.parse_args()
    run_server(args.port, args.room_types_path)
