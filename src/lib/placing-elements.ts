import type {
	Slider,
	Slidep,
	Pivot,
	Fixation,
	KinState,
	GrabElem,
	HoverOn,
	Mode,
	RodPos,
	KinObject,
	KinElem
} from '$lib/types';
import { Point2, Rod, HOVER_RADIUS, HOVER_WIDTH } from '$lib/types';

import { is_rod_in_elem, translate_rod } from '$lib/utils';
import { constrain_kinspace } from './constraints';

/**
 * Returns the kind of object / rod / position you are hovering on.
 */
export function get_hover_on(
	kinState: KinState,
	mode: Mode,
	pos: Point2,
	ignore: GrabElem | undefined
): HoverOn {
	let ignoreObject: KinElem | undefined = undefined;
	if (ignore !== undefined) {
		switch (ignore.type) {
			case 'rod pos':
				ignoreObject = ignore.rodPos.rod;
				break;
			case 'rod end':
				ignoreObject = ignore.rod;
				break;
			case 'slider':
			case 'slidep':
			case 'pivot':
			case 'fixation':
				ignoreObject = ignore.object;
		}
	}
	for (let object of kinState.sliders) {
		if (
			(ignoreObject === undefined || object !== ignoreObject) &&
			object.pos.distance_to(pos) < HOVER_RADIUS
		) {
			return { type: 'slider', object };
		}
	}
	for (let object of kinState.slideps) {
		if (
			(ignoreObject === undefined || object !== ignoreObject) &&
			object.pos.distance_to(pos) < HOVER_RADIUS
		) {
			return { type: 'slidep', object };
		}
	}
	for (let object of kinState.pivots) {
		if (
			(ignoreObject === undefined || object !== ignoreObject) &&
			object.pos.distance_to(pos) < HOVER_RADIUS
		) {
			return { type: 'pivot', object };
		}
	}
	for (let object of kinState.fixations) {
		if (
			(ignoreObject === undefined || object !== ignoreObject) &&
			object.pos.distance_to(pos) < HOVER_RADIUS
		) {
			return { type: 'fixation', object };
		}
	}
	for (let rod of kinState.rods) {
		if (ignoreObject === undefined || !is_rod_in_elem(rod, ignoreObject)) {
			if (rod.a.distance_to(pos) < HOVER_RADIUS) {
				return { type: 'rod end', rod, isEnd: false };
			}
			if (rod.b.distance_to(pos) < HOVER_RADIUS) {
				return { type: 'rod end', rod, isEnd: true };
			}
		}
	}

	if (mode.type === 'placing rod end') {
		for (let object of kinState.sliders) {
			let rod = new Rod(mode.startPos, object.pos, 0);
			if (
				(ignoreObject === undefined || object !== ignoreObject) &&
				object.slideRod === undefined &&
				rod.k_coord(pos) > 1 &&
				rod.distance_to(pos) < HOVER_WIDTH &&
				object.pos.distance_to(pos) >= HOVER_RADIUS
			) {
				return { type: 'rod-hover slider', object, startPos: mode.startPos };
			}
		}
		for (let object of kinState.slideps) {
			let rod = new Rod(mode.startPos, object.pos, 0);
			if (
				(ignoreObject === undefined || object !== ignoreObject) &&
				object.slideRod === undefined &&
				rod.k_coord(pos) > 1 &&
				rod.distance_to(pos) < HOVER_WIDTH &&
				object.pos.distance_to(pos) >= HOVER_RADIUS
			) {
				return { type: 'rod-hover slidep', object, startPos: mode.startPos };
			}
		}
		for (let object of kinState.pivots) {
			let rod = new Rod(mode.startPos, object.pos, 0);
			if (
				(ignoreObject === undefined || object !== ignoreObject) &&
				rod.k_coord(pos) > 1 &&
				rod.distance_to(pos) < HOVER_WIDTH &&
				object.pos.distance_to(pos) >= HOVER_RADIUS
			) {
				return { type: 'rod-hover pivot', object, startPos: mode.startPos };
			}
		}
	}

	let hoverOn: HoverOn = { type: 'void' };
	let width = HOVER_WIDTH;
	for (let rod of kinState.rods) {
		let [k, dist] = rod.coords(pos);
		if (dist < width && 0 < k && k < 1) {
			if (ignoreObject === undefined || !is_rod_in_elem(rod, ignoreObject)) {
				switch (hoverOn.type) {
					case 'void':
						hoverOn = { type: 'rod pos', rodPos: rod.rod_pos(k) };
						break;
					case 'rod pos':
						let rodPos: RodPos = hoverOn.rodPos.rod.intersection_rod_pos(rod);
						hoverOn = {
							type: 'overlapping rods',
							rodPos,
							rodsPositions: [rodPos, rod.closest_rod_pos(rodPos.get_pos())]
						};
						break;
					case 'overlapping rods':
						hoverOn.rodsPositions.push(rod.closest_rod_pos(hoverOn.rodPos.get_pos()));
				}
			}
		}
	}
	return hoverOn;
}

export function get_hover_pos(pos: Point2, hoverOn: HoverOn): Point2 {
	switch (hoverOn.type) {
		case 'rod pos':
		case 'overlapping rods':
			return hoverOn.rodPos.get_pos();
		case 'rod end':
			return hoverOn.isEnd ? hoverOn.rod.b.clone() : hoverOn.rod.a.clone();
		case 'slider':
		case 'slidep':
		case 'pivot':
		case 'fixation':
			return hoverOn.object.pos.clone();
		case 'rod-hover slider':
		case 'rod-hover slidep':
		case 'rod-hover pivot':
			return new Rod(hoverOn.startPos, hoverOn.object.pos, 0).closest_pos(pos);
	}
	return pos.clone();
}

/**
 * Drags an element to the target point without affecting the whole structure.
 */
export function drag(kinState: KinState, grabbed: GrabElem, hoverOn: HoverOn, target: Point2) {
	switch (grabbed.type) {
		case 'rod pos':
			translate_rod(grabbed.rodPos, target);
			constrain_kinspace(kinState, grabbed.rodPos.rod);
			// TODO : move attached nodes
			break;
		case 'rod end':
			if (grabbed.isEnd) {
				grabbed.rod.b = target;
			} else {
				grabbed.rod.a = target;
			}
			constrain_kinspace(kinState, grabbed.rod);
			/*
			grabbed.rod.objects.forEach(([object, k]) => {
				object.pos = grabbed.rod.rod_pos(k).get_pos();
			});
			*/
			break;
		case 'slider':
		case 'slidep':
		case 'pivot':
		case 'fixation':
			grabbed.object.pos = target;
			constrain_kinspace(kinState, grabbed.object);
		// TODO : move attached rods
		// move attached nodes
	}
}

/**
 * Place a rod in the kinematic space.\
 * A fixation will be created when placing a rod on another.
 */
export function place_rod(
	kinState: KinState,
	hoverOnStart: HoverOn,
	startPos: Point2,
	startGround: boolean,
	hoverOnEnd: HoverOn,
	endPos: Point2,
	ground: boolean,
	id: number
) {
	// TODO : add ground while placing another object
	let newRod = new Rod(startPos, endPos, id);
	newRod.groundA = startGround;
	newRod.groundB = ground;
	let newFixation: Fixation;
	let pos = [startPos, endPos];
	let hoverOn = [hoverOnStart, hoverOnEnd];
	for (let i of [0, 1]) {
		switch (hoverOn[i].type) {
			case 'rod pos':
				newFixation = {
					type: 'fixation',
					pos: pos[i].clone(),
					fixedRods: [
						[hoverOn[i].rodPos, hoverOn[i].rodPos.rod.dir()],
						[newRod.rod_pos(i), newRod.dir()]
					]
				};
				kinState.fixations.push(newFixation);
				hoverOn[i].rodPos.rod.objects.push([newFixation, hoverOn[i].rodPos.k]);
				newRod.objects.push([newFixation, i]);
				break;
			case 'overlapping rods':
				// TODO
				break;
			case 'rod end':
				newFixation = {
					type: 'fixation',
					pos: pos[i].clone(),
					fixedRods: [
						[hoverOn[i].rod.rod_pos(+hoverOn[i].isEnd), hoverOn[i].rod.dir()],
						[newRod.rod_pos(i), newRod.dir()]
					]
				};
				kinState.fixations.push(newFixation);
				hoverOn[i].rod.objects.push([newFixation, +hoverOn[i].isEnd]);
				newRod.objects.push([newFixation, i]);
				break;
			case 'slider':
			case 'fixation':
				hoverOn[i].object.fixedRods.push([
					newRod.closest_rod_pos(pos[i]),
					newRod.closest_rod_pos(pos[i]).rod.dir()
				]);
				newRod.objects.push([hoverOn[i].object, i]);
				break;
			case 'slidep':
			case 'pivot':
				hoverOn[i].object.rotRods.push(newRod.closest_rod_pos(pos[i]));
				newRod.objects.push([hoverOn[i].object, i]);
				break;
			case 'rod-hover slidep':
			case 'rod-hover slider':
				hoverOn[i].object.slideRod = newRod;
				hoverOn[i].object.dir = newRod.dir();
				newRod.objects.push([hoverOn[i].object, newRod.k_coord(hoverOn[i].object.pos)]);
				break;
			case 'rod-hover pivot':
				hoverOn[i].object.rotRods.push(newRod.closest_rod_pos(hoverOn[i].object.pos));
				newRod.objects.push([hoverOn[i].object, newRod.k_coord(hoverOn[i].object.pos)]);
		}
	}
	kinState.rods.push(newRod);
}

/**
 * Place a slider in the kinematic space.\
 * A slidep will be created when placing a slider on a pivot.
 */
export function place_slider(kinState: KinState, hoverOn: HoverOn, pos: Point2, ground: boolean) {
	// TODO : add ground while placing another object
	let newSlider: Slider = {
		type: 'slider',
		pos,
		dir: new Point2(1, 0),
		dirOrigin: new Point2(1, 0),
		slideRod: undefined,
		fixedRods: [],
		ground
	};
	switch (hoverOn.type) {
		case 'rod pos':
			newSlider.slideRod = hoverOn.rodPos.rod;
			newSlider.dir = newSlider.slideRod.dir();
			newSlider.dirOrigin = newSlider.slideRod.dir();
			newSlider.slideRod.objects.push([newSlider, hoverOn.rodPos.k]);
			break;
		case 'overlapping rods':
			// TODO
			break;
		case 'rod end':
			newSlider.fixedRods = [[hoverOn.rod.rod_pos(+hoverOn.isEnd), hoverOn.rod.dir()]];
			hoverOn.rod.objects.push([newSlider, +hoverOn.isEnd]);
			break;
		case 'slider':
		case 'slidep':
			return;
		case 'pivot':
			let pivotRod = hoverOn.object.rotRods.at(0);
			if (pivotRod !== undefined && pivotRod.k !== 0 && pivotRod.k !== 1) {
				newSlider.slideRod = pivotRod.rod;
			}
			newSlider.fixedRods = hoverOn.object.rotRods
				.filter((rodPos) => rodPos.rod !== newSlider.slideRod)
				.map((rodPos) => [rodPos, rodPos.rod.dir()]);
			hoverOn.object.rotRods.toReversed().forEach((rodPos) => {
				if (rodPos.k !== 0 && rodPos.k !== 1) {
					newSlider.dir = rodPos.rod.dir();
					newSlider.dirOrigin = rodPos.rod.dir();
				}
			});
			let newSlidep: Slidep = {
				type: 'slidep',
				pos,
				dir: newSlider.dir,
				slideRod: newSlider.slideRod,
				rotRods: newSlider.fixedRods.map((b) => b[0]),
				ground: false
			};

			kinState.slideps.push(newSlidep);
			kinState.pivots.splice(kinState.pivots.indexOf(hoverOn.object), 1);
			newSlidep.rotRods.forEach((rodPos) => {
				let k = rodPos.rod.objects.splice(
					rodPos.rod.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				rodPos.rod.objects.push([newSlidep, k]);
			});
			if (newSlidep.slideRod !== undefined) {
				let k = newSlidep.slideRod.objects.splice(
					newSlidep.slideRod.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				newSlidep.slideRod.objects.push([newSlidep, k]);
			}
			return;
		case 'fixation':
			let fixationRod = hoverOn.object.fixedRods.at(0);
			if (fixationRod !== undefined) {
				newSlider.slideRod = fixationRod[0].rod;
			}
			newSlider.fixedRods = hoverOn.object.fixedRods
				.filter(([rodPos, dir]) => rodPos.rod !== newSlider.slideRod)
				.map(([rodPos, dir]) => [rodPos, rodPos.rod.dir()]);
			kinState.fixations = kinState.fixations.filter((obj) => obj !== hoverOn.object);
			newSlider.dir = hoverOn.object.fixedRods[0][0].rod.dir();
			newSlider.dirOrigin = hoverOn.object.fixedRods[0][0].rod.dir();
			hoverOn.object.fixedRods.forEach(([rodPos, dir]) => {
				let k = rodPos.rod.objects.splice(
					rodPos.rod.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				rodPos.rod.objects.push([newSlider, k]);
			});
			break;
	}
	kinState.sliders.push(newSlider);
}

/**
 * Place a pivot in the kinematic space.\
 * A slidep will be created when placing a pivot on a slider.
 */
export function place_pivot(kinState: KinState, hoverOn: HoverOn, pos: Point2, ground: boolean) {
	// TODO : add ground while placing another object
	let newPivot: Pivot = { type: 'pivot', pos, rotRods: [], ground };
	switch (hoverOn.type) {
		case 'rod pos':
			newPivot.rotRods.push(hoverOn.rodPos);
			hoverOn.rodPos.rod.objects.push([newPivot, hoverOn.rodPos.k]);
			break;
		case 'overlapping rods':
			// TODO
			break;
		case 'rod end':
			newPivot.rotRods = [hoverOn.rod.rod_pos(+hoverOn.isEnd)];
			hoverOn.rod.objects.push([newPivot, +hoverOn.isEnd]);
			break;
		case 'slider':
			let newSlidep: Slidep = {
				type: 'slidep',
				pos,
				dir: hoverOn.object.dir,
				slideRod: hoverOn.object.slideRod,
				rotRods: hoverOn.object.fixedRods.map((b) => b[0]),
				ground: false
			};
			kinState.slideps.push(newSlidep);
			kinState.sliders.splice(kinState.sliders.indexOf(hoverOn.object), 1);
			newSlidep.rotRods.forEach((rodPos) => {
				let k = rodPos.rod.objects.splice(
					rodPos.rod.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				rodPos.rod.objects.push([newSlidep, k]);
			});
			if (newSlidep.slideRod !== undefined) {
				let k = newSlidep.slideRod.objects.splice(
					newSlidep.slideRod.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				newSlidep.slideRod.objects.push([newSlidep, k]);
			}
			return;
		case 'slidep':
		case 'pivot':
			return;
		case 'fixation':
			newPivot.rotRods = hoverOn.object.fixedRods.map((b) => b[0]);
			kinState.fixations.splice(kinState.fixations.indexOf(hoverOn.object), 1);
			hoverOn.object.fixedRods.forEach(([rodPos, dir]) => {
				let k = rodPos.rod.objects.splice(
					rodPos.rod.objects.map((obj) => obj[0]).indexOf(hoverOn.object),
					1
				)[0][1];
				rodPos.rod.objects.push([newPivot, k]);
			});
			break;
	}
	kinState.pivots.push(newPivot);
}

/**
 * Ground an element in the kinematic space.\
 * Placing a ground on where there is already one will delete it.
 */
export function place_ground(hoverOn: HoverOn, pos: Point2) {
	switch (hoverOn.type) {
		case 'rod pos':
		case 'overlapping rods':
			for (let object of hoverOn.rodPos.rod.objects) {
				if (object[1] === +(hoverOn.rodPos.k > 0.5)) {
					switch (object[0].type) {
						case 'slider':
						case 'slidep':
						case 'pivot':
							object[0].ground = !object[0].ground;
							return;
					}
				}
			}
			if (hoverOn.rodPos.k > 0.5) {
				if (hoverOn.rodPos.rod.groundA) {
					hoverOn.rodPos.rod.groundA = false;
					hoverOn.rodPos.rod.groundB = true;
				} else {
					hoverOn.rodPos.rod.groundB = !hoverOn.rodPos.rod.groundB;
				}
			} else {
				if (hoverOn.rodPos.rod.groundB) {
					hoverOn.rodPos.rod.groundB = false;
					hoverOn.rodPos.rod.groundA = true;
				} else {
					hoverOn.rodPos.rod.groundA = !hoverOn.rodPos.rod.groundA;
				}
			}
			break;
		case 'rod end':
			if (hoverOn.isEnd) {
				if (hoverOn.rod.groundA) {
					hoverOn.rod.groundA = false;
					hoverOn.rod.groundB = true;
				} else {
					hoverOn.rod.groundB = !hoverOn.rod.groundB;
				}
			} else {
				if (hoverOn.rod.groundB) {
					hoverOn.rod.groundB = false;
					hoverOn.rod.groundA = true;
				} else {
					hoverOn.rod.groundA = !hoverOn.rod.groundA;
				}
			}
			break;
		case 'slider':
		case 'slidep':
		case 'pivot':
			hoverOn.object.ground = !hoverOn.object.ground;
			break;
		case 'fixation':
			let closestRod = hoverOn.object.fixedRods[0][0].rod;
			let dist = Infinity;
			let aToB = true;
			hoverOn.object.fixedRods.forEach(([rodPos, dir]) => {
				let newDist = rodPos.rod.a.distance_to(pos);
				if (newDist < dist) {
					dist = newDist;
					aToB = true;
					closestRod = rodPos.rod;
				}
				newDist = rodPos.rod.b.distance_to(pos);
				if (newDist < dist) {
					dist = newDist;
					aToB = false;
					closestRod = rodPos.rod;
				}
			});
			if (aToB) {
				closestRod.groundA = !closestRod.groundA;
			} else {
				closestRod.groundB = !closestRod.groundB;
			}
			break;
	}
}
