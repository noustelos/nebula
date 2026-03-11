const canvas = document.querySelector("#bg");
const heroText = document.querySelector(".hero-text");
const scrollHint = document.querySelector(".scroll-to-experience");
const rootStyle = document.documentElement.style;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouchDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;

if (!canvas || typeof THREE === "undefined") {
	throw new Error("Missing canvas or THREE library.");
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (start, end, factor) => start + (end - start) * factor;

canvas.style.width = "100vw";
canvas.style.height = "100vh";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
	75,
	window.innerWidth / window.innerHeight,
	0.1,
	1000
);

const renderer = new THREE.WebGLRenderer({
	canvas,
	antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.3 : 1.75));
renderer.setClearColor(0x222244);
document.body.appendChild(renderer.domElement);

const credentialSection = document.querySelector(".credential-section");
const scrollOrb = document.createElement("div");
scrollOrb.className = "scroll-orb";
document.body.appendChild(scrollOrb);

const trailPool = [];
const trailSize = prefersReducedMotion ? 0 : isTouchDevice ? 10 : 25;
for (let i = 0; i < trailSize; i++) {
	const trailEl = document.createElement("div");
	trailEl.className = "orb-trail";
	trailEl.style.display = "none";
	document.body.appendChild(trailEl);
	trailPool.push(trailEl);
}
let trailIndex = 0;
let framesSinceTrail = 0;
const trailCadence = isTouchDevice ? 5 : 2;


const orbState = {
	x: window.innerWidth * 0.5,
	y: window.innerHeight * 0.5
};
const heroState = {
	x: 0,
	y: 0,
	targetX: 0,
	targetY: 0
};
let targetCameraZ = 5;
let scrollSceneProgress = 0;

const cardNodes = Array.from(document.querySelectorAll(".badge-button"));
const orbPassState = {
	nextSwapAt: 0,
	cardIndex: 0,
	jitterSeed: Math.random() * Math.PI * 2
};
let hoveredCard = null;
let hoveredGateway = null;

cardNodes.forEach((card) => {
	card.addEventListener("pointerenter", () => {
		hoveredCard = card;
		scrollOrb.classList.add("is-hovering-card");
	});
	card.addEventListener("pointermove", (event) => {
		if (prefersReducedMotion || isTouchDevice) return;
		const rect = card.getBoundingClientRect();
		const relativeX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
		const relativeY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
		const tiltX = (relativeX - 0.5) * 10;
		const tiltY = (0.5 - relativeY) * 8;

		card.style.setProperty("--pointer-x", `${(relativeX * 100).toFixed(2)}%`);
		card.style.setProperty("--pointer-y", `${(relativeY * 100).toFixed(2)}%`);
		card.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
		card.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
	});
	card.addEventListener("pointerleave", () => {
		if (hoveredCard === card) hoveredCard = null;
		scrollOrb.classList.remove("is-hovering-card");
		card.style.setProperty("--pointer-x", "50%");
		card.style.setProperty("--pointer-y", "50%");
		card.style.setProperty("--tilt-x", "0deg");
		card.style.setProperty("--tilt-y", "0deg");
	});
	card.addEventListener("focusin", () => {
		hoveredCard = card;
		scrollOrb.classList.add("is-hovering-card");
	});
	card.addEventListener("focusout", () => {
		if (hoveredCard === card) hoveredCard = null;
		scrollOrb.classList.remove("is-hovering-card");
	});
});

// Per-card organic float state — distinct phase offsets so each card drifts independently
const floatState = cardNodes.map((_, i) => ({ phase: i * 2.07 + 0.42 }));

// Gateway drawer hover — orb lands on active drawer
const gatewayNodes = Array.from(document.querySelectorAll(".gateway-card"));
gatewayNodes.forEach((gw) => {
	gw.addEventListener("pointerenter", () => {
		hoveredGateway = gw;
		scrollOrb.classList.add("is-hovering-card");
	});
	gw.addEventListener("pointerleave", () => {
		if (hoveredGateway === gw) hoveredGateway = null;
		scrollOrb.classList.remove("is-hovering-card");
	});
	gw.addEventListener("focusin",  () => { hoveredGateway = gw;   scrollOrb.classList.add("is-hovering-card"); });
	gw.addEventListener("focusout", () => { if (hoveredGateway === gw) hoveredGateway = null; scrollOrb.classList.remove("is-hovering-card"); });
});

// ── Gateway title: boarding-board scramble → settle on hover ──────────────
camera.position.z = 5;
scene.fog = new THREE.FogExp2(0x000000, 0.0015);

const ambientLight = new THREE.AmbientLight(0x6f7fff, 0.35);
const keyLight = new THREE.DirectionalLight(0x9ab6ff, 1.15);
keyLight.position.set(20, 30, 20);
scene.add(ambientLight, keyLight);

const galaxyGeometry = new THREE.BufferGeometry();
const starCount = 4900;
const positions = new Float32Array(starCount * 3);
const intensities = new Float32Array(starCount);
const sizes = new Float32Array(starCount);

for (let i = 0; i < starCount; i++) {
	const i3 = i * 3;
	positions[i3] = (Math.random() - 0.5) * 800;
	positions[i3 + 1] = (Math.random() - 0.5) * 800;
	positions[i3 + 2] = (Math.random() - 0.5) * 800;
	intensities[i] = 0.45 + Math.random() * 0.95;
	sizes[i] = 1.4 + Math.random() * 3.6;
}

galaxyGeometry.setAttribute(
	"position",
	new THREE.BufferAttribute(positions, 3)
);
galaxyGeometry.setAttribute(
	"aIntensity",
	new THREE.BufferAttribute(intensities, 1)
);
galaxyGeometry.setAttribute(
	"aSize",
	new THREE.BufferAttribute(sizes, 1)
);

const galaxyMaterial = new THREE.ShaderMaterial({
	transparent: true,
	depthWrite: false,
	blending: THREE.AdditiveBlending,
	uniforms: {
		time: { value: 0 }
	},
	vertexShader: `
	attribute float aIntensity;
	attribute float aSize;
	varying float vIntensity;

	void main() {
		vIntensity = aIntensity;
		vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
		gl_PointSize = aSize * (170.0 / -mvPosition.z);
		gl_Position = projectionMatrix * mvPosition;
	}
	`,
	fragmentShader: `
	uniform float time;
	varying float vIntensity;

	void main() {
		vec2 p = gl_PointCoord - vec2(0.5);
		float d = length(p);
		if (d > 0.5) discard;

		float core = smoothstep(0.2, 0.0, d);
		float halo = smoothstep(0.5, 0.0, d) * 0.95;
		float twinkle = 0.82 + 0.18 * sin(time * (2.2 + vIntensity * 2.4));
		float alpha = (core + halo) * vIntensity * twinkle * 1.22;
		vec3 color = mix(vec3(0.68, 0.82, 1.0), vec3(1.0, 1.0, 1.0), vIntensity);

		gl_FragColor = vec4(color, alpha);
	}
	`
});

const galaxy = new THREE.Points(galaxyGeometry, galaxyMaterial);
scene.add(galaxy);

const nebulaVertexShader = `
varying vec2 vUv;
uniform float curvature;

void main() {
	vUv = uv;
	vec3 p = position;
	vec2 centered = uv - 0.5;
	float d = dot(centered, centered);
	p.z -= d * curvature;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
}
`;

const nebulaFragmentShader = `
varying vec2 vUv;
uniform float time;
uniform vec2 orbUv;
uniform float orbBoost;
uniform float scrollProgress;

// Simplex Noise function
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
	const vec2 C = vec2(1.0/6.0, 1.0/3.0);
	const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
	vec3 i  = floor(v + dot(v, C.yyy));
	vec3 x0 = v - i + dot(i, C.xxx);
	vec3 g = step(x0.yzx, x0.xyz);
	vec3 l = 1.0 - g;
	vec3 i1 = min(g.xyz, l.zxy);
	vec3 i2 = max(g.xyz, l.zxy);
	vec3 x1 = x0 - i1 + C.xxx;
	vec3 x2 = x0 - i2 + C.yyy;
	vec3 x3 = x0 - D.yyy;
	i = mod289(i);
	vec4 p = permute(permute(permute(
		i.z + vec4(0.0, i1.z, i2.z, 1.0))
		+ i.y + vec4(0.0, i1.y, i2.y, 1.0))
		+ i.x + vec4(0.0, i1.x, i2.x, 1.0));
	float n_ = 0.142857142857;
	vec3 ns = n_ * D.wyz - D.xzx;
	vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
	vec4 x_ = floor(j * ns.z);
	vec4 y_ = floor(j - 7.0 * x_);
	vec4 x = x_ * ns.x + ns.yyyy;
	vec4 y = y_ * ns.x + ns.yyyy;
	vec4 h = 1.0 - abs(x) - abs(y);
	vec4 b0 = vec4(x.xy, y.xy);
	vec4 b1 = vec4(x.zw, y.zw);
	vec4 s0 = floor(b0)*2.0 + 1.0;
	vec4 s1 = floor(b1)*2.0 + 1.0;
	vec4 sh = -step(h, vec4(0.0));
	vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
	vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
	vec3 p0 = vec3(a0.xy,h.x);
	vec3 p1 = vec3(a0.zw,h.y);
	vec3 p2 = vec3(a1.xy,h.z);
	vec3 p3 = vec3(a1.zw,h.w);
	vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
	p0 *= norm.x;
	p1 *= norm.y;
	p2 *= norm.z;
	p3 *= norm.w;
	vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
	m = m * m;
	return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
	vec2 uv = vUv;
	float t = time * 0.1;

	float f = 0.0;
	uv *= 3.0;
	f += 0.50 * snoise(vec3(uv, t * 0.4));
	uv *= 2.0;
	f += 0.25 * snoise(vec3(uv, t * 0.6));
	uv *= 2.0;
	f += 0.125 * snoise(vec3(uv, t * 0.8));
	uv *= 2.0;
	f += 0.0625 * snoise(vec3(uv, t * 1.0));
	f = 0.5 + 0.5 * f;

	float cloudMask = smoothstep(0.45, 0.8, f);
	float veil = 0.5 + 0.5 * snoise(vec3(vUv * 2.6, t * 0.18 + 7.0));
	float stormMask = smoothstep(0.42, 0.82, veil + scrollProgress * 0.18);
	
	vec3 color = vec3(0.05, 0.08, 0.22); // Deep space blue
	color = mix(color, vec3(0.1, 0.05, 0.25), cloudMask); // Purple hues
	color = mix(color, vec3(0.8, 0.2, 0.5), pow(cloudMask, 4.0) * 0.3); // Magenta highlights
	color = mix(color, vec3(0.9, 0.9, 1.0), pow(cloudMask, 32.0) * 0.1); // Bright cores
	color += mix(vec3(0.08, 0.16, 0.34), vec3(0.34, 0.1, 0.26), scrollProgress) * stormMask * 0.14;

	float orbDist = distance(vUv, orbUv);
	float orbLight = smoothstep(0.25, 0.0, orbDist) * orbBoost;
	color += vec3(0.2, 0.3, 0.5) * orbLight;

	float edgeFade = 1.0 - smoothstep(0.4, 0.98, distance(vUv, vec2(0.5)));
	float cinematicPulse = 0.9 + 0.1 * sin(time * 0.22 + scrollProgress * 3.14159);
	gl_FragColor = vec4(color * cinematicPulse, (cloudMask * 0.72 + stormMask * 0.14 + orbLight * 0.08) * edgeFade);
}
`;

const nebulaGeometry = new THREE.PlaneGeometry(1800, 1800, 120, 120);
const nebulaMaterial = new THREE.ShaderMaterial({
	transparent: true,
	uniforms: {
		time: { value: 0 },
		curvature: { value: 340.0 },
		orbUv: { value: new THREE.Vector2(0.5, 0.5) },
		orbBoost: { value: 0.0 },
		scrollProgress: { value: 0.0 }
	},
	vertexShader: nebulaVertexShader,
	fragmentShader: nebulaFragmentShader,
	depthWrite: false,
	side: THREE.DoubleSide,
	blending: THREE.NormalBlending
});

const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
nebula.position.z = -180;
scene.add(nebula);

let targetX = 0;
let targetY = 0;

document.addEventListener("pointermove", (e) => {
	const x = e.clientX / window.innerWidth - 0.5;
	const y = e.clientY / window.innerHeight - 0.5;
	targetX = x * 5;
	targetY = -y * 5;
	if (!prefersReducedMotion) {
		heroState.targetX = x * 18;
		heroState.targetY = y * 14;
	}
});

function updateScrollSceneState() {
	const t = document.body.getBoundingClientRect().top;
	scrollSceneProgress = clamp(window.scrollY / Math.max(window.innerHeight * 0.92, 1), 0, 1);
	const nextZ = 5 + t * -0.01;
	targetCameraZ = clamp(nextZ + scrollSceneProgress * 0.9, 4.2, 11.5);
	galaxy.rotation.y += t * -0.0002;
}

window.addEventListener("scroll", updateScrollSceneState);
updateScrollSceneState();

window.addEventListener("resize", () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.3 : 1.75));
});

function animate() {
	requestAnimationFrame(animate);

	nebulaMaterial.uniforms.time.value += 0.01;
	galaxyMaterial.uniforms.time.value += 0.016;
	galaxy.rotation.y += 0.0006;
	galaxy.rotation.x += 0.00015;
	nebula.rotation.z += 0.0002;
	nebula.position.x = camera.position.x * 0.35;
	nebula.position.y = camera.position.y * 0.35;
	camera.position.z = lerp(camera.position.z, targetCameraZ, prefersReducedMotion ? 0.16 : 0.05);
	nebula.position.z = camera.position.z - 180;

	camera.position.x += (targetX - camera.position.x) * 0.08;
	camera.position.y += (targetY - camera.position.y) * 0.08;
	camera.lookAt(scene.position);

	if (heroText && !prefersReducedMotion) {
		heroState.x = lerp(heroState.x, heroState.targetX * (1 - scrollSceneProgress * 0.65), 0.08);
		heroState.y = lerp(heroState.y, heroState.targetY * (1 - scrollSceneProgress * 0.65) - scrollSceneProgress * 52, 0.08);
		rootStyle.setProperty("--hero-shift-x", `${heroState.x.toFixed(2)}px`);
		rootStyle.setProperty("--hero-shift-y", `${heroState.y.toFixed(2)}px`);
		rootStyle.setProperty("--hero-fade", `${(1 - scrollSceneProgress * 0.78).toFixed(3)}`);
		rootStyle.setProperty("--hero-blur", `${(scrollSceneProgress * 6).toFixed(2)}px`);
	} else {
		rootStyle.setProperty("--hero-shift-x", "0px");
		rootStyle.setProperty("--hero-shift-y", "0px");
		rootStyle.setProperty("--hero-fade", `${(1 - scrollSceneProgress * 0.55).toFixed(3)}`);
		rootStyle.setProperty("--hero-blur", "0px");
	}

	// ─── Orb companion: 3-phase Lissajous fluid motion ─────────────────
	const _now = performance.now();
	const _t   = _now * 0.001;
	const sp   = scrollSceneProgress;

	// Smooth-step helper (cubic)
	const ss = (e0, e1, x) => {
		const c = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
		return c * c * (3 - 2 * c);
	};

	// ── PHASE 1: title anchor (Lissajous drift around hero text) ──────
	let titleCX = window.innerWidth * 0.5;
	let titleCY = window.innerHeight * 0.44;
	if (heroText) {
		const _hr = heroText.getBoundingClientRect();
		titleCX = _hr.left + _hr.width  * 0.5;
		titleCY = _hr.top  + _hr.height * 0.5;
	}
	// Incommensurate frequencies → never repeats, always organic
	const heroOrbX = titleCX
		+ Math.sin(_t * 0.38) * 82
		+ Math.sin(_t * 0.61 + 1.24) * 40
		+ Math.sin(_t * 1.13 + 2.7)  * 16;
	const heroOrbY = titleCY
		+ Math.sin(_t * 0.27 + 0.62) * 50
		+ Math.cos(_t * 0.49 + 0.31) * 24
		+ Math.sin(_t * 0.87 + 1.8)  * 10;

	// ── PHASE 2: fluid descent (Lissajous columns, vertical sweep) ────
	const _jA = _t * 0.21;
	const credRect = credentialSection ? credentialSection.getBoundingClientRect() : null;
	const destY = credRect ? credRect.top + credRect.height * 0.38 : window.innerHeight * 1.1;
	const journeyX = window.innerWidth * 0.5
		+ Math.sin(_jA * 1.73)          * 170
		+ Math.sin(_jA * 0.91 + 1.4)    *  68
		+ Math.cos(_jA * 2.41 + 0.8)    *  24;
	const journeyY = lerp(titleCY, destY, Math.min(sp / 0.72, 1));

	// ── PHASE 3: card companion orbit ────────────────────────────────
	let credCX = window.innerWidth * 0.5;
	let credCY = window.innerHeight * 0.5;
	let sectionInfluence = 0;
	if (credRect) {
		credCX = credRect.left + credRect.width  * 0.5;
		credCY = credRect.top  + credRect.height * 0.42;
		const _cd = Math.abs(credCY - window.innerHeight * 0.5);
		sectionInfluence = Math.max(0, 1 - Math.min(1, _cd / (window.innerHeight * 0.9)));
	}
	const _cA = _t * 0.44;
	let cardOrbX = credCX + Math.sin(_cA * 1.61) * 175 + Math.sin(_cA * 0.78 + 0.9) * 58;
	let cardOrbY = credCY + Math.sin(_cA * 0.95 + 0.4) * 82 + Math.cos(_cA * 1.44) * 32;

	let highlightedCard = null;
	let orbRgb = "190, 220, 255";

	// ── PRIORITY 0: gateway drawer hover — highest override ────────
	if (hoveredGateway) {
		const _gr = hoveredGateway.getBoundingClientRect();
		// land at the number column centre (left 72px zone) with micro-pulse
		cardOrbX = _gr.left + 52 + Math.sin(_t * 2.1) * 6 + Math.sin(_t * 3.7 + 1.2) * 3;
		cardOrbY = _gr.top + _gr.height * 0.5 + Math.sin(_t * 1.6 + 0.8) * 5 + Math.cos(_t * 2.9) * 2.5;
		sectionInfluence = 1;
		orbRgb = "190, 220, 255";
	} else if (hoveredCard) {
		const _cR  = hoveredCard.getBoundingClientRect();
		const _ccX = _cR.left + _cR.width  * 0.5;
		const _ccY = _cR.top  + _cR.height * 0.5;
		const _sA  = _now * 0.0005;
		cardOrbX = _ccX + Math.cos(_sA) * _cR.width  * 0.72;
		cardOrbY = _ccY + Math.sin(_sA * 0.9) * _cR.height * 0.44;
		sectionInfluence = Math.max(sectionInfluence, 0.95);
		highlightedCard = hoveredCard;
	} else if (sectionInfluence > 0.2 && cardNodes.length > 0) {
		if (_now > orbPassState.nextSwapAt) {
			orbPassState.cardIndex  = Math.floor(Math.random() * cardNodes.length);
			orbPassState.nextSwapAt = _now + 3200 + Math.random() * 2600;
			orbPassState.jitterSeed = Math.random() * Math.PI * 2;
		}
		const _aC = cardNodes[orbPassState.cardIndex];
		if (_aC) {
			const _aCr = _aC.getBoundingClientRect();
			const _acX = _aCr.left + _aCr.width  * 0.5;
			const _acY = _aCr.top  + _aCr.height * 0.5;
			const _jX  = Math.sin(_now * 0.00035 + orbPassState.jitterSeed) * (_aCr.width  * 0.34);
			const _jY  = Math.cos(_now * 0.00028 + orbPassState.jitterSeed * 1.3) * (_aCr.height * 0.22);
			cardOrbX = cardOrbX * (1 - sectionInfluence) + (_acX + _jX) * sectionInfluence;
			cardOrbY = cardOrbY * (1 - sectionInfluence) + (_acY + _jY) * sectionInfluence;
			highlightedCard = _aC;
		}
	}

	// ── Blend weights: hero → journey → cards (sum ≈ 1 via normalise) ─
	const heroW   = hoveredGateway ? 0 : ss(0.28, 0.0,  sp);
	const cardW   = hoveredGateway ? 1 : ss(0.55, 0.85, sp);
	const journW  = Math.max(0, 1 - heroW - cardW);
	const _wSum   = heroW + journW + cardW || 1;
	const targetOrbX = (heroOrbX * heroW + journeyX * journW + cardOrbX * cardW) / _wSum;
	const targetOrbY = (heroOrbY * heroW + journeyY * journW + cardOrbY * cardW) / _wSum;

	// Per-card orb glow
	cardNodes.forEach((card) => {
		const _cR  = card.getBoundingClientRect();
		const _ccX = _cR.left + _cR.width  * 0.5;
		const _ccY = _cR.top  + _cR.height * 0.5;
		const _maxD = Math.max(_cR.width, _cR.height) * 1.25;
		const _d    = Math.hypot(orbState.x - _ccX, orbState.y - _ccY);
		card.style.setProperty("--orb-glow", clamp(1 - _d / _maxD, 0, 1).toFixed(3));
	});

	if (highlightedCard?.dataset.orbRgb) orbRgb = highlightedCard.dataset.orbRgb;

	orbState.x += (targetOrbX - orbState.x) * (prefersReducedMotion ? 0.12 : 0.052);
	orbState.y += (targetOrbY - orbState.y) * (prefersReducedMotion ? 0.12 : 0.052);
	rootStyle.setProperty("--orb-rgb", orbRgb);

	// Trail
	if (trailSize > 0) {
		framesSinceTrail++;
		if (framesSinceTrail > trailCadence) {
			framesSinceTrail = 0;
			const _tEl = trailPool[trailIndex];
			_tEl.style.display = "block";
			_tEl.style.transform = `translate3d(${orbState.x - 14}px, ${orbState.y - 14}px, 0) scale(1)`;
			_tEl.className = "";
			void _tEl.offsetWidth;
			_tEl.className = "orb-trail";
			trailIndex = (trailIndex + 1) % trailSize;
		}
	}

	// ── Pulse: subtle breathing, stays readable ────────────────────────
	const _p1 = 0.5 + 0.5 * Math.sin(_t * 1.74);
	const _p2 = 0.5 + 0.5 * Math.sin(_t * 2.83 + 1.1);
	const _p3 = 0.5 + 0.5 * Math.sin(_t * 0.61 + 2.4);
	// heroW lifts the pulse gently: max scale ≈ 1.8 (at hero zone)
	const orbScale   = 1.0 + 0.12 * _p1 + 0.06 * _p2 + heroW * (0.38 + 0.22 * _p3);
	const orbOpacity = 0.82 + 0.14 * sectionInfluence + heroW * 0.08;

	scrollOrb.style.transform = `translate3d(${(orbState.x - 29).toFixed(1)}px, ${(orbState.y - 29).toFixed(1)}px, 0) scale(${orbScale.toFixed(3)})`;
	scrollOrb.style.opacity   = Math.min(orbOpacity, 0.96).toFixed(3);

	// Organic nebula float: JS-driven per-card sinusoidal drift (replaces CSS hangFloat)
	if (!prefersReducedMotion) {
		const _ft = performance.now() * 0.001;
		cardNodes.forEach((card, i) => {
			const ph = floatState[i].phase;
			const tx = Math.sin(_ft * 0.37 + ph) * 7 + Math.sin(_ft * 0.71 + ph * 1.4) * 3.5;
			const ty = Math.sin(_ft * 0.42 + ph * 0.8) * 9 + Math.cos(_ft * 0.23 + ph * 1.2) * 4;
			const rz = Math.sin(_ft * 0.28 + ph * 0.6) * 1.8 + Math.cos(_ft * 0.51 + ph) * 0.8;
			card.style.setProperty("--nebula-tx", `${tx.toFixed(2)}px`);
			card.style.setProperty("--nebula-ty", `${ty.toFixed(2)}px`);
			card.style.setProperty("--nebula-rz", `${rz.toFixed(2)}deg`);
		});
	}

	nebulaMaterial.uniforms.orbUv.value.set(
		clamp(orbState.x / window.innerWidth, 0, 1),
		clamp(1 - orbState.y / window.innerHeight, 0, 1)
	);
	nebulaMaterial.uniforms.orbBoost.value = 0.18 + sectionInfluence * 0.46;
	nebulaMaterial.uniforms.scrollProgress.value = scrollSceneProgress;

	renderer.render(scene, camera);
}

animate();

if (window.gsap && window.ScrollTrigger) {
	gsap.registerPlugin(ScrollTrigger);

	gsap.fromTo(".badge-button",{
		autoAlpha:0,
		filter:"blur(18px)",
	},{

		scrollTrigger:{
			trigger:".credential-section",
			start:"top 72%",
			once:true
		},

		autoAlpha:1,
		filter:"blur(0px)",
		stagger:0.22,
		duration:1.2,
		ease:"power3.out",
		immediateRender:false

	});

	// Gateway drawer cards — stagger reveal on scroll
	const gatewayCards = gsap.utils.toArray(".gateway-card");

	gatewayCards.forEach((card, i) => {
		gsap.fromTo(card,
			{
				autoAlpha: 0,
				y: 60,
				clipPath: "inset(0 0 100% 0)"
			},
			{
				scrollTrigger: {
					trigger: card,
					start: "top 88%",
					once: true
				},
				autoAlpha: 1,
				y: 0,
				clipPath: "inset(0 0 0% 0)",
				duration: 1.1,
				delay: i * 0.1,
				ease: "power3.out",
				immediateRender: false
			}
		);

		// Animated left-edge line that sweeps down on hover
		const line = document.createElement("span");
		line.className = "gateway-line";
		line.style.cssText = `
			position:absolute;left:0;top:0;width:2px;height:0;
			background:linear-gradient(180deg,rgba(120,190,255,0),rgba(140,200,255,0.7),rgba(120,190,255,0));
			transition:height 0.62s cubic-bezier(0.76,0,0.24,1);
			pointer-events:none;
		`;
		card.appendChild(line);
		card.addEventListener("mouseenter", () => { line.style.height = "100%"; });
		card.addEventListener("mouseleave", () => { line.style.height = "0"; });
	});
}

