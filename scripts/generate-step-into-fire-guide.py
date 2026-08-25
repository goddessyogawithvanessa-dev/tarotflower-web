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
from pypdf import PdfReader, PdfWriter


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "public/images/digital-rituals/step-into-the-fire"
OUTPUT_DIR = ROOT / "private-assets/digital-rituals/step-into-the-fire"
OUTPUT_FILE = OUTPUT_DIR / "step-into-the-fire-ritual-guide.pdf"
TEMP_FILE = OUTPUT_DIR / "step-into-the-fire-ritual-guide-working.pdf"

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
    c.drawString(54, 25, "TAROT FLOWER  ·  STEP INTO YOUR FIRE")
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
    image_width = 220
    draw_image_cover(
        c,
        IMAGE_DIR / image_name,
        0,
        0,
        image_width,
        PAGE_H,
        anchor_x=image_anchor_x,
        anchor_y=0.5,
    )
    c.saveState()
    c.setFillAlpha(0.16)
    c.setFillColor(PAPER)
    c.rect(image_width - 48, 0, 72, PAGE_H, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(PAPER)
    c.rect(image_width, 0, PAGE_W - image_width, PAGE_H, stroke=0, fill=1)
    c.setFillColor(accent)
    c.rect(image_width, 0, 5, PAGE_H, stroke=0, fill=1)

    x = 252
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
        fontSize=9.35,
        leading=13.5,
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
        fontSize=10.65,
        leading=15,
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
        fontSize=9.2,
        leading=13.4,
        textColor=INK,
        alignment=TA_LEFT,
    )
    note = ParagraphStyle(
        "StageNote",
        fontName="Georgia-Italic",
        fontSize=8.6,
        leading=12.4,
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
        "body": 8,
        "section": 6,
        "quote": 10,
        "prompt": 9,
        "note": 7,
    }
    y = PAGE_H - 190
    for kind, text in content:
        y = draw_paragraph(c, text, styles[kind], x, y, width)
        y -= spacing[kind]
    if y < 48:
        raise ValueError(f"{title} page content extends into the footer: y={y:.1f}")

    c.setFillColor(MUTED)
    c.setFont("Georgia", 8)
    c.drawString(x, 25, "STEP INTO YOUR FIRE")
    c.drawRightString(PAGE_W - 52, 25, str(page_number))


def generate():
    register_fonts()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(TEMP_FILE), pagesize=A4, pageCompression=1)
    c.setTitle("Step Into Your Fire - Ritual Guide")
    c.setAuthor("Vanessa Hylande · Tarot Flower")
    c.setSubject("A ritual companion for courage and confidence")

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
    c.drawCentredString(PAGE_W / 2, 277, "Step Into Your Fire")
    c.setFillColor(BURGUNDY)
    c.setFont("Helvetica", 10)
    c.drawCentredString(PAGE_W / 2, 241, "A RITUAL FOR COURAGE & CONFIDENCE")
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
        607,
        PAGE_W,
        PAGE_H - 607,
        anchor_x=0.5,
        anchor_y=0.44,
    )
    c.saveState()
    c.setFillColor(Color(INK.red, INK.green, INK.blue, alpha=0.64))
    c.rect(0, 607, PAGE_W, PAGE_H - 607, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(EMBER)
    c.rect(0, PAGE_H - 8, PAGE_W, 8, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, 603, PAGE_W, 4, stroke=0, fill=1)
    draw_footer(c, 2)

    c.setFillColor(PALE_GOLD)
    c.setFont("Helvetica", 8)
    c.drawString(54, PAGE_H - 42, "WELCOME")
    title_style = ParagraphStyle(
        "Title",
        fontName="Chancery",
        fontSize=32,
        leading=38,
        textColor=PAPER,
        alignment=TA_CENTER,
    )
    welcome_body = ParagraphStyle(
        "WelcomeBody",
        fontName="Georgia",
        fontSize=9.8,
        leading=14.7,
        textColor=INK,
        alignment=TA_LEFT,
    )
    draw_paragraph(c, "Welcome to the Fire", title_style, 70, PAGE_H - 103, PAGE_W - 140)

    left_x = 54
    right_x = 310
    column_width = 231
    left_y = 570
    right_y = 570
    left_blocks = [
        "You have already made the hardest decision of all: <b>you chose yourself.</b> You chose to invest in yourself, to reclaim your own power, and to step into the fire.",
        "As we move through this ritual together, remember that there is no right or wrong way to practice a ritual. I'm sharing with you the way I practice my rituals, but you already know how to practice magic. Listen to your own soul. Listen to your intuition. Give yourself permission to dive deep.",
        "<b>All feelings are messengers.</b> The dark, painful, and scary feelings have as much value as the beautiful ones. If shame comes up, acknowledge it. Hold it, respect it, honor it, and release it. If fear comes up, take note. Write it in your journal. Listen to what it has to tell you.",
    ]
    right_blocks = [
        "Nobody is watching you. <b>It's just you and me in this room.</b> You and your Goddess Guide. Your connection to the divine.",
        "If you feel inspired to do something completely different, do it. This isn't a formula. This isn't a prescription. Listen to yourself and follow what arises.",
        "I'm just sharing my way with you, so that you can find yours.",
    ]
    for text in left_blocks:
        left_y = draw_paragraph(c, text, welcome_body, left_x, left_y, column_width) - 12
    for text in right_blocks:
        right_y = draw_paragraph(c, text, welcome_body, right_x, right_y, column_width) - 12
    if min(left_y, right_y) < 120:
        raise ValueError("Welcome page copy extends into the closing invocation area")

    c.setStrokeColor(Color(PALE_GOLD.red, PALE_GOLD.green, PALE_GOLD.blue, alpha=0.9))
    c.setLineWidth(0.6)
    c.line(PAGE_W / 2 - 54, 196, PAGE_W / 2 + 54, 196)
    closing_style = ParagraphStyle(
        "WelcomeClosing",
        fontName="Georgia-Bold",
        fontSize=10.6,
        leading=15,
        textColor=EMBER,
        alignment=TA_CENTER,
    )
    draw_paragraph(c, "Let's ignite the fire - our inner fire.", closing_style, 54, 178, PAGE_W - 108)
    invocation_style = ParagraphStyle(
        "WelcomeInvocations",
        fontName="Georgia-Italic",
        fontSize=10.4,
        leading=14,
        textColor=GOLD,
        alignment=TA_CENTER,
    )
    draw_paragraph(c, "<b>I Choose</b> &middot; <b>I Release</b> &middot; <b>I Embody</b> &middot; <b>I Receive</b>", invocation_style, 54, 138, PAGE_W - 108)
    c.showPage()

    draw_stage_page(
        c,
        3,
        "fire-goddess-front-flipped.jpg",
        "First threshold",
        "Initiation",
        "I Choose",
        [
            ("body", "There is power in becoming clear about what you want. Our words carry power, and the clearer we are with our intentions, the more directly we can put our energy behind what we want to create."),
            ("body", "Take your time here. Envision where you want to be. If you're not sure what you want, dive into the feeling instead. <b>What do you want to feel?</b> And if even that isn't clear yet, begin with what you no longer want to feel and look for its opposite."),
            ("quote", "Wanting is not the same as choosing."),
            ("quote", "<b>Choosing is ownership. Authorship. Commitment.</b>"),
            ("body", "When you choose, you stop wishing and waiting for something to happen to you. You become willing to put your own fire behind what you want - to bring your power, your intention, your responsibility, and your action to its creation."),
            ("section", "JOURNAL"),
            ("prompt", "What is your threshold today?<br/><br/>What do you choose?<br/><br/>What do you want to feel?<br/><br/>What are you ready to grow in your life?"),
            ("note", "Refine your intention into one word or a very short phrase. This will become your mantra as we move through the ritual."),
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
            ("body", "Before you release your shadow, take a moment to look at why it is here."),
            ("body", "Your shadow isn't something outside of you. It isn't simply a nuisance or something standing in your way. <b>It had a job.</b> Perhaps it gave you security, comfort, or protection when you needed it."),
            ("body", "Honor it. Respect it. Ask yourself what it has been doing for you - and then ask whether you still need it to do that job today."),
            ("body", "Sometimes our shadows simply continue running on autopilot long after the threat they were created to protect us from has disappeared."),
            ("section", "REFLECTION"),
            ("body", "Shame keeps us from looking directly at these parts of ourselves. But when we recognize that a shadow was there for a reason - that it was trying to protect us - we can begin to dissolve the shame around it."),
            ("body", "It is a part of you. Hold it. Honor it. Forgive yourself."),
            ("quote", "<b>We have to integrate what we want to transmute.</b>"),
            ("body", "We cannot transmute something while rejecting it and holding it outside of ourselves. First we bring it home. We understand why it was there. We thank it for what it tried to do for us."),
            ("body", "And when we know that we no longer need it, we allow it to go."),
            ("section", "JOURNAL"),
            ("prompt", "What shadow are you ready to meet today?<br/><br/>What was it protecting you from?<br/><br/>What did it give you when you needed it?<br/><br/>Does that job still belong in your life today?"),
            ("note", "If you are ready, write what you are releasing on a piece of paper. Take your time."),
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
            ("body", "Now we call in the archetype that fights for you."),
            ("body", "The one person in this world who can protect, love, defend, and empower you better than anyone else is <b>you</b>."),
            ("body", "We call deep into the fundamental divine feminine nature within us and invoke her power - to walk beside you, stand beside you, hold you up, inspire you, and carry you forward."),
            ("body", "She isn't outside of you."),
            ("quote", "<b>She is you. This is a remembrance.</b>"),
            ("section", "REFLECTION"),
            ("body", "Through movement, we don't simply imagine the Guardian. <b>We inhabit her.</b>"),
            ("body", "We allow ourselves to experience her through the body and through the senses - not only through the mind. Feel her power moving through you. Breathe her power. See her in yourself."),
            ("body", "This is embodiment."),
            ("section", "JOURNAL"),
            ("prompt", "Who is she?<br/><br/>What does she protect?<br/><br/>What boundaries does she fight to defend?<br/><br/>What energy does she bring into the world?<br/><br/>What does she feel like in your body?"),
            ("note", "Return to the hosted ritual for the complete Guardian embodiment practice with <i>Warrior Goddess</i>."),
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
            ("body", "Now we become still."),
            ("body", "Lie down and feel your body. Allow your mind and imagination to flow. Lose yourself in the music, in the sound, in the visions that may begin to grow from everything you have raised and moved through your body."),
            ("body", "You have created energy. You have embodied it. You have released it into the world."),
            ("quote", "Now allow yourself to <b>receive</b>."),
            ("section", "REFLECTION"),
            ("body", "Receiving doesn't come through thought or action. It comes through allowing."),
            ("body", "In this moment of stillness, subtle messages may begin to reveal themselves. You may see images or visions. You may notice sensations in your body, emotions, words, memories, or something you cannot immediately explain."),
            ("body", "Give them space."),
            ("body", "I channeled this sound bath meditation specifically for <i>Step Into Your Fire</i> and recorded it as a live channeling for this ritual. Allow the sound, music, and message to carry you into stillness."),
            ("quote", "Listen.<br/>Receive."),
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
        54,
        620,
        150,
        150,
        anchor_x=0.5,
    )
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.rect(54, 620, 150, 150, stroke=1, fill=0)

    final_title = ParagraphStyle(
        "FinalTitle",
        fontName="Chancery",
        fontSize=28,
        leading=32,
        textColor=INK,
        alignment=TA_LEFT,
    )
    final_body = ParagraphStyle(
        "FinalBody",
        fontName="Georgia",
        fontSize=10.1,
        leading=15.2,
        textColor=INK,
        alignment=TA_LEFT,
    )
    x = 235
    y = draw_paragraph(c, "Open the Circle", final_title, x, 738, PAGE_W - x - 54)
    y -= 14
    draw_paragraph(
        c,
        "When you are ready, slowly walk the circle three times in reverse, opening the sacred space and returning its energy to the world.",
        final_body,
        x,
        y,
        PAGE_W - x - 55,
    )

    c.setStrokeColor(PALE_GOLD)
    c.line(54, 585, PAGE_W - 54, 585)
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 9)
    c.drawCentredString(PAGE_W / 2, 556, "INTEGRATION")
    integration = ParagraphStyle(
        "Integration",
        fontName="Georgia",
        fontSize=9.9,
        leading=14.9,
        textColor=INK,
        alignment=TA_LEFT,
    )
    left_blocks = [
        "<b>The ritual doesn't end when the ritual ends.</b>",
        "Your body, mind, and spirit may continue working with what you have experienced long after you leave the circle. Everybody has a different timing and a different process. You may understand something immediately, or the message may reveal itself hours or days later.",
        "Keep your journal close. You may suddenly have a flash of inspiration or a realization that makes you stop and think, <i>Oh my God. This is it.</i> You may experience something that surprises you or affirms what arose during the ritual.",
        "And take your journal to bed with you.",
    ]
    right_blocks = [
        "During sleep, the body and conscious mind are at rest and we enter a different state. Dreams can become another place where the work continues and where messages reveal themselves.",
        "Write down what comes.",
        "The act of writing also grounds the experience back into the physical world - onto paper, into something tangible that you can return to later. Over time, your journal becomes a living record of your transformation.",
    ]
    left_y = 525
    right_y = 525
    for text in left_blocks:
        left_y = draw_paragraph(c, text, integration, 54, left_y, 231) - 11
    for text in right_blocks:
        right_y = draw_paragraph(c, text, integration, 310, right_y, 231) - 11
    if min(left_y, right_y) < 58:
        raise ValueError("Integration copy extends into the footer")
    c.showPage()

    # Elemental path
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    draw_image_cover(
        c,
        IMAGE_DIR / "elemental-rituals-header.jpg",
        0,
        607,
        PAGE_W,
        227,
        anchor_x=0.55,
        anchor_y=0.52,
    )
    c.saveState()
    c.setFillColor(Color(INK.red, INK.green, INK.blue, alpha=0.62))
    c.rect(0, 607, PAGE_W, 227, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(GOLD)
    c.rect(0, PAGE_H - 8, PAGE_W, 8, stroke=0, fill=1)
    draw_footer(c, 9)
    c.setFillColor(PALE_GOLD)
    c.setFont("Helvetica", 8)
    c.drawString(54, PAGE_H - 42, "ELEMENTAL PATH")
    elemental_title = ParagraphStyle(
        "ElementalTitle",
        fontName="Chancery",
        fontSize=29,
        leading=34,
        textColor=PAPER,
        alignment=TA_CENTER,
    )
    draw_paragraph(c, "What Element Is Calling You Next?", elemental_title, 72, 744, PAGE_W - 144)

    elemental_body = ParagraphStyle(
        "ElementalBody",
        fontName="Georgia",
        fontSize=10.2,
        leading=15.4,
        textColor=INK,
        alignment=TA_LEFT,
    )
    elemental_y = 568
    elemental_y = draw_paragraph(c, "Different moments in our lives call us toward different elements.", elemental_body, 72, elemental_y, PAGE_W - 144) - 16
    element_blocks = [
        (TEAL, "Water", "Perhaps <b>Water</b> is calling you toward your emotional world - to tend grief, soften an overflowing or guarded heart, or allow your heart to catch up with what your mind already knows."),
        (GOLD, "Earth", "Perhaps <b>Earth</b> is asking you to make something real - to ground your ideas into everyday life, nourish your body, care for yourself, and create the physical conditions in which what you are growing can take root."),
        (BURGUNDY, "Air", "Perhaps <b>Air</b> is asking you to reclaim your voice - to speak what you know, trust what you have to say, and allow yourself to be heard."),
        (EMBER, "Fire", "And whenever you need courage, action, strength, or the power to create, <b>Fire will still be here.</b>"),
    ]
    for color, label, text in element_blocks:
        c.setFillColor(color)
        c.rect(72, elemental_y - 4, 3, 18, stroke=0, fill=1)
        elemental_y = draw_paragraph(c, text, elemental_body, 88, elemental_y + 10, PAGE_W - 160) - 14
    if elemental_y < 150:
        raise ValueError("Elemental path copy overlaps the closing statement")

    closing_note = ParagraphStyle(
        "ElementalClosing",
        fontName="Georgia-Italic",
        fontSize=11.2,
        leading=17,
        textColor=MUTED,
        alignment=TA_CENTER,
    )
    draw_paragraph(c, "Listen to what calls you.", closing_note, 90, elemental_y + 4, PAGE_W - 180)
    c.setStrokeColor(PALE_GOLD)
    c.line(PAGE_W / 2 - 58, 116, PAGE_W / 2 + 58, 116)
    c.setFillColor(BURGUNDY)
    c.setFont("Georgia-Bold", 13)
    c.drawCentredString(PAGE_W / 2, 84, "Leave the ashes behind. Rise up and shine.")
    c.showPage()

    c.save()

    new_reader = PdfReader(str(TEMP_FILE))
    writer = PdfWriter()
    for page in new_reader.pages:
        writer.add_page(page)
    metadata = {key: str(value) for key, value in (new_reader.metadata or {}).items() if value is not None}
    if metadata:
        writer.add_metadata(metadata)
    with OUTPUT_FILE.open("wb") as stream:
        writer.write(stream)
    TEMP_FILE.unlink(missing_ok=True)
    print(OUTPUT_FILE)


if __name__ == "__main__":
    generate()
