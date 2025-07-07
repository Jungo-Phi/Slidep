<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import type { Mode, HoverOn, KinState } from '$lib/types';
	import { Point2, HOVER_RADIUS, TAU, MY_RED } from '$lib/types';
	import { get_error, animate } from '$lib/constraints';
	import {
		get_hover_on,
		place_rod,
		place_ground,
		place_pivot,
		place_slider,
		get_hover_pos,
		drag
	} from '$lib/placing-elements';
	import { draw_kinspace } from '$lib/draw';
	import { erase, is_grounded } from '$lib/utils';

	let mode: Mode = { type: 'idle' };
	let mouse: Point2 = $state(new Point2());
	let hoverOn: HoverOn = { type: 'void' };
	let rodIdCounter: number = 0;

	let cursor = $state('auto');
	let kinState: KinState = { rods: [], sliders: [], slideps: [], pivots: [], fixations: [] };

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;

	// TODO : grabbing -drag
	// TODO : constraints
	// TODO : progressive aniamtions
	// TODO : k < 1 does shit
	// TODO : ctrl Z
	// TODO : slider limit ?
	// TODO : cotation / dimention (D)
	// TODO : save file
	// TODO : front page
	// TODO : sélection multiple ?
	// TODO : 'draw path curves' option ?
	// TODO : black and white mode
	// TODO : 3D ?

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
		// TODO : ignore ground when animate
		let ignore = mode.type === 'animating' || mode.type === 'grabbing' ? mode.grabbed : undefined;
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
			case 'grabbing':
				drag(kinState, mode.grabbed, hoverOn, mouse.clone());
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
			let type: 'grabbing' | 'animating' = 'grabbing';
			switch (mode.type) {
				case 'animate':
					if (is_grounded(hoverOn)) {
						break;
					}
					type = 'animating';
				case 'idle':
					switch (hoverOn.type) {
						case 'rod pos':
						case 'overlapping rods':
							mode = { type, grabbed: { type : 'rod pos', rodPos: hoverOn.rodPos } };
							break;
						case 'rod end':
							mode = { type, grabbed: { type : 'rod end', rod: hoverOn.rod, isEnd: hoverOn.isEnd } };
							break;
						case 'slider':
							mode = { type, grabbed: { type: 'slider', object: hoverOn.object } };
							break;
						case 'slidep':
							mode = { type, grabbed: { type: 'slidep', object: hoverOn.object } };
							break;
						case 'pivot':
							mode = { type, grabbed: { type: 'pivot', object: hoverOn.object } };
							break;
						case 'fixation':
							mode = { type, grabbed: { type: 'fixation', object: hoverOn.object } };
					}
					if (type === 'grabbing') {
						cursor = 'grabbing';
					}
					break;
				case 'erase':
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
			case 'grabbing':
				// TODO : connect grabElem & hoverOn
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
					case 'grabbing':
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
		let degrees_of_freedom = 0;
		kinState.rods.forEach((rod) => {
			if (rod.groundA || rod.groundB) {
				nbGrounds += 1;
			} else {
				degrees_of_freedom += 3;
			}
		});
		kinState.sliders.forEach((slider) => {
			if (slider.ground) {
				nbGrounds += 1;
			} else {
				degrees_of_freedom += 3;
			}
			degrees_of_freedom -= 2 * +(slider.slideRod !== undefined);
			degrees_of_freedom -= 3 * slider.fixedRods.length;
		});
		kinState.slideps.forEach((slidep) => {
			if (slidep.ground) {
				nbGrounds += 1;
			} else {
				degrees_of_freedom += 2;
			}
			degrees_of_freedom -= +(slidep.slideRod !== undefined);
			degrees_of_freedom -= 2 * slidep.rotRods.length;
		});
		kinState.pivots.forEach((pivot) => {
			if (pivot.ground) {
				nbGrounds += 1;
			} else {
				degrees_of_freedom += 2;
			}
			degrees_of_freedom -= 2 * pivot.rotRods.length;
		});
		kinState.fixations.forEach((fixation) => {
			degrees_of_freedom += 3;
			degrees_of_freedom -= 3 * fixation.fixedRods.length;
		});
		ctx.fillText('grounds: ' + nbGrounds, 10, 150);
		ctx.fillText('error: ' + get_error(kinState).toFixed(4), 10, 180);
		// TODO : afficher les zones de sur-contraintes et sous-contraintes
		ctx.fillText('Degrees of freedom : ' + degrees_of_freedom, 10, 210);

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
			case 'rod-hover pivot':
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
		/*
		kinState.rods.forEach((rod) => {
			let p = rod.a.add(rod.b).div(2);
			ctx.beginPath();
			ctx.arc(p.x, p.y, 9, 0, TAU);
			ctx.fillStyle = '#ffffffb0';
			ctx.fill();
			ctx.fillStyle = '#000000b0';
			ctx.fillText(rod.id.toString(), p.x - 4, p.y + 5);
		});
		*/
	}
</script>

<div class="app-container">
	<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat" />
	<div class="topnav">
		<a href="{base}/">Slidep</a>
		<div class="toolbar">
			<div class="subbar">
				<div class="iconbar">
					<button
						onclick={() => {
							mode = { type: 'erase' };
							cursor = 'crosshair';
						}}
						title="Eraser (E)"
					>
						<img src="/icons/eraser.svg" alt="an eraser" width="32px" />
					</button>
					<button
						onclick={() => {
							mode = { type: 'placing rod start', ground: false };
							cursor = 'none';
						}}
						title="Rod (R)"
					>
						<img src="/icons/rod.svg" alt="a thick line" width="32px" />
					</button>
					<button
						onclick={() => {
							mode = { type: 'placing slider', ground: false };
							cursor = 'none';
						}}
						title="Slider (S)"
					>
						<img src="/icons/slider.svg" alt="a hollowed rectangle" width="32px" />
					</button>
					<button
						onclick={() => {
							mode = { type: 'placing pivot', ground: false };
							cursor = 'none';
						}}
						title="Pivot (P)"
					>
						<img src="/icons/pivot.svg" alt="a hollowed circle" width="32px" />
					</button>
					<button
						onclick={() => {
							mode = { type: 'placing ground' };
							cursor = 'none';
						}}
						title="Ground (G)"
					>
						<img src="/icons/ground.svg" alt="the ground symbol" width="32px" />
					</button>
				</div>
				Tools
			</div>
			<div class="subbar">
				<div class="iconbar">
					<button
						onclick={() => {
							mode = { type: 'dimension constraint' };
							cursor = 'auto';
						}}
						title="Dimension (D)"
					>
						<img src="/icons/dimention.svg" alt="a line with arrows on both ends" width="32px" />
					</button>
					<button
						onclick={() => {
							mode = { type: 'horizontal constraint' };
							cursor = 'auto';
						}}
						title="Horizontal (H)"
					>
						<img src="/icons/horizontal.svg" alt="a horizontal line" width="32px" />
					</button>
					<button
						onclick={() => {
							mode = { type: 'vertical constraint' };
							cursor = 'auto';
						}}
						title="Vertical (V)"
					>
						<img src="/icons/vertical.svg" alt="a vertical line" width="32px" />
					</button>
					<button
						onclick={() => {
							mode = { type: 'normal constraint' };
							cursor = 'auto';
						}}
						title="Normal (N)"
					>
						<img src="/icons/normal.svg" alt="two lines forming a T" width="32px" />
					</button>
				</div>
				Constraints
			</div>
			<div class="subbar">
				<div class="iconbar">
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
							width="32px"
						/>
					</button>
				</div>
				Animation
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
		height: 60px;
		padding-top: 5px;
	}
	.topnav a {
		float: left;
		color: #db5000;
		text-align: center;
		padding: 4px 6px;
		text-decoration: none;
		font-size: 28px;
		font-weight: bolder;
	}
	.toolbar {
		display: flex;
		justify-content: center;
		align-items: center;
		margin-right: 70pt;
		height: 100%;
		gap: 12px;
	}
	.subbar {
		display: flex;
		flex-flow: column;
		align-items: center;
		font-size: 12px;
		color: #001d59;
	}
	.iconbar {
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
