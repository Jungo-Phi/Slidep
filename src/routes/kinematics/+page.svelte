<script lang="ts">
	import { onMount } from 'svelte';
	import { TAU, Point, pull_beam, translate_beam, over_beam, over_node } from '$lib/utils';
	import type {
		Node,
		Beam,
		BeamPos,
		Slider,
		Pivot,
		Slidep,
		Coincidence,
		Fixation
	} from '$lib/utils';

	const HOVER_RADIUS = 12;
	const HOVER_WIDTH = 8;

	let mouse = $state(new Point());
	let cursor = $state('auto');
	// 'Idle', 'Animate', 'AnimateNode', 'AnimateBeam',
	// 'PlacingSlider', 'PlacingPivot', 'PlacingBeam1', 'PlacingBeam2',
	// 'MovingNode', 'MovingBeam'
	let mode = $state('Idle');

	let startBeam: Point; // mode = 'PlacingBeam2'
	let grabbedBeam: BeamPos | undefined; // mode = 'MovingBeam'
	let grabbedNode: Node | undefined; // mode = 'MovingNode'

	let overNode: Node | undefined;
	let overBeam: BeamPos | undefined;

	let nodes: Array<Node> = [];
	let beams: Array<Beam> = [];
	let sliders: Array<Slider> = [];
	let pivots: Array<Pivot> = [];
	let slideps: Array<Slidep> = [];
	let coincidences: Array<Coincidence> = [];
	let fixations: Array<Fixation> = [];

	let canvas;
	let ctx;

	function onpointermove(event) {
		var cRect = canvas.getBoundingClientRect();
		mouse.x = event.clientX - cRect.left;
		mouse.y = event.clientY - cRect.top;
		overNode = over_node(nodes, mouse, grabbedNode, HOVER_RADIUS);
		if (overNode != undefined) {
			mouse = overNode.pos.clone();
		}
		overBeam = over_beam(beams, mouse, HOVER_WIDTH);

		if (mode == 'Idle') {
			if (overNode != undefined || overBeam != undefined) {
				cursor = 'grab';
			} else {
				cursor = 'auto';
			}
		} else if (mode == 'MovingBeam') {
			translate_beam(grabbedBeam, mouse);
		} else if (mode == 'MovingNode') {
			grabbedNode.pos = mouse.clone();
		}
		draw();
	}

	function onpointerdown(event: Event) {
		if (mode == 'Idle') {
			if (overNode != undefined) {
				mode = 'MovingNode';
				grabbedNode = overNode;
				cursor = 'grabbing';
			} else if (overBeam != undefined) {
				mode = 'MovingBeam';
				grabbedBeam = overBeam;
				cursor = 'grabbing';
			}
		} else if (mode == 'PlacingPivot') {
			if (overNode == undefined) {
				nodes.push({ pos: mouse.clone(), ground: false });
				overNode = nodes.at(-1);
			}
			pivots.push({ node: overNode, rotatingbeams: [] });
		} else if (mode == 'PlacingBeam1') {
			startBeam = mouse.clone();
			mode = 'PlacingBeam2';
		} else if (mode == 'PlacingBeam2') {
			let nodeA = nodes.find((node) => node.pos.is_equal(startBeam));
			if (nodeA == undefined) {
				nodes.push({ pos: startBeam.clone(), ground: false });
				nodeA = nodes.at(-1);
			}
			if (overNode == undefined) {
				nodes.push({ pos: mouse.clone(), ground: false });
				overNode = nodes.at(-1);
			}
			beams.push({ nodeA, nodeB: overNode });
			mode = 'PlacingBeam1';
		} else if (mode == 'PlacingGround') {
		}
		draw();
	}

	function onpointerup(event: Event) {
		if (mode == 'MovingBeam') {
			mode = 'Idle';
			cursor = 'auto';
			grabbedBeam = undefined;
		} else if (mode == 'MovingNode') {
			if (overNode != undefined) {
				/*
				let n1 = nodes.findIndex(node => node.pos.is_equal(overNode.pos));
				let n2 = nodes.findIndex(node => node.pos.is_equal(grabbedNode.pos));
				nodes[n1] = nodes[n2];
				delete nodes[n1];
				console.log(n1, n2);
				*/
				//let n = nodes.findIndex(node => node == grabbedNode);
				//overNode = nodes[n];
				//delete nodes[n];
				//console.log(n)
				// fuze_nodes(nodes, beams, sliders, pivots, slideps, grounds, coincidences, grabbedNode, overNode);
			}

			mode = 'Idle';
			cursor = 'auto';
			grabbedNode = undefined;
		}
		draw();
	}

	function onKeyDown(event: Event) {
		switch (event.keyCode) {
			case 27: // Escape
				mode = 'Idle';
				cursor = 'auto';
				draw();
				break;
			case 83: // S
				mode = 'PlacingSlider';
				cursor = 'none';
				draw();
				break;
			case 80: // P
				mode = 'PlacingPivot';
				cursor = 'none';
				draw();
				break;
			case 66: // B
				mode = 'PlacingBeam1';
				cursor = 'none';
				draw();
				break;
		}
	}

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
		if (!canvas) return;
		ctx = canvas.getContext('2d');
		resizeCanvas();
		draw();
	});

	function draw() {
		if (!ctx || !canvas) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		/*
		// Sun
		ctx.fillStyle = '#db5000';
		ctx.beginPath();
		ctx.arc(width / 2, height - 300, 50, 0, TAU);
		ctx.fill();
		// Sea
		ctx.fillStyle = '#b7e2ff';
		ctx.fillRect(0, canvas.height - 300, canvas.width, canvas.height);
		*/
		// Debug text
		ctx.font = '16px Arial';
		ctx.fillStyle = '#db5000';
		ctx.fillText(mode, 10, 20);

		// hover color
		if (overNode != undefined || mode == 'MovingNode') {
			let p;
			if (mode == 'MovingNode') {
				p = grabbedNode.pos;
			} else {
				p = overNode.pos;
			}
			const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 25);
			grad.addColorStop(0, '#ffbe80');
			grad.addColorStop(1, '#ffbe8000');
			ctx.beginPath();
			ctx.arc(p.x, p.y, 25, 0, TAU);
			ctx.fillStyle = grad;
			ctx.fill();
		}

		ctx.lineCap = 'square'; // 'round'
		for (let beam of beams) {
			draw_beam(beam.nodeA.pos, beam.nodeB.pos);
		}
		if (mode == 'PlacingBeam1') {
			ctx.strokeStyle = '#001d59';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.rect(mouse.x - 4, mouse.y - 4, 8, 8);
			ctx.fillStyle = '#b7e2ff';
			ctx.fill();
			ctx.stroke();
		} else if (mode == 'PlacingBeam2') {
			draw_beam(startBeam, mouse);
		}

		for (let slider of sliders) {
			draw_slider(slider.node.pos, slider.slidingBeam.nodeB.pos.sub(slider.slidingBeam.nodeA.pos));
		}

		if (mode == 'PlacingSlider') {
			let p = mouse.clone();
			let dir = new Point();
			if (overBeam != undefined) {
				p = overBeam.beam.nodeA.pos.lerp(overBeam.beam.nodeB.pos, overBeam.k);
				dir = overBeam.beam.nodeB.pos.sub(overBeam.beam.nodeA.pos);
			}
			draw_slider(p, dir);
		}

		for (let pivot of pivots) {
			draw_pivot(pivot.node.pos);
		}
		if (mode == 'PlacingPivot') {
			draw_pivot(mouse);
		}

		if (mode == 'PlacingGround') {
			draw_ground(mouse);
		}
	}

	function draw_pivot(p: Point) {
		if (!ctx) return;

		ctx.strokeStyle = '#001d59';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(p.x, p.y, 8, 0, TAU);
		ctx.fillStyle = '#ffbe80';
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(p.x, p.y, 4, 0, TAU);
		ctx.fillStyle = '#b7e2ff';
		ctx.fill();
		ctx.stroke();
	}

	function draw_beam(a: Point, b: Point) {
		if (!ctx) return;

		ctx.strokeStyle = '#001d59';
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		ctx.lineTo(b.x, b.y);
		ctx.lineWidth = 9;
		ctx.stroke();
		ctx.strokeStyle = '#b7e2ff';
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		ctx.lineTo(b.x, b.y);
		ctx.lineWidth = 5;
		ctx.stroke();
	}

	function draw_slider(p: Point, dir: Point) {
		if (!ctx) return;
		ctx.strokeStyle = '#001d59';
		ctx.lineWidth = 2;

		let angle = dir.angle_rad();
		let pR = p.rotate_rad(-angle);
		ctx.rotate(angle);

		ctx.beginPath();
		ctx.roundRect(pR.x - 12, pR.y - 7, 24, 14, [2]);
		ctx.fillStyle = '#ffbe80';
		ctx.fill();
		ctx.stroke();

		ctx.beginPath();
		ctx.rect(pR.x - 7, pR.y - 3, 14, 6);
		ctx.fillStyle = '#b7e2ff';
		ctx.fill();
		ctx.stroke();

		ctx.rotate(-angle);
	}

	function draw_slidep(p: Point) {
		if (!ctx) return;
		ctx.strokeStyle = '#001d59';
		ctx.lineWidth = 2;

		ctx.beginPath();
		ctx.roundRect(p.x - 12, p.y - 7, 4, 14, [2, 0, 0, 2]);
		ctx.stroke();
		ctx.beginPath();
		ctx.roundRect(p.x + 8, p.y - 7, 4, 14, [0, 2, 2, 0]);
		ctx.stroke();

		ctx.fillStyle = '#ffbe80';
		ctx.fillRect(p.x - 11, p.y - 6, 22, 12);
		ctx.fillStyle = '#ffbe80b0';
		ctx.fillRect(p.x - 8, p.y - 7, 16, 14);

		ctx.beginPath();
		ctx.arc(p.x, p.y, 8, 0, TAU);
		ctx.fillStyle = '#ffbe80';
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(p.x, p.y, 4, 0, TAU);
		ctx.fillStyle = '#b7e2ff';
		ctx.fill();
		ctx.stroke();
	}

	function draw_ground(p: Point) {
		if (!ctx) return;

		ctx.strokeStyle = '#001d59';
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(p.x - 5, p.y);
		ctx.lineTo(p.x + 5, p.y);
		ctx.lineTo(p.x, p.y + 5);
		ctx.stroke();
	}
</script>

<div class="app-container">
	<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat" />
	<div class="topnav">
		<a href="/">Slidep</a>
		<div class="toolbar">
			<button
				onclick={() => {
					mode = 'PlacingSlider';
					cursor = 'none';
				}}
				title="Slider (s)"
				>Slider
			</button>
			<button
				onclick={() => {
					mode = 'PlacingPivot';
					cursor = 'none';
				}}
				title="Pivot (p)"
			>
				Pivot
			</button>
			<button
				onclick={() => {
					mode = 'PlacingBeam1';
					cursor = 'none';
				}}
				title="Beam (b)"
			>
				Beam
			</button>
			<button
				onclick={() => {
					mode = 'PlacingGround';
					cursor = 'none';
				}}
				title="Ground (g)"
			>
				Ground
			</button>
			|
			<div>
				<input type="checkbox" class="hidden" name="cb" id="cb" />
				<label for="cb">Animate</label>
			</div>
		</div>
	</div>
	<canvas
		bind:this={canvas}
		class="main-canvas"
		style="cursor: {cursor};"
		{onpointermove}
		{onpointerdown}
		{onpointerup}
	></canvas>
</div>

<svelte:window on:keydown|preventDefault={onKeyDown} />

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
	.toolbar {
		margin-right: 60pt;
		display: flex;
		justify-content: center;
		height: 100%;
		align-items: center;
	}
	button {
		display: inline-block;
		background-color: #b7e2ff;
		color: #001d59;
		font-size: medium;
		padding: 0pt 2pt;
		border-radius: 2pt;
		border: #001d59 solid 2pt;
		margin: 4pt;
		cursor: pointer;
	}
	button:hover {
		background-color: #97c2df;
	}

	.hidden {
		position: absolute;
		visibility: hidden;
		opacity: 0;
	}
	input[type='checkbox'] + label {
		display: inline-block;
		background-color: #b7e2ff;
		color: #001d59;
		font-size: medium;
		padding: 0pt 2pt;
		border-radius: 2pt;
		border: #001d59 solid 2pt;
		margin: 4pt;
		cursor: pointer;
	}
	input[type='checkbox'] + label:hover {
		background-color: #97c2df;
	}

	input[type='checkbox']:checked + label {
		background-color: #ffedc6;
		color: #db5000;
		border-color: #db5000;
	}
	input[type='checkbox']:checked + label:hover {
		background-color: #dfcda6;
	}
</style>
