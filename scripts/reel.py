"""Join takes into one reel with ffmpeg: a cut, a fade (crossfade) or a dip (through black) at
each join; audio crossfades with the picture. Takes are 768x448 at 24 fps with audio (LTX).

Usage: reel.py OUT.mp4 TAKE1.mp4 JOIN TAKE2.mp4 [JOIN TAKE3.mp4 ...]   JOIN = cut | fade | dip
Prints JSON {out, seconds}."""
import json
import subprocess
import sys

FADE = 0.5  # seconds a fade or dip takes


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def size(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path], capture_output=True, text=True, check=True).stdout
    w, h = out.strip().split(",")[:2]
    return int(w), int(h)


def has_audio(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path], capture_output=True, text=True)
    return bool(out.stdout.strip())


def main():
    out, rest = sys.argv[1], sys.argv[2:]
    takes, joins = rest[0::2], rest[1::2]
    if len(takes) != len(joins) + 1 or any(j not in ("cut", "fade", "dip") for j in joins):
        raise SystemExit(__doc__)
    audio = all(has_audio(t) for t in takes)
    args = ["ffmpeg", "-loglevel", "error", "-y"]
    for t in takes:
        args += ["-i", t]
    # Every take at the largest one's size (a take refined to HD beside one as shot), same rate.
    sizes = [size(t) for t in takes]
    W, H = max(sizes)
    f = [f"[{i}:v]scale={W}:{H}:flags=lanczos,setsar=1,fps=24[s{i}]" for i in range(len(takes))]
    v, a = "[s0]", "[0:a]"
    t_end = duration(takes[0])
    for i, j in enumerate(joins, start=1):
        d = duration(takes[i])
        vo, ao = f"[v{i}]", f"[a{i}]"
        if j == "cut":
            f.append(f"{v}[s{i}]concat=n=2:v=1:a=0{vo}")
            if audio:
                f.append(f"{a}[{i}:a]concat=n=2:v=0:a=1{ao}")
            t_end += d
        else:
            off = t_end - FADE
            f.append(f"{v}[s{i}]xfade=transition={'fade' if j == 'fade' else 'fadeblack'}:duration={FADE}:offset={off:.3f}{vo}")
            if audio:
                f.append(f"{a}[{i}:a]acrossfade=d={FADE}{ao}")
            t_end += d - FADE
        v, a = vo, ao
    args += ["-filter_complex", ";".join(f) or "null", "-map", v]
    if audio:
        # One take alone has no audio filter: its own stream, not a label.
        args += ["-map", "0:a" if a == "[0:a]" else a, "-c:a", "aac", "-b:a", "160k"]
    args += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-r", "24", out]
    subprocess.run(args, check=True)
    print(json.dumps({"out": out, "seconds": round(duration(out), 2)}))


if __name__ == "__main__":
    main()
