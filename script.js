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

const heroState = {
	x: 0,
	y: 0,
	targetX: 0,
	targetY: 0
};
let targetCameraZ = 5;
let scrollSceneProgress = 0;

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

	nebulaMaterial.uniforms.scrollProgress.value = scrollSceneProgress;

	renderer.render(scene, camera);
}

animate();

if (window.gsap && window.ScrollTrigger) {
	gsap.registerPlugin(ScrollTrigger);

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

