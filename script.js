/* =====================================================
   LOVE STORY BOOK
   -----------------------------------------------------
   Pages:  photo1 = cover (single, right side)
           photo2 | photo3   (spread 1)
           photo4 | photo5   (spread 2)
           photo6            (last page, single, left side)

   Each physical sheet ("leaf") has a front and a back:
     leaf 0: front photo1, back photo2
     leaf 1: front photo3, back photo4
     leaf 2: front photo5, back photo6
   Turning a leaf flips it around the spine.
===================================================== */


/* ---------- SETTINGS (edit these) ---------- */

// Folder that contains photo1.png, photo2.png, photo3.png ...
const PHOTO_FOLDER = "assets/photos/";

// HOW MANY photos the book has in total (cover + inner pages + last page).
// Name them photo1.png ... photoN.png. Use an EVEN number (6, 8, 10, 12 ...)
// so the last photo sits alone on the final page.
const TOTAL_PHOTOS = 6;

// Optional animated cover. Put your video here (mp4).
// If the file is missing, the still cover image is used.
const COVER_VIDEO = "";

// 3D book thickness
const BOARD_COLOR = "#6b1a22";   // hard-cover edge colour (not used while BOARD_THICKNESS = 0)
const MAX_PAGES_THICKNESS = 26;  // px, thickness of the whole page block
const BOARD_THICKNESS = 0;       // px, 0 = no extra hard cover, only soft paper edges

const FLIP_TIME = 900;          // ms, keep equal to CSS transition time
const COMMIT_PROGRESS = 0.3;    // drag this far (0-1) and the page finishes turning


/* ---------- DATA ---------- */

const photos = Array.from(
    { length: TOTAL_PHOTOS },
    (_, i) => `${PHOTO_FOLDER}photo${i + 1}.png`
);
const LEAF_COUNT = Math.ceil(photos.length / 2);

const scene = document.getElementById("scene");
const book = document.getElementById("book");
const hint = document.getElementById("hint");

const leaves = [];

let state = 0;             // number of leaves already turned to the left (0..3)
let pageW = 0;
let pageH = 0;
let busy = false;


/* ---------- BUILD THE LEAVES ---------- */

for (let i = 0; i < LEAF_COUNT; i++) {

    const leaf = document.createElement("div");
    leaf.className = i === 0 ? "leaf cover" : "leaf";

    const backSrc = photos[i * 2 + 1];   // missing if the count is odd -> blank page

    leaf.innerHTML = `
        <div class="face front"><img src="${photos[i * 2]}" alt="" draggable="false"></div>
        <div class="face back">${backSrc ? `<img src="${backSrc}" alt="" draggable="false">` : ""}</div>
    `;

    book.appendChild(leaf);
    leaves.push(leaf);
}


/* ---------- BOOK THICKNESS (page edges, hard cover, spine) ---------- */

const stackLeft = document.createElement("div");
stackLeft.className = "stack left";

const stackRight = document.createElement("div");
stackRight.className = "stack right";

const spine = document.createElement("div");
spine.className = "spine";

book.prepend(stackLeft, stackRight, spine);

const PER_LEAF = Math.min(6, MAX_PAGES_THICKNESS / LEAF_COUNT);

let current = { left: 0, right: LEAF_COUNT };
let tweenId = null;

// Draws a stack of page edges as many 1px layers.
// count = how many leaves are on that side (can be fractional while dragging)
function edgeShadow(side, count) {

    const sign = side === "right" ? 1 : -1;
    const pages = count * PER_LEAF;
    const board = Math.min(1, count) * BOARD_THICKNESS;
    const total = pages + board;

    const layers = [];

    for (let k = 1; k <= Math.ceil(total); k++) {

        const color = k > pages
            ? BOARD_COLOR
            : (k % 2 ? "#fdf6f1" : "#ecd7d0");

        layers.push(`${(sign * k * 1.0).toFixed(2)}px ${k}px 0 ${color}`);
    }

    if (layers.length) {
        // soft ground shadow that follows the visible pages
        layers.push(`${(sign * total * 0.5).toFixed(1)}px ${(total + 14).toFixed(1)}px 26px rgba(140, 45, 70, .34)`);
    }

    return layers.length ? layers.join(",") : "none";
}

function applyStacks(left, right) {

    current = { left, right };

    stackLeft.style.boxShadow = edgeShadow("left", left);
    stackRight.style.boxShadow = edgeShadow("right", right);

    stackLeft.style.visibility = left > 0.02 ? "visible" : "hidden";
    stackRight.style.visibility = right > 0.02 ? "visible" : "hidden";

    // spine of the closed book (only visible while the cover is shut)
    const width = LEAF_COUNT * PER_LEAF + BOARD_THICKNESS;

    spine.style.width = width + "px";
    spine.style.left = `calc(var(--page-width) - ${width}px)`;
    spine.style.opacity = BOARD_THICKNESS > 0 ? Math.max(0, 1 - left) : 0;
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


/* ---------- COVER VIDEO (optional) ---------- */

if (COVER_VIDEO) {

    const video = document.createElement("video");

    video.src = COVER_VIDEO;
    video.poster = photos[0];
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "auto";

    // No video file? just keep the still cover.
    video.addEventListener("error", () => video.remove());

    leaves[0].querySelector(".front").appendChild(video);

    // Some phones need a nudge to start autoplay.
    const kick = () => video.play().catch(() => {});
    video.addEventListener("canplay", kick);
    document.addEventListener("pointerdown", kick, { once: true });
}


/* ---------- SIZE ---------- */

function loadRatio(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
        img.onerror = () => resolve(0.72);          // fallback ratio
        img.src = src;
    });
}

let coverRatio = 0.72;

function layout() {

    pageH = window.innerHeight * (window.innerWidth <= 600 ? 0.78 : 0.82);
    pageW = pageH * coverRatio;

    // the open book (2 pages) must fit the screen
    const maxBookW = window.innerWidth * 0.92;

    if (pageW * 2 > maxBookW) {
        pageW = maxBookW / 2;
        pageH = pageW / coverRatio;
    }

    book.style.setProperty("--page-width", pageW + "px");
    book.style.setProperty("--page-height", pageH + "px");

    render();
}


/* ---------- POSITIONS ---------- */

// While a leaf is in the air it must be on top of everything.
function render(flyingIndex = -1, animate = false) {

    // Centre the book on whatever is visible:
    //   cover only  -> shift left by half a page
    //   last page   -> shift right by half a page
    let offset = 0;
    if (state === 0) offset = -0.5;
    if (state === LEAF_COUNT) offset = 0.5;

    book.style.transform = `translateX(${offset * pageW}px)`;

    leaves.forEach((leaf, i) => {

        const turned = i < state;

        leaf.style.transform = `rotateY(${turned ? -180 : 0}deg)`;

        if (i === flyingIndex) {
            leaf.style.zIndex = 100;
        } else {
            // turned leaves stack up on the left, unturned on the right
            leaf.style.zIndex = turned ? i + 1 : LEAF_COUNT - i;
        }
    });

    // page-block thickness on each side
    if (animate) {
        tweenStacks(state, LEAF_COUNT - state, FLIP_TIME);
    } else {
        cancelTween();
        applyStacks(state, LEAF_COUNT - state);
    }
}


/* ---------- TURNING ---------- */

function finishFlip(index) {
    busy = true;
    render(index, true);

    setTimeout(() => {
        render();
        busy = false;
    }, FLIP_TIME);

    hint.classList.add("hidden");
}

function nextPage() {
    if (busy || state >= LEAF_COUNT) return;
    const index = state;
    state++;
    finishFlip(index);
}

function previousPage() {
    if (busy || state <= 0) return;
    state--;
    finishFlip(state);
}


/* ---------- SWIPE / DRAG (page follows your finger) ---------- */

let drag = null;

scene.addEventListener("pointerdown", event => {

    if (busy) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    drag = {
        startX: event.clientX,
        startY: event.clientY,
        dir: 0,            // 1 = forward, -1 = back
        index: -1,
        progress: 0,
        lastX: event.clientX,
        lastT: performance.now(),
        velocity: 0
    };

    scene.setPointerCapture(event.pointerId);
});


scene.addEventListener("pointermove", event => {

    if (!drag) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    // decide direction once
    if (drag.dir === 0) {

        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;

        if (Math.abs(dy) > Math.abs(dx)) {     // vertical, ignore
            drag = null;
            return;
        }

        drag.dir = dx < 0 ? 1 : -1;

        if (drag.dir === 1 && state >= LEAF_COUNT) { drag = null; return; }
        if (drag.dir === -1 && state <= 0)         { drag = null; return; }

        drag.index = drag.dir === 1 ? state : state - 1;

        const leaf = leaves[drag.index];
        leaf.classList.add("dragging");
        leaf.style.zIndex = 100;
    }

    // how far the finger has travelled in the turning direction
    const travelled = drag.dir === 1 ? -dx : dx;
    drag.progress = Math.min(1, Math.max(0, travelled / (pageW * 1.1)));

    const angle = drag.dir === 1
        ? -180 * drag.progress
        : -180 * (1 - drag.progress);

    leaves[drag.index].style.transform = `rotateY(${angle}deg)`;

    // the two page stacks grow / shrink with your finger
    const turnedLeaves = state + drag.dir * drag.progress;
    applyStacks(turnedLeaves, LEAF_COUNT - turnedLeaves);

    // speed of the finger (for quick flicks)
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) drag.velocity = (event.clientX - drag.lastX) / dt;
    drag.lastX = event.clientX;
    drag.lastT = now;
});


function endDrag(event) {

    if (!drag) return;

    const d = drag;
    drag = null;

    // a simple tap: right half = next, left half = previous
    if (d.dir === 0) {
        const moved = Math.hypot(event.clientX - d.startX, event.clientY - d.startY);
        if (moved < 8 && event.type === "pointerup") {
            if (event.clientX > window.innerWidth / 2) nextPage();
            else previousPage();
        }
        return;
    }

    const leaf = leaves[d.index];
    leaf.classList.remove("dragging");
    void leaf.offsetWidth;                       // apply transition again

    const flick = d.dir === 1 ? -d.velocity > 0.5 : d.velocity > 0.5;
    const commit = d.progress > COMMIT_PROGRESS || flick;

    if (commit) {
        state += d.dir;
    }

    finishFlip(d.index);
}

scene.addEventListener("pointerup", endDrag);
scene.addEventListener("pointercancel", endDrag);


/* ---------- KEYBOARD ---------- */

document.addEventListener("keydown", event => {
    if (event.key === "ArrowRight") nextPage();
    if (event.key === "ArrowLeft") previousPage();
});


/* ---------- MISC ---------- */

document.addEventListener("contextmenu", event => event.preventDefault());

window.addEventListener("resize", () => {
    book.classList.add("no-anim");
    layout();
    void book.offsetWidth;
    book.classList.remove("no-anim");
});


/* ---------- START ---------- */

loadRatio(photos[0]).then(ratio => {

    coverRatio = ratio;

    book.classList.add("no-anim");
    layout();
    void book.offsetWidth;
    book.classList.remove("no-anim");

    book.classList.add("ready");
});


/* ---------- FLOATING HEARTS (background) ---------- */

(function makeHearts() {

    const box = document.getElementById("petals");

    if (!box || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const colours = ["#e8607d", "#f39aae", "#d63f63", "#f7b6c4"];

    for (let i = 0; i < 16; i++) {

        const heart = document.createElement("span");
        heart.className = "heart";
        heart.textContent = "\u2665";

        const size = 10 + Math.random() * 18;

        heart.style.left = Math.random() * 100 + "%";
        heart.style.fontSize = size + "px";
        heart.style.color = colours[i % colours.length];
        heart.style.animationDuration = 14 + Math.random() * 14 + "s";
        heart.style.animationDelay = -Math.random() * 26 + "s";
        heart.style.setProperty("--sway", (Math.random() * 80 - 40) + "px");
        heart.style.filter = `blur(${size < 15 ? 1.2 : 0}px)`;

        box.appendChild(heart);
    }
})();