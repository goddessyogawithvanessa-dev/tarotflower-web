#!/usr/bin/env python3
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "public/images/digital-rituals/step-into-the-fire"
OUTPUT_DIR = ROOT / "private-assets/digital-rituals/step-into-the-fire"
OUTPUT_FILE = OUTPUT_DIR / "step-into-the-fire-ritual-guide.pdf"

PAGE_W, PAGE_H = A4

IVORY = HexColor("#F7F1E8")
PAPER = HexColor("#FCF9F3")
INK = HexColor("#342C28")
MUTED = HexColor("#756B62")
GOLD = HexColor("#B38A4A")
PALE_GOLD = HexColor("#DCC69D")
EMBER = HexColor("#9B432B")
BURGUNDY = HexColor("#5B2333")
TEAL = HexColor("#345B59")


def register_fonts():
    font_dir = Path("/System/Library/Fonts/Supplemental")
    pdfmetrics.registerFont(TTFont("Georgia", font_dir / "Georgia.ttf"))
    pdfmetrics.registerFont(TTFont("Georgia-Italic", font_dir / "Georgia Italic.ttf"))
    pdfmetrics.registerFont(TTFont("Georgia-Bold", font_dir / "Georgia Bold.ttf"))
    pdfmetrics.registerFont(TTFont("Chancery", font_dir / "Apple Chancery.ttf"))


def draw_image_cover(c, path, x, y, width, height, anchor_x=0.5, anchor_y=0.5):
    with Image.open(path) as image:
        image_w, image_h = image.size
    scale = max(width / image_w, height / image_h)
    drawn_w = image_w * scale
    drawn_h = image_h * scale
    draw_x = x - (drawn_w - width) * anchor_x
    draw_y = y - (drawn_h - height) * anchor_y
    c.saveState()
    clip = c.beginPath()
    clip.rect(x, y, width, height)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(
        ImageReader(path),
        draw_x,
        draw_y,
        width=drawn_w,
        height=drawn_h,
        preserveAspectRatio=True,
        mask="auto",
    )
    c.restoreState()


def draw_paragraph(c, text, style, x, top_y, width):
    paragraph = Paragraph(text, style)
    _, height = paragraph.wrap(width, PAGE_H)
    paragraph.drawOn(c, x, top_y - height)
    return top_y - height


def draw_footer(c, page_number):
    c.setStrokeColor(Color(GOLD.red, GOLD.green, GOLD.blue, alpha=0.45))
    c.setLineWidth(0.45)
    c.line(54, 42, PAGE_W - 54, 42)
    c.setFillColor(MUTED)
    c.setFont("Georgia", 8)
    c.drawString(54, 25, "TAROT FLOWER  ·  STEP INTO THE FIRE")
    c.drawRightString(PAGE_W - 54, 25, str(page_number))


def draw_page_header(c, eyebrow, page_number, accent=GOLD):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(accent)
    c.rect(0, PAGE_H - 8, PAGE_W, 8, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(54, PAGE_H - 42, eyebrow.upper())
    draw_footer(c, page_number)


def draw_stage_page(
    c,
    page_number,
    image_name,
    eyebrow,
    title,
    invocation,
    content,
    accent,
    image_anchor_x=0.5,
):
    draw_image_cover(
        c,
        IMAGE_DIR / image_name,
        0,
        0,
        248,
        PAGE_H,
        anchor_x=image_anchor_x,
        anchor_y=0.5,
    )
    c.saveState()
    c.setFillAlpha(0.16)
    c.setFillColor(PAPER)
    c.rect(200, 0, 72, PAGE_H, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(PAPER)
    c.rect(248, 0, PAGE_W - 248, PAGE_H, stroke=0, fill=1)
    c.setFillColor(accent)
    c.rect(248, 0, 5, PAGE_H, stroke=0, fill=1)

    x = 286
    width = PAGE_W - x - 52
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(x, PAGE_H - 60, eyebrow.upper())
    c.setFillColor(INK)
    c.setFont("Georgia", 28)
    c.drawString(x, PAGE_H - 112, title)
    c.setFillColor(accent)
    c.setFont("Georgia-Italic", 18)
    c.drawString(x, PAGE_H - 148, invocation)
    c.setStrokeColor(PALE_GOLD)
    c.setLineWidth(0.7)
    c.line(x, PAGE_H - 174, x + 86, PAGE_H - 174)

    body = ParagraphStyle(
        "StageBody",
        fontName="Georgia",
        fontSize=10.4,
        leading=15.5,
        textColor=INK,
        alignment=TA_LEFT,
    )
    section = ParagraphStyle(
        "StageSection",
        fontName="Helvetica",
        fontSize=7.8,
        leading=10,
        textColor=accent,
        alignment=TA_LEFT,
    )
    quote = ParagraphStyle(
        "StageQuote",
        fontName="Georgia-Italic",
        fontSize=11.4,
        leading=17,
        textColor=accent,
        alignment=TA_LEFT,
        leftIndent=11,
        rightIndent=4,
        borderColor=PALE_GOLD,
        borderWidth=0,
        borderLeftWidth=1.4,
        borderPadding=7,
    )
    prompt = ParagraphStyle(
        "StagePrompt",
        fontName="Georgia",
        fontSize=10.1,
        leading=15.2,
        textColor=INK,
        alignment=TA_LEFT,
    )
    note = ParagraphStyle(
        "StageNote",
        fontName="Georgia-Italic",
        fontSize=9.1,
        leading=13.5,
        textColor=MUTED,
        alignment=TA_LEFT,
    )
    styles = {
        "body": body,
        "section": section,
        "quote": quote,
        "prompt": prompt,
        "note": note,
    }
    spacing = {
        "body": 12,
        "section": 7,
        "quote": 14,
        "prompt": 12,
        "note": 9,
    }
    y = PAGE_H - 200
    for kind, text in content:
        y = draw_paragraph(c, text, styles[kind], x, y, width)
        y -= spacing[kind]

    c.setFillColor(MUTED)
    c.setFont("Georgia", 8)
    c.drawString(x, 25, "STEP INTO THE FIRE")
    c.drawRightString(PAGE_W - 52, 25, str(page_number))


def generate():
    register_fonts()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT_FILE), pagesize=A4, pageCompression=1)
    c.setTitle("Step Into the Fire - Ritual Guide")
    c.setAuthor("Vanessa Hylande · Tarot Flower")
    c.setSubject("A digital ritual companion for courage and confidence")

    # Cover
    c.setFillColor(IVORY)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    draw_image_cover(
        c,
        IMAGE_DIR / "elemental-rituals-header.jpg",
        0,
        PAGE_H * 0.43,
        PAGE_W,
        PAGE_H * 0.57,
        anchor_x=0.55,
    )
    c.setFillColor(GOLD)
    c.rect(0, PAGE_H * 0.43 - 6, PAGE_W, 6, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Chancery", 40)
    c.drawCentredString(PAGE_W / 2, 277, "Step Into the Fire")
    c.setFillColor(BURGUNDY)
    c.setFont("Helvetica", 10)
    c.drawCentredString(PAGE_W / 2, 241, "A DIGITAL RITUAL FOR COURAGE & CONFIDENCE")
    c.setStrokeColor(PALE_GOLD)
    c.line(PAGE_W / 2 - 60, 220, PAGE_W / 2 + 60, 220)
    c.setFillColor(MUTED)
    c.setFont("Georgia", 12)
    c.drawCentredString(PAGE_W / 2, 178, "A companion guide")
    c.setFont("Georgia-Bold", 11)
    c.drawCentredString(PAGE_W / 2, 104, "TAROT FLOWER")
    c.setFont("Georgia", 10)
    c.drawCentredString(PAGE_W / 2, 84, "Vanessa Hylande")
    c.showPage()

    # Welcome and journey
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    draw_image_cover(
        c,
        IMAGE_DIR / "fire-goddess-music.jpeg",
        0,
        515,
        PAGE_W,
        PAGE_H - 515,
        anchor_x=0.5,
        anchor_y=0.44,
    )
    c.saveState()
    c.setFillColor(Color(INK.red, INK.green, INK.blue, alpha=0.58))
    c.rect(0, 515, PAGE_W, PAGE_H - 515, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(EMBER)
    c.rect(0, PAGE_H - 8, PAGE_W, 8, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, 511, PAGE_W, 4, stroke=0, fill=1)
    draw_footer(c, 2)

    c.setFillColor(PALE_GOLD)
    c.setFont("Helvetica", 8)
    c.drawString(54, PAGE_H - 42, "WELCOME")
    title_style = ParagraphStyle(
        "Title",
        fontName="Chancery",
        fontSize=31,
        leading=36,
        textColor=PAPER,
        alignment=TA_CENTER,
    )
    intro_style = ParagraphStyle(
        "Intro",
        fontName="Georgia",
        fontSize=11.2,
        leading=17,
        textColor=PAPER,
        alignment=TA_CENTER,
    )
    y = draw_paragraph(c, "Welcome to the Fire", title_style, 70, PAGE_H - 72, PAGE_W - 140)
    y -= 11
    y = draw_paragraph(
        c,
        "This ritual is a sacred initiation into your own inner fire. Through candlelight, intention, movement, music, meditation, and the ancient element of fire, you’ll release what no longer serves you, reclaim your inner strength, and awaken the guardian within.",
        intro_style,
        70,
        y,
        PAGE_W - 140,
    )
    y -= 10
    c.setFillColor(PALE_GOLD)
    c.setFont("Georgia-Bold", 11.5)
    c.drawCentredString(PAGE_W / 2, y, "This is your moment to rise, radiant and unapologetic.")

    c.setStrokeColor(Color(PALE_GOLD.red, PALE_GOLD.green, PALE_GOLD.blue, alpha=0.7))
    c.setLineWidth(0.6)
    c.line(PAGE_W / 2 - 54, y - 24, PAGE_W / 2 + 54, y - 24)
    c.setFillColor(PAPER)
    c.setFont("Georgia-Italic", 12.2)
    c.drawCentredString(PAGE_W / 2, y - 50, "Let's ignite the fire - our inner fire.")

    invocations = [
        ("I Choose", GOLD, 422),
        ("I Release", EMBER, 344),
        ("I Embody", TEAL, 266),
        ("I Receive", GOLD, 188),
    ]
    for index, (invocation, color, invocation_y) in enumerate(invocations):
        c.setFillColor(color)
        c.setFont("Georgia-Italic", 18)
        c.drawCentredString(PAGE_W / 2, invocation_y, invocation)
        if index < len(invocations) - 1:
            diamond_y = invocation_y - 39
            diamond = c.beginPath()
            diamond.moveTo(PAGE_W / 2, diamond_y + 4)
            diamond.lineTo(PAGE_W / 2 + 4, diamond_y)
            diamond.lineTo(PAGE_W / 2, diamond_y - 4)
            diamond.lineTo(PAGE_W / 2 - 4, diamond_y)
            diamond.close()
            c.setFillColor(Color(GOLD.red, GOLD.green, GOLD.blue, alpha=0.34))
            c.drawPath(diamond, stroke=0, fill=1)
    c.showPage()

    draw_stage_page(
        c,
        3,
        "fire-goddess-front-flipped.jpg",
        "First threshold",
        "Initiation",
        "I Choose",
        [
            ("body", "Enter the ritual and choose the intention you are ready to carry forward."),
            ("section", "REFLECTION"),
            ("body", "Initiation is a threshold. At the threshold, we are asked to transform. To transmute."),
            ("quote", "&ldquo;The clearer our intention is, the more exact our manifestation will be.&rdquo;"),
            ("section", "JOURNAL"),
            ("prompt", "<b>What is your threshold today?</b><br/><br/>What is your intention for this ritual today?<br/><br/>What are you feeling you want to grow in your life?"),
            ("note", "Try to refine it into one word, or a very short phrase."),
        ],
        GOLD,
        image_anchor_x=0.48,
    )
    c.showPage()

    draw_stage_page(
        c,
        4,
        "destruction-oracle-card.png",
        "Second threshold",
        "Destruction",
        "I Release",
        [
            ("body", "Meet what is ready to be released and offer it to the fire."),
            ("section", "REFLECTION"),
            ("body", "At the threshold, we offer a sacrifice. We release what no longer serves us. We sacrifice our shadow at the threshold."),
            ("quote", "&ldquo;Allow it to burn completely. It is nothing but ash.&rdquo;"),
            ("section", "JOURNAL"),
            ("prompt", "<b>What are you releasing today?</b>"),
            ("note", "Take a piece of paper and write it down. Take your time."),
        ],
        EMBER,
        image_anchor_x=0.52,
    )
    c.showPage()

    draw_stage_page(
        c,
        5,
        "guardian-oracle-card.png",
        "Third threshold",
        "Guardian",
        "I Embody",
        [
            ("body", "Rise into the body and embody the energy you are ready to claim."),
            ("section", "REFLECTION"),
            ("body", "Think about your intention. Focus on your intention. That is your mantra."),
            ("quote", "&ldquo;This is your energy. This is your space.&rdquo;"),
            ("section", "JOURNAL"),
            ("prompt", "<b>Who is she?</b><br/><br/>What boundaries does she fight to protect?<br/><br/>What energy does she bring into the world?"),
            ("note", "Return to the hosted ritual for the complete movement practice."),
        ],
        TEAL,
        image_anchor_x=0.5,
    )
    c.showPage()

    draw_stage_page(
        c,
        6,
        "freedom-oracle-card.png",
        "Fourth threshold",
        "Freedom",
        "I Receive",
        [
            ("body", "Become still and receive the sound bath."),
            ("section", "REFLECTION"),
            ("body", "Lie down for the sound bath meditation. Surrender. Listen. Receive."),
            ("quote", "&ldquo;This is you. It is all you. You and the world.&rdquo;"),
            ("section", "RETURN"),
            ("body", "Slowly bring your awareness back into your body, back into this room. Carry with you the intention we set at the beginning of this ritual."),
            ("note", "Return to the hosted ritual for the complete sound bath meditation."),
        ],
        GOLD,
        image_anchor_x=0.5,
    )
    c.showPage()

    # Blessing
    draw_page_header(c, "Closing blessing", 7, BURGUNDY)
    c.setFillColor(INK)
    c.setFont("Chancery", 35)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 104, "Blessing")
    c.setStrokeColor(PALE_GOLD)
    c.line(PAGE_W / 2 - 62, PAGE_H - 127, PAGE_W / 2 + 62, PAGE_H - 127)
    blessing_lines = [
        "I left my shadow behind at the altar of destruction.",
        "It burned away to make space for the light.",
        "And I grow my fire, my flame, my guardian.",
        "I am my guardian.",
        "I stand tall, I stand proud.",
        "I am, I walk, I fight, I guide, I burn, I bring the light.",
        "Charge forward with your light.",
        "Leave the ashes behind.",
        "Rise up and shine.",
        "The ancient remembrance be your guide.",
        "You rise.",
        "You are between worlds.",
        "You walk between worlds.",
        "You walk, you fly.",
    ]
    c.setFillColor(INK)
    c.setFont("Georgia", 12.2)
    line_y = PAGE_H - 170
    for line in blessing_lines:
        c.drawCentredString(PAGE_W / 2, line_y, line)
        line_y -= 32
    c.setFillColor(Color(GOLD.red, GOLD.green, GOLD.blue, alpha=0.08))
    c.circle(PAGE_W / 2, 197, 94, stroke=0, fill=1)
    c.setFillColor(BURGUNDY)
    c.setFont("Georgia-Italic", 10.5)
    c.drawCentredString(PAGE_W / 2, 195, "Carry the fire forward with you.")
    c.showPage()

    # Return
    draw_page_header(c, "Return", 8, GOLD)
    draw_image_cover(
        c,
        IMAGE_DIR / "fire-goddess-music.jpeg",
        72,
        PAGE_H - 348,
        190,
        190,
        anchor_x=0.5,
    )
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.rect(72, PAGE_H - 348, 190, 190, stroke=1, fill=0)

    final_title = ParagraphStyle(
        "FinalTitle",
        fontName="Chancery",
        fontSize=30,
        leading=34,
        textColor=INK,
        alignment=TA_LEFT,
    )
    final_body = ParagraphStyle(
        "FinalBody",
        fontName="Georgia",
        fontSize=11.5,
        leading=18,
        textColor=INK,
        alignment=TA_LEFT,
    )
    x = 295
    y = draw_paragraph(c, "Open the Circle", final_title, x, PAGE_H - 171, PAGE_W - x - 55)
    y -= 18
    draw_paragraph(
        c,
        "When you are ready, slowly walk the circle three times in reverse, opening the sacred space and returning its energy to the world.",
        final_body,
        x,
        y,
        PAGE_W - x - 55,
    )

    c.setStrokeColor(PALE_GOLD)
    c.line(72, 402, PAGE_W - 72, 402)
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 9)
    c.drawCentredString(PAGE_W / 2, 370, "INTEGRATION")
    integration = ParagraphStyle(
        "Integration",
        fontName="Georgia",
        fontSize=12,
        leading=18,
        textColor=INK,
        alignment=TA_CENTER,
    )
    draw_paragraph(
        c,
        "Take a few quiet moments to journal what you chose, released, embodied, and received.<br/><br/>Record the dreams that arise afterward. Revisit the ritual whenever needed.<br/><br/>Over time, your journal becomes a living record of your transformation.",
        integration,
        92,
        338,
        PAGE_W - 184,
    )
    c.setFillColor(BURGUNDY)
    c.setFont("Georgia-Bold", 13)
    c.drawCentredString(PAGE_W / 2, 184, "Leave the ashes behind. Rise up and shine.")
    reminder = ParagraphStyle(
        "Reminder",
        fontName="Georgia-Italic",
        fontSize=11,
        leading=18,
        textColor=MUTED,
        alignment=TA_CENTER,
    )
    draw_paragraph(
        c,
        "This ritual can be revisited whenever you need courage, clarity, strength, or reconnection with your inner fire.",
        reminder,
        102,
        146,
        PAGE_W - 204,
    )
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 8)
    c.drawCentredString(PAGE_W / 2, 78, "SELF-PACED  ·  PERMANENT ACCESS")
    c.showPage()

    c.save()
    print(OUTPUT_FILE)


if __name__ == "__main__":
    generate()
