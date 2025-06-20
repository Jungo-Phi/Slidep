import type { Beam, Slider, Slidep, Pivot, Fixation, GrabElem, KinElem, KinState } from '$lib/types';
import { Point, BeamPos } from '$lib/types';

export function is_beam_in_elem(beam: Beam, elem: GrabElem): boolean {
	switch (elem.type) {
		case 'beam pos':
			if (elem.beam === beam) {
				return true;
			}
			break;
		case 'slider':
			if (elem.fixedBeams.map((beamPos) => beamPos[0].beam).includes(beam)) {
				return true;
			}
			if (elem.slideBeam === beam) {
				return true;
			}
			break;
		case 'slidep':
			if (elem.rotBeams.map((beamPos) => beamPos.beam).includes(beam)) {
				return true;
			}
			if (elem.slideBeam === beam) {
				return true;
			}
			break;
		case 'pivot':
			if (elem.rotBeams.map((beamPos) => beamPos.beam).includes(beam)) {
				return true;
			}
			break;
		case 'fixation':
			if (elem.fixedBeams.map((beamPos) => beamPos[0].beam).includes(beam)) {
				return true;
			}
	}
	return false;
}

export function translate_beam(beamPos: BeamPos, target: Point) {
	let delta = target.sub(beamPos.get_pos());
	beamPos.beam.a.update(beamPos.beam.a.add(delta));
	beamPos.beam.b.update(beamPos.beam.b.add(delta));
}

export function pull_beam_pos_to_point(beamPos: BeamPos, target: Point) {
	// Calculates the movement with smallest energy
	if (beamPos.k === 0) {
		pull_beam_by_end(beamPos.beam, target, false);
		return;
	} else if (beamPos.k === 1) {
		pull_beam_by_end(beamPos.beam, target, true);
		return;
	}
	let l = beamPos.beam.a.distance_to(beamPos.beam.b);
	let d = target
		.mul(2 - 1 / beamPos.k)
		.sub(beamPos.beam.a)
		.add(beamPos.beam.b.mul(1 / beamPos.k - 1))
		.normalize();
	beamPos.beam.a.update(target.sub(d.mul(l * beamPos.k)));
	beamPos.beam.b.update(target.add(d.mul(l * (1 - beamPos.k))));
}

export function pull_beam_to_line(beam: Beam, point: Point, dir: Point) {
	// Calculates the movement with smallest energy
	let center = beam.a.add(beam.b).div(2);
	let centerToPoint = point.sub(center);
	let delta = centerToPoint.project(dir.perp());
	let angle = dir.angle_rad() - beam.b.sub(beam.a).angle_rad();

	let center_to_a = beam.a.sub(center);
	let center_to_b = beam.b.sub(center);

	beam.a.update(center.add(delta).add(center_to_a.rotate_rad(angle)));
	beam.b.update(center.add(delta).add(center_to_b.rotate_rad(angle)));
}

export function pull_beam_to_point(beam: Beam, target: Point) {
	// Calculates the movement with smallest energy
	pull_beam_pos_to_point(beam.closest_beam_pos(target), target);
}

export function pull_beam_by_end(beam: Beam, target: Point, isB: boolean) {
	let l = beam.a.distance_to(beam.b);
	if (isB) {
		beam.b.update(target);
		beam.a.update(target.sub(target.sub(beam.a).normalize().mul(l)));
	} else {
		beam.a.update(target);
		beam.b.update(target.sub(target.sub(beam.b).normalize().mul(l)));
	}
}

/**
 * Returns the summed error of beams and constrains.
 */
export function get_error(
	kinState: KinState
): number {
	let error = 0;
	kinState.sliders.forEach((slider) => {
		if (slider.slideBeam !== undefined) {
			error += slider.slideBeam.distance_to(slider.pos);
		}
		slider.fixedBeams.forEach((beamPos) => {
			error += slider.pos.distance_to(beamPos[0].get_pos());
		});
	});
	kinState.slideps.forEach((slidep) => {
		if (slidep.slideBeam !== undefined) {
			error += slidep.slideBeam.distance_to(slidep.pos);
		}
		slidep.rotBeams.forEach((beamPos) => {
			error += slidep.pos.distance_to(beamPos.get_pos());
		});
	});
	kinState.pivots.forEach((pivot) => {
		pivot.rotBeams.forEach((beamPos) => {
			error += pivot.pos.distance_to(beamPos.get_pos());
		});
	});
	kinState.fixations.forEach((fixation) => {
		fixation.fixedBeams.forEach((beamPos) => {
			error += fixation.pos.distance_to(beamPos[0].get_pos());
		});
	});
	return error;
}

/**
 * Apply a constrain by moving connected element in a way to that complies, by 'level' amount
 */
export function apply_constrain(element: KinElem, level: number = 1.0) {
	// Beam : Pull connected Object
	// Object : Pull Beams by appling constrains
	switch (
		element.type // Ignore GROUND ?
	) {
		case 'beam':
			element.objects.forEach((object) => {
				if (!(object[0].type !== 'fixation' && object[0].ground)) {
					switch (object[0].type) {
						case 'slider':
						case 'slidep':
							object[0].dir.update(element.dir());
							object[0].pos.update(element.closest_pos(object[0].pos));
							break;
						case 'pivot':
						case 'fixation':
							object[0].pos.update(element.k_pos(object[1]));
							break;
					}
				}
			});
			break;
		case 'slider':
			if (element.slideBeam !== undefined) {
				//let half_pos = element.slideBeam.a.lerp(element.pos, level);
				if (element.ground) {
					pull_beam_to_line(element.slideBeam, element.pos, element.dir);
				} else {
					pull_beam_to_point(element.slideBeam, element.pos);
					element.dir.update(element.slideBeam.b.sub(element.slideBeam.a));
				}
			}
			for (let beamPos of element.fixedBeams) {
				let half_pos = beamPos[0].get_pos().lerp(element.pos, level);
				pull_beam_pos_to_point(beamPos[0], half_pos); // TODO : pull beam + ANGLE (beamPos[1])
			}
			break;
		case 'slidep':
		case 'pivot':
			for (let beamPos of element.rotBeams) {
				let half_pos = beamPos.get_pos().lerp(element.pos, level);
				pull_beam_pos_to_point(beamPos, half_pos);
			}
			break;
		case 'fixation':
			break;
	}
}

/**
 * Generate list of all connected elements (beams and objects) recursively.
 * @param {number} elements List of elements.
 * @return {number} The resulting list of elements.
 */
export function get_elements(elements: KinElem[]): KinElem[] {
	elements.forEach((element) => {
		switch (element.type) {
			case 'beam':
				for (let object of element.objects) {
					if (elements.includes(object[0])) {
						continue;
					}
					elements.push(object[0]);
					elements = get_elements(elements);
				}
				break;
			case 'slider':
				if (element.slideBeam !== undefined && !elements.includes(element.slideBeam)) {
					elements.push(element.slideBeam);
					elements = get_elements(elements);
				}
				for (let beamPos of element.fixedBeams) {
					if (elements.includes(beamPos[0].beam)) {
						continue;
					}
					elements.push(beamPos[0].beam);
					elements = get_elements(elements);
				}
				break;
			case 'slidep':
				break;
			case 'pivot':
				for (let beamPos of element.rotBeams) {
					if (elements.includes(beamPos.beam)) {
						continue;
					}
					elements.push(beamPos.beam);
					elements = get_elements(elements);
				}
				break;
			case 'fixation':
				break;
		}
	});
	return elements;
}

/**
 * Generate list of actions from elements to apply all constrains.\
 * For each beam : (constrain, beam, constrain).
 */
export function get_actions(elements: KinElem[]): KinElem[] {
	let actions: KinElem[] = [];
	elements.forEach((element) => {
		switch (element.type) {
			case 'beam':
				let objects = element.objects.map((object) => {
					return object[0];
				});
				// Sort objects with elements
				let first = true;
				elements.forEach((elem) => {
					if (elem.type !== 'beam' && objects.includes(elem)) {
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
