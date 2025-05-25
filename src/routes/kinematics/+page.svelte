<script>
	import { onMount } from 'svelte';

	let canvas;
	let ctx;

	function resizeCanvas() {
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;

		// Set the actual canvas size in memory (scaled for high DPI)
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;

		// Re-get context after canvas size change (canvas size change resets context)
		ctx = canvas.getContext('2d');

		// Scale the drawing context so everything draws at the correct size
		ctx.scale(dpr, dpr);

		// Set the display size (CSS pixels)
		canvas.style.width = rect.width + 'px';
		canvas.style.height = rect.height + 'px';
	}

	onMount(() => {
		ctx = canvas.getContext('2d');
		resizeCanvas();
		draw();
	});

	function draw() {
		if (!ctx || !canvas) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;

		// Fill background
		ctx.fillStyle = '#1a1a2e';
		ctx.fillRect(0, 0, width, height);

		// Draw some lines
		ctx.strokeStyle = '#00ff88';
		ctx.lineWidth = 2;

		// Diagonal lines
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(width, height);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(width, 0);
		ctx.lineTo(0, height);
		ctx.stroke();

		// Horizontal and vertical center lines
		ctx.strokeStyle = '#ff6b6b';
		ctx.beginPath();
		ctx.moveTo(width / 2, 0);
		ctx.lineTo(width / 2, height);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(0, height / 2);
		ctx.lineTo(width, height / 2);
		ctx.stroke();

		// Draw circles
		const centerX = width / 2;
		const centerY = height / 2;

		// Filled circle
		ctx.fillStyle = '#4ecdc4';
		ctx.beginPath();
		ctx.arc(centerX, centerY, 50, 0, 2 * Math.PI);
		ctx.fill();

		// Stroke circle (outline only)
		ctx.strokeStyle = '#ffe66d';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(centerX, centerY, 100, 0, 2 * Math.PI);
		ctx.stroke();

		// Multiple smaller circles
		ctx.fillStyle = '#ff6b6b';
		for (let i = 0; i < 5; i++) {
			const angle = (i / 5) * 2 * Math.PI;
			const x = centerX + Math.cos(angle) * 150;
			const y = centerY + Math.sin(angle) * 150;

			ctx.beginPath();
			ctx.arc(x, y, 20, 0, 2 * Math.PI);
			ctx.fill();
		}

		// Draw some curved lines
		ctx.strokeStyle = '#a8e6cf';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(50, 50);
		ctx.quadraticCurveTo(width / 2, 100, width - 50, 50);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(50, height - 50);
		ctx.quadraticCurveTo(width / 2, height - 100, width - 50, height - 50);
		ctx.stroke();
	}
</script>

<div class="app-container">
	<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat" />
	<div class="topnav">
		<a href="/">Slidep</a>
	</div>
	<canvas bind:this={canvas} class="main-canvas"></canvas>
</div>

<style>
	:global(html, body) {
		background: #ffedc6;
		font-family: 'Sofia', sans-serif;
		margin: 0;
		padding: 0;
		height: 100%;
		overflow: hidden;
	}
	.app-container {
		display: grid;
		grid-template-rows: auto 1fr;
		height: 100vh;
		width: 100vw;
		margin: 0;
		padding: 0;
	}
	.topnav {
		background-color: #ffbe80;
		overflow: hidden;
	}
	.topnav a {
		float: left;
		color: #db5000;
		text-align: center;
		padding: 4px 6px;
		text-decoration: none;
		font-size: 24px;
		font-weight: bolder;
	}
	.main-canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
