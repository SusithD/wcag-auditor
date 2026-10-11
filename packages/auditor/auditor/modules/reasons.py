from __future__ import annotations

KEY = "needs_review_reason"

TEXT_SIZE_UNKNOWN = (
    "text size and weight unknown: large-text status cannot be read from the screenshot, "
    "so the contrast threshold is not settled"
)
DETECTOR_BOX = (
    "element box estimated by the detector from the screenshot: its real edge and size are unknown"
)
DETECTOR_TARGET = (
    "target size taken from a detector box, not from the DOM: the element's real size is unknown"
)
ICON_PIXELS = "icon colour estimated from anti-aliased pixels (O2)"
FOCUS_UNSETTLED = (
    "focus frames did not settle (animation or transition), so the indicator may be "
    "measured mid-change"
)
NO_PIXEL_CHANGE = (
    "focus produced no pixel change inside the element: it may be covered or still transitioning"
)
