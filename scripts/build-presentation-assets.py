#!/usr/bin/env python3
"""Export static HTML decks + voiced MP4 tours from slides.json."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 1280, 720
BG = (6, 16, 24)
SEA = (26, 166, 160)
SAND = (242, 230, 212)
INK = (247, 251, 255)
MUTED = (180, 200, 210)


def font(size: int, bold: bool = False):
    for p in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def wrap(draw, text, fnt, max_w):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def make_frame(title, subtitle, bullets, out: Path, kicker=""):
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    for i in range(10):
        draw.ellipse((-180 + i * 50, -140 + i * 18, 560 + i * 40, 400 + i * 12), fill=(8 + i, 36 + i * 2, 46 + i))
    draw.rectangle((0, 0, W, 10), fill=SEA)
    draw.rectangle((0, H - 10, W, H), fill=(255, 138, 76))
    y = 56
    if kicker:
        draw.text((64, y), kicker.upper(), fill=SEA, font=font(20, True))
        y += 36
    for line in wrap(draw, title, font(44, True), W - 140)[:3]:
        draw.text((64, y), line, fill=INK, font=font(44, True))
        y += 52
    y += 6
    for line in wrap(draw, subtitle, font(24), W - 160)[:4]:
        draw.text((64, y), line, fill=MUTED, font=font(24))
        y += 32
    y += 14
    for b in bullets[:5]:
        for line in wrap(draw, f"• {b}", font(22), W - 160)[:2]:
            draw.text((72, y), line, fill=SAND, font=font(22))
            y += 30
        y += 4
    draw.text((64, H - 42), "Центр развития молодежи Сочи", fill=MUTED, font=font(18))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, quality=92)


PLAYER_CSS = """
:root{--bg0:#061018;--bg1:#0c2430;--sea:#1aa6a0;--sand:#f2e6d4;--ink:#f7fbff;--muted:rgba(247,251,255,.72);--line:rgba(255,255,255,.14)}
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:Manrope,sans-serif;color:var(--ink);
background:radial-gradient(900px 500px at 8% -10%,rgba(26,166,160,.28),transparent 55%),linear-gradient(160deg,var(--bg0),var(--bg1));overflow:hidden;touch-action:none}
.progress{position:fixed;left:0;top:0;height:3px;background:var(--sea);width:0;z-index:9}
.top{position:fixed;left:0;right:0;top:0;z-index:8;display:flex;justify-content:space-between;gap:.75rem;padding:max(.7rem,env(safe-area-inset-top)) 1rem .35rem;pointer-events:none}
.top strong{font-family:Unbounded,sans-serif}.top span{color:var(--muted);font-size:.78rem;display:block}
.top .acts{display:flex;gap:.4rem;pointer-events:auto;flex-wrap:wrap;justify-content:flex-end}
.chip{appearance:none;border:1px solid var(--line);background:rgba(0,0,0,.4);color:var(--ink);border-radius:999px;padding:.45rem .75rem;font:inherit;font-weight:700;font-size:.82rem;cursor:pointer;text-decoration:none;min-height:40px;display:inline-flex;align-items:center}
.stage{position:relative;height:100%;padding:3.4rem 1rem 5.8rem;max-width:1180px;margin:0 auto;display:grid;align-content:center}
.hit{position:absolute;top:0;bottom:0;width:24%;max-width:170px;border:0;background:transparent;z-index:3;cursor:pointer}
.hit.prev{left:0}.hit.next{right:0}
.slide{display:none;animation:in .4s ease both}.slide.on{display:block}
@keyframes in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.kicker{display:inline-block;padding:.35rem .7rem;border-radius:999px;border:1px solid var(--line);color:var(--sand);font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;margin-bottom:.55rem}
h1{font-family:Unbounded,sans-serif;margin:0;font-size:clamp(1.55rem,5vw,2.8rem);line-height:1.12;max-width:16ch}
.lead{margin:.7rem 0 0;color:var(--muted);font-size:clamp(1rem,2vw,1.15rem);line-height:1.55;max-width:42rem}
.list{list-style:none;padding:0;margin:1rem 0 0;display:grid;gap:.45rem}
.list li{padding:.55rem .75rem;border-left:3px solid var(--sea);background:rgba(255,255,255,.03);color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin-top:1rem}
.card{border:1px solid var(--line);background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border-radius:14px;padding:.85rem}
.card h3{margin:0 0 .3rem;font-size:.95rem}.card p{margin:0;color:var(--muted);font-size:.85rem}
.body{display:grid;gap:1.1rem}@media(min-width:900px){.body{grid-template-columns:1.05fr .95fr;align-items:center}}
.shot{border-radius:16px;overflow:hidden;border:1px solid var(--line);box-shadow:0 20px 50px rgba(0,0,0,.35);background:#000}
.shot img{display:block;width:100%;max-height:52vh;object-fit:cover;object-position:top}
.foot{display:flex;justify-content:space-between;gap:1rem;margin-top:1.25rem;padding-top:.75rem;border-top:1px solid var(--line);color:var(--sand);font-size:.82rem;font-weight:650}
.controls{position:fixed;left:50%;transform:translateX(-50%);bottom:max(1rem,calc(env(safe-area-inset-bottom) + 1rem));z-index:20;
display:flex;align-items:center;gap:.45rem;padding:.4rem;border-radius:999px;border:1px solid var(--line);background:rgba(6,16,24,.9);backdrop-filter:blur(10px)}
.controls button{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--ink);width:48px;height:48px;border-radius:999px;font-size:1.15rem;font-weight:800;cursor:pointer}
.counter{min-width:4.5rem;text-align:center;font-weight:800;color:var(--sand)}
"""

PLAYER_JS = """
const slides=[...document.querySelectorAll('.slide')];
let i=0; const progress=document.getElementById('progress'); const counter=document.getElementById('counter');
function show(n){i=(n+slides.length)%slides.length;slides.forEach((s,idx)=>s.classList.toggle('on',idx===i));
if(progress)progress.style.width=((i+1)/slides.length*100)+'%'; if(counter)counter.textContent=(i+1)+' / '+slides.length;}
function next(){show(i+1)} function prev(){show(i-1)}
async function toggleFs(){const el=document.documentElement; try{ if(!document.fullscreenElement) await el.requestFullscreen(); else await document.exitFullscreen(); }catch(e){ document.body.classList.toggle('css-fs'); }}
document.getElementById('prev').onclick=prev; document.getElementById('next').onclick=next;
document.getElementById('hitPrev').onclick=prev; document.getElementById('hitNext').onclick=next;
document.getElementById('fsBtn').onclick=()=>toggleFs(); document.getElementById('fsTop')?.addEventListener('click',()=>toggleFs());
window.addEventListener('keydown',(e)=>{ if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();next()}
else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();prev()} else if(e.key==='f'||e.key==='F'){e.preventDefault();toggleFs()} });
let tx=null; window.addEventListener('touchstart',(e)=>{tx=e.changedTouches[0].clientX},{passive:true});
window.addEventListener('touchend',(e)=>{ if(tx==null)return; const dx=e.changedTouches[0].clientX-tx; tx=null; if(Math.abs(dx)<48)return; if(dx<0)next(); else prev();},{passive:true});
show(0);
"""


def esc(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_slide(slide: dict, idx: int, contacts: str) -> str:
    cards = ""
    if slide.get("cards"):
        cards = '<div class="cards">' + "".join(
            f'<article class="card"><h3>{esc(c.get("title",""))}</h3><p>{esc(c.get("text",""))}</p></article>'
            for c in slide["cards"]
        ) + "</div>"
    bullets = ""
    if slide.get("bullets"):
        bullets = '<ul class="list">' + "".join(f"<li>{esc(b)}</li>" for b in slide["bullets"]) + "</ul>"
    image = ""
    if slide.get("image"):
        image = f'<div class="shot"><img src="{esc(slide["image"])}" alt="" /></div>'
    kicker = f'<div class="kicker">{esc(slide.get("kicker") or "")}</div>' if slide.get("kicker") else ""
    lead = f'<p class="lead">{esc(slide.get("lead") or "")}</p>' if slide.get("lead") else ""
    footer = esc(contacts)
    return f"""
<section class="slide{' on' if idx==0 else ''}" data-i="{idx}">
  <div class="body">
    <div>
      {kicker}
      <h1>{esc(slide.get('title') or '')}</h1>
      {lead}
      {bullets}
      {cards}
    </div>
    {image}
  </div>
  <div class="foot"><span>{footer}</span><span></span></div>
</section>"""


def write_html(deck: dict, out: Path):
    contacts = deck.get("contacts") or "8 (862) 253-32-37 · cddim_sochi@mail.ru"
    slides_html = "\n".join(
        render_slide(s, i, contacts) for i, s in enumerate(deck.get("slides") or [])
    )
    title = esc(deck.get("title") or "Презентация")
    html = f"""<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>{title}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Unbounded:wght@500;700;800&display=swap" rel="stylesheet"/>
<style>{PLAYER_CSS}</style></head><body>
<div class="progress" id="progress"></div>
<header class="top"><div><strong>{title}</strong><span>{esc(deck.get('subtitle') or '')}</span></div>
<div class="acts"><a class="chip" href="/presentation">К версиям</a><button type="button" class="chip" id="fsTop">⛶ Экран</button></div></header>
<main class="stage">
<button type="button" class="hit prev" id="hitPrev" aria-label="Назад"></button>
<button type="button" class="hit next" id="hitNext" aria-label="Вперёд"></button>
{slides_html}
</main>
<nav class="controls" aria-label="Навигация">
<button type="button" id="prev" aria-label="Назад">←</button>
<span class="counter" id="counter">1 / 1</span>
<button type="button" id="next" aria-label="Вперёд">→</button>
<button type="button" id="fsBtn" aria-label="Полный экран">⛶</button>
</nav>
<script>{PLAYER_JS}</script>
</body></html>"""
    out.write_text(html, encoding="utf-8")


def find_edge_tts() -> str:
    for cand in (
        os.environ.get("EDGE_TTS", ""),
        shutil.which("edge-tts") or "",
        str(Path.home() / ".local/bin/edge-tts"),
        "edge-tts",
    ):
        if cand and (cand == "edge-tts" or Path(cand).exists() or shutil.which(cand)):
            return cand
    return ""


def speak(text: str, audio_out: Path):
    """Natural Russian neural voice via edge-tts (Edge Read Aloud).
    Open/free neural TTS — not a branded assistant like «Алиса».
    """
    edge = find_edge_tts()
    text = " ".join((text or "").split())
    if not text:
        text = "Следующий раздел."
    if edge:
        mp3 = audio_out.with_suffix(".mp3")
        rate = os.environ.get("PRESENTATION_TTS_RATE", "-8%")
        voice = os.environ.get("PRESENTATION_TTS_VOICE", "ru-RU-SvetlanaNeural")
        subprocess.run(
            [
                edge,
                "--voice",
                voice,
                f"--rate={rate}",
                "--text",
                text,
                "--write-media",
                str(mp3),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(mp3), "-ac", "1", "-ar", "44100", str(audio_out)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return
    subprocess.run(["espeak-ng", "-v", "ru", "-s", "140", "-w", str(audio_out), text], check=True)


def narration_for(slide: dict) -> str:
    if slide.get("narration"):
        return str(slide["narration"])
    parts = []
    if slide.get("title"):
        parts.append(str(slide["title"]).rstrip(".") + ".")
    if slide.get("lead"):
        parts.append(str(slide["lead"]).rstrip(".") + ".")
    bullets = slide.get("bullets") or []
    if bullets:
        parts.append(" ".join(f"{b.rstrip('.')}." for b in bullets[:3]))
    elif slide.get("cards"):
        titles = [c.get("title", "") for c in slide["cards"] if c.get("title")]
        if titles:
            parts.append("В том числе: " + ", ".join(titles[:5]) + ".")
    return " ".join(parts)


def build_video(deck: dict, out_mp4: Path, work: Path):
    frames = work / "frames"
    audio = work / "audio"
    frames.mkdir(parents=True)
    audio.mkdir(parents=True)
    clips = []
    for i, slide in enumerate(deck.get("slides") or []):
        title = slide.get("title") or f"Слайд {i+1}"
        lead = slide.get("lead") or ""
        bullets = slide.get("bullets") or [c.get("title", "") for c in (slide.get("cards") or [])][:4]
        frame = frames / f"{i:02d}.jpg"
        wav = audio / f"{i:02d}.wav"
        make_frame(title, lead, bullets, frame, kicker=slide.get("kicker") or deck.get("title") or "")
        speak(narration_for(slide), wav)
        dur = float(
            subprocess.check_output(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", str(wav)],
                text=True,
            ).strip()
        )
        clip = work / f"clip{i:02d}.mp4"
        # soft zoom via scale+crop for motion
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-loop", "1", "-i", str(frame),
                "-i", str(wav),
                "-filter_complex",
                f"[0:v]scale=1400:788,zoompan=z='min(1.08,1+0.0015*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={max(int(dur*25)+10, 60)}:s=1280x720:fps=25[v]",
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "160k",
                "-shortest", "-t", f"{max(dur + 0.45, 2.8):.2f}",
                str(clip),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        clips.append(clip)
    lst = work / "concat.txt"
    lst.write_text("".join(f"file '{c}'\n" for c in clips), encoding="utf-8")
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out_mp4)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main():
    # ensure defaults seeded via tsx if missing
    for slug, folder in (("full", "deck"), ("necessary", "necessary")):
        path = ROOT / "public/presentation" / folder / "slides.json"
        if not path.exists():
            raise SystemExit(f"Missing {path}; run seed first")
        deck = json.loads(path.read_text(encoding="utf-8"))
        write_html(deck, ROOT / "public/presentation" / folder / "index.html")
        with tempfile.TemporaryDirectory() as td:
            build_video(deck, ROOT / "public/presentation" / folder / "tour.mp4", Path(td))
        print("built", folder, "slides", len(deck.get("slides") or []), "video", (ROOT / "public/presentation" / folder / "tour.mp4").stat().st_size)


if __name__ == "__main__":
    main()
