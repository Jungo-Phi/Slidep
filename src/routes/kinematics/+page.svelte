<script lang="ts">
	import { onMount } from 'svelte';
	import type { KinState, GrabElem, HoverOn, KinElem } from '$lib/types';
	import { Beam, Point, HOVER_RADIUS, TAU, Mode } from '$lib/types';
	import {
		translate_beam,
		pull_beam_pos_to_point,
		get_error,
		apply_constrain,
		get_actions,
		get_elements
	} from '$lib/utils';
	import {
		get_grab_elem,
		get_hover_on,
		place_beam,
		place_ground,
		place_pivot,
		place_slider
	} from '$lib/placing-elements';
	import {
		draw_beam,
		draw_fixation_bottom,
		draw_fixation_top,
		draw_ground,
		draw_ground_placement,
		draw_pivot,
		draw_slidep,
		draw_slider,
		highlight_beam,
		highlight_node
	} from '$lib/draw';

	let mode: (typeof Mode)[keyof typeof Mode] = Mode.Idle;
	let startBeamPos: Point; // mode = 'PlacingBeamEnd'
	let startBeamHoverOn: HoverOn; // mode = 'PlacingBeamEnd'
	let hoverOn: HoverOn = { type: 'void' };
	let grabbed: GrabElem; // mode = 'Grabbing' | 'Animating'
	let beamIdCounter: number = 0;

	let mouse = $state(new Point());
	let cursor = $state('auto');
	let kinState: KinState = { beams: [], sliders: [], slideps: [], pivots: [], fixations: [] };

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null;
	let animateCheckbox: HTMLInputElement;

	// TODO : k < 1 does shit
	// TODO : beam -> rod / barre

	onMount(() => {
		const rect = canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		// Set the actual canvas size in memory (scaled for high DPI)
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		// Re-get context after canvas size change (canvas size change resets context)
		ctx = canvas.getContext('2d');
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
		hoverOn = get_hover_on(
			kinState,
			mouse,
			mode === Mode.Animating || mode === Mode.Grabbing ? grabbed : undefined
		);
		if (mode !== Mode.Animating) {
			switch (hoverOn.type) {
				case 'beam pos':
					mouse = hoverOn.beamPos.get_pos();
					break;
				case 'beam end':
					mouse = hoverOn.isEnd ? hoverOn.beam.b.clone() : hoverOn.beam.a.clone();
					break;
				case 'slider':
				case 'slidep':
				case 'pivot':
				case 'fixation':
					mouse = hoverOn.object.pos.clone();
					break;
			}
		}
		switch (mode) {
			case Mode.Idle:
				if (hoverOn.type === 'void') {
					cursor = 'auto';
				} else {
					cursor = 'grab';
				}
				break;
			case Mode.Animating:
				// (3) :
				// Generate list of all connected elements (beams and objects) recursively : from mouse (to ground)
				// Generate list of actions from elements list (constrain, beam, constrain)
				//
				// LOOP until error < lambda {
				//     Pull BEAM / ELEMENT to mouse
				//     iter list {
				//         (IGNORE GROUND)
				//         Beam : Pull connected OBJECTS
				//         Object : Pull BEAMS by appling constrains
				//     }
				//
				//     iter list reversed {
				//         Beam : Pull connected OBJECTS
				//         Object : Pull BEAMS by appling constrains
				//     }
				// }

				// Pull BEAM / ELEMENT to mouse
				let firstElement: KinElem;
				// TODO : Appliquer la contrainte de la souris en limitant la distance parcourue
				switch (grabbed.type) {
					case 'beam pos':
						firstElement = grabbed.beam;
						pull_beam_pos_to_point(grabbed, mouse);
						break;
					case 'slider':
					case 'slidep':
					case 'pivot':
					case 'fixation':
						firstElement = grabbed;
						firstElement.pos = mouse.clone();
						break;
				}
				// Generate list of beams and objects : from mouse to ground(s)
				let elements = get_elements([firstElement]);
				let actions = get_actions(elements);
				console.log('elements', elements);
				console.log('actions', actions);

				// LOOP until error < lambda {
				for (let i = 0; i < 20; i++) {
					for (let action of actions) {
						apply_constrain(action, 0.5);
					}
					for (let action of actions.toReversed()) {
						apply_constrain(action, 0.5);
					}
					if (get_error(kinState) < 0.001) {
						break;
					}
				}
				break;
			case Mode.Grabbing:
				switch (grabbed.type) {
					case 'beam pos':
						if (grabbed.k === 0) {
						} else if (grabbed.k === 1) {
						} else {
							translate_beam(grabbed, mouse);
							// TODO : move attached nodes
						}

						break;
					case 'slider':
					case 'slidep':
					case 'pivot':
					case 'fixation':
						grabbed.pos = mouse.clone();
						// TODO : move attached beams
						// move attached nodes
						break;
				}

				break;
		}
		draw();
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button === 0) {
			// Left button
			// TODO : placing objet on beam -> ground change
			let pos = mouse.clone();
			if (hoverOn.type !== 'void') {
				grabbed = get_grab_elem(hoverOn);
			}
			switch (mode) {
				case Mode.Idle:
					if (hoverOn.type !== 'void') {
						mode = Mode.Grabbing;
						cursor = Mode.Grabbing;
					}
					break;
				case Mode.Animate:
					switch (hoverOn.type) {
						case 'void':
							break;
						case 'beam pos':
							if (!(hoverOn.beamPos.beam.groundA || hoverOn.beamPos.beam.groundB)) {
								mode = Mode.Animating;
							}
							break;
						case 'beam end':
							if (!(hoverOn.beam.groundA || hoverOn.beam.groundB)) {
								mode = Mode.Animating;
							}
							break;
						case 'slider':
						case 'slidep':
						case 'pivot':
							if (!hoverOn.object.ground) {
								mode = Mode.Animating;
							}
							break;
						case 'fixation':
							if (
								hoverOn.object.fixedBeams.every(
									(beamPos) => !(beamPos[0].beam.groundA || beamPos[0].beam.groundB)
								)
							) {
								mode = Mode.Animating;
							}
							break;
					}
					break;
				case Mode.PlacingSlider:
					place_slider(kinState, hoverOn, pos);
					break;
				case Mode.PlacingPivot:
					place_pivot(kinState, hoverOn, pos);
					break;
				case Mode.PlacingBeamStart:
					startBeamPos = mouse.clone();
					startBeamHoverOn = hoverOn;
					mode = Mode.PlacingBeamEnd;
					break;
				case Mode.PlacingBeamEnd:
					if (startBeamPos.distance_to(mouse) < HOVER_RADIUS) {
						mode = Mode.PlacingBeamStart;
						break;
					}
					beamIdCounter += 1;
					place_beam(kinState, startBeamHoverOn, startBeamPos, hoverOn, pos, beamIdCounter);
					mode = Mode.PlacingBeamStart;
					break;
				case Mode.PlacingGround:
					place_ground(hoverOn, mouse);
					break;
			}
		} else if (event.button === 2) {
			// Right button
			mode = Mode.Idle;
			cursor = 'auto';
			animateCheckbox.checked = false;
		}
		draw();
	}

	function onpointerup(event: PointerEvent) {
		switch (mode) {
			case Mode.Animating:
				mode = Mode.Animate;
				break;
			case Mode.Grabbing:
				mode = Mode.Idle;
				cursor = 'auto';
				break;
		}
		update_mouse();
	}

	function onKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Escape':
				mode = Mode.Idle;
				cursor = 'auto';
				animateCheckbox.checked = false;
				break;
			case 'a':
				if (animateCheckbox.checked) {
					mode = Mode.Idle;
					cursor = 'auto';
					animateCheckbox.checked = false;
				} else {
					mode = Mode.Animate;
					cursor = 'crosshair';
					animateCheckbox.checked = true;
				}
				break;
			case 's':
				mode = Mode.PlacingSlider;
				cursor = 'none';
				animateCheckbox.checked = false;
				break;
			case 'p':
				mode = Mode.PlacingPivot;
				cursor = 'none';
				animateCheckbox.checked = false;
				break;
			case 'b':
				mode = Mode.PlacingBeamStart;
				cursor = 'none';
				animateCheckbox.checked = false;
				break;
			case 'g':
				// TODO : add ground while placing another object
				mode = Mode.PlacingGround;
				cursor = 'none';
				animateCheckbox.checked = false;
				break;
		}
		update_mouse();
	}

	function draw() {
		if (!ctx || !canvas) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		/*
		// Sun
		ctx.fillStyle = '#db5000';
		ctx.beginPath();
		ctx.arc(canvas.width / 2, canvas.height - 300, 50, 0, TAU);
		ctx.fill();
		// Sea
		ctx.fillStyle = '#b7e2ff';
		ctx.fillRect(0, canvas.height - 300, canvas.width, canvas.height);
		*/
		// Debug text
		ctx.font = '16px Arial';
		ctx.fillStyle = '#db5000';
		ctx.fillText(mode, 10, 20);
		ctx.fillText('beams: ' + kinState.beams.length, 10, 50);
		ctx.fillText('sliders: ' + kinState.sliders.length, 10, 70);
		ctx.fillText('pivots: ' + kinState.pivots.length, 10, 90);
		ctx.fillText('slideps: ' + kinState.slideps.length, 10, 110);
		ctx.fillText('fixations: ' + kinState.fixations.length, 10, 130);
		let nbGrounds = 0;
		kinState.beams.forEach((beam) => {
			if (beam.groundA || beam.groundB) {
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
			case 'beam pos':
				ctx.fillText(
					'[ Beam ' + hoverOn.beamPos.beam.id + ' ]  k: ' + hoverOn.beamPos.k.toFixed(3),
					140,
					50
				);
				for (let i = 0; i < hoverOn.beamPos.beam.objects.length; i++) {
					let [objectType, k] = hoverOn.beamPos.beam.objects[i];
					ctx.fillText(objectType.type + '   k: ' + k.toFixed(3), 150, 70 + i * 20);
				}
				break;
			case 'beam end':
				let end = hoverOn.isEnd ? '(end)' : '(start)';
				ctx.fillText('[ Beam ' + hoverOn.beam.id + ' ]  ' + end, 140, 50);
				break;
			case 'slider':
				ctx.fillText('[ ' + hoverOn.object.type + ' ]', 140, 50);
				ctx.fillText(
					'fixed Beams: [' +
						hoverOn.object.fixedBeams.map((beam) => {
							return beam[0].beam.id;
						}) +
						']',
					140,
					70
				);
				ctx.fillText('slide Beam: ' + hoverOn.object.slideBeam?.id, 140, 100);
				break;
			case 'slidep':
				ctx.fillText('[ ' + hoverOn.object.type + ' ]', 140, 50);
				ctx.fillText(
					'rot Beams: [' +
						hoverOn.object.rotBeams.map((beam) => {
							return beam.beam.id;
						}) +
						']',
					140,
					70
				);
				ctx.fillText('slide Beam: ' + hoverOn.object.slideBeam?.id, 140, 90);
				break;
			case 'pivot':
				ctx.fillText('[ ' + hoverOn.object.type + ' ]', 140, 50);
				ctx.fillText(
					'rot Beams: [' +
						hoverOn.object.rotBeams.map((beam) => {
							return beam.beam.id;
						}) +
						']',
					140,
					70
				);
				break;
			case 'fixation':
				ctx.fillText('[ ' + hoverOn.object.type + ' ]', 140, 50);
				ctx.fillText(
					'fixed Beams: [' +
						hoverOn.object.fixedBeams.map((beam) => {
							return beam[0].beam.id;
						}) +
						']',
					140,
					70
				);
				break;
		}

		// TODO : Show UNCONNECTED Beams and pivot differently
		// TODO : Handle ovelapping beams (as a node ?)

		// HIGHLIGHT color
		if (mode === Mode.Grabbing) {
			if (grabbed.type === 'beam pos') {
				highlight_beam(ctx, grabbed.beam);
			} else {
				highlight_node(ctx, grabbed.pos);
			}
		} else if (mode === Mode.Animate) {
			switch (hoverOn.type) {
				case 'beam pos':
					if (!(hoverOn.beamPos.beam.groundA || hoverOn.beamPos.beam.groundB)) {
						highlight_beam(ctx, hoverOn.beamPos.beam);
					}
					break;
				case 'beam end':
					if (!(hoverOn.beam.groundA || hoverOn.beam.groundB)) {
						highlight_node(ctx, mouse);
					}
					break;
				case 'slider':
				case 'slidep':
				case 'pivot':
					if (!hoverOn.object.ground) {
						highlight_node(ctx, mouse);
					}
					break;
				case 'fixation':
					if (
						hoverOn.object.fixedBeams.every(
							(beamPos) => !(beamPos[0].beam.groundA || beamPos[0].beam.groundB)
						)
					) {
						highlight_node(ctx, mouse);
					}
					break;
			}
		} else if (mode !== Mode.Animating) {
			switch (hoverOn.type) {
				case 'beam pos':
					highlight_beam(ctx, hoverOn.beamPos.beam);
				case 'beam end':
				case 'slider':
				case 'slidep':
				case 'pivot':
				case 'fixation':
					highlight_node(ctx, mouse);
			}
		}
		if (mode === Mode.PlacingGround) {
			draw_ground_placement(ctx, hoverOn, mouse.clone());
		}
		kinState.fixations.forEach((fixation) => {
			draw_fixation_bottom(ctx, fixation.pos);
		});
		if (mode === Mode.PlacingBeamEnd) {
			switch (startBeamHoverOn.type) {
				case 'beam pos':
				case 'beam end':
					draw_fixation_bottom(ctx, startBeamPos);
			}
			switch (hoverOn.type) {
				case 'beam pos':
				case 'beam end':
					draw_fixation_bottom(ctx, mouse);
			}
		}
		kinState.beams.forEach((beam) => {
			if (beam.groundA) {
				draw_ground(ctx, beam.a, beam.dir().perp());
			}
			if (beam.groundB) {
				draw_ground(ctx, beam.b, beam.dir().perp().mul(-1));
			}
			draw_beam(ctx, beam);
		});
		if (mode === Mode.PlacingBeamStart) {
			ctx.strokeStyle = '#001d59';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.rect(mouse.x - 4, mouse.y - 4, 8, 8);
			ctx.fillStyle = '#b7e2ff';
			ctx.fill();
			ctx.stroke();
		} else if (mode === Mode.PlacingBeamEnd) {
			draw_beam(ctx, new Beam(startBeamPos, mouse, 0));
		}
		kinState.fixations.forEach((fixation) => {
			draw_fixation_top(ctx, fixation.pos);
		});
		if (mode === Mode.PlacingBeamEnd) {
			switch (startBeamHoverOn.type) {
				case 'beam pos':
				case 'beam end':
					draw_fixation_top(ctx, startBeamPos);
			}
			switch (hoverOn.type) {
				case 'beam pos':
				case 'beam end':
					draw_fixation_top(ctx, mouse);
			}
		}
		kinState.pivots.forEach((pivot) => {
			if (pivot.ground) {
				draw_ground(ctx, pivot.pos, new Point());
			}
			draw_pivot(ctx, pivot.pos);
		});
		kinState.sliders.forEach((slider) => {
			if (slider.ground) {
				draw_ground(ctx, slider.pos, slider.dir);
			}
			draw_slider(ctx, slider.pos, slider.dir);
		});
		kinState.slideps.forEach((slidep) => {
			let overDirs = slidep.rotBeams.map((beamP) => {
				if (beamP.beam.a.is_equal(slidep.pos)) {
					return beamP.beam.dir();
				} else {
					return beamP.beam.dir().mul(-1);
				}
			});
			if (mode === Mode.PlacingBeamEnd) {
				switch (startBeamHoverOn.type) {
					case 'slidep':
						if (startBeamPos.is_near_equal(slidep.pos)) {
							overDirs.push(mouse.sub(startBeamPos));
						}
				}
				switch (hoverOn.type) {
					case 'slidep':
						if (mouse.is_near_equal(slidep.pos)) {
							overDirs.push(startBeamPos.sub(mouse));
						}
				}
			}
			draw_slidep(ctx, slidep.pos, slidep.dir, overDirs);
			if (slidep.ground) {
				draw_ground(ctx, slidep.pos, new Point());
			}
			draw_pivot(ctx, slidep.pos);
		});
		if (mode === Mode.PlacingSlider) {
			let pos = mouse.clone();
			let dir = new Point();
			switch (hoverOn.type) {
				case 'beam pos':
					pos = hoverOn.beamPos.get_pos();
					dir = hoverOn.beamPos.beam.dir();
					break;
				case 'slider':
				case 'slidep':
					// TODO : do not draw_slider;
					break;
				case 'pivot':
					hoverOn.object.rotBeams.toReversed().forEach((beamPos) => {
						if (beamPos.k !== 0 && beamPos.k !== 1) {
							dir = beamPos.beam.dir();
						}
					});
					break;
				case 'fixation':
					let fixationBeam = hoverOn.object.fixedBeams[0];
					if (hoverOn.object.fixedBeams[0] !== null) {
						dir = fixationBeam[0].beam.dir();
					}
					break;
			}
			if (!(hoverOn.type === 'slider' || hoverOn.type === 'slidep')) {
				draw_slider(ctx, pos, dir);
			}
		}
		if (mode === Mode.PlacingPivot) {
			draw_pivot(ctx, mouse);
		}

		kinState.beams.forEach((beam) => {
			let p = beam.a.add(beam.b).div(2);
			ctx.beginPath();
			ctx.arc(p.x, p.y, 9, 0, TAU);
			ctx.fillStyle = '#ffffffd0';
			ctx.fill();
			ctx.fillStyle = '#000000d0';
			ctx.fillText(beam.id.toString(), p.x - 4, p.y + 5);
		});
	}
</script>

<div class="app-container">
	<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat" />
	<div class="topnav">
		<a href="/">Slidep</a>
		<div class="toolbar">
			<button
				onclick={() => {
					mode = Mode.PlacingSlider;
					cursor = 'none';
					animateCheckbox.checked = false;
				}}
				title="Slider (s)"
				>Slider
			</button>
			<button
				onclick={() => {
					mode = Mode.PlacingPivot;
					cursor = 'none';
					animateCheckbox.checked = false;
				}}
				title="Pivot (p)"
			>
				Pivot
			</button>
			<button
				onclick={() => {
					mode = Mode.PlacingBeamStart;
					cursor = 'none';
					animateCheckbox.checked = false;
				}}
				title="Rod (b)"
			>
				Rod
			</button>
			<button
				onclick={() => {
					mode = Mode.PlacingGround;
					cursor = 'none';
					animateCheckbox.checked = false;
				}}
				title="Ground (g)"
			>
				Ground
			</button>
			|
			<div>
				<input
					bind:this={animateCheckbox}
					onclick={() => {
						if (animateCheckbox.checked) {
							mode = Mode.Animate;
							cursor = 'crosshair';
						} else {
							mode = Mode.Idle;
							cursor = 'auto';
						}
					}}
					type="checkbox"
					class="hidden"
					name="cb"
					id="cb"
				/>
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
