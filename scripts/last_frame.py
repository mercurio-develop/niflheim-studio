"""The last frame of a take as a PNG, for the next shot to start on (07_direct continuity).

Reads every frame (a take is 97-121 frames, so this is quick) because seeking to the end of an
MP4 with OpenCV lands on a keyframe, not the last frame.
Run: python -I scripts/last_frame.py take.mp4 out.png  -> prints {"width", "height", "frames"}
"""
import json
import sys

import cv2


def main(src: str, out: str) -> None:
    cap = cv2.VideoCapture(src)
    last, n = None, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        last, n = frame, n + 1
    cap.release()
    if last is None:
        sys.exit(f"no frames in {src}")
    if not cv2.imwrite(out, last):
        sys.exit(f"could not write {out}")
    print(json.dumps({"width": last.shape[1], "height": last.shape[0], "frames": n}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
