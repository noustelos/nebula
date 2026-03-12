const canvas = document.querySelector("#bg");
const heroCopy = document.querySelector(".hero-copy, .page-hero");
const rootStyle = document.documentElement.style;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouchDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;
const header = document.querySelector(".site-header");
const panelNodes = Array.from(document.querySelectorAll(".glass-panel, .hero-metrics li, .contact-form, .contact-card, .faq-card"));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (start, end, factor) => start + (end - start) * factor;

const heroState = {
	x: 0,
	y: 0,
	targetX: 0,
	targetY: 0
};

let targetX = 0;
let targetY = 0;
let targetCameraZ = 5.6;
let scrollSceneProgress = 0;

if (canvas && typeof THREE !== "undefined") {
	canvas.style.width = "100vw";
	canvas.style.height = "100vh";

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(
		72,
		window.innerWidth / window.innerHeight,
		0.1,
		1000
	);
	camera.position.z = 5.6;
	scene.fog = new THREE.FogExp2(0x040711, 0.00135);

	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true
	});
	const setRendererSize = () => {
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.3 : 1.8));
	};
	setRendererSize();
	
	renderer.setClearColor(0x050816, 1);

	const ambientLight = new THREE.AmbientLight(0x6f85ff, 0.34);
	const keyLight = new THREE.DirectionalLight(0xb8d5ff, 1.1);
	keyLight.position.set(18, 24, 18);
	scene.add(ambientLight, keyLight);

	const galaxyGeometry = new THREE.BufferGeometry();
	const starCount = 5200;
	const positions = new Float32Array(starCount * 3);
	const intensities = new Float32Array(starCount);
	const sizes = new Float32Array(starCount);

	for (let index = 0; index < starCount; index++) {
		const offset = index * 3;
		positions[offset] = (Math.random() - 0.5) * 840;
		positions[offset + 1] = (Math.random() - 0.5) * 840;
		positions[offset + 2] = (Math.random() - 0.5) * 840;
		intensities[index] = 0.42 + Math.random() * 0.95;
		sizes[index] = 1.2 + Math.random() * 3.5;
	}

	galaxyGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	galaxyGeometry.setAttribute("aIntensity", new THREE.BufferAttribute(intensities, 1));
	galaxyGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

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

			float core = smoothstep(0.22, 0.0, d);
			float halo = smoothstep(0.5, 0.0, d) * 0.95;
			float twinkle = 0.82 + 0.18 * sin(time * (2.1 + vIntensity * 2.5));
			float alpha = (core + halo) * vIntensity * twinkle * 1.16;
			vec3 color = mix(vec3(0.66, 0.82, 1.0), vec3(1.0, 0.97, 0.92), vIntensity * 0.3);
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
		gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
	}
	`;

	const nebulaFragmentShader = `
	varying vec2 vUv;
	uniform float time;
	uniform float scrollProgress;

	vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
	vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
	vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
	vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

	float snoise(vec3 v) {
		const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
		const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
		vec3 i = floor(v + dot(v, C.yyy));
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
		vec4 s0 = floor(b0) * 2.0 + 1.0;
		vec4 s1 = floor(b1) * 2.0 + 1.0;
		vec4 sh = -step(h, vec4(0.0));
		vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
		vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
		vec3 p0 = vec3(a0.xy, h.x);
		vec3 p1 = vec3(a0.zw, h.y);
		vec3 p2 = vec3(a1.xy, h.z);
		vec3 p3 = vec3(a1.zw, h.w);
		vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
		p0 *= norm.x;
		p1 *= norm.y;
		p2 *= norm.z;
		p3 *= norm.w;
		vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
		m = m * m;
		return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
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
		f += 0.0625 * snoise(vec3(uv, t));
		f = 0.5 + 0.5 * f;

		float cloudMask = smoothstep(0.45, 0.82, f);
		float veil = 0.5 + 0.5 * snoise(vec3(vUv * 2.4, t * 0.2 + 7.0));
		float stormMask = smoothstep(0.44, 0.84, veil + scrollProgress * 0.16);
		vec3 color = vec3(0.04, 0.07, 0.22);
		color = mix(color, vec3(0.08, 0.07, 0.28), cloudMask);
		color = mix(color, vec3(0.15, 0.22, 0.52), stormMask * 0.5);
		color = mix(color, vec3(0.84, 0.72, 0.6), pow(cloudMask, 4.4) * 0.12);
		float edgeFade = 1.0 - smoothstep(0.44, 0.98, distance(vUv, vec2(0.5)));
		float pulse = 0.9 + 0.1 * sin(time * 0.2 + scrollProgress * 3.14159);
		gl_FragColor = vec4(color * pulse, (cloudMask * 0.62 + stormMask * 0.16) * edgeFade);
	}
	`;

	const nebulaGeometry = new THREE.PlaneGeometry(1800, 1800, 120, 120);
	const nebulaMaterial = new THREE.ShaderMaterial({
		transparent: true,
		uniforms: {
			time: { value: 0 },
			curvature: { value: 340.0 },
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

	const updateScrollSceneState = () => {
		scrollSceneProgress = clamp(window.scrollY / Math.max(window.innerHeight * 1.2, 1), 0, 1);
		targetCameraZ = clamp(5.6 + scrollSceneProgress * 0.9, 5.2, 6.6);
		if (header) {
			header.classList.toggle("is-scrolled", window.scrollY > 24);
		}
	};

	document.addEventListener("pointermove", (event) => {
		const x = event.clientX / window.innerWidth - 0.5;
		const y = event.clientY / window.innerHeight - 0.5;
		targetX = x * 4.8;
		targetY = -y * 4.4;
		if (!prefersReducedMotion) {
			heroState.targetX = x * 18;
			heroState.targetY = y * 14;
		}
	});

	window.addEventListener("scroll", updateScrollSceneState);
	window.addEventListener("resize", () => {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		setRendererSize();
	});
	updateScrollSceneState();

	const animate = () => {
		requestAnimationFrame(animate);

		nebulaMaterial.uniforms.time.value += 0.01;
		nebulaMaterial.uniforms.scrollProgress.value = scrollSceneProgress;
		galaxyMaterial.uniforms.time.value += 0.016;
		galaxy.rotation.y += 0.00055;
		galaxy.rotation.x += 0.00014;
		nebula.rotation.z += 0.00016;
		camera.position.z = lerp(camera.position.z, targetCameraZ, prefersReducedMotion ? 0.16 : 0.05);
		camera.position.x += (targetX - camera.position.x) * 0.08;
		camera.position.y += (targetY - camera.position.y) * 0.08;
		nebula.position.x = camera.position.x * 0.34;
		nebula.position.y = camera.position.y * 0.34;
		nebula.position.z = camera.position.z - 180;
		camera.lookAt(scene.position);

		if (heroCopy && !prefersReducedMotion) {
			heroState.x = lerp(heroState.x, heroState.targetX * (1 - scrollSceneProgress * 0.6), 0.08);
			heroState.y = lerp(heroState.y, heroState.targetY * (1 - scrollSceneProgress * 0.6) - scrollSceneProgress * 46, 0.08);
			rootStyle.setProperty("--hero-shift-x", `${heroState.x.toFixed(2)}px`);
			rootStyle.setProperty("--hero-shift-y", `${heroState.y.toFixed(2)}px`);
			rootStyle.setProperty("--hero-fade", `${(1 - scrollSceneProgress * 0.66).toFixed(3)}`);
			rootStyle.setProperty("--hero-blur", `${(scrollSceneProgress * 5).toFixed(2)}px`);
		} else {
			rootStyle.setProperty("--hero-shift-x", "0px");
			rootStyle.setProperty("--hero-shift-y", "0px");
			rootStyle.setProperty("--hero-fade", "1");
			rootStyle.setProperty("--hero-blur", "0px");
		}

		renderer.render(scene, camera);
	};

	animate();
} else if (header) {
	window.addEventListener("scroll", () => {
		header.classList.toggle("is-scrolled", window.scrollY > 24);
	});
}

if (!prefersReducedMotion && !isTouchDevice) {
	panelNodes.forEach((panel) => {
		panel.addEventListener("pointermove", (event) => {
			const rect = panel.getBoundingClientRect();
			const x = ((event.clientX - rect.left) / rect.width) * 100;
			const y = ((event.clientY - rect.top) / rect.height) * 100;
			panel.style.setProperty("--spotlight-x", `${x.toFixed(2)}%`);
			panel.style.setProperty("--spotlight-y", `${y.toFixed(2)}%`);
		});

		panel.addEventListener("pointerleave", () => {
			panel.style.setProperty("--spotlight-x", "50%");
			panel.style.setProperty("--spotlight-y", "50%");
		});
	});
}

const revealNodes = Array.from(document.querySelectorAll("[data-reveal], .gateway-card, .service-card, .project-card, .process-step, .detail-card, .contact-card, .faq-card"));
revealNodes.forEach((node) => node.classList.add("reveal-ready"));

const gatewayCards = Array.from(document.querySelectorAll(".gateway-card"));
if (gatewayCards.length > 0) {
	gatewayCards.forEach((card) => {
		card.addEventListener("toggle", () => {
			if (!card.open) return;

			gatewayCards.forEach((otherCard) => {
				if (otherCard !== card) {
					otherCard.open = false;
				}
			});
		});
	});
}

const detailGrid = document.querySelector(".detail-grid");
const detailCards = Array.from(document.querySelectorAll(".detail-card[id]"));
const serviceFilterStrip = document.querySelector("#service-filter");
const activeServiceName = serviceFilterStrip?.querySelector("[data-service-name]");
const navAnchorLinks = Array.from(document.querySelectorAll('.site-nav a[href^="#"]'));

if (detailGrid && detailCards.length > 0) {
	const params = new URLSearchParams(window.location.search);
	const selectedServiceId = params.get("service");
	const selectedCard = selectedServiceId
		? detailCards.find((card) => card.id === selectedServiceId)
		: null;

	if (selectedCard) {
		detailGrid.classList.add("is-filtered");

		detailCards.forEach((card) => {
			const isSelected = card === selectedCard;
			card.hidden = !isSelected;
			card.classList.toggle("is-selected", isSelected);
		});

		if (serviceFilterStrip) {
			serviceFilterStrip.hidden = false;
		}

		if (activeServiceName) {
			const serviceTitle = selectedCard.querySelector("h3")?.textContent?.trim();
			if (serviceTitle) {
				activeServiceName.textContent = serviceTitle;
			}
		}
	} else {
		detailCards.forEach((card) => {
			card.hidden = false;
			card.classList.remove("is-selected");
		});
	}
}

if (navAnchorLinks.length > 0) {
	const navSections = navAnchorLinks
		.map((link) => {
			const section = document.querySelector(link.getAttribute("href"));
			return section ? { link, section } : null;
		})
		.filter(Boolean);

	const setActiveAnchorLink = (activeId) => {
		navSections.forEach(({ link, section }) => {
			link.classList.toggle("is-active", section.id === activeId);
		});
	};

	const updateActiveAnchorLink = () => {
		const focusLine = window.innerHeight * 0.32;
		let currentSectionId = "";

		navSections.forEach(({ section }) => {
			const rect = section.getBoundingClientRect();
			if (rect.top <= focusLine && rect.bottom >= focusLine) {
				currentSectionId = section.id;
			}
		});

		setActiveAnchorLink(currentSectionId);
	};

	window.addEventListener("scroll", updateActiveAnchorLink, { passive: true });
	window.addEventListener("resize", updateActiveAnchorLink);
	updateActiveAnchorLink();
}

if (window.gsap && window.ScrollTrigger && !prefersReducedMotion) {
	gsap.registerPlugin(ScrollTrigger);

	const headingNodes = Array.from(document.querySelectorAll("[data-reveal]"));
	const cardGroups = [
		".hero-metrics li",
		".signal-stack .mini-panel",
		".service-card",
		".gateway-card",
		".process-step",
		".project-card",
		".support-card",
		".detail-card",
		".contact-card",
		".faq-card"
	];

	headingNodes.forEach((node) => {
		gsap.to(node, {
			autoAlpha: 1,
			y: 0,
			filter: "blur(0px)",
			scale: 1,
			duration: 1.15,
			ease: "power3.out",
			scrollTrigger: {
				trigger: node,
				start: "top 88%",
				once: true
			}
		});
	});

	cardGroups.forEach((selector) => {
		const nodes = Array.from(document.querySelectorAll(selector));
		if (nodes.length === 0) return;

		ScrollTrigger.batch(nodes, {
			start: "top 90%",
			once: true,
			onEnter: (batch) => {
				gsap.to(batch, {
					autoAlpha: 1,
					y: 0,
					filter: "blur(0px)",
					scale: 1,
					stagger: 0.1,
					duration: 1,
					ease: "power3.out"
				});
			}
		});
	});
} else {
	revealNodes.forEach((node) => {
		node.classList.remove("reveal-ready");
		node.style.opacity = "1";
		node.style.transform = "none";
		node.style.filter = "none";
	});
}
