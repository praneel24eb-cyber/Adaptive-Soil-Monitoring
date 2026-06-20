import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch

fig, ax = plt.subplots(1, 1, figsize=(18, 12))
ax.set_xlim(0, 18)
ax.set_ylim(0, 12)
ax.set_aspect('equal')
ax.axis('off')
fig.patch.set_facecolor('white')

# ── helpers ──────────────────────────────────────────────────────────────────
def box(x, y, w, h, label, sublabel=None, fontsize=9, lw=1.5):
    rect = mpatches.FancyBboxPatch((x, y), w, h,
                                   boxstyle="square,pad=0.05",
                                   linewidth=lw, edgecolor='black',
                                   facecolor='#f8f8f8')
    ax.add_patch(rect)
    cy = y + h / 2 + (0.18 if sublabel else 0)
    ax.text(x + w/2, cy, label, ha='center', va='center',
            fontsize=fontsize, fontweight='bold', wrap=True)
    if sublabel:
        ax.text(x + w/2, y + h/2 - 0.25, sublabel, ha='center', va='center',
                fontsize=7, color='#444444')

def pin(x, y, label, side='right', fontsize=7.5):
    ax.plot(x, y, 'ks', markersize=4)
    off = 0.12
    if side == 'right':
        ax.text(x + off, y, label, ha='left', va='center', fontsize=fontsize)
    elif side == 'left':
        ax.text(x - off, y, label, ha='right', va='center', fontsize=fontsize)
    elif side == 'bottom':
        ax.text(x, y - off, label, ha='center', va='top', fontsize=fontsize)
    elif side == 'top':
        ax.text(x, y + off, label, ha='center', va='bottom', fontsize=fontsize)

def wire(pts, color, lw=2.0, label=None, label_pos=None):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    ax.plot(xs, ys, color=color, linewidth=lw, solid_capstyle='round',
            solid_joinstyle='round', zorder=2)
    if label and label_pos:
        ax.text(label_pos[0], label_pos[1], label, ha='center', va='center',
                fontsize=7, color=color,
                bbox=dict(facecolor='white', edgecolor=color, boxstyle='round,pad=0.15', lw=0.8))

def junction(x, y, color='black'):
    ax.plot(x, y, 'o', color=color, markersize=5, zorder=4)

# ── Title ────────────────────────────────────────────────────────────────────
ax.text(9, 11.6, 'IoT Soil Fertility Monitor — Circuit Diagram',
        ha='center', va='center', fontsize=14, fontweight='bold')

# ═══════════════════════════════════════════════════════════════════
# ESP32  (x=0.3 → 2.8,  y=3.5 → 9.5)
# ═══════════════════════════════════════════════════════════════════
box(0.3, 3.5, 2.5, 6.0, 'ESP32', 'DevKit V1', fontsize=9)

# right-side pins of ESP32  (x = 2.8)
ESP32_X = 2.8
esp_pins = {
    '3.3V':       9.0,
    'GND':        8.2,
    'GPIO 4':     7.4,
    'GPIO 16\n(RX1)': 6.6,
    'GPIO 17\n(TX1)': 5.8,
    'GPIO 23':    5.0,
    'GPIO 34':    4.2,
}
for lbl, py in esp_pins.items():
    pin(ESP32_X, py, lbl, side='right', fontsize=7)

# ═══════════════════════════════════════════════════════════════════
# MAX485  (x=5.5 → 7.5,  y=5.5 → 8.5)
# ═══════════════════════════════════════════════════════════════════
box(5.5, 5.5, 2.0, 3.0, 'MAX485', fontsize=9)

# left pins  (x = 5.5)
M_L = 5.5
max_l_pins = {
    'VCC': 8.1, 'GND': 7.7,
    'RO':  7.3, 'DI':  6.9,
    'DE':  6.5, 'RE':  6.1,
}
for lbl, py in max_l_pins.items():
    pin(M_L, py, lbl, side='left', fontsize=7)

# right pins  (x = 7.5)
M_R = 7.5
max_r_pins = {'A': 7.5, 'B': 6.5}
for lbl, py in max_r_pins.items():
    pin(M_R, py, lbl, side='right', fontsize=7)

# ═══════════════════════════════════════════════════════════════════
# NPK Sensor  (x=10 → 13,  y=8.5 → 10.8)
# ═══════════════════════════════════════════════════════════════════
box(10.0, 8.5, 3.0, 2.3, 'NPK Soil Sensor', '(RS-485 Modbus)', fontsize=9)

# bottom pins  (y = 8.5)
NPK_Y = 8.5
npk_pins = {'A+': 10.5, 'B-': 11.0, '12V+': 11.5, 'GND': 12.2}
for lbl, px in npk_pins.items():
    pin(px, NPK_Y, lbl, side='bottom', fontsize=7.5)

# ═══════════════════════════════════════════════════════════════════
# 12V DC Supply  (x=14.5 → 16.5,  y=8.5 → 10.8)
# ═══════════════════════════════════════════════════════════════════
box(14.5, 8.5, 2.0, 2.3, '12V DC\nSupply', fontsize=9)

# bottom pins  (y = 8.5)
SUP_Y = 8.5
sup_pins = {'+12V': 14.9, 'GND': 15.7}
for lbl, px in sup_pins.items():
    pin(px, SUP_Y, lbl, side='bottom', fontsize=7.5)

# ═══════════════════════════════════════════════════════════════════
# DS18B20  (x=0.3 → 2.3,  y=0.8 → 2.3)
# ═══════════════════════════════════════════════════════════════════
box(0.3, 0.8, 2.0, 1.5, 'DS18B20', '(Temperature)', fontsize=8)

# right pins  (x = 2.3)
DS_X = 2.3
ds_pins = {'VDD': 2.0, 'GND': 1.5, 'DATA': 1.0}
for lbl, py in ds_pins.items():
    pin(DS_X, py, lbl, side='right', fontsize=7)

# 4.7kΩ resistor  (drawn as zigzag between x=3.5..4.3, y=1.0)
def draw_resistor(ax, cx, cy, horizontal=True):
    import numpy as np
    n = 6
    if horizontal:
        xs = [cx - 0.4]
        ys = [cy]
        for i in range(n):
            xs.append(cx - 0.4 + (i+0.5)*0.8/n)
            ys.append(cy + (0.12 if i % 2 == 0 else -0.12))
        xs.append(cx + 0.4)
        ys.append(cy)
        ax.plot(xs, ys, 'k-', lw=1.5, zorder=3)
    ax.text(cx, cy + 0.25, '4.7kΩ', ha='center', va='bottom', fontsize=7)

draw_resistor(ax, 3.8, 1.0, horizontal=True)

# ═══════════════════════════════════════════════════════════════════
# Moisture Sensor  (x=9.5 → 11.0,  y=0.8 → 3.5)
# ═══════════════════════════════════════════════════════════════════
box(9.5, 0.8, 1.5, 2.7, 'Capacitive\nMoisture\nSensor', fontsize=8)

# top pins  (y = 3.5)
MOIS_Y = 3.5
mois_pins = {'VCC': 9.75, 'GND': 10.25, 'AOUT': 10.75}
for lbl, px in mois_pins.items():
    pin(px, MOIS_Y, lbl, side='top', fontsize=7)

# ═══════════════════════════════════════════════════════════════════
# WIRES
# ═══════════════════════════════════════════════════════════════════

# ── 3.3V rail (horizontal bus at y=9.3) ──
wire([(ESP32_X, 9.0), (4.0, 9.0), (4.0, 9.3), (5.5, 9.3)],   # ESP32→MAX485 VCC
     'red', label='3.3V', label_pos=(4.7, 9.45))
junction(ESP32_X, 9.0)

# ── GND rail (horizontal bus at y=8.8) ──
wire([(ESP32_X, 8.2), (4.2, 8.2), (4.2, 7.7), (5.5, 7.7)],   # ESP32→MAX485 GND
     'black')

# ── RX: GPIO16 → MAX485 RO ──
wire([(ESP32_X, 6.6), (5.0, 6.6), (5.0, 7.3), (5.5, 7.3)],
     'green', label='RX', label_pos=(5.2, 7.0))

# ── TX: GPIO17 → MAX485 DI ──
wire([(ESP32_X, 5.8), (5.1, 5.8), (5.1, 6.9), (5.5, 6.9)],
     'blue', label='TX', label_pos=(5.25, 6.4))

# ── DIR: GPIO23 → MAX485 DE+RE ──
wire([(ESP32_X, 5.0), (5.2, 5.0), (5.2, 6.5), (5.5, 6.5)],
     'darkorange', label='DIR', label_pos=(5.3, 5.5))
wire([(5.5, 6.5), (5.5, 6.1)], 'darkorange')   # bridge DE to RE
junction(5.5, 6.5)

# ── RS-485 A: MAX485 A → NPK A+ ──
wire([(M_R, 7.5), (9.0, 7.5), (9.0, 9.0), (10.5, 9.0), (10.5, 8.5)],
     'red', label='RS-485 A', label_pos=(9.7, 9.15))

# ── RS-485 B: MAX485 B → NPK B- ──
wire([(M_R, 6.5), (8.5, 6.5), (8.5, 8.8), (11.0, 8.8), (11.0, 8.5)],
     'black', label='RS-485 B', label_pos=(9.7, 8.65))

# ── 12V+ : Supply +12V → NPK 12V+ ──
# Route: from (14.9, 8.5) DOWN to 7.9, LEFT to 11.5, UP to 8.5
wire([(14.9, 8.5), (14.9, 7.9), (11.5, 7.9), (11.5, 8.5)],
     'red', lw=2.5, label='+12V', label_pos=(13.2, 7.7))

# ── GND : Supply GND → NPK GND ──
# Route: from (15.7, 8.5) DOWN to 7.5, LEFT to 12.2, UP to 8.5
wire([(15.7, 8.5), (15.7, 7.5), (12.2, 7.5), (12.2, 8.5)],
     'black', lw=2.5, label='GND', label_pos=(13.9, 7.3))

# ── DS18B20 VDD → 3.3V ──
wire([(DS_X, 2.0), (4.0, 2.0), (4.0, 9.0)],
     'red')
junction(4.0, 9.0)

# ── DS18B20 GND ──
wire([(DS_X, 1.5), (4.2, 1.5), (4.2, 8.2)],
     'black')
junction(4.2, 8.2)

# ── DS18B20 DATA → GPIO4 + 4.7kΩ pullup ──
wire([(DS_X, 1.0), (3.4, 1.0)], 'gold', lw=1.8)         # to resistor left
wire([(4.2, 1.0), (ESP32_X+0.3, 1.0), (ESP32_X+0.3, 7.4), (ESP32_X, 7.4)],
     'gold', lw=1.8, label='DATA\n(1-Wire)', label_pos=(3.8, 7.2))
wire([(3.8, 1.0), (3.8, 1.8), (4.0, 1.8)],              # pullup tap to 3.3V rail
     'red', lw=1.2)
junction(4.0, 1.8)
wire([(4.0, 1.8), (4.0, 9.0)], 'red', lw=1.2)

# ── Moisture VCC ──
wire([(9.75, MOIS_Y), (9.75, 4.5), (4.0, 4.5), (4.0, 9.0)],
     'red')
junction(4.0, 4.5)

# ── Moisture GND ──
wire([(10.25, MOIS_Y), (10.25, 4.2), (4.2, 4.2), (4.2, 8.2)],
     'black')
junction(4.2, 4.2)

# ── Moisture AOUT → GPIO34 ──
wire([(10.75, MOIS_Y), (10.75, 4.0), (5.3, 4.0), (5.3, 4.2), (ESP32_X, 4.2)],
     'purple', lw=1.8, label='Analog', label_pos=(7.5, 3.8))

# ═══════════════════════════════════════════════════════════════════
# LEGEND
# ═══════════════════════════════════════════════════════════════════
legend_items = [
    ('red',        'Power (+3.3V / +12V)'),
    ('black',      'GND'),
    ('blue',       'TX — GPIO17 → MAX485 DI'),
    ('green',      'RX — GPIO16 → MAX485 RO'),
    ('darkorange', 'DIR — GPIO23 → MAX485 DE+RE'),
    ('gold',       'DATA — DS18B20 1-Wire (GPIO4)'),
    ('purple',     'Analog — Moisture AOUT (GPIO34)'),
]
lx, ly = 13.0, 4.5
ax.add_patch(mpatches.FancyBboxPatch((lx-0.2, ly-0.4), 5.0, 3.0,
             boxstyle='round,pad=0.1', edgecolor='gray', facecolor='#fafafa', lw=1))
ax.text(lx + 2.3, ly + 2.4, 'Wire Color Legend', ha='center', fontsize=8, fontweight='bold')
for i, (color, desc) in enumerate(legend_items):
    y = ly + 2.0 - i * 0.35
    ax.plot([lx, lx+0.4], [y, y], color=color, lw=3)
    ax.text(lx + 0.55, y, desc, va='center', fontsize=7)

plt.tight_layout(pad=0.2)
plt.savefig(r'c:\Users\PRANEEL K.A\Desktop\IoT_project\circuit_diagram_final.png',
            dpi=200, bbox_inches='tight', facecolor='white')
plt.close()
print("Saved: circuit_diagram_final.png")
