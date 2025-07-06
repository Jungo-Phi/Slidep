import type { Rod, GrabElem, KinElem, KinState, HoverOn } from '$lib/types';
import { Point2, RodPos } from '$lib/types';
import { pull_rod, pull_rod_by_end, pull_rod_pos, pull_rod_to_line, rotate_rod } from './utils';



/**
 * Returns the summed error of rods and constrains.
 */
export function get_error(kinState: KinState): number {
	let error = 0;
	kinState.sliders.forEach((slider) => {
		if (slider.slideRod !== undefined) {
			error += slider.slideRod.distance_to(slider.pos);
		}
		slider.fixedRods.forEach(([rodPos, dir]) => {
			error += slider.pos.distance_to(rodPos.get_pos());
		});
	});
	kinState.slideps.forEach((slidep) => {
		if (slidep.slideRod !== undefined) {
			error += slidep.slideRod.distance_to(slidep.pos);
		}
		slidep.rotRods.forEach((rodPos) => {
			error += slidep.pos.distance_to(rodPos.get_pos());
		});
	});
	kinState.pivots.forEach((pivot) => {
		pivot.rotRods.forEach((rodPos) => {
			error += pivot.pos.distance_to(rodPos.get_pos());
		});
	});
	kinState.fixations.forEach((fixation) => {
		fixation.fixedRods.forEach(([rodPos, dir]) => {
			error += fixation.pos.distance_to(rodPos.get_pos());
		});
	});
	return error;
}

/**
 * Drags an element as close to the target while respecting the constrains of the structure.
 *
 * Generate list of all connected elements (rods and objects) recursively : from mouse (to ground)\
 * Generate list of actions from elements list (constrain, rod, constrain)\
 * LOOP until error < lambda {\
 *  - Pull BEAM / ELEMENT to mouse\
 *  - iter list + list reversed {\
 *  - - (IGNORE GROUND)\
 *  - - Rod : Pull connected OBJECTS\
 *  - - Object : Pull BEAMS by appling constrains\
 *  - }\
 * }
 */
export function animate(kinState: KinState, grabbed: GrabElem, target: Point2) {
	// Pull BEAM / ELEMENT to mouse
	let firstElement: KinElem;
	let source;
	// TODO : Appliquer la contrainte de la souris incrémentalement + en limitant la distance parcourue
	for (let i = 0; i < 10; i++) {
		switch (grabbed.type) {
			case 'rod pos':
				source = grabbed.rodPos.get_pos();
				break;
			case 'rod end':
				if (grabbed.isEnd) {
					source = grabbed.rod.b;
				} else {
					source = grabbed.rod.a;
				}
				break;
			case 'slider':
			case 'slidep':
			case 'pivot':
			case 'fixation':
				source = grabbed.object.pos;
		}
		target = target.sub(source).limit_length(100 - i * 10).add(source);
		switch (grabbed.type) {
			case 'rod pos':
				firstElement = grabbed.rodPos.rod;
				pull_rod_pos(grabbed.rodPos, target);
				break;
			case 'rod end':
				firstElement = grabbed.rod;
				pull_rod_by_end(firstElement, target, grabbed.isEnd);
				break;
			case 'slider':
			case 'slidep':
			case 'pivot':
			case 'fixation':
				firstElement = grabbed.object;
				firstElement.pos.update(target);
		}
		constrain_kinspace(kinState, firstElement);
	}
}


/**
 * Generate list of all connected elements (rods and objects) recursively : from mouse (to ground)\
 * Generate list of actions from elements list (constrain, rod, constrain)\
 * LOOP until error < lambda {\
 *  - Pull BEAM / ELEMENT to mouse\
 *  - iter list + list reversed {\
 *  - - (IGNORE GROUND)\
 *  - - Rod : Pull connected OBJECTS\
 *  - - Object : Pull BEAMS by appling constrains\
 *  - }\
 * }
 */
export function constrain_kinspace(kinState: KinState, firstElement: KinElem) {
	// Generate list of rods and objects : from mouse to ground(s)
	let elements = get_elements([firstElement]);
	let actions = get_actions(elements);
	// LOOP until error < lambda OR max iterations {
	for (let i = 0; i < 100; i++) {
		for (let action of actions) {
			apply_constrain(action);
		}
		for (let action of actions.toReversed()) {
			apply_constrain(action);
		}
		if (get_error(kinState) < 0.001) {
			break;
		}
	}
}

/**
 * Apply a constrain by moving connected element in a way to that complies, by 'level' amount
 */
export function apply_constrain(element: KinElem) {
	let meanDirOrigin;
	let meanDir;
	let meanAngleDelta;
	switch (element.type) {
		case 'rod':
			element.objects.forEach(([object, k]) => {
				let half_pos = object.pos.lerp(element.k_pos(k), 0.5);
				switch (object.type) {
					case 'slider':
						if (object.ground) {
							break;
						}
						if (element === object.slideRod) {
							object.pos.update(object.pos.lerp(element.closest_pos(object.pos), 0.5));
							object.dir.update(object.dir.add(element.dir()).normalize());
						} else {
							object.pos.update(half_pos);
						}
						break;
					case 'slidep':
						if (element === object.slideRod) {
							if (!object.ground) {
								object.pos.update(object.pos.lerp(element.closest_pos(object.pos), 0.5));
							}
							object.dir.update(object.dir.add(element.dir()).normalize());
						} else if (!object.ground) {
							object.pos.update(half_pos);
						}
						break;
					case 'pivot':
						if (object.ground) {
							break;
						}
					case 'fixation':
						object.pos.update(half_pos);
						break;
				}
			});
			break;
		case 'slider':
			for (let [rodPos, _dir] of element.fixedRods) {
				if (!(rodPos.rod.groundA || rodPos.rod.groundB)) {
					let half_pos = rodPos.get_pos().lerp(element.pos, 0.5);
					pull_rod_pos(rodPos, half_pos);
				}
			}
			meanDirOrigin = element.fixedRods
				.reduce((accumulator, [_rodPos, dir]) => accumulator.add(dir), new Point2())
				.add(element.dirOrigin);
			meanDir = element.fixedRods
				.reduce((accumulator, [rodPos, _dir]) => accumulator.add(rodPos.rod.dir()), new Point2())
				.add(element.dir);
			meanAngleDelta = meanDir.angle_deg() - meanDirOrigin.angle_deg();
			for (let [rodPos, dir] of element.fixedRods) {
				if (!(rodPos.rod.groundA || rodPos.rod.groundB)) {
					let rodAngleDelta = dir.angle_deg() - rodPos.rod.dir().angle_deg();
					let tot = (meanAngleDelta + rodAngleDelta + 360) % 360;
					if (tot > 180) {
						tot -= 360;
					}
					rotate_rod(rodPos.rod, tot * 0.5);
				}
			}
			if (element.ground) {
				if (
					element.slideRod !== undefined &&
					!(element.slideRod.groundA || element.slideRod.groundB)
				) {
					let half_pos = element.slideRod.a.lerp(element.pos, 0.5);
					pull_rod_to_line(element.slideRod, half_pos, element.dir);
				}
			} else {
				let rodAngleDelta = element.dirOrigin.angle_deg() - element.dir.angle_deg();
				let tot = (meanAngleDelta + rodAngleDelta + 360) % 360;
				if (tot > 180) {
					tot -= 360;
				}
				element.dir = element.dir.rotate_deg(tot * 0.5);
				if (
					element.slideRod !== undefined &&
					!(element.slideRod.groundA || element.slideRod.groundB)
				) {
					let half_pos = element.slideRod.a.lerp(element.pos, 0.5);
					pull_rod(element.slideRod, half_pos);
					rotate_rod(element.slideRod, tot * 0.5);
				}
			}
			break;
		case 'slidep':
			if (
				element.slideRod !== undefined &&
				!(element.slideRod.groundA || element.slideRod.groundB)
			) {
				let half_pos = element.slideRod.a.lerp(element.pos, 0.5);
				pull_rod(element.slideRod, half_pos);
				pull_rod(element.slideRod, half_pos);
			}
		case 'pivot':
			for (let rodPos of element.rotRods) {
				if (!(rodPos.rod.groundA || rodPos.rod.groundB)) {
					let half_pos = rodPos.get_pos().lerp(element.pos, 0.5);
					pull_rod_pos(rodPos, half_pos);
				}
			}
			break;
		case 'fixation':
			for (let [rodPos, _dir] of element.fixedRods) {
				if (!(rodPos.rod.groundA || rodPos.rod.groundB)) {
					let half_pos = rodPos.get_pos().lerp(element.pos, 0.5);
					pull_rod_pos(rodPos, half_pos);
				}
			}
			meanDirOrigin = element.fixedRods.reduce(
				(accumulator, [_rodPos, dir]) => accumulator.add(dir),
				new Point2()
			);
			meanDir = element.fixedRods.reduce(
				(accumulator, [rodPos, _dir]) => accumulator.add(rodPos.rod.dir()),
				new Point2()
			);
			meanAngleDelta = meanDir.angle_deg() - meanDirOrigin.angle_deg();
			for (let [rodPos, dir] of element.fixedRods) {
				if (!(rodPos.rod.groundA || rodPos.rod.groundB)) {
					let rodAngleDelta = dir.angle_deg() - rodPos.rod.dir().angle_deg();
					let tot = (meanAngleDelta + rodAngleDelta + 360) % 360;
					if (tot > 180) {
						tot -= 360;
					}
					rotate_rod(rodPos.rod, tot * 0.5);
				}
			}
			break;
	}
}

/**
 * Generate list of all connected elements (rods and objects) recursively.
 * @param {number} elements Initial list of elements.
 * @return {number} Resulting list of elements.
 */
export function get_elements(elements: KinElem[]): KinElem[] {
	elements.forEach((element) => {
		switch (element.type) {
			case 'rod':
				for (let object of element.objects) {
					if (elements.includes(object[0])) {
						continue;
					}
					elements.push(object[0]);
					elements = get_elements(elements);
				}
				break;
			case 'slider':
				if (element.slideRod !== undefined && !elements.includes(element.slideRod)) {
					elements.push(element.slideRod);
					elements = get_elements(elements);
				}
			case 'fixation':
				for (let [rodPos, dir] of element.fixedRods) {
					if (elements.includes(rodPos.rod)) {
						continue;
					}
					elements.push(rodPos.rod);
					elements = get_elements(elements);
				}
				break;
			case 'slidep':
				if (element.slideRod !== undefined && !elements.includes(element.slideRod)) {
					elements.push(element.slideRod);
					elements = get_elements(elements);
				}
			case 'pivot':
				for (let rodPos of element.rotRods) {
					if (elements.includes(rodPos.rod)) {
						continue;
					}
					elements.push(rodPos.rod);
					elements = get_elements(elements);
				}
				break;
		}
	});
	return elements;
}

/**
 * Generate list of actions from elements to apply all constrains.\
 * For each rod : (first constrain, rod, other constrains).
 */
export function get_actions(elements: KinElem[]): KinElem[] {
	let actions: KinElem[] = [];
	elements.forEach((element) => {
		if (element.type === 'rod') {
			let objects = element.objects.map(([object, k]) => object);
			// Sort objects with elements
			let first = true;
			elements.forEach((elem) => {
				if (elem.type !== 'rod' && objects.includes(elem)) {
					actions.push(elem);
					if (first) {
						actions.push(element);
						first = false;
					}
				}
			});
		}
	});
	return actions;
}
