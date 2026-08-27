"""
PDF Report — clean single-page layout:
  • Header: "Resources Claims Analysis" + date, gold rule
  • Client name (large) + description (smaller, separate line)
  • Two hero cards: Funded Ratio | Surplus/Deficit
  • Resources vs Claims breakdown table
  • Portfolio Overview: larger bar chart + two pie charts side by side
  • Sankey-style flow diagram (canvas-style, drawn with ReportLab shapes)
  • Key metrics tiles (no Eq. references)
  • Methodology footnote (no Eq. references)
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO
from datetime import date
import math

from models import PlanInput, FundedRatioResult
from routers.calculate import calculate_funded_ratio

router = APIRouter(tags=["Report"])

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether, PageBreak,
    )
    from reportlab.graphics.shapes import (
        Drawing, Rect, String, Line, Wedge, Path, Group, Circle,
    )
    from reportlab.graphics import renderPDF
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

# ── Brand palette ──────────────────────────────────────────────────────────────
def _c(h): return colors.HexColor(h)

TEAL       = _c("#598A7D")
STEEL      = _c("#698D9F")
TERRACOTTA = _c("#C97955")
SAND       = _c("#CAB688")
NAVY       = _c("#1a2744")
GOLD       = _c("#c9a84c")
LIGHT_BG   = _c("#F9FAFB")
ROW_ALT    = _c("#F3F4F6")
BORDER     = _c("#E5E7EB")
TEXT       = _c("#374151")
MUTED      = _c("#6B7280")
GREEN_VAL  = _c("#166534")
RED_VAL    = _c("#991B1B")
WHITE      = colors.white


def _couple_name(plan):
    """Build smart display name: 'John and Jane Smith' or 'John Doe and Jane Smith'."""
    primary = plan.investor_name.strip()
    if not plan.has_co_investor or not plan.co_investor_name:
        return primary
    co = plan.co_investor_name.strip()
    p_parts = primary.split()
    c_parts = co.split()
    p_last = p_parts[-1] if p_parts else ''
    c_last = c_parts[-1] if c_parts else ''
    p_first = p_parts[0] if p_parts else primary
    if p_last == c_last:
        return f"{p_first} and {co}"
    return f"{primary} and {co}"


def _dollar(v):
    if v < 0: return f"(${abs(v):,.0f})"
    return f"${v:,.0f}"

def _dollarM(v):
    if abs(v) >= 1e6: return f"${v/1e6:.2f}M"
    if abs(v) >= 1e3: return f"${v/1e3:.0f}k"
    return _dollar(v)

def _pct(v):
    return f"{v:.1f}%"

def _status_color(status):
    return {
        "overfunded":   GREEN_VAL,
        "fully_funded": GREEN_VAL,
        "at_risk":      _c("#92400E"),
        "underfunded":  RED_VAL,
    }.get(status, MUTED)


@router.post("/report")
async def generate_report(plan: PlanInput):
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(500, "reportlab not installed")
    result: FundedRatioResult = calculate_funded_ratio(plan)
    buffer = BytesIO()
    _build_pdf(buffer, plan, result)
    buffer.seek(0)
    filename = f"RCA_{plan.investor_name.replace(' ', '_')}_{date.today().isoformat()}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ── Drawing helpers ────────────────────────────────────────────────────────────

def _stacked_bar_chart(res_invest, res_add, clm_ess, clm_disc, width, height=180):
    """Stacked bar chart comparing Resources vs Claims."""
    d = Drawing(width, height)

    bar_w  = min(90, width * 0.18)
    max_v  = max(res_invest + res_add, clm_ess + clm_disc, 1)
    plot_h = height - 30
    plot_y = 14
    cx1    = width * 0.28
    cx2    = width * 0.72

    def sc(v): return (v / max_v) * plot_h

    # Resources bars
    h1 = sc(res_invest);  h2 = sc(res_add)
    d.add(Rect(cx1 - bar_w/2, plot_y,      bar_w, h1, fillColor=TEAL,  strokeColor=None))
    d.add(Rect(cx1 - bar_w/2, plot_y + h1, bar_w, h2, fillColor=STEEL, strokeColor=None))

    # Claims bars
    h3 = sc(clm_ess);  h4 = sc(clm_disc)
    d.add(Rect(cx2 - bar_w/2, plot_y,      bar_w, h3, fillColor=TERRACOTTA, strokeColor=None))
    d.add(Rect(cx2 - bar_w/2, plot_y + h3, bar_w, h4, fillColor=SAND,       strokeColor=None))

    # Percentage labels INSIDE each bar segment
    tot_r = res_invest + res_add
    tot_c = clm_ess + clm_disc
    def pct_label(cx, y, h, val, total):
        if h > 12 and total > 0:
            pct = val / total * 100
            d.add(String(cx, y + h/2 - 3, f"{pct:.0f}%",
                fontName="Helvetica-Bold", fontSize=8,
                fillColor=WHITE, textAnchor="middle"))
    pct_label(cx1, plot_y, h1, res_invest, tot_r)
    pct_label(cx1, plot_y + h1, h2, res_add, tot_r)
    pct_label(cx2, plot_y, h3, clm_ess, tot_c)
    pct_label(cx2, plot_y + h3, h4, clm_disc, tot_c)

    # Totals above bars
    for cx, tot, col in [(cx1, tot_r, "#166534"), (cx2, tot_c, "#374151")]:
        d.add(String(cx, plot_y + sc(tot) + 5, _dollarM(tot),
            fontName="Helvetica-Bold", fontSize=7.5,
            fillColor=_c(col), textAnchor="middle"))

    # Bar labels below
    for cx, label in [(cx1, "Resources"), (cx2, "Claims")]:
        d.add(String(cx, 2, label,
            fontName="Helvetica-Bold", fontSize=9,
            fillColor=_c("#374151"), textAnchor="middle"))

    return d


def _pie_chart(data, size=100):
    """Pie chart with percentage labels inside wedges."""
    total = sum(x["value"] for x in data)
    d = Drawing(size, size)
    if total == 0:
        return d
    cx = cy = size / 2
    r  = size / 2 - 3
    angle = 90.0
    for item in data:
        if item["value"] <= 0:
            continue
        sweep = (item["value"] / total) * 360.0
        end   = angle - sweep
        w = Wedge(cx, cy, r, end, angle,
            fillColor=_c(item["color"]),
            strokeColor=WHITE, strokeWidth=1.5)
        d.add(w)
        # Percentage label inside the wedge
        pct = item["value"] / total * 100
        if pct > 4:
            mid_angle = math.radians(angle - sweep / 2)
            lr = r * 0.55
            lx = cx + lr * math.cos(mid_angle)
            ly = cy + lr * math.sin(mid_angle)
            d.add(String(lx, ly - 3, f"{pct:.0f}%",
                fontName="Helvetica-Bold", fontSize=9,
                fillColor=WHITE, textAnchor="middle"))
        angle = end
    return d


def _legend_drawing(items, width, row_h=14):
    h = len(items) * row_h + 4
    d = Drawing(width, h)
    y = h - row_h
    # Estimate max text width to center the block
    max_txt = max(len(f"{i['name']}: {_dollarM(i['value'])}") for i in items) if items else 10
    block_w = max_txt * 4.8 + 14
    start_x = max(0, (width - block_w) / 2)
    for item in items:
        d.add(Rect(start_x, y + 2, 9, 9, fillColor=_c(item["color"]), strokeColor=None))
        label = f"{item['name']}: {_dollarM(item['value'])}"
        d.add(String(start_x + 13, y + 1, label,
            fontName="Helvetica", fontSize=7.5, fillColor=_c("#374151")))
        y -= row_h
    return d


def _sankey_drawing(src_items, clm_items, total_src, total_clm, width, height=None):
    """
    Proper Sankey: sources (left) → midRes bar → midClm bar → claims (right).
    Uses bezier-approximated flows via polyline paths.
    """
    n_rows  = max(len(src_items), len(clm_items))
    if height is None:
        height = max(n_rows * 52 + 60, 280)

    d = Drawing(width, height)

    NW     = 14          # node bar width
    GAP    = 6           # gap between stacked nodes
    PAD_T  = 18
    PAD_B  = 45
    LBL_L  = width * 0.26
    LBL_R  = width * 0.27
    MID    = width - LBL_L - LBL_R
    X0     = LBL_L
    X1     = LBL_L + MID * 0.32
    X2     = LBL_L + MID * 0.68
    X3     = width - LBL_R

    GRAND  = max(total_src, total_clm, 1)
    TRACK  = height - PAD_T - PAD_B

    def sc(v): return (v / GRAND) * TRACK

    SRC_COLORS = {"invest": "#598A7D", "add": "#698D9F", "liability": "#939598"}
    CLM_COLORS = {"essential": "#C97955", "healthcare": "#C97955",
                  "housing": "#C97955", "home improvement": "#C97955",
                  "home_improvement": "#C97955", "desired": "#CAB688", "other": "#CAB688"}

    def stack_nodes(items, x, total):
        """Stack nodes top-to-bottom (high y = top in ReportLab)."""
        used_h = sc(total)
        gaps   = max(0, (len(items) - 1) * GAP)
        bar_px = max(0, used_h - gaps)
        # Start from top of the track area and stack downward
        start_y = height - PAD_T - (TRACK - used_h) / 2
        y = start_y
        nodes  = []
        for n in items:
            abs_val = abs(n["val"])
            h = max(3, (abs_val / max(total, 1)) * bar_px)
            y -= h
            nodes.append({**n, "x": x, "y": y, "h": h})
            y -= GAP
        return nodes

    # Separate positive sources from liabilities
    src_positive = [n for n in src_items if n["val"] > 0]
    src_liab = [n for n in src_items if n["val"] <= 0]
    gross_src = sum(abs(n["val"]) for n in src_positive)

    src_nodes = stack_nodes(src_positive, X0, gross_src)
    clm_nodes = stack_nodes(clm_items, X3, total_clm)

    # Mid-bar: position to align with the node stack
    GRAND_H = sc(max(gross_src, total_clm, 1))
    mid_top = height - PAD_T - (TRACK - GRAND_H) / 2
    mid_res_h = sc(gross_src);  mid_res_y = mid_top - mid_res_h
    mid_clm_h = sc(total_clm);  mid_clm_y = mid_top - mid_clm_h

    # Position liability nodes below positive sources (lower y in ReportLab)
    liab_nodes = []
    if src_liab:
        last_src = src_nodes[-1] if src_nodes else None
        liab_y = (last_src["y"] - GAP * 2) if last_src else height - PAD_T
        for n in src_liab:
            h = max(6, min(sc(abs(n["val"])), 18))
            liab_y -= h
            liab_nodes.append({**n, "x": X0, "y": liab_y, "h": h})
            liab_y -= GAP

    def draw_flow(x0, yT0, yB0, x1, yT1, yB1, hex_col, alpha=0.18):
        """Approximate bezier band with a trapezoid path (ReportLab has no bezier fill)."""
        # Use 8 vertical slices to approximate the bezier curve
        steps = 10
        top_pts = []
        bot_pts = []
        for i in range(steps + 1):
            t  = i / steps
            # Cubic bezier control points: both controls at midpoint x
            cx = (x0 + x1) / 2
            bx = x0 + t * (x1 - x0)   # linear x is fine for visual
            # Top edge
            tyT = yT0 + t * (yT1 - yT0)
            # Bot edge
            tyB = yB0 + t * (yB1 - yB0)
            top_pts.append((bx, tyT))
            bot_pts.append((bx, tyB))

        path_pts = top_pts + list(reversed(bot_pts))
        if len(path_pts) < 3:
            return

        # Build a polygon using Path
        p = Path(fillColor=_c(hex_col), strokeColor=None,
                 fillOpacity=alpha, strokeOpacity=0)
        p.moveTo(path_pts[0][0], path_pts[0][1])
        for px, py in path_pts[1:]:
            p.lineTo(px, py)
        p.closePath()
        d.add(p)

    # Flows: positive src nodes → midRes (proportional to fill mid-bar, top-down)
    mr_off = 0
    total_pos_val = sum(abs(n["val"]) for n in src_nodes) or 1
    for n in src_nodes:
        col = SRC_COLORS.get(n.get("type", "invest"), "#598A7D")
        src_top = n["y"] + n["h"]
        src_bot = n["y"]
        flow_h = (abs(n["val"]) / total_pos_val) * mid_res_h
        mid_top_flow = mid_res_y + mid_res_h - mr_off
        mid_bot_flow = mid_top_flow - flow_h
        draw_flow(n["x"] + NW, src_top, src_bot,
                  X1, mid_top_flow, mid_bot_flow,
                  col, 0.20)
        mr_off += flow_h

    # Liability nodes — dashed line connector to bottom of mid-bar
    for n in liab_nodes:
        cy = n["y"] + n["h"] / 2
        d.add(Line(n["x"] + NW + 2, cy, X1, mid_res_y,
            strokeColor=_c("#939598"), strokeWidth=0.8,
            strokeDashArray=[3, 2]))

    # Bridge: midRes → midClm (top-to-bottom)
    draw_flow(X1 + NW, mid_res_y + mid_res_h, mid_res_y,
              X2, mid_clm_y + mid_clm_h, mid_clm_y,
              "#698D9F", 0.13)

    # Flows: midClm → clm nodes (top down)
    mc_off = 0
    for n in clm_nodes:
        col = CLM_COLORS.get((n.get("grouping", "essential") or "essential").lower(), "#CAB688")
        fh  = mid_clm_h * (n["val"] / total_clm)
        mid_flow_top = mid_clm_y + mid_clm_h - mc_off
        mid_flow_bot = mid_flow_top - fh
        draw_flow(X2 + NW, mid_flow_top, mid_flow_bot,
                  n["x"], n["y"] + n["h"], n["y"],
                  col, 0.22)
        mc_off += fh

    # Node bars — positive sources + liabilities
    for n in src_nodes:
        col = SRC_COLORS.get(n.get("type", "invest"), "#598A7D")
        d.add(Rect(n["x"], n["y"], NW, max(n["h"], 3),
            fillColor=_c(col), strokeColor=None))
    for n in liab_nodes:
        d.add(Rect(n["x"], n["y"], NW, max(n["h"], 3),
            fillColor=_c("#939598"), strokeColor=None))

    for n in clm_nodes:
        col = CLM_COLORS.get((n.get("grouping", "essential") or "essential").lower(), "#CAB688")
        d.add(Rect(n["x"], n["y"], NW, max(n["h"], 3),
            fillColor=_c(col), strokeColor=None))

    # Mid bars
    d.add(Rect(X1, mid_res_y, NW, max(mid_res_h, 3), fillColor=_c("#4a7a6e"), strokeColor=None))
    d.add(Rect(X2, mid_clm_y, NW, max(mid_clm_h, 3), fillColor=_c("#C97955"), strokeColor=None))

    # Left labels — with anti-overlap spacing (top-to-bottom = decreasing y)
    prev_lcy = 99999
    for n in src_nodes + liab_nodes:
        cy = n["y"] + n["h"] / 2
        label_cy = min(cy, prev_lcy - 20)
        prev_lcy = label_cy
        is_liab = n.get("type") == "liability"
        dot_col = _c(SRC_COLORS.get(n.get("type", "invest"), "#598A7D"))
        d.add(Circle(n["x"] - 9, cy, 3, fillColor=dot_col, strokeColor=None))
        if abs(label_cy - cy) > 4:
            d.add(Line(n["x"] - 9, cy, n["x"] - 14, label_cy,
                strokeColor=_c("#D1D5DB"), strokeWidth=0.5))
        lbl_col = _c("#939598") if is_liab else _c("#1a2744")
        val_str = f"({_dollarM(abs(n['val']))})" if is_liab else _dollarM(n["val"])
        d.add(String(n["x"] - 15, label_cy + 4, n["label"],
            fontName="Helvetica-Oblique" if is_liab else "Helvetica",
            fontSize=8, fillColor=lbl_col, textAnchor="end"))
        d.add(String(n["x"] - 15, label_cy - 8, val_str,
            fontName="Helvetica", fontSize=7.5, fillColor=_c("#939598") if is_liab else _c("#6B7280"),
            textAnchor="end"))

    # Right labels — use anti-overlap spacing
    min_label_gap = 22  # minimum px between label centers
    prev_cy = 99999
    for n in clm_nodes:
        cy = n["y"] + n["h"] / 2
        # Push label down (lower y) if too close to previous
        label_cy = min(cy, prev_cy - min_label_gap)
        prev_cy = label_cy
        dot_col = _c(CLM_COLORS.get((n.get("grouping","essential") or "essential").lower(), "#CAB688"))
        d.add(Circle(n["x"] + NW + 8, cy, 3, fillColor=dot_col, strokeColor=None))
        # Connect dot to label with small line if pushed
        if abs(label_cy - cy) > 4:
            d.add(Line(n["x"] + NW + 8, cy, n["x"] + NW + 14, label_cy,
                strokeColor=_c("#D1D5DB"), strokeWidth=0.5))
        d.add(String(n["x"] + NW + 15, label_cy + 4, n["label"],
            fontName="Helvetica", fontSize=8, fillColor=_c("#1a2744"),
            textAnchor="start"))
        d.add(String(n["x"] + NW + 15, label_cy - 8, _dollarM(n["val"]),
            fontName="Helvetica", fontSize=7.5, fillColor=_c("#6B7280"),
            textAnchor="start"))

    # Mid labels — beside bars
    def mid_label(x, y, h, label, total, side="left"):
        lx = x - 6 if side == "left" else x + NW + 6
        anchor = "end" if side == "left" else "start"
        cy = y + h / 2
        d.add(String(lx, cy + 5, label,
            fontName="Helvetica-Bold", fontSize=9, fillColor=_c("#1a2744"),
            textAnchor=anchor))
        d.add(String(lx, cy - 8, _dollarM(total),
            fontName="Helvetica", fontSize=8, fillColor=_c("#6B7280"),
            textAnchor=anchor))

    mid_label(X1, mid_res_y, mid_res_h, "Resources", total_src, "left")  # total_src is net
    mid_label(X2, mid_clm_y, mid_clm_h, "Claims",    total_clm, "right")



    return d, height


# ── Main PDF builder ───────────────────────────────────────────────────────────

def _build_pdf(buffer, plan, result):
    doc = SimpleDocTemplate(buffer, pagesize=letter,
        rightMargin=0.6*inch, leftMargin=0.6*inch,
        topMargin=0.55*inch, bottomMargin=0.55*inch)

    styles = getSampleStyleSheet()
    W = letter[0] - 1.2*inch

    def sty(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    label_sty  = sty("lbl",  fontName="Helvetica",       fontSize=8,   textColor=MUTED,    spaceAfter=1, alignment=TA_CENTER)
    hero_sty   = sty("hero", fontName="Helvetica-Bold",   fontSize=25,  textColor=TEAL,     leading=29, alignment=TA_CENTER)
    h2_sty     = sty("h2",   fontName="Helvetica-Bold",   fontSize=10,  textColor=NAVY,     spaceBefore=6, spaceAfter=3)
    col_hdr    = sty("ch",   fontName="Helvetica-Bold",   fontSize=8,   textColor=WHITE,    alignment=TA_LEFT)
    row_lbl    = sty("rl",   fontName="Helvetica",        fontSize=8.5, textColor=TEXT)
    row_val    = sty("rv",   fontName="Helvetica",        fontSize=8.5, textColor=TEXT,     alignment=TA_RIGHT)
    total_lbl  = sty("tl",   fontName="Helvetica-Bold",   fontSize=9,   textColor=NAVY)
    total_val  = sty("tv",   fontName="Helvetica-Bold",   fontSize=9,   textColor=NAVY,    alignment=TA_RIGHT)
    metric_lbl = sty("ml",   fontName="Helvetica",        fontSize=8,   textColor=MUTED,    alignment=TA_CENTER, spaceAfter=2)
    metric_sub = sty("ms",   fontName="Helvetica",        fontSize=7.5, textColor=MUTED,    alignment=TA_CENTER)
    note_sty   = sty("note", fontName="Helvetica-Oblique",fontSize=7,   textColor=MUTED,    leading=10)
    chart_lbl  = sty("clbl", fontName="Helvetica-Bold",   fontSize=8.5, textColor=NAVY,     alignment=TA_CENTER, spaceAfter=3)

    story = []
    res  = result.resources
    clms = result.claims

    # ── Header ─────────────────────────────────────────────────────────────────
    hdr = Table([[
        Paragraph("Resources Claims Analysis",
            sty("hh", fontName="Helvetica-Bold", fontSize=11, textColor=NAVY)),
        Paragraph(date.today().strftime("%B %d, %Y"),
            sty("hd", fontName="Helvetica", fontSize=9, textColor=MUTED, alignment=TA_RIGHT)),
    ]], colWidths=[W*0.6, W*0.4])
    hdr.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "BOTTOM"),
        ("LINEBELOW",     (0,0), (-1,-1), 2, GOLD),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story += [hdr, Spacer(1, 8)]

    # ── Client name + description in a KeepTogether block ──────────────────────
    display_name = _couple_name(plan)
    client_rows = [[Paragraph(display_name,
        sty("cn", fontName="Helvetica-Bold", fontSize=18, textColor=NAVY))]]
    if result.description:
        client_rows.append([Paragraph(result.description,
            sty("desc", fontName="Helvetica", fontSize=10, textColor=MUTED))])
    client_tbl = Table(client_rows, colWidths=[W])
    client_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0,0), (0,0), 2),   # name row
        ("BOTTOMPADDING", (0,0), (0,0), 6),   # space below name
        ("TOPPADDING",    (0,1), (0,1), 2),   # description row
        ("BOTTOMPADDING", (0,1), (0,1), 2),
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
    ]))
    story += [client_tbl, Spacer(1, 5)]

    # ── Hero cards ─────────────────────────────────────────────────────────────
    # Match status color across both hero cards
    if result.funded_ratio_pct >= 100:
        status_color = GREEN_VAL
    elif result.funded_ratio_pct >= 80:
        status_color = _c("#92400E")  # amber for at_risk
    else:
        status_color = RED_VAL
    surplus_color = status_color

    def _hero_card(rows, accent, cw):
        t = Table(rows, colWidths=[cw])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), LIGHT_BG),
            ("LINEABOVE",     (0,0), (-1,0),  2, accent),
            ("TOPPADDING",    (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING",   (0,0), (-1,-1), 8),
            ("RIGHTPADDING",  (0,0), (-1,-1), 8),
            ("BOX",           (0,0), (-1,-1), 0.5, BORDER),
            ("ALIGN",         (0,0), (-1,-1), "CENTER"),
        ]))
        return t

    if result.funded_ratio_pct >= 100:
        fr_accent = TEAL
    elif result.funded_ratio_pct >= 80:
        fr_accent = _c("#92400E")  # amber
    else:
        fr_accent = RED_VAL
    fr_card = _hero_card([
        [Paragraph("Funded ratio", label_sty)],
        [Paragraph(f"{result.funded_ratio_pct:.1f}%",
            sty("hv", fontName="Helvetica-Bold", fontSize=22, leading=26,
                textColor=fr_accent, alignment=TA_CENTER))],
        [Paragraph(result.status.replace("_"," ").title(),
            sty("fs", fontName="Helvetica", fontSize=8, textColor=_status_color(result.status),
                alignment=TA_CENTER))],
    ], fr_accent, W*0.44)

    sr_card = _hero_card([
        [Paragraph("Surplus / (Deficit)", label_sty)],
        [Paragraph(_dollar(result.surplus_deficit),
            sty("sv", fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=surplus_color,
                alignment=TA_CENTER))],
        [Paragraph("Resources minus claims",
            sty("ss", fontName="Helvetica", fontSize=8, textColor=MUTED,
                alignment=TA_CENTER))],
    ], surplus_color, W*0.44)

    hero_row = Table([[fr_card, sr_card]], colWidths=[W*0.48, W*0.48])
    hero_row.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    story += [hero_row, Spacer(1, 10)]

    # ── Key metrics tiles (page 1, right after heroes) ─────────────────────────
    def _metric_tile(lbl, val_str, desc, val_color=NAVY):
        t = Table([
            [Paragraph(lbl, sty("mttl", fontName="Helvetica", fontSize=8,
                                 textColor=MUTED, spaceAfter=1, alignment=TA_CENTER))],
            [Paragraph(val_str, sty("mtv", fontName="Helvetica-Bold", fontSize=22,
                                    leading=26, textColor=val_color, alignment=TA_CENTER))],
            [Paragraph(desc, sty("mtd", fontName="Helvetica", fontSize=8,
                                  textColor=MUTED, alignment=TA_CENTER))],
        ], colWidths=[W*0.44])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), LIGHT_BG),
            ("LINEABOVE",     (0,0), (-1,0),  2, val_color),
            ("TOPPADDING",    (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING",   (0,0), (-1,-1), 8),
            ("RIGHTPADDING",  (0,0), (-1,-1), 8),
            ("BOX",           (0,0), (-1,-1), 0.5, BORDER),
            ("ALIGN",         (0,0), (-1,-1), "CENTER"),
        ]))
        return t

    # Match status color across both hero cards
    if result.funded_ratio_pct >= 100:
        status_color = GREEN_VAL
    elif result.funded_ratio_pct >= 80:
        status_color = _c("#92400E")  # amber for at_risk
    else:
        status_color = RED_VAL
    surplus_color = status_color
    m1 = _metric_tile("Annuity factor",
                       f"{result.annuity_factor:.2f}",
                       "PV of $1/year for life")
    m2 = _metric_tile("Max withdrawal rate",
                       _pct(result.max_sustainable_withdrawal_rate * 100),
                       "1 ÷ Annuity Factor")
    mrow = Table([[m1, m2]],
        colWidths=[W*0.48, W*0.48])
    mrow.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    story += [mrow, Spacer(1, 8)]

    # ── Resources vs Claims table ──────────────────────────────────────────────
    story.append(Paragraph("Resources vs. Claims", h2_sty))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=5))

    _liab = res.liabilities_total or 0
    res_rows = [
        ("Portfolio (after-tax)",   res.portfolio_after_tax or 0),
        ("Private assets (net)",    res.private_assets_net  or 0),
        ("Social security (PV)",    res.social_security_pv  or 0),
        ("Retirement income (PV)",  (getattr(res,"retirement_income_pv",0) or 0)
                                    + (res.pension_pv or 0)
                                    + (res.annuity_pv or 0)
                                    + (res.other_income_pv or 0)),
        ("Future assets (PV)",      getattr(res,"future_assets_pv",0) or 0),
        ("Human capital / savings", res.human_capital_pv or 0),
    ]
    res_rows = [(l, v) for l, v in res_rows if v > 0]
    # Show liabilities as a deduction row so table sum = total_resources
    if _liab > 0:
        res_rows.append(("Less: standalone liabilities", -_liab))
    clm_rows = [(sg["label"], sg["pv"]) for sg in clms.spending_goals]
    n = max(len(res_rows), len(clm_rows))

    tdata = [[
        Paragraph("Resources", col_hdr), Paragraph("", col_hdr),
        Paragraph("Claims",    col_hdr), Paragraph("", col_hdr),
    ]]
    for i in range(n):
        rval = ""
        rlbl = ""
        if i < len(res_rows):
            rlbl = res_rows[i][0]
            v = res_rows[i][1]
            is_neg = v < 0
            rval_sty = sty("rv_neg", fontName="Helvetica-Oblique", fontSize=7.5,
                           textColor=_c("#991B1B"), alignment=TA_RIGHT) if is_neg else row_val
            rlbl_sty = sty("rl_neg", fontName="Helvetica-Oblique", fontSize=7.5,
                           textColor=_c("#6B7280")) if is_neg else row_lbl
            rval = Paragraph(_dollar(v), rval_sty)
        else:
            rval = Paragraph("", row_val)
        tdata.append([
            Paragraph(rlbl, rlbl_sty if i < len(res_rows) and res_rows[i][1] < 0 else row_lbl),
            rval,
            Paragraph(clm_rows[i][0] if i < len(clm_rows) else "", row_lbl),
            Paragraph(_dollar(clm_rows[i][1]) if i < len(clm_rows) else "", row_val),
        ])
    tdata.append([
        Paragraph("Total resources", total_lbl),
        Paragraph(_dollar(res.total_resources), total_val),
        Paragraph("Total claims",    total_lbl),
        Paragraph(_dollar(clms.total_claims),   total_val),
    ])
    nr = len(tdata)
    bk = Table(tdata, colWidths=[W*0.30, W*0.18, W*0.30, W*0.18], hAlign='CENTER')
    bk.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),  (1,0),       TEAL),
        ("BACKGROUND",    (2,0),  (3,0),       TERRACOTTA),
        ("FONTSIZE",      (0,0),  (-1,-1),     8.5),
        ("TEXTCOLOR",     (0,1),  (-1,-2),     TEXT),
        ("ALIGN",         (1,0),  (1,-1),      "RIGHT"),
        ("ALIGN",         (3,0),  (3,-1),      "RIGHT"),
        ("ROWBACKGROUNDS",(0,1),  (-1,nr-2),   [WHITE, ROW_ALT]),
        ("TOPPADDING",    (0,0),  (-1,-1),     3),
        ("BOTTOMPADDING", (0,0),  (-1,-1),     3),
        ("LEFTPADDING",   (0,0),  (-1,-1),     6),
        ("RIGHTPADDING",  (0,0),  (-1,-1),     6),
        ("LINEBEFORE",    (2,0),  (2,-1),      0.5, BORDER),
        ("LINEABOVE",     (0,nr-1),(-1,nr-1),  1,   NAVY),
        ("BACKGROUND",    (0,nr-1),(-1,nr-1),  LIGHT_BG),
        ("BOX",           (0,0),  (-1,-1),     0.5, BORDER),
    ]))
    story += [bk, Spacer(1, 12)]

    # ── Portfolio Overview: bar + two pies (page 2) ──────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Portfolio Overview", h2_sty))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=8))

    ESSENTIAL_GRP = {"essential", "healthcare", "housing", "home improvement", "home_improvement"}
    ess_goals  = [g for g in clms.spending_goals if (g.get("grouping","essential") or "essential").lower() in ESSENTIAL_GRP]
    disc_goals = [g for g in clms.spending_goals if (g.get("grouping","essential") or "essential").lower() not in ESSENTIAL_GRP]
    clm_ess  = sum(g["pv"] for g in ess_goals)  if ess_goals  else clms.total_claims * 0.75
    clm_disc = sum(g["pv"] for g in disc_goals) if disc_goals else clms.total_claims * 0.25

    res_invest = (res.portfolio_after_tax or 0) + (res.private_assets_net or 0)
    res_add    = ((getattr(res,"retirement_income_pv",0) or 0)
                  + (res.social_security_pv  or 0)
                  + (res.pension_pv or 0)
                  + (res.annuity_pv or 0)
                  + (res.other_income_pv or 0)
                  + (res.human_capital_pv or 0)
                  + (getattr(res,"future_assets_pv",0) or 0)
                  - (res.liabilities_total or 0))

    # Row 1: full-width stacked bar chart
    bar_full_w = W
    bar_d = _stacked_bar_chart(res_invest, res_add, clm_ess, clm_disc, bar_full_w, height=240)

    bar_row = Table([
        [Paragraph("Resources vs. Claims", chart_lbl)],
        [bar_d],
    ], colWidths=[bar_full_w])
    bar_row.setStyle(TableStyle([("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"TOP"),
        ("TOPPADDING",(0,0),(-1,-1),1),("BOTTOMPADDING",(0,0),(-1,-1),1)]))
    story += [bar_row, Spacer(1, 22)]

    # Row 2: two large pie charts side by side
    pie_col_w = W * 0.46
    pie_size  = 170

    res_pie_data = [
        {"name": "Current investments", "value": res_invest, "color": "#598A7D"},
        {"name": "Expected additions",  "value": res_add,    "color": "#698D9F"},
    ]
    clm_pie_data = [
        {"name": "Essential spending", "value": clm_ess,  "color": "#C97955"},
        {"name": "Desired spending",   "value": clm_disc, "color": "#CAB688"},
    ]
    res_pie_data = [x for x in res_pie_data if x["value"] > 0]
    clm_pie_data = [x for x in clm_pie_data if x["value"] > 0]

    res_pie_d = _pie_chart(res_pie_data, size=pie_size)
    clm_pie_d = _pie_chart(clm_pie_data, size=pie_size)
    res_lgnd  = _legend_drawing(res_pie_data, pie_col_w)
    clm_lgnd  = _legend_drawing(clm_pie_data, pie_col_w)

    res_sect = Table([
        [res_pie_d],
        [res_lgnd],
    ], colWidths=[pie_col_w])
    res_sect.setStyle(TableStyle([("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"TOP")]))

    clm_sect = Table([
        [clm_pie_d],
        [clm_lgnd],
    ], colWidths=[pie_col_w])
    clm_sect.setStyle(TableStyle([("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"TOP")]))

    pies_row = Table([[res_sect, clm_sect]], colWidths=[W*0.50, W*0.50])
    pies_row.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("ALIGN",(0,0),(-1,-1),"CENTER")]))
    story += [pies_row, Spacer(1, 20)]

    # ── Sankey flow diagram — header kept with chart via KeepTogether ──────
    src_items = []
    if res.portfolio_after_tax and res.portfolio_after_tax > 0:
        src_items.append({"label":"Portfolio (after-tax)",  "val":res.portfolio_after_tax, "type":"invest"})
    if res.private_assets_net  and res.private_assets_net  > 0:
        src_items.append({"label":"Private assets (net)",   "val":res.private_assets_net,  "type":"invest"})
    if res.social_security_pv  and res.social_security_pv  > 0:
        src_items.append({"label":"Social Security (PV)",   "val":res.social_security_pv,  "type":"add"})
    ri = getattr(res,"retirement_income_pv",0) or 0
    if ri > 0:
        src_items.append({"label":"Retirement income (PV)", "val":ri,                       "type":"add"})
    if res.pension_pv and res.pension_pv > 0:
        src_items.append({"label":"Pension (PV)",            "val":res.pension_pv,          "type":"add"})
    if res.annuity_pv and res.annuity_pv > 0:
        src_items.append({"label":"Annuity (PV)",            "val":res.annuity_pv,          "type":"add"})
    if res.other_income_pv and res.other_income_pv > 0:
        src_items.append({"label":"Other income (PV)",       "val":res.other_income_pv,     "type":"add"})
    fa = getattr(res,"future_assets_pv",0) or 0
    if fa > 0:
        src_items.append({"label":"Future assets (PV)",      "val":fa,                      "type":"add"})
    if res.human_capital_pv and res.human_capital_pv > 0:
        src_items.append({"label":"Future savings (PV)",     "val":res.human_capital_pv,    "type":"add"})
    # Liabilities at bottom of src_items (matches HTML page ordering)
    _liab_sk = res.liabilities_total or 0
    if _liab_sk > 0:
        src_items.append({"label":"Less: liabilities",       "val":-_liab_sk,               "type":"liability"})
    # Sort: invest first (top), then add (middle), then liability last (bottom)
    # stack_nodes now builds top-to-bottom, so first item = top of chart
    src_items.sort(key=lambda x: (0 if x["type"]=="invest" else 1 if x["type"]=="add" else 2))

    clm_items_sk = [
        {"label": sg["label"], "val": sg["pv"], "grouping": sg.get("grouping","essential")}
        for sg in clms.spending_goals
    ]

    # Always use the authoritative backend total so Sankey label matches table
    total_src_sk = res.total_resources
    total_clm_sk = clms.total_claims

    if src_items and clm_items_sk:
        n_sk = max(len(src_items), len(clm_items_sk))
        liab_extra = 70 if any(n["val"] <= 0 for n in src_items) else 0
        sk_h = max(len(src_items) * 54 + 60 + liab_extra, len(clm_items_sk) * 62 + 60, 280)
        sk_d, sk_h = _sankey_drawing(src_items, clm_items_sk, total_src_sk, total_clm_sk, W, sk_h)
        # KeepTogether ensures "Resource Flow" header stays with the chart
        from reportlab.platypus import KeepTogether
        story += [KeepTogether([
            Paragraph("Resource Flow", h2_sty),
            HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=4),
            sk_d,
        ]), Spacer(1, 12)]

    # ── Methodology footnote ───────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=5))
    story.append(Paragraph(
        "Resources Claims analysis is based on the funded ratio framework described in "
        "Pittman (2015), <i>\"Use Your Client's Funded Ratio to Simplify and Improve Retirement "
        "Planning Decisions,\" The Journal of Retirement</i>, Fall 2015. "
        "Spending liabilities are valued using actuarial present value, discounting cash flows "
        "by real TIPS yields and SSA 2022 Period Life Table mortality probabilities. "
        "Funded Ratio = Total Resources ÷ Total Claims. "
        "For internal use only. Does not constitute investment, tax, or legal advice.",
        note_sty))

    doc.build(story)
