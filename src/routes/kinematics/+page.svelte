<script lang="ts">
	import { onMount } from 'svelte';
	import {
		TAU,
		BeamPos,
		Node,
		Point,
		translate_beam,
		beam_coords,
		pull_beam_pos_to_point,
		pull_beam_by_end,
		get_error,
		apply_constrain,
		get_actions,
		get_elements,
		hover_what,
	} from '$lib/utils';
	import type { Beam, Slider, Slidep, Pivot, Fixation } from '$lib/utils';

	const HOVER_RADIUS = 20;
	const HOVER_WIDTH = 10;

	const Mode = {
		Idle: 'idle',
		Moving: 'moving',
		Animate: 'animate',
		Animating: 'animating',
		PlacingSlider: 'placing slider',
		PlacingPivot: 'placing pivot',
		PlacingBeam1: 'placing beam 1',
		PlacingBeam2: 'placing beam 2',
		PlacingGround: 'placing ground',
	} as const;

	type ModeKeys = typeof Mode[keyof typeof Mode];

	let mode: ModeKeys = Mode.Idle;
	let startBeamPos: Point; // mode = 'PlacingBeam2'
	let hover: Node | BeamPos | undefined;
	let grabbed: Node | BeamPos | undefined;
	let beamIdCounter: number = 0;

	let mouse = $state(new Point());
	let cursor = $state('auto');
	let animateCheckbox: HTMLElement | null;


	let beams: Array<Beam> = [];
	let sliders: Array<Slider> = [];
	let slideps: Array<Slidep> = [];
	let pivots: Array<Pivot> = [];
	let fixations: Array<Fixation> = [];

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null;

	onMount(() => {
		animateCheckbox = document.getElementById('cb');
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
		hover = hover_what(
			beams,
			sliders,
			slideps,
			pivots,
			fixations,
			mouse,
			HOVER_WIDTH,
			HOVER_RADIUS,
			grabbed,
		);

		if (mode != 'animating') {
			if (hover != undefined) {
				if (hover instanceof Node) {
					mouse = hover.pos.clone();
				} else {
					mouse = hover.get_pos();
				}
			}
		}

		switch (mode) {
			case 'idle':
				if (hover != undefined) {
					cursor = 'grab';
				} else {
					cursor = 'auto';
				}
				break;
			case 'animating':
				if (grabbed == undefined) {
					break;
				}

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
				let firstElement: Beam | Slider | Slidep | Pivot | Fixation;
				// TODO : Appliquer la contrainte de la souris en limitant la distance parcourue
				if (grabbed instanceof Node) {
					if (grabbed.object == null) {
						firstElement = grabbed.beams[0];
						pull_beam_by_end(firstElement, mouse, beam_coords(firstElement, grabbed.pos)[0] > 0.5);
					} else {
						firstElement = grabbed.object;
						firstElement.pos = mouse.clone();
					}
				} else {
					firstElement = grabbed.beam;
					pull_beam_pos_to_point(grabbed, mouse);
				}
				// Generate list of beams and objects : from mouse to ground(s)
				let elements = get_elements([firstElement]);
				let actions = get_actions(elements);
				console.log("elements", elements);
				console.log("actions", actions);
				
				// LOOP until error < lambda {
				for (let i = 0; i < 100; i++) {
					for (let action of actions) {
						apply_constrain(action, 0.5);
					}
					for (let action of actions.toReversed()) {
						apply_constrain(action, 0.5);
					}
					if (get_error(sliders, slideps, pivots, fixations) < 0.001) {
						break;
					}
				}
				break;
			case 'moving':
				if (grabbed == undefined) {
					break;
				}
				if (grabbed instanceof Node) {
					for (let beam of grabbed.beams) {
						if (beam.a.is_equal(grabbed.pos)) {
							beam.a = mouse.clone();
						} else {
							beam.b = mouse.clone();
						}
					}
					if (grabbed.object != null) {
						grabbed.object.pos = mouse.clone();
					}
					grabbed.pos = mouse.clone();
					// TODO : move attached beams
					// move attached nodes
				} else {
					translate_beam(grabbed, mouse);
					// TODO : move attached nodes
				}
				
				break;
		}
		draw();
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button == 0) {
			// Left button
			// TODO : placing objet on beam -> ground change
			let pos = mouse.clone();
			switch (mode) {
				case 'idle':
					if (hover != undefined) {
						grabbed = hover;
						mode = Mode.Moving;
						cursor = 'grabbing';
					}
					break;
				case 'animate':
					if (hover != undefined) {
						if (hover instanceof Node) {
							let fixedBeam = false;
							hover.beams.forEach(beam => {
								if (beam.groundA || beam.groundB) { fixedBeam = true; }
							});
							if (!((hover.object != null && hover.object.type != 'fixation' && hover.object.ground) || fixedBeam)) {
								grabbed = hover;
								mode = Mode.Animating;
							}
						} else {
							if (!(hover.beam.groundA || hover.beam.groundA)) {
								grabbed = hover;
								mode = Mode.Animating;
							}
						}
					}
					break;
				case 'placing slider':
					let newSlider: Slider = { type: 'slider', pos, dir: new Point(1, 0), slideBeam: undefined, fixedBeams: [], ground: false };
					if (hover != undefined) {
						if (hover instanceof Node) {
							if (hover.object == null) {
								newSlider.fixedBeams = hover.beams.map(beam => [
									new BeamPos(beam, beam_coords(beam, pos)[0]),
									0 // addAngle
								]);
							} else {
								switch (hover.object.type) {
									case 'slider':
									case 'slidep':
										return;
									case 'pivot':
										let pivotBeam = hover.object.rotBeams[0];
										if (pivotBeam != null && pivotBeam.k != 0 && pivotBeam.k != 1) {
											newSlider.slideBeam = pivotBeam.beam;
										}
										newSlider.fixedBeams = hover.beams
											.filter(beam => beam !== newSlider.slideBeam)
											.map(beam => [
												new BeamPos(beam, beam_coords(beam, pos)[0]),
												0 // addAngle
											]);
										pivots = pivots.filter((obj) => obj !== hover.object);
										
										hover.object.rotBeams.toReversed().forEach(beamPos => {
											if ((beamPos.k != 0) && (beamPos.k != 1)) {
												newSlider.dir = beamPos.beam.b.sub(beamPos.beam.a);
											}
										});
										slideps.push({
											type: 'slidep',
											pos,
											dir: newSlider.dir,
											slideBeam: newSlider.slideBeam,
											rotBeams: newSlider.fixedBeams.map(b => b[0]),
											ground: false
										});
										return;
									case 'fixation':
										let fixationBeam = hover.object.fixedBeams[0];
										if (hover.object.fixedBeams[0] != null) {
											newSlider.slideBeam = fixationBeam[0].beam;
										}
										newSlider.fixedBeams = hover.beams
											.filter(beam => beam !== newSlider.slideBeam)
											.map(beam => [
												new BeamPos(beam, beam_coords(beam, pos)[0]),
												0 // addAngle
											]);
										fixations = fixations.filter((obj) => obj !== hover.object);
										newSlider.dir = hover.object.fixedBeams[0][0].beam.b.sub(hover.object.fixedBeams[0][0].beam.a);
										break;
								}
							}
						} else {
							newSlider.slideBeam = hover.beam;
							newSlider.dir = newSlider.slideBeam.b.sub(newSlider.slideBeam.a);
							newSlider.slideBeam.objects.push([newSlider, 0]);
						}
					}
					sliders.push(newSlider);
					break;
				case 'placing pivot':
					let newPivot: Pivot = { type: 'pivot', pos, rotBeams: [], ground: false };

					if (hover == undefined) {
						pivots.push(newPivot);
					} else {
						if (hover instanceof Node) {
							if (hover.object == null) {
								newPivot.rotBeams = hover.beams.map((beam) => {
									return new BeamPos(beam, beam_coords(beam, pos)[0]);
								});
								pivots.push(newPivot);
								hover.beams.forEach(beam => {
									beam.objects.push([newPivot, + (beam_coords(beam, hover.pos)[0] > 0.5)]);
								});
							} else {
								switch (hover.object.type) {
									case 'slider':
										let slider = hover.object;
										slideps.push({
											type: 'slidep',
											pos,
											dir: hover.object.dir,
											slideBeam: slider.slideBeam,
											rotBeams: slider.fixedBeams.map(b => b[0]),
											ground: false
										});
										sliders = sliders.filter((obj) => obj !== hover.object);
										break;
									case 'fixation':
										newPivot.rotBeams = hover.object.fixedBeams.map(b => b[0]);
										fixations = fixations.filter((obj) => obj !== hover.object);
										pivots.push(newPivot);
										break;
								}
							}
						} else {
							newPivot.rotBeams.push(hover);
							pivots.push(newPivot);
							hover.beam.objects.push([newPivot, hover.k]);
						}
					}
					break;
				case 'placing beam 1':
					startBeamPos = mouse.clone();
					mode = Mode.PlacingBeam2;
					break;
				case 'placing beam 2':
					let startHover = hover_what(
						beams,
						sliders,
						slideps,
						pivots,
						fixations,
						startBeamPos,
						HOVER_WIDTH,
						HOVER_RADIUS
					);
					beamIdCounter += 1;
					let newBeam: Beam = {
						type: 'beam',
						a: startBeamPos,
						b: mouse.clone(),
						groundA: false,
						groundB: false,
						objects: [],
						id: beamIdCounter
					};

					if (startHover != undefined) {
						if (startHover instanceof Node) {
							if (startHover.object == null) {
								if (startHover.beams.length > 0) {
									let fixedBeams: Array<[BeamPos, number]> = startHover.beams.map(beam => [
										new BeamPos(beam, beam_coords(beam, startBeamPos)[0]),
										0 // addAngle
									]);
									fixedBeams.push([
										new BeamPos(newBeam, 0),
										0 // addAngle
									]);
									fixations.push({ type: 'fixation', pos: startBeamPos, fixedBeams });
								}
							} else {
								switch (startHover.object.type) {
									case 'slider':
									case 'fixation':
										startHover.object.fixedBeams.push([
											new BeamPos(newBeam, beam_coords(newBeam, startBeamPos)[0]),
											0 // addAngle
										]);
										break;
									case 'slidep':
									case 'pivot':
										startHover.object.rotBeams.push(
											new BeamPos(newBeam, beam_coords(newBeam, startBeamPos)[0])
										);
										newBeam.objects.push([startHover.object, 0]);
										break;
								}
							}
						} else {
							fixations.push({
								type: 'fixation',
								pos: startBeamPos,
								fixedBeams: [[
									startHover,
									0 // addAngle
								], [
									new BeamPos(newBeam, 0),
									0 // addAngle
								]]
							});
						}
					}
					if (hover != undefined) {
						if (hover instanceof Node) {
							if (hover.object == null) {
								if (hover.beams.length > 0) {
									let fixedBeams: Array<[BeamPos, number]> = hover.beams.map(beam => [
										new BeamPos(beam, beam_coords(beam, mouse)[0]),
										0 // addAngle
									]);
									fixedBeams.push([
										new BeamPos(newBeam, 1),
										0 // addAngle
									]);
									fixations.push({ type: 'fixation', pos: mouse.clone(), fixedBeams });
								}
							} else {
								switch (hover.object.type) {
									case 'slider':
									case 'fixation':
										hover.object.fixedBeams.push([
											new BeamPos(newBeam, beam_coords(newBeam, mouse)[0]),
											0 // addAngle
										]);
										break;
									case 'slidep':
									case 'pivot':
										hover.object.rotBeams.push(new BeamPos(newBeam, beam_coords(newBeam, mouse)[0]));
										newBeam.objects.push([hover.object, 1]);
										break;
								}
							}
						} else {
							fixations.push({
								type: 'fixation',
								pos: mouse.clone(),
								fixedBeams: [[
									hover,
									0 // addAngle
								], [
									new BeamPos(newBeam, 1),
									0 // addAngle
								]]
							});
						}
					}
					beams.push(newBeam);
					mode = Mode.PlacingBeam1;
					break;
				case 'placing ground':
					if (hover != undefined) {
						if (hover instanceof Node) {
							if (hover.object != null) {
								switch (hover.object.type) {
									case 'slidep':
									case 'pivot':
									case 'slider':
										hover.object.ground = !hover.object.ground;
										break;
									case 'fixation':
										let closestBeam = hover.beams[0];
										let dist = Infinity;
										let aToB = true;
										hover.object.fixedBeams.forEach(beamPos => {
											let newDist = beamPos[0].beam.a.distance_to(mouse);
											if (newDist < dist) {
												dist = newDist;
												aToB = true;
												closestBeam = beamPos[0].beam;
											}
											newDist = beamPos[0].beam.b.distance_to(mouse);
											if (newDist < dist) {
												dist = newDist;
												aToB = false;
												closestBeam = beamPos[0].beam;
											}
										});
										if (aToB) {
											closestBeam.groundA = !closestBeam.groundA;
										} else {
											closestBeam.groundB = !closestBeam.groundB;
										}
										break;
								}
							} else {
								if (hover.beams[0].a.is_equal(mouse)) {
									if (hover.beams[0].groundB) {
										hover.beams[0].groundB = false;
										hover.beams[0].groundA = true;
									} else {
										hover.beams[0].groundA = !hover.beams[0].groundA;
									}
								} else {
									if (hover.beams[0].groundA) {
										hover.beams[0].groundA = false;
										hover.beams[0].groundB = true;
									} else {
										hover.beams[0].groundB = !hover.beams[0].groundB;
									}
								}
							}
						} else {
							if (hover.k < 0.5) {
								if (hover.beam.groundB) {
									hover.beam.groundB = false;
									hover.beam.groundA = true;
								} else {
									hover.beam.groundA = !hover.beam.groundA;
								}
							} else {
								if (hover.beam.groundA) {
									hover.beam.groundA = false;
									hover.beam.groundB = true;
								} else {
									hover.beam.groundB = !hover.beam.groundB;
								}
							}
						}
					}
					break;
			}
		} else if (event.button == 2) {
			// Right button
			mode = Mode.Idle;
			cursor = 'auto';
			animateCheckbox.checked = false;
		}
		draw();
	}

	function onpointerup(event: PointerEvent) {
		switch (mode) {
			case 'animating':
				mode = Mode.Animate;
				grabbed = undefined;
				break;
			case 'moving':
				mode = Mode.Idle;
				cursor = 'auto';
				grabbed = undefined;
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
				mode = Mode.PlacingBeam1;
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
		ctx.fillText('beams: ' + beams.length, 10, 50);
		ctx.fillText('sliders: ' + sliders.length, 10, 70);
		ctx.fillText('pivots: ' + pivots.length, 10, 90);
		ctx.fillText('slideps: ' + slideps.length, 10, 110);
		ctx.fillText('fixations: ' + fixations.length, 10, 130);
		let nbGrounds = 0;
		beams.forEach(beam => {
			if (beam.groundA || beam.groundB) {
				nbGrounds += 1;
			}
		});
		sliders.forEach(slider => {
			if (slider.ground) {
				nbGrounds += 1;
			}
		});
		slideps.forEach(slidep => {
			if (slidep.ground) {
				nbGrounds += 1;
			}
		});
		pivots.forEach(pivot => {
			if (pivot.ground) {
				nbGrounds += 1;
			}
		});
		ctx.fillText('grounds: ' + nbGrounds, 10, 150);
		ctx.fillText('error: ' + get_error(sliders, slideps, pivots, fixations).toFixed(4), 10, 170);

		if (hover != undefined) {
			if (hover instanceof Node) {
				if (hover.object == undefined) {
					let isA = '(start)';
					if (hover.beams[0].b == hover.pos) {
						isA = '(end)';
					}
					ctx.fillText('[ Beam ' + hover.beams[0].id + ' ]  ' + isA, 140, 60);
				} else {
					ctx.fillText('[ ' + hover.object.type + ' ]', 140, 60);
					switch (hover.object.type) {
						case 'slider':
							ctx.fillText(
								'fixed Beams: [' +
									hover.object.fixedBeams.map((beam) => {
										return beam[0].beam.id;
									}) +
									']',
								140,
								80
							);
							ctx.fillText('slide Beam: ' + hover.object.slideBeam?.id, 140, 100);
							break;
						case 'slidep':
							ctx.fillText(
								'rot Beams: [' +
									hover.object.rotBeams.map((beam) => {
										return beam.beam.id;
									}) +
									']',
								140,
								80
							);
							ctx.fillText('slide Beam: ' + hover.object.slideBeam?.id, 140, 100);
							break;
						case 'pivot':
							ctx.fillText(
								'rot Beams: [' +
									hover.object.rotBeams.map((beam) => {
										return beam.beam.id;
									}) +
									']',
								140,
								80
							);
							break;
						case 'fixation':
							ctx.fillText(
								'fixed Beams: [' +
									hover.object.fixedBeams.map((beam) => {
										return beam[0].beam.id;
									}) +
									']',
								140,
								80
							);
							break;
					}
				}
			} else {
				ctx.fillText('[ Beam ' + hover.beam.id + ' ]  k: ' + hover.k.toFixed(3), 150, 60);
				for (let i = 0; i < hover.beam.objects.length; i++) {
					let [objectType, k] = hover.beam.objects[i];
					ctx.fillText(objectType.type + '   k: ' + k.toFixed(3), 150, 80 + i * 20);
				}
			}
		}

		// TODO : Show UNCONNECTED Beams and pivot differently
		// TODO : Handle ovelapping beams (as a node ?)

		// HIGHLIGHT color
		if (mode == 'moving' && grabbed != undefined) {
			if (grabbed instanceof Node) {
				highlight_node(grabbed.pos);
			} else {
				highlight_beam(grabbed.beam.a, grabbed.beam.b);
			}
		} else if (mode == 'animating') {
			// TODO add something ?
		} else if (mode == 'animate' && hover != undefined) {
			if (hover instanceof Node) {
				let fixedBeam = false;
				hover.beams.forEach(beam => {
					if (beam.groundA || beam.groundB) { fixedBeam = true; }
				});
				if (!((hover.object != null && hover.object.type != 'fixation' && hover.object.ground) || fixedBeam)) {
					highlight_node(hover.pos);
				}
			} else {
				if (!(hover.beam.groundA || hover.beam.groundB)) {
					highlight_beam(hover.beam.a, hover.beam.b);
					//highlight_node(hover.pos());
				}
			}
		} else if (hover != undefined) {
			if (hover instanceof Node) {
				highlight_node(hover.pos);
			} else {
				highlight_beam(hover.beam.a, hover.beam.b);
			}
		}

		if (mode == Mode.PlacingGround) {
			let p = mouse.clone();
			let dir = new Point();
			if (hover != undefined) {
				if (hover instanceof Node) {
					if (hover.object != null) {
						if (hover.object.type == 'slider' && hover.object.slideBeam != undefined) {
							dir = hover.object.slideBeam.b.sub(hover.object.slideBeam.a);
						} else if (hover.object.type == 'fixation') {
							let closestBeam = hover.beams[0];
							let dist = Infinity;
							let aToB = true;
							hover.object.fixedBeams.forEach(beamP => {
								let newDist = beamP[0].beam.a.distance_to(mouse);
								if (newDist < dist) {
									dist = newDist;
									aToB = true;
									closestBeam = beamP[0].beam;
								}
								newDist = beamP[0].beam.b.distance_to(mouse);
								if (newDist < dist) {
									dist = newDist;
									aToB = false;
									closestBeam = beamP[0].beam;
								}
							});
							if (aToB) {
								dir = closestBeam.b.sub(closestBeam.a).perp();
							} else {
								dir = closestBeam.a.sub(closestBeam.b).perp();
							}
						}
					} else {
						if (hover.beams[0].a.is_equal(mouse)) {
							dir = hover.beams[0].b.sub(hover.beams[0].a).perp();
						} else {
							dir = hover.beams[0].a.sub(hover.beams[0].b).perp();
						}
					}
				} else {
					highlight_node(p);
					if (hover.k < 0.5) {
						dir = hover.beam.b.sub(hover.beam.a).perp();
						p = hover.beam.a;
					} else {
						dir = hover.beam.a.sub(hover.beam.b).perp();
						p = hover.beam.b;
					}
				}
			}
			draw_ground(p, dir);
		}
		fixations.forEach(fixation => {
			draw_fixation_bottom(fixation.pos);
		});
		let startHover: Node | BeamPos | undefined = undefined;
		if (mode == Mode.PlacingBeam2) {
			startHover = hover_what(
				beams,
				sliders,
				slideps,
				pivots,
				fixations,
				startBeamPos,
				HOVER_WIDTH,
				HOVER_RADIUS
			);

			if (startHover != undefined) {
				if (startHover instanceof Node) {
					if (startHover.object == null && startHover.beams.length > 0) {
						draw_fixation_bottom(startBeamPos);
					}
				} else if (startHover != undefined) {
					draw_fixation_bottom(startBeamPos);
				}
			}
			if (hover != undefined) {
				if (hover instanceof Node) {
					if (hover.object == null && hover.beams.length > 0) {
						draw_fixation_bottom(hover.pos);
					}
				} else {
					draw_fixation_bottom(hover.get_pos());
				}
			}
		}
		beams.forEach(beam => {
			if (beam.groundA) {
				draw_ground(beam.a, beam.b.sub(beam.a).perp());
			}
			if (beam.groundB) {
				draw_ground(beam.b, beam.a.sub(beam.b).perp());
			}
			draw_beam(beam.a, beam.b);
		});
		if (mode == Mode.PlacingBeam1) {
			ctx.strokeStyle = '#001d59';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.rect(mouse.x - 4, mouse.y - 4, 8, 8);
			ctx.fillStyle = '#b7e2ff';
			ctx.fill();
			ctx.stroke();
		} else if (mode == Mode.PlacingBeam2) {
			draw_beam(startBeamPos, mouse);
		}
		fixations.forEach(fixation => {
			draw_fixation_top(fixation.pos);
		});
		if (mode == Mode.PlacingBeam2) {
			if (startHover != undefined) {
					if (startHover instanceof Node) {
					if (startHover.object == null && startHover.beams.length > 0) {
						draw_fixation_top(startBeamPos);
					}
				} else if (startHover != undefined) {
					draw_fixation_top(startBeamPos);
				}
			}
			if (hover != undefined) {
				if (hover instanceof Node) {
					if (hover.object == null && hover.beams.length > 0) {
						draw_fixation_top(hover.pos);
					}
				} else {
					draw_fixation_top(hover.get_pos());
				}
			}
		}
		pivots.forEach(pivot => {
			if (pivot.ground) {
				draw_ground(pivot.pos, new Point());
			}
			draw_pivot(pivot.pos);
		});
		sliders.forEach(slider => {
			if (slider.ground) {
				draw_ground(slider.pos, slider.dir);
			}
			draw_slider(slider.pos, slider.dir);
		});
		slideps.forEach(slidep => {
			let overDirs = slidep.rotBeams.map((beamP) => {
				if (beamP.beam.a.is_equal(slidep.pos)) {
					return beamP.beam.b.sub(beamP.beam.a);
				} else {
					return beamP.beam.a.sub(beamP.beam.b);
				}
			});
			if (mode == Mode.PlacingBeam2) {
				if (startHover != undefined && startHover instanceof Node && startBeamPos.is_near_equal(slidep.pos)) {
					if (startHover.object != null && startHover.object.type == 'slidep') {
						overDirs.push(mouse.sub(startBeamPos));
					}
				}
				if (hover != undefined && hover instanceof Node && mouse.is_near_equal(slidep.pos)) {
					if (hover.object != null && hover.object.type == 'slidep') {
						overDirs.push(startBeamPos.sub(mouse));
					}
				}
			}
			draw_slidep(slidep.pos, slidep.dir, overDirs);
			if (slidep.ground) {
				draw_ground(slidep.pos, new Point());
			}
			draw_pivot(slidep.pos);
		});
		if (mode == Mode.PlacingSlider) {
			let p = mouse.clone();
			let dir = new Point();
			if (hover != undefined) {
				if (hover instanceof Node) {
					if (hover.object != null) {
						switch (hover.object.type) {
							case 'slider':
								if (hover.object.slideBeam != undefined) {
									dir = hover.object.slideBeam.b.sub(hover.object.slideBeam.a);
								}
								break;
							case 'slidep':
								if (hover.object.slideBeam != undefined) {
									dir = hover.object.slideBeam.b.sub(hover.object.slideBeam.a);
								}
								break;
							case 'pivot':
								hover.object.rotBeams.toReversed().forEach(beamPos => {
									if ((beamPos.k != 0) && (beamPos.k != 1)) {
										dir = beamPos.beam.b.sub(beamPos.beam.a);
									}
								});
								break;
							case 'fixation':
								let fixationBeam = hover.object.fixedBeams[0];
								if (hover.object.fixedBeams[0] != null) {
									dir = fixationBeam[0].beam.b.sub(fixationBeam[0].beam.a);
								}
								break;
						}
					}
				} else {
					p = hover.get_pos();
					dir = hover.beam.b.sub(hover.beam.a);
				}
			}
			draw_slider(p, dir);
		}
		if (mode == Mode.PlacingPivot) {
			draw_pivot(mouse);
		}

		beams.forEach(beam => {
			let p = beam.a.add(beam.b).div(2);
			ctx.beginPath();
			ctx.arc(p.x, p.y, 9, 0, TAU);
			ctx.fillStyle = '#ffffffd0';
			ctx.fill();
			ctx.fillStyle = '#000000d0';
			ctx.fillText(beam.id.toString(), p.x - 4, p.y + 5);
		});
	}

	function highlight_node(p: Point) {
		if (!ctx) return;

		const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 25);
		grad.addColorStop(0, '#ffbe80');
		grad.addColorStop(1, '#ffbe8000');
		ctx.beginPath();
		ctx.arc(p.x, p.y, 25, 0, TAU);
		ctx.fillStyle = grad;
		ctx.fill();
	}

	function highlight_beam(a: Point, b: Point) {
		if (!ctx) return;

		const width = 26;
		let delta = b.sub(a);
		let angle = delta.angle_rad();
		let pR = a.rotate_rad(-angle);
		ctx.rotate(angle);
		const grad = ctx.createLinearGradient(pR.x, pR.y - width / 2, pR.x, pR.y + width / 2);
		grad.addColorStop(0, '#ffbe8000');
		grad.addColorStop(0.25, '#ffbe80');
		grad.addColorStop(0.75, '#ffbe80');
		grad.addColorStop(1, '#ffbe8000');
		ctx.fillStyle = grad;
		ctx.roundRect(
			pR.x - width / 3,
			pR.y - width / 2,
			delta.length() + (width * 2) / 3,
			width,
			width / 2
		);
		ctx.fill();

		ctx.rotate(-angle);
	}

	function draw_fixation_bottom(p: Point) {
		if (!ctx) return;

		ctx.beginPath();
		ctx.arc(p.x, p.y, 8, 0, TAU);
		ctx.fillStyle = '#001d59';
		ctx.fill();
	}

	function draw_fixation_top(p: Point) {
		if (!ctx) return;

		ctx.beginPath();
		ctx.arc(p.x, p.y, 6, 0, TAU);
		ctx.fillStyle = '#b7e2ff';
		ctx.fill();
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

		ctx.lineCap = 'square';
		ctx.strokeStyle = '#001d59';
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		ctx.lineTo(b.x, b.y);
		ctx.lineWidth = 8;
		ctx.stroke();
		ctx.strokeStyle = '#b7e2ff';
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		ctx.lineTo(b.x, b.y);
		ctx.lineWidth = 4;
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

	function draw_slidep(p: Point, dir: Point, overDirs: Array<Point>) {
		if (!ctx) return;

		ctx.strokeStyle = '#001d59';
		ctx.lineWidth = 2;

		let angle = dir.angle_rad();
		let pR = p.rotate_rad(-angle);
		ctx.rotate(angle);

		ctx.beginPath();
		ctx.roundRect(pR.x - 12, pR.y - 7, 4, 14, [2, 0, 0, 2]);
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.roundRect(pR.x + 8, pR.y - 7, 4, 14, [0, 2, 2, 0]);
		ctx.fill();
		ctx.stroke();

		ctx.fillStyle = '#ffbe80';
		ctx.fillRect(pR.x - 11, pR.y - 6, 22, 12);
		ctx.fillStyle = '#ffbe80b0';
		ctx.fillRect(pR.x - 8, pR.y - 7, 16, 14);

		ctx.rotate(-angle);

		ctx.lineCap = 'butt';
		for (let overDir of overDirs) {
			let b = p.add(overDir.normalize().mul(15));
			ctx.strokeStyle = '#001d59';
			ctx.beginPath();
			ctx.moveTo(p.x, p.y);
			ctx.lineTo(b.x, b.y);
			ctx.lineWidth = 8;
			ctx.stroke();
			b = p.add(overDir.normalize().mul(16));
			ctx.strokeStyle = '#b7e2ff';
			ctx.beginPath();
			ctx.moveTo(p.x, p.y);
			ctx.lineTo(b.x, b.y);
			ctx.lineWidth = 4;
			ctx.stroke();
		}
	}

	function draw_ground(p: Point, dir: Point) {
		if (!ctx) return;

		let angle = dir.angle_rad();
		let pR = p.rotate_rad(-angle).add(new Point(0, 4));
		ctx.rotate(angle);

		ctx.strokeStyle = '#001d59';
		ctx.lineCap = 'butt';
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(pR.x, pR.y);
		ctx.lineTo(pR.x, pR.y + 8);
		ctx.stroke();

		ctx.lineCap = 'round';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(pR.x - 12, pR.y + 8.5);
		ctx.lineTo(pR.x + 12, pR.y + 8.5);
		ctx.stroke();

		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(pR.x - 12, pR.y + 9);
		ctx.lineTo(pR.x - 6, pR.y + 18);
		ctx.moveTo(pR.x - 6, pR.y + 9);
		ctx.lineTo(pR.x, pR.y + 18);
		ctx.moveTo(pR.x, pR.y + 9);
		ctx.lineTo(pR.x + 6, pR.y + 18);
		ctx.moveTo(pR.x + 6, pR.y + 9);
		ctx.lineTo(pR.x + 12, pR.y + 18);
		ctx.stroke();

		ctx.rotate(-angle);
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
					mode = Mode.PlacingBeam1;
					cursor = 'none';
					animateCheckbox.checked = false;
				}}
				title="Beam (b)"
			>
				Beam
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
