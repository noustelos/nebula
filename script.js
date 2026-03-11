const canvas = document.querySelector("#bg");

if (!canvas || typeof THREE === "undefined") {
	throw new Error("Missing canvas or THREE library.");
}

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
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x222244);
document.body.appendChild(renderer.domElement);

const credentialSection = document.querySelector(".credential-section");
const scrollOrb = document.createElement("div");
scrollOrb.className = "scroll-orb";
document.body.appendChild(scrollOrb);

const trailPool = [];
const trailSize = 25;
for (let i = 0; i < trailSize; i++) {
	const trailEl = document.createElement("div");
	trailEl.className = "orb-trail";
	trailEl.style.display = "none";
	document.body.appendChild(trailEl);
	trailPool.push(trailEl);
}
let trailIndex = 0;
let framesSinceTrail = 0;


const orbState = {
	x: window.innerWidth * 0.5,
	y: window.innerHeight * 0.5
};

const cardNodes = Array.from(document.querySelectorAll(".badge-button"));
const orbPassState = {
	nextSwapAt: 0,
	cardIndex: 0,
	jitterSeed: Math.random() * Math.PI * 2
};
let hoveredCard = null;

cardNodes.forEach((card) => {
	card.addEventListener("mouseenter", () => {
		hoveredCard = card;
		scrollOrb.classList.add("is-hovering-card");
	});
	card.addEventListener("mouseleave", () => {
		if (hoveredCard === card) hoveredCard = null;
		scrollOrb.classList.remove("is-hovering-card");
	});
});

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
	
	vec3 color = vec3(0.05, 0.08, 0.22); // Deep space blue
	color = mix(color, vec3(0.1, 0.05, 0.25), cloudMask); // Purple hues
	color = mix(color, vec3(0.8, 0.2, 0.5), pow(cloudMask, 4.0) * 0.3); // Magenta highlights
	color = mix(color, vec3(0.9, 0.9, 1.0), pow(cloudMask, 32.0) * 0.1); // Bright cores

	float orbDist = distance(vUv, orbUv);
	float orbLight = smoothstep(0.25, 0.0, orbDist) * orbBoost;
	color += vec3(0.2, 0.3, 0.5) * orbLight;

	float edgeFade = 1.0 - smoothstep(0.4, 0.98, distance(vUv, vec2(0.5)));
	gl_FragColor = vec4(color, cloudMask * 0.8 * edgeFade);
}
`;

const nebulaGeometry = new THREE.PlaneGeometry(1800, 1800, 120, 120);
const nebulaMaterial = new THREE.ShaderMaterial({
	transparent: true,
	uniforms: {
		time: { value: 0 },
		curvature: { value: 340.0 },
		orbUv: { value: new THREE.Vector2(0.5, 0.5) },
		orbBoost: { value: 0.0 }
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

document.addEventListener("mousemove", (e) => {
	const x = e.clientX / window.innerWidth - 0.5;
	const y = e.clientY / window.innerHeight - 0.5;
	targetX = x * 5;
	targetY = -y * 5;
});

window.addEventListener("scroll", () => {
	const t = document.body.getBoundingClientRect().top;
	const nextZ = 5 + t * -0.01;
	camera.position.z = Math.max(3.5, Math.min(12, nextZ));
	galaxy.rotation.y += t * -0.0002;
});

window.addEventListener("resize", () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
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
	nebula.position.z = camera.position.z - 180;

	camera.position.x += (targetX - camera.position.x) * 0.08;
	camera.position.y += (targetY - camera.position.y) * 0.08;
	camera.lookAt(scene.position);

	const scrollMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
	const progress = window.scrollY / scrollMax;
	const orbitAngle = progress * Math.PI * 10 + performance.now() * 0.00024;
	const radiusX = Math.min(window.innerWidth * 0.42, 420);
	const radiusY = Math.min(window.innerHeight * 0.28, 240);
	const orbitCenterX = window.innerWidth * 0.5;
	const orbitCenterY = window.innerHeight * 0.58;

	let targetOrbX = orbitCenterX + Math.cos(orbitAngle) * radiusX;
	let targetOrbY = orbitCenterY + Math.sin(orbitAngle * 1.15) * radiusY;
	let sectionInfluence = 0;

	if (credentialSection) {
		const rect = credentialSection.getBoundingClientRect();
		const sectionCenterY = rect.top + rect.height * 0.42;
		const distance = Math.abs(sectionCenterY - window.innerHeight * 0.5);
		sectionInfluence = Math.max(0, 1 - Math.min(1, distance / (window.innerHeight * 0.9)));
		targetOrbX += Math.sin(orbitAngle * 1.55) * 95 * sectionInfluence;
		targetOrbY = targetOrbY * (1 - sectionInfluence) + sectionCenterY * sectionInfluence;

		if (hoveredCard) {
			const now = performance.now();
			const cardRect = hoveredCard.getBoundingClientRect();
			const cardCenterX = cardRect.left + cardRect.width * 0.5;
			const cardCenterY = cardRect.top + cardRect.height * 0.5;
			const satAngle = now * 0.0005;
			const satRadiusX = cardRect.width * 0.72;
			const satRadiusY = cardRect.height * 0.44;
			targetOrbX = cardCenterX + Math.cos(satAngle) * satRadiusX;
			targetOrbY = cardCenterY + Math.sin(satAngle * 0.9) * satRadiusY;
			sectionInfluence = Math.max(sectionInfluence, 0.95);
		} else if (sectionInfluence > 0.2 && cardNodes.length > 0) {
			const now = performance.now();
			if (now > orbPassState.nextSwapAt) {
				orbPassState.cardIndex = Math.floor(Math.random() * cardNodes.length);
				orbPassState.nextSwapAt = now + 3200 + Math.random() * 2600;
				orbPassState.jitterSeed = Math.random() * Math.PI * 2;
			}

			const activeCard = cardNodes[orbPassState.cardIndex];
			if (activeCard) {
				const cardRect = activeCard.getBoundingClientRect();
				const cardCenterX = cardRect.left + cardRect.width * 0.5;
				const cardCenterY = cardRect.top + cardRect.height * 0.5;
				const jitterX = Math.sin(now * 0.00035 + orbPassState.jitterSeed) * (cardRect.width * 0.34);
				const jitterY = Math.cos(now * 0.00028 + orbPassState.jitterSeed * 1.3) * (cardRect.height * 0.22);

				targetOrbX = targetOrbX * (1 - sectionInfluence) + (cardCenterX + jitterX) * sectionInfluence;
				targetOrbY = targetOrbY * (1 - sectionInfluence) + (cardCenterY + jitterY) * sectionInfluence;
			}
		}
	}

			orbState.x += (targetOrbX - orbState.x) * 0.06;
			orbState.y += (targetOrbY - orbState.y) * 0.06;
		
			framesSinceTrail++;
			if (framesSinceTrail > 2) {
				framesSinceTrail = 0;
				const trailEl = trailPool[trailIndex];
				trailEl.style.display = "block";
				trailEl.style.transform = `translate3d(${orbState.x-14}px, ${orbState.y-14}px, 0) scale(1)`;
		
				trailEl.className = "";
				void trailEl.offsetWidth; 
				trailEl.className = "orb-trail";
				
				trailIndex = (trailIndex + 1) % trailSize;
			}
		
			const orbScale = 1.05 + 0.18 * Math.sin(orbitAngle * 1.8);
			const orbOpacity = 0.34 + 0.24 * sectionInfluence;
			scrollOrb.style.transform = `translate3d(${orbState.x - 17}px, ${orbState.y - 17}px, 0) scale(${orbScale})`;
			scrollOrb.style.opacity = `${orbOpacity}`;
		nebulaMaterial.uniforms.orbUv.value.set(
			Math.min(1, Math.max(0, orbState.x / window.innerWidth)),
			Math.min(1, Math.max(0, 1 - orbState.y / window.innerHeight))
		);
		nebulaMaterial.uniforms.orbBoost.value = 0.2 + sectionInfluence * 0.42;

	renderer.render(scene, camera);
}

animate();

if (window.gsap && window.ScrollTrigger) {
	gsap.registerPlugin(ScrollTrigger);

	gsap.fromTo(".badge-button",{
		autoAlpha:0,
	},{

		scrollTrigger:{
			trigger:".credential-section",
			start:"top 72%",
			once:true
		},

		autoAlpha:1,
		stagger:0.3,
		duration:1.2,
		ease:"power3.out",
		immediateRender:false

	})
}

