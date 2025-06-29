import type { Rod, GrabElem, KinElem, KinState } from '$lib/types';
import { Point2, RodPos } from '$lib/types';

function translate_rod(rodPos: RodPos, target: Point2) {
	let delta = target.sub(rodPos.get_pos());
	rodPos.rod.a.update(rodPos.rod.a.add(delta));
	rodPos.rod.b.update(rodPos.rod.b.add(delta));
}

function pull_rod_pos_to_point(rodPos: RodPos, target: Point2) {
	// Calculates the movement with smallest energy
	if (rodPos.k === 0) {
		pull_rod_by_end(rodPos.rod, target, false);
		return;
	} else if (rodPos.k === 1) {
		pull_rod_by_end(rodPos.rod, target, true);
		return;
	}
	let l = rodPos.rod.a.distance_to(rodPos.rod.b);
	let d = target
		.mul(2 - 1 / rodPos.k)
		.sub(rodPos.rod.a)
		.add(rodPos.rod.b.mul(1 / rodPos.k - 1))
		.normalize();
	rodPos.rod.a.update(target.sub(d.mul(l * rodPos.k)));
	rodPos.rod.b.update(target.add(d.mul(l * (1 - rodPos.k))));
}

function pull_rod_to_line(rod: Rod, point: Point2, dir: Point2) {
	// Calculates the movement with smallest energy
	let center = rod.a.add(rod.b).div(2);
	let centerToPoint = point.sub(center);
	let delta = centerToPoint.project(dir.perp());
	let angle = dir.angle_rad() - rod.b.sub(rod.a).angle_rad();

	let center_to_a = rod.a.sub(center);
	let center_to_b = rod.b.sub(center);

	rod.a.update(center.add(delta).add(center_to_a.rotate_rad(angle)));
	rod.b.update(center.add(delta).add(center_to_b.rotate_rad(angle)));
}

function pull_rod_to_point(rod: Rod, target: Point2) {
	// Calculates the movement with smallest energy
	pull_rod_pos_to_point(rod.closest_rod_pos(target), target);
}

function pull_rod_by_end(rod: Rod, target: Point2, isEnd: boolean) {
	let l = rod.a.distance_to(rod.b);
	if (isEnd) {
		rod.b.update(target);
		rod.a.update(target.sub(target.sub(rod.a).normalize().mul(l)));
	} else {
		rod.a.update(target);
		rod.b.update(target.sub(target.sub(rod.b).normalize().mul(l)));
	}
}

function rotate_rod(rod: Rod, angle: number) {
	let center = rod.a.add(rod.b).div(2);
	let center_to_a = rod.a.sub(center);
	let center_to_b = rod.b.sub(center);
	rod.a.update(center.add(center_to_a.rotate_deg(angle)));
	rod.b.update(center.add(center_to_b.rotate_deg(angle)));
}

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
	// TODO : Appliquer la contrainte de la souris incrémentalement + en limitant la distance parcourue
	switch (grabbed.type) {
		case 'rod pos':
			firstElement = grabbed.rod;
			pull_rod_pos_to_point(grabbed, target);
			break;
		case 'slider':
		case 'slidep':
		case 'pivot':
		case 'fixation':
			firstElement = grabbed;
			firstElement.pos = target;
			break;
	}
	// Generate list of rods and objects : from mouse to ground(s)
	let elements = get_elements([firstElement]);
	let actions = get_actions(elements);
	console.log('elements', elements);
	console.log('actions', actions);

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
 * Drags an element to the target point without affecting the whole structure.
 */
export function drag(kinState: KinState, grabbed: GrabElem, target: Point2) {
	switch (grabbed.type) {
		case 'rod pos':
			if (grabbed.k === 0) {
			} else if (grabbed.k === 1) {
			} else {
				translate_rod(grabbed, target);
				// TODO : move attached nodes
			}

			break;
		case 'slider':
		case 'slidep':
		case 'pivot':
		case 'fixation':
			grabbed.pos = target;
			// TODO : move attached rods
			// move attached nodes
			break;
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
					pull_rod_pos_to_point(rodPos, half_pos);
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
					pull_rod_to_point(element.slideRod, half_pos);
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
				pull_rod_to_point(element.slideRod, half_pos);
				pull_rod_to_point(element.slideRod, half_pos);
			}
		case 'pivot':
			for (let rodPos of element.rotRods) {
				if (!(rodPos.rod.groundA || rodPos.rod.groundB)) {
					let half_pos = rodPos.get_pos().lerp(element.pos, 0.5);
					pull_rod_pos_to_point(rodPos, half_pos);
				}
			}
			break;
		case 'fixation':
			for (let [rodPos, _dir] of element.fixedRods) {
				if (!(rodPos.rod.groundA || rodPos.rod.groundB)) {
					let half_pos = rodPos.get_pos().lerp(element.pos, 0.5);
					pull_rod_pos_to_point(rodPos, half_pos);
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
