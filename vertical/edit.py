"""Edit decision list for the vertical (9:16) Hashmali ad.

Everything that decides *what happens when* lives here: where each narration
phrase lands, which clip plays under it, how it is framed, and which title is on
screen. audio.py and video.py both read this file, so the picture, the voice and
the score always share one clock.

Times are in seconds of the finished film. Music runs at 120 BPM (beat = 0.5 s),
and every cut and brand moment sits on a beat.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, FPS = 1080, 1920, 30
BPM = 120
DURATION = 47.0

NARRATION = os.path.join(ROOT, 'assets', 'narration-v3.wav')
KITCHEN = os.path.join(ROOT, 'footage', 'clip-d-kitchen-design.mp4')   # 30 fps, 1280x720
WORK = os.path.join(ROOT, 'footage', 'clip-e-work-montage.mp4')         # 24 fps, 1280x720
LOGO = os.path.join(ROOT, 'assets', 'logo-original.png')
FONTS = os.path.join(ROOT, 'vertical', 'fonts')

PHONE = '058-5634770'

# Narration: (start, end) of each phrase in narration-v3.wav -> where it starts in the film.
# The recording does not contain "תבחרו נכון", so the 2 s brand frame sits in a
# natural pause between "לחשמל?" and "מאחורי הקירות".
VO = [
    # src_in, src_out, film_at, text
    (0.28, 1.23, 0.70, 'בחרתם מטבח.'),
    (1.70, 2.64, 2.15, 'בחרתם ריצוף.'),
    (3.21, 4.71, 3.60, 'בחרתם כל פרט בבית.'),
    (5.32, 6.71, 6.10, 'אבל את מי בחרתם'),
    (7.41, 8.17, 8.05, 'לחשמל?'),
    (9.34, 10.37, 11.60, 'מאחורי הקירות,'),
    (10.78, 11.73, 12.95, 'מתחת לרצפה,'),
    (12.43, 14.29, 14.60, 'יש החלטות שתרגישו בכל יום.'),
    (15.27, 16.96, 17.25, 'השקע בדיוק איפה שצריך.'),
    (17.65, 19.10, 19.70, 'התאורה שמתאימה לחלל.'),
    (19.91, 22.40, 21.75, 'התשתית שמוכנה גם למה שתצטרכו מחר.'),
    (23.50, 24.02, 25.85, 'חשמלי.'),
    (24.81, 26.53, 26.75, 'תשתיות, לוחות חשמל,'),
    (26.87, 28.52, 28.75, 'תאורה חכמה ועמדות טעינה.'),
    (29.30, 29.85, 31.00, 'לבתים,'),
    (30.06, 30.65, 31.76, 'לעסקים'),
    (31.03, 31.62, 32.73, 'ולפרויקטים.'),
    (32.55, 32.97, 34.10, 'בונים?'),
    (33.71, 34.23, 35.20, 'משפצים?'),
    (35.07, 36.76, 36.40, 'בואו נתכנן את החשמל שלכם נכון.'),
    (37.68, 38.24, 39.40, 'חשמלי.'),
    (38.88, 39.72, 40.55, 'יש על מי לבנות.'),
]

# Shots. src: 'K' kitchen clip, 'W' work montage, or a brand card.
# a..b is the source range; it is time-stretched to fill the shot, and anything
# slower than real time is motion-interpolated.
# Framing: crop centre (cx, cy) and crop height h in source pixels (width = h*9/16);
# 'z' is the crop scale at the end of the shot (0.94 = slow 6% push-in),
# 'dx'/'dy' drift the centre over the shot. The work montage has burned-in captions
# along its bottom edge, so its crops are kept clear of them.
SHOTS = [
    # --- the home: fast, glossy, like a design commercial
    dict(t=0.00, end=2.00, src='K', a=0.23, b=1.53, cx=640, cy=380, h=700, z=0.92, dx=-40),   # island + pendant
    dict(t=2.00, end=2.90, src='W', a=0.38, b=0.75, cx=520, cy=300, h=590, z=0.95),           # tile sample
    dict(t=2.90, end=3.80, src='K', a=5.45, b=6.15, cx=770, cy=330, h=600, z=0.94),           # faucet
    dict(t=3.80, end=4.60, src='K', a=6.00, b=6.72, cx=560, cy=430, h=560, z=0.95),           # lit drawer slides open
    dict(t=4.60, end=5.50, src='K', a=6.82, b=7.72, cx=620, cy=380, h=700, z=0.93),           # marble island from above
    # --- the question
    dict(t=5.50, end=7.50, src='W', a=0.83, b=1.75, cx=440, cy=295, h=590, z=0.96, dx=20),    # electrician reads the plan
    dict(t=7.50, end=9.50, src='W', a=7.50, b=8.42, cx=480, cy=295, h=590, z=0.93),           # at the distribution board
    dict(t=9.50, end=11.50, src='CARD_CHOOSE'),                                               # "תבחרו נכון." + logo
    # --- behind the walls
    dict(t=11.50, end=12.70, src='W', a=1.83, b=2.34, cx=420, cy=300, h=590, z=0.94),         # cutting a channel
    dict(t=12.70, end=13.50, src='W', a=2.42, b=2.75, cx=820, cy=300, h=590, z=0.95, dx=-40), # conduits in the wall
    dict(t=13.50, end=17.00, src='K', a=1.60, b=3.73, cx=560, cy=370, h=700, z=0.92),         # the finished kitchen
    dict(t=17.00, end=19.50, src='W', a=2.83, b=3.96, cx=600, cy=300, h=590, z=0.95),         # plug at the coffee corner
    dict(t=19.50, end=21.50, src='W', a=4.04, b=5.25, cx=760, cy=300, h=600, z=0.93),         # lighting in the living space
    dict(t=21.50, end=23.50, src='W', a=5.33, b=6.42, cx=820, cy=300, h=590, z=0.94),         # EV charging
    dict(t=23.50, end=25.50, src='W', a=6.50, b=7.42, cx=300, cy=300, h=560, z=0.92),         # charger ring lights up
    # --- the brand and the services
    dict(t=25.50, end=26.50, src='CARD_LOGO'),
    dict(t=26.50, end=27.35, src='W', a=2.42, b=2.75, cx=560, cy=290, h=560, z=0.95, dx=40),  # תשתיות
    dict(t=27.35, end=28.70, src='W', a=6.50, b=7.10, cx=760, cy=300, h=560, z=0.94),         # לוחות חשמל
    dict(t=28.70, end=29.60, src='K', a=0.40, b=1.10, cx=700, cy=250, h=520, z=0.95),         # תאורה חכמה
    dict(t=29.60, end=30.90, src='W', a=5.33, b=6.10, cx=700, cy=320, h=560, z=0.94),         # עמדות טעינה
    dict(t=30.90, end=31.70, src='W', a=4.40, b=5.20, cx=520, cy=300, h=590, z=0.95),         # לבתים
    dict(t=31.70, end=32.65, src='W', a=7.95, b=8.42, cx=760, cy=290, h=580, z=0.95),         # לעסקים
    dict(t=32.65, end=34.00, src='W', a=1.83, b=2.34, cx=700, cy=300, h=590, z=0.94),         # ולפרויקטים
    # --- the call
    dict(t=34.00, end=35.10, src='W', a=6.95, b=7.42, cx=640, cy=290, h=580, z=0.95),         # בונים?
    dict(t=35.10, end=36.20, src='W', a=0.38, b=0.75, cx=600, cy=300, h=590, z=0.95),         # משפצים?
    dict(t=36.20, end=39.00, src='W', a=0.83, b=1.75, cx=560, cy=295, h=590, z=0.93),         # planning
    dict(t=39.00, end=DURATION, src='CARD_END'),
]

# On-screen titles. style: 'title' (lower third), 'kicker' (small),
# 'q1'/'q2' (the question), 'service', 'stack' (builds line by line).
TITLES = [
    dict(t=0.70, end=2.00, text='בחרתם מטבח.', style='title'),
    dict(t=2.15, end=3.10, text='בחרתם ריצוף.', style='title'),
    dict(t=3.60, end=5.50, text='כל פרט בבית.', style='title'),
    dict(t=6.10, end=9.50, text='אבל את מי בחרתם', style='q1'),
    dict(t=8.05, end=9.50, text='לחשמל?', style='q2'),
    dict(t=11.60, end=13.70, text='תכנון שמתחיל בתשתית', style='kicker'),
    dict(t=14.60, end=17.00, text='החלטות שתרגישו\nבכל יום.', style='title'),
    dict(t=17.25, end=19.50, text='בדיוק איפה שצריך.', style='title'),
    dict(t=19.70, end=21.50, text='תאורה שמתאימה לכם.', style='title'),
    dict(t=21.75, end=25.50, text='חושבים גם על מחר.', style='title'),
    dict(t=26.75, end=27.35, text='תשתיות', style='service'),
    dict(t=27.38, end=28.70, text='לוחות חשמל', style='service'),
    dict(t=28.75, end=29.60, text='תאורה חכמה', style='service'),
    dict(t=29.67, end=30.90, text='עמדות טעינה', style='service'),
    dict(t=31.00, end=34.00, text='לבתים', style='stack', row=0),
    dict(t=31.76, end=34.00, text='לעסקים', style='stack', row=1),
    dict(t=32.73, end=34.00, text='ולפרויקטים', style='stack', row=2),
    dict(t=34.10, end=36.20, text='בונים?', style='stack', row=0),
    dict(t=35.20, end=36.20, text='משפצים?', style='stack', row=1),
    dict(t=36.40, end=39.00, text='בואו נתכנן את\nהחשמל שלכם נכון.', style='title'),
]

# Brand cards: when each element enters.
CARD_CHOOSE = dict(text_at=9.50, logo_at=10.00)
CARD_LOGO = dict(logo_at=25.50)
CARD_END = dict(logo_at=39.00, slogan_at=40.55, phone_at=41.20, cta_at=41.70)

# Sound design cues the score is built around.
CUES = dict(
    dip=(5.50, 9.50),        # music thins out under the question
    choose_text=9.50,        # soft accent on "תבחרו נכון."
    choose_logo=10.00,       # deep accent as the logo lands
    groove=11.50,            # beat comes back in
    brand=25.50,             # big hit on "חשמלי."
    call=34.00,              # lighter, rhythmic: "בונים? משפצים?"
    end=39.00,               # end-card hit and final chord
    plug=17.35,              # plug seats in the socket
)
