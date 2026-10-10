from auditor import protocol


def test_load_has_protocol_v11_values() -> None:
    p = protocol.load()
    t = p.thresholds
    assert p.protocol_version == "1.1"
    assert (t.contrast.text, t.contrast.large_text, t.contrast.non_text) == (4.5, 3.0, 3.0)
    assert (t.large_text.min_px, t.large_text.min_px_bold, t.large_text.bold_weight) == (
        24,
        18.66,
        700,
    )
    assert t.target_size_px == 24
    assert t.focus.visibility_ratio == 1.5
    assert t.focus.ring_min_px == 2
    assert t.focus.area_factor == 4
    assert (t.match.iou, t.match.containment) == (0.3, 0.5)


def test_rulings_and_observations_complete() -> None:
    p = protocol.load()
    assert set(p.rulings) == {f"R{i}" for i in range(1, 7)}
    assert set(p.observations) == {f"O{i}" for i in range(1, 9)}


def test_sha256_is_stable_hex() -> None:
    assert len(protocol.sha256()) == 64


def test_scs_match_schema_and_protocol_sha_matches_file() -> None:
    import hashlib
    from typing import get_args

    from auditor.schema import FOCUS_SCS, SC

    p = protocol.load()
    assert p.scs == list(get_args(SC))
    assert set(p.focus_scs) == FOCUS_SCS
    assert protocol.sha256() == hashlib.sha256(protocol.PROTOCOL_PATH.read_bytes()).hexdigest()


def test_serious_boundary_is_strict() -> None:
    sev = protocol.load().severity.contrast
    assert (sev.serious_below, sev.serious_below_large) == (4.0, 2.7)


def test_protocol_path_can_be_overridden_for_sweeps(tmp_path, monkeypatch):  # type: ignore[no-untyped-def]
    alt = tmp_path / "alt.yaml"
    alt.write_text(
        protocol.PROTOCOL_PATH.read_text().replace(
            "ua_default_ring_exempt: false", "ua_default_ring_exempt: true"
        )
    )
    monkeypatch.setenv("AUDITOR_PROTOCOL", str(alt))
    assert protocol.load().heuristics.ua_default_ring_exempt is True
    assert protocol.sha256() != protocol.sha256(protocol.PROTOCOL_PATH)
    monkeypatch.delenv("AUDITOR_PROTOCOL")
    assert protocol.load().heuristics.ua_default_ring_exempt is False
