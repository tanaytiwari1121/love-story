/* =====================================================
   LOVE STORY BOOK
   -----------------------------------------------------
   DESKTOP / TABLET / PHONE SIDEWAYS
       cover (alone) -> spreads (2 pages) -> last page (alone)

   PHONE HELD UPRIGHT
       one big page at a time, so the text is readable.

   EVERYWHERE
       double-tap (or double-click) a page to zoom in,
       drag to move around, double-tap again to zoom out.
===================================================== */


/* =====================================================
   SETTINGS  (the part you edit)
===================================================== */

// Photos live next to index.html (GitHub layout).
// They are called photo1.jpg, photo2.jpg, photo3.jpg ...
const PHOTO_FOLDER = "";
const PHOTO_EXT = "jpg";

// How many photos in total (cover + inner pages + last page).
const TOTAL_PHOTOS = 15;

// If the number of photos is odd, one extra "to be continued"
// page is added just before the last photo, so the last photo
// is always alone on the final page. Set false for a blank page.
const AUTO_CLOSING_PAGE = true;

// Animated cover video, for example "cover.mp4". Keep "" for none.
const COVER_VIDEO = "";

// Page-turn sound, for example "page-turn.mp3". Keep "" for none.
const TURN_SOUND = "";

// "auto"    = photos that are a different shape from the page are shown
//             whole on a soft blurred background (nothing is stretched)
// "stretch" = always stretch photos to fill the page
const IMAGE_FIT = "auto";
const STRETCH_TOLERANCE = 0.04;     // 4 % difference is stretched silently

// How much a double-tap zooms in
const ZOOM_LEVEL = 2.3;

// Book thickness (page edges)
const MAX_PAGES_THICKNESS = 26;     // px

const FLIP_TIME = 900;              // ms (same as the CSS transition)
const COMMIT_PROGRESS = 0.3;        // drag this far (0-1) and the page finishes turning

// Text under the book
const HINT_START = "swipe to turn the page";
const HINT_ZOOM = "double-tap a page to read it closely";
const HINT_END = "happy boyfriend\u2019s day, Aditya";

const REDUCED_MOTION =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;


/* =====================================================
   ELEMENTS
===================================================== */

const scene = document.getElementById("scene");
const book = document.getElementById("book");
const hint = document.getElementById("hint");


/* =====================================================
   PAGES
===================================================== */

const pages = Array.from(
    { length: TOTAL_PHOTOS },
    (_, i) => ({
        type: "img",
        src: `${PHOTO_FOLDER}photo${i + 1}.${PHOTO_EXT}`
    })
);

// keep the page count even, so the last photo stays alone
if (pages.length % 2 === 1) {
    pages.splice(
        pages.length - 1,
        0,
        { type: AUTO_CLOSING_PAGE ? "note" : "blank" }
    );
}

const PAGE_COUNT = pages.length;


/* =====================================================
   STATE
===================================================== */

let mode = "spread";        // "spread" (2 pages) or "single" (1 big page)
let leafCount = 0;
let state = 0;              // how many leaves are already turned
let leaves = [];
let stackLeft = null;
let stackRight = null;
let perLeaf = 3;

let pageW = 0;
let pageH = 0;
let coverRatio = 0.7115;

let busy = false;

let zoomed = false;
let view = { x: 0, y: 0, s: 1 };

let current = { left: 0, right: 0 };
let tweenId = null;


/* =====================================================
   BUILDING THE BOOK
===================================================== */

const NOTE_HTML = `
    <div class="note">
        <span class="note-top">our love story</span>
        <h2 class="note-title">to be<br>continued</h2>
        <span class="note-heart">&hearts;</span>
        <span class="note-names">Aditya &amp; Priyanshi</span>
    </div>
`;

function makeFace(page, side) {

    const face = document.createElement("div");
    face.className = "face " + side;

    if (page.type === "img") {

        const img = new Image();
        img.alt = "";
        img.draggable = false;
        img.decoding = "async";

        img.addEventListener("load", () => fitImage(face, img, page.src));

        img.src = page.src;
        face.appendChild(img);

    } else if (page.type === "note") {

        face.classList.add("note-page");
        face.innerHTML = NOTE_HTML;

    } else if (page.type === "paper") {

        face.classList.add("paper");
    }

    return face;
}

// Never stretch a photo that has a different shape.
// It is shown whole, and the empty space beside it is filled by
// stretching the photo's own edge colour (so it blends in).
function fitImage(face, img, src) {

    const ratio = img.naturalWidth / img.naturalHeight;
    const difference = Math.abs(ratio / coverRatio - 1);

    if (IMAGE_FIT === "stretch" || difference <= STRETCH_TOLERANCE) {
        img.classList.add("stretch");
        return;
    }

    if (ratio < coverRatio) {

        // photo is narrower than the page: bands left + right
        const band = (1 - ratio / coverRatio) / 2 * 100;

        addBand(face, src, "left", band);
        addBand(face, src, "right", band);

    } else {

        // photo is wider than the page: bands top + bottom
        const band = (1 - coverRatio / ratio) / 2 * 100;

        addBand(face, src, "top", band);
        addBand(face, src, "bottom", band);
    }
}

function addBand(face, src, side, percent) {

    const band = document.createElement("div");
    band.className = "band";

    const size = percent + 1;        // overlap a little under the photo
    const strip = 4000;              // show only the outer ~2.5 % of the photo
    const bleed = 18;                // px pushed past the page edge (hides the blur fringe)

    band.style.backgroundImage = `url("${src}")`;

    if (side === "left" || side === "right") {

        band.style.top = `-${bleed}px`;
        band.style.bottom = `-${bleed}px`;
        band.style[side] = `-${bleed}px`;
        band.style.width = `calc(${size}% + ${bleed}px)`;
        band.style.backgroundSize = `${strip}% 100%`;
        band.style.backgroundPosition = `${side} center`;

    } else {

        band.style.left = `-${bleed}px`;
        band.style.right = `-${bleed}px`;
        band.style[side] = `-${bleed}px`;
        band.style.height = `calc(${size}% + ${bleed}px)`;
        band.style.backgroundSize = `100% ${strip}%`;
        band.style.backgroundPosition = `center ${side}`;
    }

    // bands go BEHIND the photo
    face.insertBefore(band, face.firstChild);
}

function addCoverExtras(coverLeaf) {

    const front = coverLeaf.querySelector(".front");

    if (COVER_VIDEO) {

        const video = document.createElement("video");

        video.src = COVER_VIDEO;
        video.poster = pages[0].src;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.preload = "auto";

        video.addEventListener("error", () => video.remove());

        front.appendChild(video);

        const kick = () => video.play().catch(() => {});
        video.addEventListener("canplay", kick);
        document.addEventListener("pointerdown", kick, { once: true });
    }

    if (!REDUCED_MOTION) {
        const shine = document.createElement("div");
        shine.className = "shine";
        front.appendChild(shine);
    }
}

function build(newMode) {

    mode = newMode;

    book.innerHTML = "";
    leaves = [];

    leafCount = mode === "single" ? PAGE_COUNT : PAGE_COUNT / 2;
    perLeaf = Math.min(6, MAX_PAGES_THICKNESS / leafCount);

    stackLeft = document.createElement("div");
    stackLeft.className = "stack left";

    stackRight = document.createElement("div");
    stackRight.className = "stack right";

    book.append(stackLeft, stackRight);

    for (let i = 0; i < leafCount; i++) {

        const leaf = document.createElement("div");
        leaf.className = i === 0 ? "leaf cover" : "leaf";

        const frontPage = mode === "single" ? pages[i] : pages[i * 2];
        const backPage = mode === "single" ? { type: "paper" } : pages[i * 2 + 1];

        leaf.append(
            makeFace(frontPage, "front"),
            makeFace(backPage, "back")
        );

        book.appendChild(leaf);
        leaves.push(leaf);
    }

    addCoverExtras(leaves[0]);

    current = { left: 0, right: leafCount };
}

function maxState() {
    return mode === "single" ? leafCount - 1 : leafCount;
}

// page index <-> state when the layout changes (rotating the phone)
function stateToPage(s) {
    return s === 0 ? 0 : 2 * s - 1;
}

function pageToState(p) {
    return p === 0 ? 0 : Math.floor((p + 1) / 2);
}


/* =====================================================
   SIZE
===================================================== */

function wantSingle() {
    return window.innerWidth <= 700 &&
           window.innerHeight > window.innerWidth;
}

function measure() {

    const W = window.innerWidth;
    const H = window.innerHeight;

    if (mode === "single") {

        pageH = Math.min(H * 0.80, (W * 0.92) / coverRatio);
        pageW = pageH * coverRatio;

    } else {

        pageH = H * (W <= 600 ? 0.78 : 0.82);
        pageW = pageH * coverRatio;

        const maxBookW = W * 0.92;

        if (pageW * 2 > maxBookW) {
            pageW = maxBookW / 2;
            pageH = pageW / coverRatio;
        }
    }

    book.style.setProperty("--page-width", pageW + "px");
    book.style.setProperty("--page-height", pageH + "px");
}

// cover / last page are alone: draw them bigger when there is room
function singleZoom() {

    const fitW = (window.innerWidth * 0.86) / (pageW + leafCount * perLeaf);
    const fitH = (window.innerHeight * 0.84) / pageH;

    return Math.max(1, Math.min(fitW, fitH, 2.2));
}

function loadRatio(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
        img.onerror = () => resolve(0.7115);
        img.src = src;
    });
}


/* =====================================================
   BOOK POSITION  (centering + zoom)
===================================================== */

function baseTransform() {

    if (mode === "single") {
        return { x: -0.5 * pageW, y: 0, s: 1 };
    }

    if (state === 0 || state === leafCount) {
        const s = singleZoom();
        const offset = state === 0 ? -0.5 : 0.5;
        return { x: offset * pageW * s, y: 0, s };
    }

    return { x: 0, y: 0, s: 1 };
}

// left / right edge of what is visible, relative to the book centre
function visibleRange() {

    if (mode === "single" || state === 0) return [0, pageW];
    if (state === leafCount) return [-pageW, 0];
    return [-pageW, pageW];
}

function clampView(x, y, s) {

    const [lo, hi] = visibleRange();

    function axis(t, size, a, b) {
        const half = size / 2;
        if (s * (b - a) <= size) return -s * (a + b) / 2;
        return Math.min(Math.max(t, half - s * b), -half - s * a);
    }

    return {
        x: axis(x, window.innerWidth, lo, hi),
        y: axis(y, window.innerHeight, -pageH / 2, pageH / 2),
        s
    };
}

function applyTransform(panning) {

    const t = zoomed ? view : baseTransform();

    book.classList.toggle("zoomed", zoomed);
    book.classList.toggle("panning", !!panning);

    book.style.transform =
        `translate(${t.x}px, ${t.y}px) scale(${t.s})`;
}

function zoomAt(px, py) {

    const base = baseTransform();
    const k = ZOOM_LEVEL;

    // keep the point under the finger fixed while zooming
    const x = (px - window.innerWidth / 2) * (1 - k) + k * base.x;
    const y = (py - window.innerHeight / 2) * (1 - k) + k * base.y;

    view = clampView(x, y, base.s * k);
    zoomed = true;

    applyTransform(false);
}

function zoomOut() {

    if (!zoomed) return;

    zoomed = false;
    applyTransform(false);
}


/* =====================================================
   PAGE EDGES  (book thickness)
===================================================== */

function edgeShadow(side, count) {

    const sign = side === "right" ? 1 : -1;
    const total = count * perLeaf;

    const layers = [];

    for (let k = 1; k <= Math.ceil(total); k++) {

        const color = k % 2 ? "#fdf6f1" : "#ecd7d0";

        layers.push(`${(sign * k).toFixed(2)}px ${k}px 0 ${color}`);
    }

    if (layers.length) {
        layers.push(
            `${(sign * total * 0.5).toFixed(1)}px ${(total + 14).toFixed(1)}px 26px rgba(140, 45, 70, .34)`
        );
    }

    return layers.length ? layers.join(",") : "none";
}

function applyStacks(left, right) {

    current = { left, right };

    stackLeft.style.boxShadow = edgeShadow("left", left);
    stackRight.style.boxShadow = edgeShadow("right", right);

    stackLeft.style.visibility = left > 0.06 ? "visible" : "hidden";
    stackRight.style.visibility = right > 0.06 ? "visible" : "hidden";
}

function cancelTween() {
    if (tweenId) cancelAnimationFrame(tweenId);
    tweenId = null;
}

function tweenStacks(toLeft, toRight, duration) {

    cancelTween();

    const from = { ...current };
    const start = performance.now();

    function step(now) {

        const p = Math.min(1, (now - start) / duration);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

        applyStacks(
            from.left + (toLeft - from.left) * e,
            from.right + (toRight - from.right) * e
        );

        tweenId = p < 1 ? requestAnimationFrame(step) : null;
    }

    tweenId = requestAnimationFrame(step);
}


/* =====================================================
   RENDER
===================================================== */

function render(flyingIndex = -1, animate = false) {

    applyTransform(false);

    book.classList.toggle("at-cover", state === 0);

    leaves.forEach((leaf, i) => {

        const turned = i < state;

        leaf.style.transform = `rotateY(${turned ? -180 : 0}deg)`;

        leaf.style.zIndex =
            i === flyingIndex ? 100 : (turned ? i + 1 : leafCount - i);
    });

    if (animate) {
        tweenStacks(state, leafCount - state, FLIP_TIME * 0.45);
    } else {
        cancelTween();
        applyStacks(state, leafCount - state);
    }
}


/* =====================================================
   HINT / CAPTION
===================================================== */

let hintTimer = null;
let zoomHintShown = false;

function setHint(text) {

    clearTimeout(hintTimer);

    if (!text) {
        hint.classList.add("hidden");
        return;
    }

    hint.innerHTML = `${text} <span class="beat">&hearts;</span>`;
    hint.classList.remove("hidden");
}

function updateHint() {

    if (state === 0) {
        setHint(HINT_START);
        return;
    }

    if (state === maxState()) {
        setHint(HINT_END);
        return;
    }

    // first time the book is opened: tell people about zoom
    if (!zoomHintShown) {

        zoomHintShown = true;
        setHint(HINT_ZOOM);

        hintTimer = setTimeout(() => setHint(""), 4500);
        return;
    }

    setHint("");
}


/* =====================================================
   SPARKLES  (little hearts when a page turns)
===================================================== */

function burst(count) {

    if (REDUCED_MOTION) return;

    const colours = ["#e8607d", "#f39aae", "#d63f63", "#ff9db4"];

    const box = book.getBoundingClientRect();

    const cx = box.left + box.width / 2;
    const cy = box.top + box.height * 0.62;

    const spread = Math.min(pageW * 0.7, window.innerWidth * 0.4);

    for (let i = 0; i < count; i++) {

        const el = document.createElement("span");
        el.className = "fly";
        el.textContent = "\u2665";

        const size = 10 + Math.random() * 14;

        el.style.fontSize = size + "px";
        el.style.color = colours[i % colours.length];
        el.style.left = cx + (Math.random() - 0.5) * spread + "px";
        el.style.top = cy + "px";

        scene.appendChild(el);

        const dx = (Math.random() - 0.5) * 90;
        const dy = 120 + Math.random() * 190;

        const animation = el.animate(
            [
                { transform: "translate(0, 0) scale(.4)", opacity: 0 },
                { opacity: .95, offset: .18 },
                { transform: `translate(${dx}px, ${-dy}px) scale(1.05)`, opacity: 0 }
            ],
            {
                duration: 1500 + Math.random() * 1300,
                delay: Math.random() * 250,
                easing: "cubic-bezier(.2, .7, .3, 1)",
                fill: "forwards"
            }
        );

        animation.onfinish = () => el.remove();
    }
}


/* =====================================================
   SOUND
===================================================== */

const sounds = TURN_SOUND
    ? Array.from({ length: 3 }, () => {
        const audio = new Audio(TURN_SOUND);
        audio.preload = "auto";
        audio.volume = 0.7;
        return audio;
    })
    : [];

let soundIndex = 0;

function playTurnSound() {

    if (!sounds.length) return;

    const audio = sounds[soundIndex++ % sounds.length];

    try {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    } catch (error) { /* ignore */ }
}


/* =====================================================
   TURNING PAGES
===================================================== */

function finishFlip(index, withSound) {

    busy = true;

    render(index, true);

    if (withSound) playTurnSound();

    setTimeout(() => {
        render();
        busy = false;
    }, FLIP_TIME);

    updateHint();
}

function celebrate() {

    if (state === maxState()) {
        burst(18);
    } else if (state === 1 || state === 0) {
        burst(10);
    } else {
        burst(6);
    }
}

function nextPage() {

    if (busy || state >= maxState()) return;

    zoomOut();

    const index = state;
    state++;

    finishFlip(index, true);
    celebrate();
}

function previousPage() {

    if (busy || state <= 0) return;

    zoomOut();

    state--;

    finishFlip(state, true);
    burst(4);
}


/* =====================================================
   TOUCH / MOUSE
   swipe = turn page (page follows your finger)
   double-tap = zoom, drag while zoomed = move around
===================================================== */

let drag = null;
let lastTap = { t: 0, x: 0, y: 0 };
let tapTimer = null;

function dragSpan() {
    return mode === "single" ? pageW * 0.8 : pageW * 1.1;
}

scene.addEventListener("pointerdown", event => {

    if (busy) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    drag = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastT: performance.now(),
        velocity: 0,
        dir: 0,
        index: -1,
        progress: 0,
        moved: 0
    };

    scene.setPointerCapture(event.pointerId);
});

scene.addEventListener("pointermove", event => {

    if (!drag) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));

    /* ---------- zoomed: move around ---------- */

    if (zoomed) {

        view = clampView(
            view.x + (event.clientX - drag.lastX),
            view.y + (event.clientY - drag.lastY),
            view.s
        );

        drag.lastX = event.clientX;
        drag.lastY = event.clientY;

        applyTransform(true);
        return;
    }

    /* ---------- not zoomed: turn pages ---------- */

    if (drag.dir === 0) {

        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;

        if (Math.abs(dy) > Math.abs(dx)) {      // vertical, ignore
            drag.moved = 999;
            drag.dir = 2;
            return;
        }

        const dir = dx < 0 ? 1 : -1;

        if ((dir === 1 && state >= maxState()) || (dir === -1 && state <= 0)) {
            drag.dir = 2;                         // nothing to turn
            return;
        }

        drag.dir = dir;
        drag.index = dir === 1 ? state : state - 1;

        const leaf = leaves[drag.index];
        leaf.classList.add("dragging");
        leaf.style.zIndex = 100;
    }

    if (drag.dir === 2) return;

    const travelled = drag.dir === 1 ? -dx : dx;

    drag.progress = Math.min(1, Math.max(0, travelled / dragSpan()));

    const angle = drag.dir === 1
        ? -180 * drag.progress
        : -180 * (1 - drag.progress);

    leaves[drag.index].style.transform = `rotateY(${angle}deg)`;

    // the page stacks grow / shrink with your finger
    const turnedLeaves = state + drag.dir * drag.progress;
    applyStacks(turnedLeaves, leafCount - turnedLeaves);

    // speed (for quick flicks)
    const now = performance.now();
    const dt = now - drag.lastT;

    if (dt > 0) drag.velocity = (event.clientX - drag.lastX) / dt;

    drag.lastX = event.clientX;
    drag.lastT = now;
});

function handleTap(x, y) {

    const now = performance.now();

    // double tap  ->  zoom in / out
    if (
        now - lastTap.t < 320 &&
        Math.hypot(x - lastTap.x, y - lastTap.y) < 45
    ) {
        clearTimeout(tapTimer);
        lastTap.t = 0;

        if (zoomed) zoomOut();
        else zoomAt(x, y);

        return;
    }

    lastTap = { t: now, x, y };

    if (zoomed) return;

    // single tap  ->  turn (right half = next, left half = back)
    tapTimer = setTimeout(() => {
        if (x > window.innerWidth / 2) nextPage();
        else previousPage();
    }, 300);
}

function endDrag(event) {

    if (!drag) return;

    const d = drag;
    drag = null;

    if (zoomed) {

        applyTransform(false);

        if (d.moved < 8 && event.type === "pointerup") {
            handleTap(event.clientX, event.clientY);
        }

        return;
    }

    // no movement at all = a tap
    if (d.dir === 0) {

        if (d.moved < 8 && event.type === "pointerup") {
            handleTap(event.clientX, event.clientY);
        }

        return;
    }

    if (d.dir === 2) return;

    const leaf = leaves[d.index];

    leaf.classList.remove("dragging");
    void leaf.offsetWidth;                       // turn the transition back on

    const flick = d.dir === 1 ? -d.velocity > 0.5 : d.velocity > 0.5;
    const commit = d.progress > COMMIT_PROGRESS || flick;

    if (commit) {
        state += d.dir;
    }

    finishFlip(d.index, commit);

    if (commit) {
        if (d.dir === 1) celebrate();
        else burst(4);
    }
}

scene.addEventListener("pointerup", endDrag);
scene.addEventListener("pointercancel", endDrag);


/* =====================================================
   KEYBOARD
===================================================== */

document.addEventListener("keydown", event => {

    if (event.key === "ArrowRight") nextPage();
    if (event.key === "ArrowLeft") previousPage();
    if (event.key === "Escape") zoomOut();
});

document.addEventListener("contextmenu", event => event.preventDefault());


/* =====================================================
   LAYOUT  (runs at start, on resize, on rotate)
===================================================== */

function layout() {

    const wanted = wantSingle() ? "single" : "spread";

    book.classList.add("no-anim");

    zoomed = false;

    if (wanted !== mode || !leaves.length) {

        // keep the reader on the same page when the layout changes
        const page = leaves.length
            ? (mode === "spread" ? stateToPage(state) : state)
            : 0;

        build(wanted);

        state = wanted === "single" ? page : pageToState(page);
    }

    measure();
    render();
    updateHint();

    void book.offsetWidth;

    book.classList.remove("no-anim");
}

window.addEventListener("resize", layout);


/* =====================================================
   BACKGROUND:  soft orbs + floating hearts
===================================================== */

(function ambient() {

    if (REDUCED_MOTION) return;

    const small = window.innerWidth <= 600;

    /* ----- orbs ----- */

    const orbs = document.getElementById("orbs");

    for (let i = 0; i < (small ? 5 : 8); i++) {

        const orb = document.createElement("span");
        orb.className = "orb";

        const size = 110 + Math.random() * 220;

        orb.style.width = orb.style.height = size + "px";
        orb.style.left = Math.random() * 100 + "%";
        orb.style.top = Math.random() * 100 + "%";
        orb.style.setProperty("--dx", (Math.random() * 120 - 60) + "px");
        orb.style.setProperty("--dy", (Math.random() * 120 - 60) + "px");
        orb.style.animationDuration = 14 + Math.random() * 14 + "s";
        orb.style.animationDelay = -Math.random() * 14 + "s";

        orbs.appendChild(orb);
    }

    /* ----- hearts ----- */

    const box = document.getElementById("petals");
    const colours = ["#e8607d", "#f39aae", "#d63f63", "#f7b6c4"];
    const count = small ? 24 : 34;

    for (let i = 0; i < count; i++) {

        const heart = document.createElement("span");
        heart.className = "heart";
        heart.textContent = "\u2665";

        const size = (small ? 9 : 10) + Math.random() * (small ? 14 : 20);

        heart.style.left = Math.random() * 100 + "%";
        heart.style.fontSize = size + "px";
        heart.style.color = colours[i % colours.length];
        heart.style.animationDuration = 12 + Math.random() * 12 + "s";
        heart.style.animationDelay = -Math.random() * 24 + "s";
        heart.style.setProperty("--sway", (Math.random() * 80 - 40) + "px");

        box.appendChild(heart);
    }
})();


/* =====================================================
   START
===================================================== */

loadRatio(pages[0].src).then(ratio => {

    coverRatio = ratio;

    layout();

    book.classList.add("ready");
});
