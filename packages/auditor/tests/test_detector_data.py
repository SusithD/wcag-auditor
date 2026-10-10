import io
import json
from pathlib import Path

import numpy as np
import pytest
from auditor.detector import classmap
from auditor.detector import prepare_webui as pw
from PIL import Image

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
VOCAB = json.loads(Path(classmap.VOCAB_PATH).read_text())


def test_the_six_classes_are_the_plan_classes_in_order() -> None:
    assert classmap.classes() == ["text", "link", "button", "input", "choice", "image_icon"]


def test_every_webui_label_token_seen_in_the_data_is_mapped_or_explicitly_ignored() -> None:
    assert len(VOCAB) >= 80
    assert sorted(t for t in VOCAB if t not in classmap.known_tokens()) == []


def test_no_token_is_both_mapped_and_ignored() -> None:
    import yaml

    data = yaml.safe_load(classmap.CLASSMAP_PATH.read_text())
    assert not set(classmap.token_class()) & set(data["ignored"])
    assert set(data["priority"]) == set(data["classes"])


@pytest.mark.parametrize(
    ("labels", "expected"),
    [
        (["StaticText"], "text"),
        (["StaticText", "link"], "link"),
        (["generic", "textbox"], "input"),
        (["generic", "button"], "button"),
        (["img", "link"], "link"),
        (["img"], "image_icon"),
        (["checkbox"], "choice"),
        (["StaticText", "link", "menuitem"], "link"),
        (["generic"], None),
        (["paragraph"], None),
        (["totally-unknown-token"], None),
        ([], None),
    ],
)
def test_label_sets_resolve_by_priority(labels: list[str], expected: str | None) -> None:
    assert classmap.class_for(labels) == expected


def test_group_id_is_stable_and_split_is_group_level() -> None:
    labels = [["StaticText"], ["link"]]
    assert pw.group_id(labels) == pw.group_id([["StaticText"], ["link"]])
    assert pw.group_id(labels) != pw.group_id([["link"], ["StaticText"]])
    ids = [pw.group_id([[f"t{i}"]]) for i in range(2000)]
    splits = {g: pw.split_of(g, 0.1) for g in ids}
    assert {pw.split_of(g, 0.1) for g in ids} == {"train", "valid"}
    assert all(pw.split_of(g, 0.1) == s for g, s in splits.items())
    assert 0.05 < sum(s == "valid" for s in splits.values()) / len(ids) < 0.15


def test_boxes_are_scaled_by_the_device_ratio_clipped_and_filtered() -> None:
    boxes: list[list[float]] = [
        [10, 20, 110, 70],
        [0, 0, 3, 3],
        [-50, -50, 5000, 5000],
        [10, 10, 40, 40],
    ]
    labels = [["StaticText", "link"], ["StaticText"], ["button"], ["generic"]]
    phone = pw.convert_boxes(boxes, labels, "iPhone-13 Pro", (1170, 2532), min_area=100)
    assert phone[0] == ("link", [30.0, 60.0, 300.0, 150.0])
    assert phone[1][0] == "button" and phone[1][1] == [0.0, 0.0, 1170.0, 2532.0]
    assert len(phone) == 2
    desktop = pw.convert_boxes(boxes[:1], labels[:1], "default_1280-720", (1280, 720), 100)
    assert desktop == [("link", [10.0, 20.0, 100.0, 50.0])]


def test_box_cap_keeps_the_first_boxes() -> None:
    boxes: list[list[float]] = [[i, 0, i + 20, 20] for i in range(400)]
    out = pw.convert_boxes(boxes, [["StaticText"]] * 400, "default_1280-720", (5000, 100), 1)
    assert len(out) == pw.MAX_BOXES


def test_hash_is_zero_distance_for_the_same_image_and_far_for_different_ones() -> None:
    rng = np.random.default_rng(0)
    a = Image.fromarray(rng.integers(0, 255, (90, 160, 3), dtype=np.uint8))
    b = Image.fromarray(rng.integers(0, 255, (90, 160, 3), dtype=np.uint8))
    assert pw.hamming(pw.phash(a), pw.phash(a)) == 0
    assert pw.hamming(pw.phash(a), pw.phash(b)) > 40
    assert pw.phash(a).bit_length() <= pw.PHASH_SIZE**2


def test_benchmark_hashes_cover_every_real_page() -> None:
    bench = pw.benchmark_hashes(FIXTURES / "real")
    assert sorted(n for n, _ in bench) == sorted(
        p.name for p in FIXTURES.glob("real/*") if p.is_dir()
    )
    assert pw.leak_distance(bench[0][1], bench) == 0
    assert pw.leak_distance(1, []) == pw.PHASH_SIZE * pw.PHASH_SIZE


def png(image: Image.Image) -> dict[str, bytes]:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return {"bytes": buf.getvalue()}


def write_shard(path: Path, rows: list[dict[str, object]]) -> None:
    pa = pytest.importorskip("pyarrow")
    pq = pytest.importorskip("pyarrow.parquet")

    pq.write_table(pa.Table.from_pylist(rows), path)


def make_row(image: Image.Image, name: str, seed: int) -> dict[str, object]:
    return {
        "image": png(image),
        "labels": [["StaticText", "link"], ["button"], ["generic"], [f"StaticText{seed}"]],
        "contentBoxes": [[10, 10, 200, 40], [220, 10, 320, 40], [0, 0, 5, 5], [30, 60, 90, 80]],
        "key_name": name,
    }


def test_prepare_writes_a_roboflow_dataset_and_screens_out_benchmark_pages(
    tmp_path: Path,
) -> None:
    rng = np.random.default_rng(1)
    shot = next(FIXTURES.glob("real/real_com_003_desktop_*")) / "screenshot.png"
    with Image.open(shot) as full:
        leaked = full.convert("RGB").crop((0, 0, full.width, 900))
    fresh = [
        Image.fromarray(rng.integers(0, 255, (720, 1280, 3), dtype=np.uint8)) for _ in range(6)
    ]
    shard = tmp_path / "train-00000-of-00001.parquet"
    rows = [make_row(leaked, "default_1280-720", 99)] + [
        make_row(img, "default_1280-720", i) for i, img in enumerate(fresh)
    ]
    write_shard(shard, rows)
    manifest = pw.prepare([shard], tmp_path / "out", 4, 2, 7, FIXTURES / "real", leak_bits=16)
    assert manifest["filtered"].get("benchmark_like") == 1
    assert sum(manifest["counts"].values()) == 6
    assert manifest["benchmark_check"]["min_distance"] > 16
    assert set(manifest["boxes_per_class"]) == {"link", "button"}
    assert manifest["classes"] == classmap.classes()
    coco = json.loads((tmp_path / "out" / "train" / "_annotations.coco.json").read_text())
    assert len(coco["categories"]) == 6 and coco["annotations"]
    assert all(a["bbox"][2] > 0 and a["bbox"][3] > 0 for a in coco["annotations"])
    for item in manifest["items"]:
        assert (tmp_path / "out" / item["file"]).is_file()
    groups = {
        s: {i["group"] for i in manifest["items"] if i["file"].startswith(s)}
        for s in ("train", "valid")
    }
    assert not groups["train"] & groups["valid"]
    bench = pw.benchmark_hashes(FIXTURES / "real")
    pw.verify_no_leak(manifest, bench, 16)


def test_verify_no_leak_fails_when_a_training_image_matches_a_benchmark_page() -> None:
    bench = pw.benchmark_hashes(FIXTURES / "real")
    manifest = {
        "items": [{"file": "train/x.png", "phash": f"{bench[0][1]:064x}"}],
    }
    with pytest.raises(AssertionError, match="resemble benchmark pages"):
        pw.verify_no_leak(manifest, bench, 16)
