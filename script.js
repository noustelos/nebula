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

float noise(vec2 p){
	return sin(p.x)*sin(p.y);
}

void main(){
	vec2 uv = vUv;
	vec2 centered = uv - 0.5;
	uv += centered * dot(centered, centered) * 0.16;

	float n =
		noise(uv*10.0 + time*0.2) +
		noise(uv*20.0 - time*0.3);

	vec3 color =
		vec3(0.2,0.1,0.6) +
		n * vec3(0.3,0.2,0.8);
	color *= 0.9;

	float orbDist = distance(vUv, orbUv);
	float orbLight = smoothstep(0.38, 0.0, orbDist) * orbBoost;
	color += vec3(0.14, 0.22, 0.38) * orbLight;

	float edgeFade = 1.0 - smoothstep(0.58, 0.98, distance(vUv, vec2(0.5)));
	float imaxVignette = 1.0 - smoothstep(0.45, 0.98, distance(vUv, vec2(0.5)));
	float baseAlpha = (0.216 * edgeFade) + (0.063 * imaxVignette);
	float localAlphaBoost = orbLight * 0.24;
	gl_FragColor = vec4(color, baseAlpha + localAlphaBoost);
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
	blending: THREE.AdditiveBlending
});

const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
nebula.position.z = -120;
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
	nebula.rotation.z += 0.00025;
	nebula.position.x = camera.position.x;
	nebula.position.y = camera.position.y;
	nebula.position.z = camera.position.z - 120;

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

		if (sectionInfluence > 0.2 && cardNodes.length > 0) {
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

		orbState.x += (targetOrbX - orbState.x) * 0.075;
		orbState.y += (targetOrbY - orbState.y) * 0.075;

		const orbScale = 1.05 + 0.18 * Math.sin(orbitAngle * 1.8);
	const orbOpacity = 0.34 + 0.24 * sectionInfluence;
	scrollOrb.style.transform = `translate3d(${orbState.x}px, ${orbState.y}px, 0) scale(${orbScale})`;
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

const boards = document.querySelectorAll(".matrix-bg")

boards.forEach(board=>{

for(let i=0;i<120;i++){

const cell = document.createElement("span")

cell.innerText = Math.floor(Math.random()*10)

board.appendChild(cell)

}

})

setInterval(()=>{

document.querySelectorAll(".matrix-bg span")
.forEach(el=>{

if(Math.random() > .9){

el.innerText = Math.floor(Math.random()*10)

}

})

},120)
