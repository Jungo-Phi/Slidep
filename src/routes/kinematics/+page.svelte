<script lang="ts">
	import { onMount } from 'svelte';
	import {
		TAU,
		BeamPos,
		Node,
		Point,
		translate_beam,
		over_beam,
		over_node,
		beam_coords,
		pull_beam,
		pull_beam_by_end,
		get_error,
		apply_constrain,
		get_actions,
		get_elements,
	} from '$lib/utils';
	import type { Beam, Slider, Slidep, Pivot, Fixation } from '$lib/utils';

	const HOVER_RADIUS = 20;
	const HOVER_WIDTH = 10;

	const Mode = {
		Idle: 'idle',
		Animate: 'animate',
		AnimateNode: 'animate node',
		AnimateBeam: 'animate beam',
		PlacingSlider: 'placing slider',
		PlacingPivot: 'placing pivot',
		PlacingBeam1: 'placing beam 1',
		PlacingBeam2: 'placing beam 2',
		PlacingGround: 'placing ground',
		MovingNode: 'moving node',
		MovingBeam: 'moving beam',
	} as const;

	type ModeKeys = typeof Mode[keyof typeof Mode];

	let mode: ModeKeys = Mode.Idle;
	let mouse = $state(new Point());
	let cursor = $state('auto');
	let animateCheckbox: HTMLElement | null;

	let startBeamPos: Point; // mode = 'PlacingBeam2'
	let grabbedBeam: BeamPos | undefined; // mode = 'MovingBeam'
	let grabbedNode: Node | undefined; // mode = 'MovingNode'
	let beamIdCounter: number = 0;

	let overNode: Node | undefined;
	let overBeam: BeamPos | undefined;

	let beams: Array<Beam> = [];
	let sliders: Array<Slider> = [];
	let slideps: Array<Slidep> = [];
	let pivots: Array<Pivot> = [];
	let fixations: Array<Fixation> = [];
	
	// *** DEBUG ***
	/*
	beams.push({type: 'beam', a: new Point(600, 250), b: new Point(800, 250), groundA: false, groundB: false, objects: [], id: 1});
	beams.push({type: 'beam', a: new Point(800, 250), b: new Point(800, 450), groundA: false, groundB: false, objects: [], id: 2});
	beams.push({type: 'beam', a: new Point(800, 450), b: new Point(600, 450), groundA: false, groundB: false, objects: [], id: 3});
	beams.push({type: 'beam', a: new Point(600, 450), b: new Point(600, 250), groundA: false, groundB: false, objects: [], id: 4});
	pivots.push({type: 'pivot', pos: new Point(600, 250), rotBeams: [new BeamPos(beams[0], 0), new BeamPos(beams[3], 1)], ground: false});
	pivots.push({type: 'pivot', pos: new Point(800, 250), rotBeams: [new BeamPos(beams[0], 1), new BeamPos(beams[1], 0)], ground: false});
	pivots.push({type: 'pivot', pos: new Point(800, 450), rotBeams: [new BeamPos(beams[1], 1), new BeamPos(beams[2], 0)], ground: false});
	pivots.push({type: 'pivot', pos: new Point(600, 450), rotBeams: [new BeamPos(beams[2], 1), new BeamPos(beams[3], 0)], ground: false});
	beams[0].objects.push([pivots[0], 0], [pivots[1], 1]);
	beams[1].objects.push([pivots[1], 0], [pivots[2], 1]);
	beams[2].objects.push([pivots[2], 0], [pivots[3], 1]);
	beams[3].objects.push([pivots[3], 0], [pivots[0], 1]);

	mode = Mode.AnimateNode;
	cursor = 'crosshair';
	let n = 0;
	*/
	// *** DEBUG ***

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
		overNode = over_node(
			beams,
			sliders,
			slideps,
			pivots,
			fixations,
			mouse,
			HOVER_RADIUS,
			grabbedNode
		);
		overBeam = over_beam(beams, mouse, HOVER_WIDTH, grabbedNode, grabbedBeam);

		if (mode != 'animate node' && mode != 'animate beam') {
			if (overNode != undefined) {
				mouse = overNode.pos.clone();
			} else if (overBeam != undefined) {
				mouse = overBeam.get_pos();
			}
		}
		// *** DEBUG ***
		// mouse = new Point(400, 250);
		// grabbedNode = new Node(mouse.clone(), [beams[0], beams[1]], pivots[1]);
		// *** DEBUG ***

		switch (mode) {
			case 'idle':
				if (overNode != undefined || overBeam != undefined) {
					cursor = 'grab';
				} else {
					cursor = 'auto';
				}
				break;
			case 'animate node':
				if (grabbedNode == undefined) {
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
				if (grabbedNode.object == null) {
					firstElement = grabbedNode.beams[0];
					pull_beam_by_end(firstElement, mouse, beam_coords(firstElement, grabbedNode.pos)[0] > 0.5);
					apply_constrain(firstElement);
				} else {
					firstElement = grabbedNode.object;
					firstElement.pos = mouse.clone();
				}
				// Generate list of beams and objects : from mouse to ground(s)
				let elements = get_elements([firstElement]);
				let actions = get_actions(elements);

				console.log("elements : ", elements);
				console.log("actions : ", actions);
				
				// LOOP until error < lambda {
				for (let i = 0; i < 1; i++) {
					for (let action of actions) {
						apply_constrain(action);
					}
					/*
					for (let action of actions.toSorted(() => Math.random()-0.5 )) {
						// Beam : Pull connected ELEMENTS
						// Element : Pull BEAMS by appling constrains
						switch (action.type) {
							case 'beam':
								action.objects.forEach(object => {
									object[0].pos.update(action.a.lerp(action.b, object[1]));
								});
								break;
							case 'slider':
								break;
							case 'slidep':
								break;
							case 'pivot':
								for (let beamPos of action.rotBeams) {
									// if (ignoreBeams.includes(beamPos.beam)) { continue; }
									pull_beam(beamPos, action.pos);
								}
								break;
							case 'fixation':
								break;
						}
					}
					*/
					for (let action of actions.toReversed()) {
						apply_constrain(action);
					}
				}
				break;
			case 'animate beam':
				if (grabbedBeam == undefined) {
					break;
				}
				pull_beam(grabbedBeam, mouse);
				break;
			case 'moving node':
				if (grabbedNode == undefined) {
					break;
				}
				for (let beam of grabbedNode.beams) {
					if (beam.a.is_equal(grabbedNode.pos)) {
						beam.a = mouse.clone();
					} else {
						beam.b = mouse.clone();
					}
				}
				if (grabbedNode.object != null) {
					grabbedNode.object.pos = mouse.clone();
				}
				grabbedNode.pos = mouse.clone();
				// TODO : move attached beams
				// move attached nodes
				break;
			case 'moving beam':
				if (grabbedBeam == undefined) {
					break;
				}
				translate_beam(grabbedBeam, mouse);
				// TODO : move attached nodes
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
					if (overNode != undefined) {
						grabbedNode = overNode;
						mode = Mode.MovingNode;
						cursor = 'grabbing';
					} else if (overBeam != undefined) {
						grabbedBeam = overBeam;
						mode = Mode.MovingBeam;
						cursor = 'grabbing';
					}
					break;
				case 'animate':
					if (overNode != undefined) {
						grabbedNode = overNode;
						mode = Mode.AnimateNode;
					} else if (overBeam != undefined) {
						grabbedBeam = overBeam;
						mode = Mode.AnimateBeam;
					}
					break;
				case 'placing slider':
					let slideBeam: Beam | undefined = undefined;
					let fixedBeams: Array<BeamPos> = [];
					if (overNode != undefined) {
						if (overNode.object == null) {
							fixedBeams = overNode.beams.map((beam) => new BeamPos(beam, beam_coords(beam, pos)[0]));
						} else {
							switch (overNode.object.type) {
								case 'slider':
								case 'slidep':
									return;
								case 'pivot':
									let pivotBeam = overNode.object.rotBeams[0];
									if (pivotBeam != null && pivotBeam.k != 0 && pivotBeam.k != 1) {
										slideBeam = pivotBeam.beam;
									}
									fixedBeams = overNode.beams
										.map((beam) => new BeamPos(beam, beam_coords(beam, pos)[0]))
										.filter((b) => b.beam !== slideBeam);
									pivots = pivots.filter((obj) => obj !== overNode.object);
									slideps.push({
										type: 'slidep',
										pos,
										slideBeam,
										rotBeams: fixedBeams,
										ground: false
									});
									return;
								case 'fixation':
									let fixationBeam = overNode.object.fixedBeams[0];
									if (overNode.object.fixedBeams[0] != null) {
										slideBeam = fixationBeam.beam;
									}
									fixedBeams = overNode.beams
										.map((beam) => new BeamPos(beam, beam_coords(beam, pos)[0]))
										.filter((b) => b.beam !== slideBeam);
									fixations = fixations.filter((obj) => obj !== overNode.object);
									break;
							}
						}
					} else if (overBeam != undefined) {
						slideBeam = overBeam.beam;
					}
					sliders.push({ type: 'slider', pos, slideBeam, fixedBeams, ground: false });
					break;
				case 'placing pivot':
					let newPivot: Pivot = { type: 'pivot', pos, rotBeams: [], ground: false };

					if (overNode != undefined) {
						if (overNode.object == null) {
							newPivot.rotBeams = overNode.beams.map((beam) => {
								return new BeamPos(beam, beam_coords(beam, pos)[0]);
							});
							pivots.push(newPivot);
							overNode.beams.forEach(beam => {
								beam.objects.push([newPivot, + (beam_coords(beam, overNode.pos)[0] > 0.5)]);
							});
						} else {
							switch (overNode.object.type) {
								case 'slider':
									let slider = overNode.object;
									slideps.push({
										type: 'slidep',
										pos,
										slideBeam: slider.slideBeam,
										rotBeams: slider.fixedBeams,
										ground: false
									});
									sliders = sliders.filter((obj) => obj !== overNode.object);
									break;
								case 'fixation':
									newPivot.rotBeams = overNode.object.fixedBeams;
									fixations = fixations.filter((obj) => obj !== overNode.object);
									pivots.push(newPivot);
									break;
							}
						}
					} else if (overBeam != undefined) {
						newPivot.rotBeams.push(overBeam);
						pivots.push(newPivot);
						overBeam.beam.objects.push([newPivot, overBeam.k]);
					} else {
						pivots.push(newPivot);
					}
					break;
				case 'placing beam 1':
					startBeamPos = mouse.clone();
					mode = Mode.PlacingBeam2;
					break;
				case 'placing beam 2':
					let startOverNode = over_node(
						beams,
						sliders,
						slideps,
						pivots,
						fixations,
						startBeamPos,
						HOVER_RADIUS
					);
					let startOverBeam = over_beam(beams, startBeamPos, HOVER_WIDTH);
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

					if (startOverNode != undefined) {
						if (startOverNode.object == null) {
							if (startOverNode.beams.length > 0) {
								let fixedBeams = startOverNode.beams.map((beam) => {
									return new BeamPos(beam, beam_coords(beam, startBeamPos)[0]);
								});
								fixedBeams.push(new BeamPos(newBeam, 0));
								fixations.push({ type: 'fixation', pos: startBeamPos, fixedBeams });
							}
						} else {
							switch (startOverNode.object.type) {
								case 'slider':
								case 'fixation':
									startOverNode.object.fixedBeams.push(
										new BeamPos(newBeam, beam_coords(newBeam, startBeamPos)[0])
									);
									break;
								case 'slidep':
								case 'pivot':
									startOverNode.object.rotBeams.push(
										new BeamPos(newBeam, beam_coords(newBeam, startBeamPos)[0])
									);
									newBeam.objects.push([startOverNode.object, 0]);
									break;
							}
						}
					} else if (startOverBeam != undefined) {
						fixations.push({
							type: 'fixation',
							pos: startBeamPos,
							fixedBeams: [startOverBeam, new BeamPos(newBeam, 0)]
						});
					}
					if (overNode != undefined) {
						if (overNode.object == null) {
							if (overNode.beams.length > 0) {
								let fixedBeams = overNode.beams.map((beam) => {
									return new BeamPos(beam, beam_coords(beam, mouse)[0]);
								});
								fixedBeams.push(new BeamPos(newBeam, 1));
								fixations.push({ type: 'fixation', pos: mouse.clone(), fixedBeams });
							}
						} else {
							switch (overNode.object.type) {
								case 'slider':
								case 'fixation':
									overNode.object.fixedBeams.push(
										new BeamPos(newBeam, beam_coords(newBeam, mouse)[0])
									);
									break;
								case 'slidep':
								case 'pivot':
									overNode.object.rotBeams.push(new BeamPos(newBeam, beam_coords(newBeam, mouse)[0]));
									newBeam.objects.push([overNode.object, 1]);
									break;
							}
						}
					} else if (overBeam != undefined) {
						fixations.push({
							type: 'fixation',
							pos: mouse.clone(),
							fixedBeams: [overBeam, new BeamPos(newBeam, 1)]
						});
					}
					beams.push(newBeam);
					mode = Mode.PlacingBeam1;
					break;
				case 'placing ground':
					if (overNode != undefined) {
						if (overNode.object != null) {
							switch (overNode.object.type) {
								case 'slidep':
								case 'pivot':
								case 'slider':
									overNode.object.ground = !overNode.object.ground;
									break;
								case 'fixation':
									let closestBeam = overNode.beams[0];
									let dist = Infinity;
									let aToB = true;
									overNode.object.fixedBeams.forEach(beamPos => {
										let newDist = beamPos.beam.a.distance_to(mouse);
										if (newDist < dist) {
											dist = newDist;
											aToB = true;
											closestBeam = beamPos.beam;
										}
										newDist = beamPos.beam.b.distance_to(mouse);
										if (newDist < dist) {
											dist = newDist;
											aToB = false;
											closestBeam = beamPos.beam;
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
							if (overNode.beams[0].a.is_equal(mouse)) {
								if (overNode.beams[0].groundB) {
									overNode.beams[0].groundB = false;
									overNode.beams[0].groundA = true;
								} else {
									overNode.beams[0].groundA = !overNode.beams[0].groundA;
								}
							} else {
								if (overNode.beams[0].groundA) {
									overNode.beams[0].groundA = false;
									overNode.beams[0].groundB = true;
								} else {
									overNode.beams[0].groundB = !overNode.beams[0].groundB;
								}
							}
						}
					} else if (overBeam != undefined) {
						if (overBeam.k < 0.5) {
							if (overBeam.beam.groundB) {
								overBeam.beam.groundB = false;
								overBeam.beam.groundA = true;
							} else {
								overBeam.beam.groundA = !overBeam.beam.groundA;
							}
						} else {
							if (overBeam.beam.groundA) {
								overBeam.beam.groundA = false;
								overBeam.beam.groundB = true;
							} else {
								overBeam.beam.groundB = !overBeam.beam.groundB;
							}
						}
					}
					break;
			}
		} else if (event.button == 2) {
			// Right button
			mode = Mode.Idle;
			cursor = 'auto';
		}
		draw();
	}

	function onpointerup(event: PointerEvent) {
		switch (mode) {
			case 'animate node':
				mode = Mode.Animate;
				grabbedNode = undefined;
				break;
			case 'animate beam':
				mode = Mode.Animate;
				grabbedBeam = undefined;
				break;
			case 'moving node':
				mode = Mode.Idle;
				cursor = 'auto';
				grabbedNode = undefined;
				break;
			case 'moving beam':
				mode = Mode.Idle;
				cursor = 'auto';
				grabbedBeam = undefined;
				break;
		}
		update_mouse();
	}

	function onKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Escape':
				mode = Mode.Idle;
				cursor = 'auto';
				if (animateCheckbox != null) {
					animateCheckbox.checked = false;
				}
				break;
			case 'a':
				mode = Mode.Animate;
				cursor = 'crosshair';
				if (animateCheckbox != null) {
					animateCheckbox.checked = true;
				}
				break;
			case 's':
				mode = Mode.PlacingSlider;
				cursor = 'none';
				if (animateCheckbox != null) {
					animateCheckbox.checked = false;
				}
				break;
			case 'p':
				mode = Mode.PlacingPivot;
				cursor = 'none';
				if (animateCheckbox != null) {
					animateCheckbox.checked = false;
				}
				break;
			case 'b':
				mode = Mode.PlacingBeam1;
				cursor = 'none';
				if (animateCheckbox != null) {
					animateCheckbox.checked = false;
				}
				break;
			case 'g':
				mode = Mode.PlacingGround;
				cursor = 'none';
				if (animateCheckbox != null) {
					animateCheckbox.checked = false;
				}
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
		ctx.fillText('sliders: ' + sliders.length, 10, 60);
		ctx.fillText('pivots: ' + pivots.length, 10, 80);
		ctx.fillText('slideps: ' + slideps.length, 10, 100);
		ctx.fillText('fixations: ' + fixations.length, 10, 120);
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
		ctx.fillText('grounds: ' + nbGrounds, 10, 140);
		ctx.fillText('error: ' + get_error(sliders, slideps, pivots, fixations).toFixed(4), 10, 160);

		if (overNode != undefined) {
			if (overNode.object == undefined) {
				let isA = '(start)';
				if (overNode.beams[0].b == overNode.pos) {
					isA = '(end)';
				}
				ctx.fillText('[ Beam ' + overNode.beams[0].id + ' ]  ' + isA, 140, 60);
			} else {
				ctx.fillText('[ ' + overNode.object.type + ' ]', 140, 60);
				switch (overNode.object.type) {
					case 'slider':
						ctx.fillText(
							'fixed Beams: [' +
								overNode.object.fixedBeams.map((beam) => {
									return beam.beam.id;
								}) +
								']',
							140,
							80
						);
						ctx.fillText('slide Beam: ' + overNode.object.slideBeam?.id, 140, 100);
						break;
					case 'slidep':
						ctx.fillText(
							'rot Beams: [' +
								overNode.object.rotBeams.map((beam) => {
									return beam.beam.id;
								}) +
								']',
							140,
							80
						);
						ctx.fillText('slide Beam: ' + overNode.object.slideBeam?.id, 140, 100);
						break;
					case 'pivot':
						ctx.fillText(
							'rot Beams: [' +
								overNode.object.rotBeams.map((beam) => {
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
								overNode.object.fixedBeams.map((beam) => {
									return beam.beam.id;
								}) +
								']',
							140,
							80
						);
						break;
				}
			}
		} else if (overBeam != undefined) {
			ctx.fillText('[ Beam ' + overBeam.beam.id + ' ]  k: ' + overBeam.k.toFixed(3), 150, 60);
			for (let i = 0; i < overBeam.beam.objects.length; i++) {
				let [objectType, k] = overBeam.beam.objects[i];
				ctx.fillText(objectType.type + '  k: ' + k.toFixed(3), 150, 80 + i * 20);
			}
		}

		// HIGHLIGHT color
		if (mode == 'moving node' && grabbedNode != undefined) {
			highlight_node(grabbedNode.pos);
		} else if (mode == 'moving beam' && grabbedBeam != undefined) {
			highlight_beam(grabbedBeam.beam.a, grabbedBeam.beam.b);
		} else if (mode == 'animate node') {
		} else if (mode == 'animate beam') {
		} else if (overNode != undefined) {
			if (mode == Mode.Animate) {
				let fixedBeam = false;
				overNode.beams.forEach(beam => {
					if (beam.groundA || beam.groundB) { fixedBeam = true; }
				});
				if (!((overNode.object != null && overNode.object.type != 'fixation' && overNode.object.ground) || fixedBeam)) {
					highlight_node(overNode.pos);
				}
			} else {
				highlight_node(overNode.pos);
			}
		} else if (overBeam != undefined) {
			if (mode == Mode.Animate) {
				if (!(overBeam.beam.groundA || overBeam.beam.groundB)) {
					highlight_beam(overBeam.beam.a, overBeam.beam.b);
					//highlight_node(overBeam.pos());
				}
			} else {
				highlight_beam(overBeam.beam.a, overBeam.beam.b);
			}
		}

		if (mode == Mode.PlacingGround) {
			let p = mouse.clone();
			let dir = new Point();
			if (overNode != undefined) {
				if (overNode.object != null) {
					if (overNode.object.type == 'slider' && overNode.object.slideBeam != undefined) {
						dir = overNode.object.slideBeam.b.sub(overNode.object.slideBeam.a);
					} else if (overNode.object.type == 'fixation') {
						let closestBeam = overNode.beams[0];
						let dist = Infinity;
						let aToB = true;
						overNode.object.fixedBeams.forEach(beamP => {
							let newDist = beamP.beam.a.distance_to(mouse);
							if (newDist < dist) {
								dist = newDist;
								aToB = true;
								closestBeam = beamP.beam;
							}
							newDist = beamP.beam.b.distance_to(mouse);
							if (newDist < dist) {
								dist = newDist;
								aToB = false;
								closestBeam = beamP.beam;
							}
						});
						if (aToB) {
							dir = closestBeam.b.sub(closestBeam.a).perp();
						} else {
							dir = closestBeam.a.sub(closestBeam.b).perp();
						}
					}
				} else {
					if (overNode.beams[0].a.is_equal(mouse)) {
						dir = overNode.beams[0].b.sub(overNode.beams[0].a).perp();
					} else {
						dir = overNode.beams[0].a.sub(overNode.beams[0].b).perp();
					}
				}
			} else if (overBeam != undefined) {
				highlight_node(p);
				if (overBeam.k < 0.5) {
					dir = overBeam.beam.b.sub(overBeam.beam.a).perp();
					p = overBeam.beam.a;
				} else {
					dir = overBeam.beam.a.sub(overBeam.beam.b).perp();
					p = overBeam.beam.b;
				}
			}
			draw_ground(p, dir);
		}
		fixations.forEach(fixation => {
			draw_fixation_bottom(fixation.pos);
		});
		if (mode == Mode.PlacingBeam2) {
			let startOverNode = over_node(
				beams,
				sliders,
				slideps,
				pivots,
				fixations,
				startBeamPos,
				HOVER_RADIUS
			);
			let startOverBeam = over_beam(beams, startBeamPos, HOVER_WIDTH);

			if (startOverNode != undefined) {
				if (startOverNode.object == null && startOverNode.beams.length > 0) {
					draw_fixation_bottom(startBeamPos);
				}
			} else if (startOverBeam != undefined) {
				draw_fixation_bottom(startBeamPos);
			}
			if (overNode != undefined) {
				if (overNode.object == null && overNode.beams.length > 0) {
					draw_fixation_bottom(overNode.pos);
				}
			} else if (overBeam != undefined) {
				draw_fixation_bottom(overBeam.get_pos());
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
			let startOverNode = over_node(
				beams,
				sliders,
				slideps,
				pivots,
				fixations,
				startBeamPos,
				HOVER_RADIUS
			);
			let startOverBeam = over_beam(beams, startBeamPos, HOVER_WIDTH);

			if (startOverNode != undefined) {
				if (startOverNode.object == null && startOverNode.beams.length > 0) {
					draw_fixation_top(startBeamPos);
				}
			} else if (startOverBeam != undefined) {
				draw_fixation_top(startBeamPos);
			}
			if (overNode != undefined) {
				if (overNode.object == null && overNode.beams.length > 0) {
					draw_fixation_top(overNode.pos);
				}
			} else if (overBeam != undefined) {
				draw_fixation_top(overBeam.get_pos());
			}
		}
		sliders.forEach(slider => {
			let dir = new Point();
			if (slider.slideBeam != undefined) {
				dir = slider.slideBeam.b.sub(slider.slideBeam.a);
			}
			if (slider.ground) {
				draw_ground(slider.pos, dir);
			}
			draw_slider(slider.pos, dir);
		});
		slideps.forEach(slidep => {
			let dir = new Point();
			if (slidep.slideBeam != undefined) {
				dir = slidep.slideBeam.b.sub(slidep.slideBeam.a);
			}
			let overDirs = slidep.rotBeams.map((beamP) => {
				if (beamP.beam.a.is_equal(slidep.pos)) {
					return beamP.beam.b.sub(beamP.beam.a);
				} else {
					return beamP.beam.a.sub(beamP.beam.b);
				}
			});
			if (mode == Mode.PlacingBeam2) {
				let startOverNode = over_node(
					beams,
					sliders,
					slideps,
					pivots,
					fixations,
					startBeamPos,
					HOVER_RADIUS
				);
				if (startOverNode != undefined && startBeamPos.is_equal(slidep.pos)) {
					if (startOverNode.object != null && startOverNode.object.type == 'slidep') {
						overDirs.push(mouse.sub(startBeamPos));
					}
				}
				if (overNode != undefined && mouse.is_equal(slidep.pos)) {
					if (overNode.object != null && overNode.object.type == 'slidep') {
						overDirs.push(startBeamPos.sub(mouse));
					}
				}
			}
			draw_slidep(slidep.pos, dir, overDirs);
			if (slidep.ground) {
				draw_ground(slidep.pos, new Point());
			}
			draw_pivot(slidep.pos);
		});
		if (mode == Mode.PlacingSlider) {
			let p = mouse.clone();
			let dir = new Point();
			if (overNode != undefined) {
				if (overNode.object != null) {
					switch (overNode.object.type) {
						case 'slider':
							if (overNode.object.slideBeam != undefined) {
								dir = overNode.object.slideBeam.b.sub(overNode.object.slideBeam.a);
							}
							break;
						case 'slidep':
							if (overNode.object.slideBeam != undefined) {
								dir = overNode.object.slideBeam.b.sub(overNode.object.slideBeam.a);
							}
							break;
						case 'pivot':
							let pivotBeam = overNode.object.rotBeams[0];
							if (pivotBeam != null && pivotBeam.k != 0 && pivotBeam.k != 1) {
								dir = pivotBeam.beam.b.sub(pivotBeam.beam.a);
							}
							break;
						case 'fixation':
							let fixationBeam = overNode.object.fixedBeams[0];
							if (overNode.object.fixedBeams[0] != null) {
								dir = fixationBeam.beam.b.sub(fixationBeam.beam.a);
							}
							break;
					}
				}
			} else if (overBeam != undefined) {
				p = overBeam.get_pos();
				dir = overBeam.beam.b.sub(overBeam.beam.a);
			}
			draw_slider(p, dir);
		}
		pivots.forEach(pivot => {
			if (pivot.ground) {
				draw_ground(pivot.pos, new Point());
			}
			draw_pivot(pivot.pos);
		});
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
