"""The router split must not add, drop or rename any route. Update the fixture only on purpose."""

from pathlib import Path

from app.main import app


def test_every_route_path_and_method_is_unchanged():
    spec = app.openapi()
    actual = sorted(f"{method.upper()} {path}" for path, ops in spec["paths"].items() for method in ops)
    expected = (Path(__file__).parent / "fixtures" / "routes_v1.txt").read_text().split("\n")
    assert actual == [line for line in expected if line]
