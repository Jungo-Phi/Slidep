import type {
	Slider,
	Slidep,
	Pivot,
	Fixation,
	KinState,
	GrabElem,
	HoverOn,
	HoverOnStuff
} from '$lib/types';
import { Point, Beam, BeamPos, HOVER_RADIUS, HOVER_WIDTH } from '$lib/types';

import { is_beam_in_elem } from '$lib/utils';

/**
 * Returns the kind of object / beam / position you are hovering on.
 */
export function get_hover_on(
	kinState: KinState,
	pos: Point,
	ignore: GrabElem | undefined
): HoverOn {
	for (let object of kinState.sliders) {
		if (ignore === undefined || object !== ignore) {
			if (object.pos.distance_to(pos) < HOVER_RADIUS) {
				return { type: 'slider', object };
			}
		}
	}
	for (let object of kinState.slideps) {
		if (ignore === undefined || object !== ignore) {
			if (object.pos.distance_to(pos) < HOVER_RADIUS) {
				return { type: 'slidep', object };
			}
		}
	}
	for (let object of kinState.pivots) {
		if (ignore === undefined || object !== ignore) {
			if (object.pos.distance_to(pos) < HOVER_RADIUS) {
				return { type: 'pivot', object };
			}
		}
	}
	for (let object of kinState.fixations) {
		if (ignore === undefined || object !== ignore) {
			if (object.pos.distance_to(pos) < HOVER_RADIUS) {
				return { type: 'fixation', object };
			}
		}
	}
	for (let beam of kinState.beams) {
		if (ignore === undefined || !is_beam_in_elem(beam, ignore)) {
			if (beam.a.distance_to(pos) < HOVER_RADIUS) {
				return { type: 'beam end', beam, isEnd: false };
			}
			if (beam.b.distance_to(pos) < HOVER_RADIUS) {
				return { type: 'beam end', beam, isEnd: true };
			}
		}
	}

	let hoverOn: HoverOn = { type: 'void' };
	let width = HOVER_WIDTH;
	for (let beam of kinState.beams) {
		let [k, dist] = beam.coords(pos);
		if (dist < width && 0 < k && k < 1) {
			width = dist;
			if (ignore === undefined || (ignore !== undefined && !is_beam_in_elem(beam, ignore))) {
				hoverOn = { type: 'beam pos', beamPos: new BeamPos(beam, k) };
			}
		}
	}
	return hoverOn;
}

/**
 * Returns the grabbed element corresponding to the stuff that is hovered on.
 */
export function get_grab_elem(hoverOn: HoverOnStuff): GrabElem {
	switch (hoverOn.type) {
		case 'beam pos':
			return hoverOn.beamPos;
		case 'beam end':
			return new BeamPos(hoverOn.beam, +hoverOn.isEnd);
		case 'slider':
		case 'slidep':
		case 'pivot':
		case 'fixation':
			return hoverOn.object;
	}
}

/**
 * Place a beam in the kinematic space.\
 * A fixation will be created when placing a beam on another.
 */
export function place_beam(
	kinState: KinState,
	hoverOnStart: HoverOn,
	startPos: Point,
	hoverOnEnd: HoverOn,
	endPos: Point,
	id: number
) {
	let newBeam = new Beam(startPos, endPos, id);
	let fixedBeams: [BeamPos, number][];
	let newFixation: Fixation;

	let pos = [startPos, endPos];
	let hoverOn = [hoverOnStart, hoverOnEnd];
	for (let i of [0, 1]) {
		switch (hoverOn[i].type) {
			case 'beam pos':
				fixedBeams = [
					[hoverOn[i].beamPos, hoverOn[i].beamPos.beam.angle_rad()],
					[new BeamPos(newBeam, i), newBeam.angle_rad()]
				];
				newFixation = { type: 'fixation', pos: pos[i], fixedBeams };
				kinState.fixations.push(newFixation);
				hoverOn[i].beamPos.beam.objects.push([newFixation, hoverOn[i].beamPos.k]);
				newBeam.objects.push([newFixation, i]);
				break;
			case 'beam end':
				fixedBeams = [
					[new BeamPos(hoverOn[i].beam, +hoverOn[i].isEnd), hoverOn[i].beam.angle_rad()],
					[new BeamPos(newBeam, i), newBeam.angle_rad()]
				];
				newFixation = { type: 'fixation', pos: pos[i], fixedBeams };
				kinState.fixations.push(newFixation);
				hoverOn[i].beam.objects.push([newFixation, +hoverOn[i].isEnd]);
				newBeam.objects.push([newFixation, i]);
				break;
			case 'slider':
			case 'fixation':
				hoverOn[i].object.fixedBeams.push([
					newBeam.closest_beam_pos(pos[i]),
					newBeam.closest_beam_pos(pos[i]).beam.angle_rad()
				]);
				newBeam.objects.push([hoverOn[i].object, i]);
				break;
			case 'slidep':
			case 'pivot':
				hoverOn[i].object.rotBeams.push(newBeam.closest_beam_pos(pos[i]));
				newBeam.objects.push([hoverOn[i].object, i]);
				break;
		}
	}
	kinState.beams.push(newBeam);
}

/**
 * Place a slider in the kinematic space.\
 * A slidep will be created when placing a slider on a pivot.
 */
export function place_slider(kinState: KinState, hoverOn: HoverOn, pos: Point) {
	let newSlider: Slider = {
		type: 'slider',
		pos,
		dir: new Point(1, 0),
		slideBeam: undefined,
		fixedBeams: [],
		ground: false
	};
	switch (hoverOn.type) {
		case 'beam pos':
			newSlider.slideBeam = hoverOn.beamPos.beam;
			newSlider.dir = newSlider.slideBeam.dir();
			newSlider.slideBeam.objects.push([newSlider, hoverOn.beamPos.k]);
			break;
		case 'beam end':
			newSlider.fixedBeams = [
				[new BeamPos(hoverOn.beam, +hoverOn.isEnd), hoverOn.beam.angle_rad()]
			];
			hoverOn.beam.objects.push([newSlider, +hoverOn.isEnd]);
			break;
		case 'slider':
		case 'slidep':
			return;
		case 'pivot':
			let pivotBeam = hoverOn.object.rotBeams.at(0);
			if (pivotBeam !== undefined && pivotBeam.k !== 0 && pivotBeam.k !== 1) {
				newSlider.slideBeam = pivotBeam.beam;
			}
			newSlider.fixedBeams = hoverOn.object.rotBeams
				.filter((beamPos) => beamPos.beam !== newSlider.slideBeam)
				.map((beamPos) => [beamPos, beamPos.beam.angle_rad()]);
			hoverOn.object.rotBeams.toReversed().forEach((beamPos) => {
				if (beamPos.k !== 0 && beamPos.k !== 1) {
					newSlider.dir = beamPos.beam.dir();
				}
			});
			let newSlidep: Slidep = {
				type: 'slidep',
				pos,
				dir: newSlider.dir,
				slideBeam: newSlider.slideBeam,
				rotBeams: newSlider.fixedBeams.map((b) => b[0]),
				ground: false
			};

			kinState.slideps.push(newSlidep);
			kinState.pivots.splice(kinState.pivots.indexOf(hoverOn.object), 1);
			newSlidep.rotBeams.forEach((beamPos) => {
				let k = beamPos.beam.objects.splice(
					beamPos.beam.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				beamPos.beam.objects.push([newSlidep, k]);
			});
			if (newSlidep.slideBeam !== undefined) {
				let k = newSlidep.slideBeam.objects.splice(
					newSlidep.slideBeam.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				newSlidep.slideBeam.objects.push([newSlidep, k]);
			}
			return;
		case 'fixation':
			let fixationBeam = hoverOn.object.fixedBeams.at(0);
			if (fixationBeam !== undefined) {
				newSlider.slideBeam = fixationBeam[0].beam;
			}
			newSlider.fixedBeams = hoverOn.object.fixedBeams
				.filter((beamPos) => beamPos[0].beam !== newSlider.slideBeam)
				.map((beamPos) => [beamPos[0], beamPos[0].beam.angle_rad()]);
			kinState.fixations = kinState.fixations.filter((obj) => obj !== hoverOn.object);
			newSlider.dir = hoverOn.object.fixedBeams[0][0].beam.dir();
			hoverOn.object.fixedBeams.forEach((beamPos) => {
				let k = beamPos[0].beam.objects.splice(
					beamPos[0].beam.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				beamPos[0].beam.objects.push([newSlider, k]);
			});
			break;
	}
	kinState.sliders.push(newSlider);
}

/**
 * Place a pivot in the kinematic space.\
 * A slidep will be created when placing a pivot on a slider.
 */
export function place_pivot(kinState: KinState, hoverOn: HoverOn, pos: Point) {
	let newPivot: Pivot = { type: 'pivot', pos, rotBeams: [], ground: false };
	switch (hoverOn.type) {
		case 'beam pos':
			newPivot.rotBeams.push(hoverOn.beamPos);
			hoverOn.beamPos.beam.objects.push([newPivot, hoverOn.beamPos.k]);
			break;
		case 'beam end':
			newPivot.rotBeams = [new BeamPos(hoverOn.beam, +hoverOn.isEnd)];
			hoverOn.beam.objects.push([newPivot, +hoverOn.isEnd]);
			break;
		case 'slider':
			let newSlidep: Slidep = {
				type: 'slidep',
				pos,
				dir: hoverOn.object.dir,
				slideBeam: hoverOn.object.slideBeam,
				rotBeams: hoverOn.object.fixedBeams.map((b) => b[0]),
				ground: false
			};
			kinState.slideps.push(newSlidep);
			kinState.sliders.splice(kinState.sliders.indexOf(hoverOn.object), 1);
			newSlidep.rotBeams.forEach((beamPos) => {
				let k = beamPos.beam.objects.splice(
					beamPos.beam.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				beamPos.beam.objects.push([newSlidep, k]);
			});
			if (newSlidep.slideBeam !== undefined) {
				let k = newSlidep.slideBeam.objects.splice(
					newSlidep.slideBeam.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				newSlidep.slideBeam.objects.push([newSlidep, k]);
			}
			return;
		case 'slidep':
		case 'pivot':
			return;
		case 'fixation':
			newPivot.rotBeams = hoverOn.object.fixedBeams.map((b) => b[0]);
			kinState.fixations.splice(kinState.fixations.indexOf(hoverOn.object), 1);
			hoverOn.object.fixedBeams.forEach((beamPos) => {
				let k = beamPos[0].beam.objects.splice(
					beamPos[0].beam.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				beamPos[0].beam.objects.push([newPivot, k]);
			});
			break;
	}
	kinState.pivots.push(newPivot);
}

/**
 * Ground an element in the kinematic space.\
 * Placing a ground on where there is already one will delete it.
 */
export function place_ground(hoverOn: HoverOn, pos: Point) {
	switch (hoverOn.type) {
		case 'beam pos':
			for (let object of hoverOn.beamPos.beam.objects) {
				if (object[1] === +(hoverOn.beamPos.k > 0.5)) {
					switch (object[0].type) {
						case 'slider':
						case 'slidep':
						case 'pivot':
							object[0].ground = !object[0].ground;
							return;
					}
				}
			}
			if (hoverOn.beamPos.k > 0.5) {
				if (hoverOn.beamPos.beam.groundA) {
					hoverOn.beamPos.beam.groundA = false;
					hoverOn.beamPos.beam.groundB = true;
				} else {
					hoverOn.beamPos.beam.groundB = !hoverOn.beamPos.beam.groundB;
				}
			} else {
				if (hoverOn.beamPos.beam.groundB) {
					hoverOn.beamPos.beam.groundB = false;
					hoverOn.beamPos.beam.groundA = true;
				} else {
					hoverOn.beamPos.beam.groundA = !hoverOn.beamPos.beam.groundA;
				}
			}
			break;
		case 'beam end':
			if (hoverOn.isEnd) {
				if (hoverOn.beam.groundA) {
					hoverOn.beam.groundA = false;
					hoverOn.beam.groundB = true;
				} else {
					hoverOn.beam.groundB = !hoverOn.beam.groundB;
				}
			} else {
				if (hoverOn.beam.groundB) {
					hoverOn.beam.groundB = false;
					hoverOn.beam.groundA = true;
				} else {
					hoverOn.beam.groundA = !hoverOn.beam.groundA;
				}
			}
			break;
		case 'slider':
		case 'slidep':
		case 'pivot':
			hoverOn.object.ground = !hoverOn.object.ground;
			break;
		case 'fixation':
			let closestBeam = hoverOn.object.fixedBeams[0][0].beam;
			let dist = Infinity;
			let aToB = true;
			hoverOn.object.fixedBeams.forEach((beamPos) => {
				let newDist = beamPos[0].beam.a.distance_to(pos);
				if (newDist < dist) {
					dist = newDist;
					aToB = true;
					closestBeam = beamPos[0].beam;
				}
				newDist = beamPos[0].beam.b.distance_to(pos);
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
}
