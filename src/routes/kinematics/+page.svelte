<script lang="ts">
	import { onMount } from 'svelte';
	import type { Mode, HoverOn, KinState } from '$lib/types';
	import { Point2, HOVER_RADIUS, TAU, MY_RED, Rod } from '$lib/types';
	import { get_error, animate, drag } from '$lib/animation';
	import {
		get_hover_on,
		place_rod,
		place_ground,
		place_pivot,
		place_slider,
		get_hover_pos
	} from '$lib/placing-elements';
	import { draw_kinspace } from '$lib/draw';
	import { erase } from '$lib/utils';

	let mode: Mode = { type: 'idle' };
	let mouse: Point2 = $state(new Point2());
	let hoverOn: HoverOn = { type: 'void' };
	let rodIdCounter: number = 0;

	let cursor = $state('auto');
	let kinState: KinState = { rods: [], sliders: [], slideps: [], pivots: [], fixations: [] };

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;

	// TODO : rod-hover on pivot/slider
	// TODO : show degrees of freedom
	// TODO : progressive aniamtions
	// TODO : k < 1 does shit
	// TODO : ctrl Z
	// TODO : cotation / dimention (D)
	// TODO : save file
	// TODO : black and white mode

	onMount(() => {
		const rect = canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		// Set the actual canvas size in memory (scaled for high DPI)
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		// Re-get context after canvas size change (canvas size change resets context)
		let newCtx = canvas.getContext('2d');
		if (newCtx !== null) {
			ctx = newCtx;
		}
		// Set the display size (CSS pixels)
		canvas.style.width = rect.width + 'px';
		canvas.style.height = rect.height + 'px';
		draw();
	});

	function onpointermove(event: PointerEvent) {
		var cRect = canvas.getBoundingClientRect();
		mouse.x = event.clientX - cRect.left;
		mouse.y = event.clientY - cRect.top;
		update_mouse();
	}

	function update_mouse() {
		let ignore = mode.type === 'animating' || mode.type === 'dragging' ? mode.grabbed : undefined;
		hoverOn = get_hover_on(kinState, mode, mouse, ignore);
		switch (mode.type) {
			case 'idle':
				if (hoverOn.type === 'void') {
					cursor = 'auto';
				} else {
					cursor = 'grab';
				}
				break;
			case 'animating':
				animate(kinState, mode.grabbed, mouse.clone());
				break;
			case 'dragging':
				drag(kinState, mode.grabbed, mouse.clone());
				break;
			case 'erasing':
				erase(kinState, hoverOn);
		}
		draw();
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button === 0) {
			// Left button
			let pos = get_hover_pos(mouse, hoverOn);

			switch (mode.type) {
				case 'idle':
					switch (hoverOn.type) {
						case 'rod pos':
							mode = { type: 'dragging', grabbed: hoverOn.rodPos };
							cursor = 'grabbing';
							break;
						case 'overlapping rods':
							mode = { type: 'dragging', grabbed: hoverOn.rodPos };
							cursor = 'grabbing';
							break;
						case 'rod end':
							mode = { type: 'dragging', grabbed: hoverOn.rod.rod_pos(+hoverOn.isEnd) };
							cursor = 'grabbing';
							break;
						case 'slider':
						case 'slidep':
						case 'pivot':
						case 'fixation':
							mode = { type: 'dragging', grabbed: hoverOn.object };
							cursor = 'grabbing';
					}
					break;
				case 'animate':
					switch (hoverOn.type) {
						case 'rod pos':
							if (!(hoverOn.rodPos.rod.groundA || hoverOn.rodPos.rod.groundB)) {
								mode = { type: 'animating', grabbed: hoverOn.rodPos };
							}
							break;
						case 'overlapping rods':
							if (!(hoverOn.rodPos.rod.groundA || hoverOn.rodPos.rod.groundB)) {
								mode = { type: 'animating', grabbed: hoverOn.rodPos };
							}
							break;
						case 'rod end':
							if (!(hoverOn.rod.groundA || hoverOn.rod.groundB)) {
								mode = { type: 'animating', grabbed: hoverOn.rod.rod_pos(+hoverOn.isEnd) };
							}
							break;
						case 'slider':
						case 'slidep':
						case 'pivot':
							if (!hoverOn.object.ground) {
								mode = { type: 'animating', grabbed: hoverOn.object };
							}
							break;
						case 'fixation':
							if (
								hoverOn.object.fixedRods.every(
									(rodPos) => !(rodPos[0].rod.groundA || rodPos[0].rod.groundB)
								)
							) {
								mode = { type: 'animating', grabbed: hoverOn.object };
							}
					}
					break;
				case 'erase':
					erase(kinState, hoverOn);
					mode = { type: 'erasing' };
					break;
				case 'placing slider':
					place_slider(kinState, hoverOn, pos, mode.ground);
					break;
				case 'placing pivot':
					place_pivot(kinState, hoverOn, pos, mode.ground);
					break;
				case 'placing rod start':
					mode = {
						type: 'placing rod end',
						startPos: pos,
						startHoverOn: hoverOn,
						startGround: mode.ground,
						ground: false
					};
					break;
				case 'placing rod end':
					if (mode.startPos.distance_to(pos) < HOVER_RADIUS) {
						mode = { type: 'placing rod start', ground: false };
						break;
					}
					rodIdCounter += 1;
					place_rod(
						kinState,
						mode.startHoverOn,
						mode.startPos,
						mode.startGround,
						hoverOn,
						pos,
						mode.ground,
						rodIdCounter
					);
					mode = { type: 'placing rod start', ground: mode.startGround };
					break;
				case 'placing ground':
					place_ground(hoverOn, pos);
					break;
			}
		} else if (event.button === 2) {
			// Right button
			mode = { type: 'idle' };
			cursor = 'auto';
		}
		update_mouse();
	}

	function onpointerup(event: PointerEvent) {
		switch (mode.type) {
			case 'animating':
				mode = { type: 'animate' };
				break;
			case 'dragging':
				mode = { type: 'idle' };
				cursor = 'auto';
				break;
			case 'erasing':
				mode = { type: 'erase' };
		}
		update_mouse();
	}

	function onKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Escape':
				mode = { type: 'idle' };
				cursor = 'auto';
				break;
			case ' ':
				if (mode.type === 'animate' || mode.type === 'animating') {
					mode = { type: 'idle' };
					cursor = 'auto';
					break;
				} else {
					mode = { type: 'animate' };
					cursor = 'move';
				}
				break;
			case 'g':
			case 'G':
				switch (mode.type) {
					case 'idle':
					case 'dragging':
					case 'animate':
					case 'animating':
					case 'erasing':
					case 'dimension constraint':
					case 'horizontal constraint':
					case 'vertical constraint':
					case 'normal constraint':
						mode = { type: 'placing ground' };
						cursor = 'none';
						break;
					case 'placing slider':
					case 'placing pivot':
					case 'placing rod start':
						if (mode.ground) {
							mode = { type: 'placing ground' };
						} else {
							mode.ground = true;
						}
						break;
					case 'placing rod end':
						if (mode.ground) {
							mode = { type: 'placing ground' };
						} else {
							mode.startGround = false;
							mode.ground = true;
						}
				}
				break;
			case 's':
			case 'S':
				mode = { type: 'placing slider', ground: false };
				cursor = 'none';
				break;
			case 'p':
			case 'P':
				mode = { type: 'placing pivot', ground: false };
				cursor = 'none';
				break;
			case 'r':
			case 'R':
				mode = { type: 'placing rod start', ground: false };
				cursor = 'none';
				break;
			case 'e':
			case 'E':
				mode = { type: 'erase' };
				cursor = 'crosshair';
				break;
			case 'd':
			case 'D':
				mode = { type: 'dimension constraint' };
				cursor = 'auto';
				break;
			case 'h':
			case 'H':
				mode = { type: 'horizontal constraint' };
				cursor = 'auto';
				break;
			case 'v':
			case 'V':
				mode = { type: 'vertical constraint' };
				cursor = 'auto';
				break;
			case 'n':
			case 'N':
				mode = { type: 'normal constraint' };
				cursor = 'auto';
				break;
		}
		update_mouse();
	}

	function draw() {
		if (!ctx || !canvas) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		/*
		// Sun
		ctx.fillStyle = MY_RED;
		ctx.beginPath();
		ctx.arc(canvas.width / 2, canvas.height - 300, 50, 0, TAU);
		ctx.fill();
		// Sea
		ctx.fillStyle = MY_BLUE;
		ctx.fillRect(0, canvas.height - 300, canvas.width, canvas.height);
		*/
		// Debug text
		ctx.font = '16px Arial';
		ctx.fillStyle = MY_RED;
		ctx.fillText(mode.type, 10, 20);
		ctx.fillText('rods: ' + kinState.rods.length, 10, 50);
		ctx.fillText('sliders: ' + kinState.sliders.length, 10, 70);
		ctx.fillText('pivots: ' + kinState.pivots.length, 10, 90);
		ctx.fillText('slideps: ' + kinState.slideps.length, 10, 110);
		ctx.fillText('fixations: ' + kinState.fixations.length, 10, 130);
		let nbGrounds = 0;
		kinState.rods.forEach((rod) => {
			if (rod.groundA || rod.groundB) {
				nbGrounds += 1;
			}
		});
		kinState.sliders.forEach((slider) => {
			if (slider.ground) {
				nbGrounds += 1;
			}
		});
		kinState.slideps.forEach((slidep) => {
			if (slidep.ground) {
				nbGrounds += 1;
			}
		});
		kinState.pivots.forEach((pivot) => {
			if (pivot.ground) {
				nbGrounds += 1;
			}
		});
		ctx.fillText('grounds: ' + nbGrounds, 10, 150);
		ctx.fillText('error: ' + get_error(kinState).toFixed(4), 10, 170);

		ctx.fillText('over : ' + hoverOn.type, 140, 20);
		switch (hoverOn.type) {
			case 'void':
				ctx.fillText('' + mouse, 140, 50);
				break;
			case 'rod pos':
				ctx.fillText(
					'[ Rod ' + hoverOn.rodPos.rod.id + ' ]  k: ' + hoverOn.rodPos.k.toFixed(3),
					140,
					50
				);
				for (let i = 0; i < hoverOn.rodPos.rod.objects.length; i++) {
					let [objectType, k] = hoverOn.rodPos.rod.objects[i];
					ctx.fillText(objectType.type + '   k: ' + k.toFixed(3), 150, 70 + i * 20);
				}
				break;
			case 'rod end':
				let end = hoverOn.isEnd ? '(end)' : '(start)';
				ctx.fillText('[ Rod ' + hoverOn.rod.id + ' ]  ' + end, 140, 50);
				break;
			case 'slider':
			case 'rod-hover slider':
				ctx.fillText('[ ' + hoverOn.object.type + ' ]', 140, 50);
				ctx.fillText(
					'fixed Rods: [' +
						hoverOn.object.fixedRods.map((rod) => {
							return rod[0].rod.id;
						}) +
						']',
					140,
					70
				);
				ctx.fillText('slide Rod: ' + hoverOn.object.slideRod?.id, 140, 100);
				break;
			case 'slidep':
			case 'rod-hover slidep':
				ctx.fillText('[ ' + hoverOn.object.type + ' ]', 140, 50);
				ctx.fillText(
					'rot Rods: [' +
						hoverOn.object.rotRods.map((rod) => {
							return rod.rod.id;
						}) +
						']',
					140,
					70
				);
				ctx.fillText('slide Rod: ' + hoverOn.object.slideRod?.id, 140, 90);
				break;
			case 'pivot':
				ctx.fillText('[ ' + hoverOn.object.type + ' ]', 140, 50);
				ctx.fillText(
					'rot Rods: [' +
						hoverOn.object.rotRods.map((rod) => {
							return rod.rod.id;
						}) +
						']',
					140,
					70
				);
				break;
			case 'fixation':
				ctx.fillText('[ ' + hoverOn.object.type + ' ]', 140, 50);
				ctx.fillText(
					'fixed Rods: [' +
						hoverOn.object.fixedRods.map(([rodPos, dir]) => {
							return rodPos.rod.id;
						}) +
						']',
					140,
					70
				);
				break;
			case 'overlapping rods':
				ctx.fillText('[ ' + hoverOn.rodPos.get_pos() + ' ]', 140, 50);
				ctx.fillText(
					'fixed Rods: [' +
						hoverOn.rodsPositions.map((rodPos) => {
							return rodPos.rod.id;
						}) +
						']',
					140,
					70
				);
		}

		draw_kinspace(ctx, kinState, mode, hoverOn, mouse.clone());
		// Debug : rod number
		kinState.rods.forEach((rod) => {
			let p = rod.a.add(rod.b).div(2);
			ctx.beginPath();
			ctx.arc(p.x, p.y, 9, 0, TAU);
			ctx.fillStyle = '#ffffffd0';
			ctx.fill();
			ctx.fillStyle = '#000000d0';
			ctx.fillText(rod.id.toString(), p.x - 4, p.y + 5);
		});
	}
</script>

<div class="app-container">
	<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat" />
	<div class="topnav">
		<a href="/">Slidep</a>
		<div class="toolbar">
			<div class="subbar">
				<button
					onclick={() => {
						mode = { type: 'erase' };
						cursor = 'crosshair';
					}}
					title="Eraser (E)"
				>
					<img src="/icons/eraser.svg" alt="eraser" />
				</button>
			</div>
			<div class="subbar">
				<button
					onclick={() => {
						mode = { type: 'placing rod start', ground: false };
						cursor = 'none';
					}}
					title="Rod (R)"
				>
					<img src="/icons/rod.svg" alt="rod" />
				</button>
				<button
					onclick={() => {
						mode = { type: 'placing slider', ground: false };
						cursor = 'none';
					}}
					title="Slider (S)"
				>
					<img src="/icons/slider.svg" alt="slider" />
				</button>
				<button
					onclick={() => {
						mode = { type: 'placing pivot', ground: false };
						cursor = 'none';
					}}
					title="Pivot (P)"
				>
					<img src="/icons/pivot.svg" alt="pivot" />
				</button>
				<button
					onclick={() => {
						mode = { type: 'placing ground' };
						cursor = 'none';
					}}
					title="Ground (G)"
				>
					<img src="/icons/ground.svg" alt="ground" />
				</button>
			</div>
			<div class="subbar">
				<button
					onclick={() => {
						mode = { type: 'dimension constraint' };
						cursor = 'auto';
					}}
					title="Dimension (D)"
				>
					<img src="/icons/dimention.svg" alt="dimention" />
				</button>
				<button
					onclick={() => {
						mode = { type: 'horizontal constraint' };
						cursor = 'auto';
					}}
					title="Horizontal (H)"
				>
					<img src="/icons/horizontal.svg" alt="dimention" />
				</button>
				<button
					onclick={() => {
						mode = { type: 'vertical constraint' };
						cursor = 'auto';
					}}
					title="Vertical (V)"
				>
					<img src="/icons/vertical.svg" alt="dimention" />
				</button>
				<button
					onclick={() => {
						mode = { type: 'normal constraint' };
						cursor = 'auto';
					}}
					title="Normal (N)"
				>
					<img src="/icons/normal.svg" alt="dimention" />
				</button>
			</div>
			<div class="subbar">
				<button
					onclick={() => {
						if (mode.type === 'animate' || mode.type === 'animating') {
							mode = { type: 'idle' };
							cursor = 'auto';
						} else {
							mode = { type: 'animate' };
							cursor = 'move';
						}
					}}
					title="Animate (Space)"
				>
					<img
						src="/icons/{mode.type === 'animate' || mode.type === 'animating'
							? 'stop'
							: 'play'}.svg"
						alt="play/stop"
					/>
				</button>
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
	.main-canvas {
		width: 100%;
		height: 100%;
		display: block;
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
		height: 48px;
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
	.toolbar {
		display: flex;
		justify-content: center;
		align-items: center;
		margin-right: 60pt;
		height: 100%;
		gap: 12px;
	}
	.subbar {
		display: flex;
		gap: 2px;
		background-color: #ffedc6;
		border-radius: 5px;
		overflow: hidden;
	}
	button {
		display: inline-block;
		border: solid #ffedc6 2pt;
		border-radius: 3.5pt;
		cursor: pointer;
	}
	button:hover {
		border: solid #db5000 2pt;
	}
</style>
