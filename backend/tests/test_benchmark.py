"""MaargaDocBench stays runnable and deterministic, and the GRAMIN header bug stays fixed."""
from benchmarks.maargadocbench_v0 import generate, run
from app.document_ai import extract_fields


def test_sanction_header_gramin_is_not_read_as_village():
    _, fields = extract_fields("PRADHAN MANTRI AWAAS YOJANA - GRAMIN\nBeneficiary: Test Person\nVillage: Kudur\nTaluk: Magadi")
    assert fields["village"] == "Kudur"


def test_benchmark_is_deterministic_and_meets_v0_floor():
    a, b = run(generate(100, seed=3)), run(generate(100, seed=3))
    assert a["field_f1"] == b["field_f1"] and a["mismatch_recall"] == b["mismatch_recall"]
    assert a["field_f1"] >= 0.9
    assert a["mismatch_recall"] >= 0.9
