import type { Rod, GrabElem, HoverOn, KinState, RodPos, Point2, KinElem } from '$lib/types';

export function is_rod_in_elem(rod: Rod, elem: KinElem): boolean {
	switch (elem.type) {
		case 'rod':
			if (elem === rod) {
				return true;
			}
			break;
		case 'slider':
			if (elem.fixedRods.map(([rodPos, dir]) => rodPos.rod).includes(rod)) {
				return true;
			}
			if (elem.slideRod === rod) {
				return true;
			}
			break;
		case 'slidep':
			if (elem.rotRods.map((rodPos) => rodPos.rod).includes(rod)) {
				return true;
			}
			if (elem.slideRod === rod) {
				return true;
			}
			break;
		case 'pivot':
			if (elem.rotRods.map((rodPos) => rodPos.rod).includes(rod)) {
				return true;
			}
			break;
		case 'fixation':
			if (elem.fixedRods.map(([rodPos, dir]) => rodPos.rod).includes(rod)) {
				return true;
			}
	}
	return false;
}

/**
 * Translates a rod keeping if parallel.
 */
export function translate_rod(rodPos: RodPos, target: Point2) {
	let delta = target.sub(rodPos.get_pos());
	rodPos.rod.a.update(rodPos.rod.a.add(delta));
	rodPos.rod.b.update(rodPos.rod.b.add(delta));
}

/**
 * Moves a rod towards a point.
 */
export function pull_rod(rod: Rod, target: Point2) {
	pull_rod_pos(rod.closest_rod_pos(target), target);
}

/**
 * Moves a rod position towards a point.
 *
 * Calculates the movement with smallest energy.
 */
export function pull_rod_pos(rodPos: RodPos, target: Point2) {
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

/**
 * Rotates the rod around its center to be aligned and then moves it to the line.
 */
export function pull_rod_to_line(rod: Rod, point: Point2, dir: Point2) {
	let center = rod.a.add(rod.b).div(2);
	let centerToPoint = point.sub(center);
	let delta = centerToPoint.project(dir.perp());
	let angle = dir.angle_rad() - rod.b.sub(rod.a).angle_rad();

	let center_to_a = rod.a.sub(center);
	let center_to_b = rod.b.sub(center);

	rod.a.update(center.add(delta).add(center_to_a.rotate_rad(angle)));
	rod.b.update(center.add(delta).add(center_to_b.rotate_rad(angle)));
}

export function pull_rod_by_end(rod: Rod, target: Point2, isEnd: boolean) {
	let l = rod.a.distance_to(rod.b);
	if (isEnd) {
		rod.b.update(target);
		rod.a.update(target.sub(target.sub(rod.a).normalize().mul(l)));
	} else {
		rod.a.update(target);
		rod.b.update(target.sub(target.sub(rod.b).normalize().mul(l)));
	}
}

export function rotate_rod(rod: Rod, angle: number) {
	let center = rod.a.add(rod.b).div(2);
	let center_to_a = rod.a.sub(center);
	let center_to_b = rod.b.sub(center);
	rod.a.update(center.add(center_to_a.rotate_deg(angle)));
	rod.b.update(center.add(center_to_b.rotate_deg(angle)));
}

/**
 * Removes the hovered object from the kinematic space
 */
export function erase(kinState: KinState, hoverOn: HoverOn) {
	// TODO : delete to much rod objects
	switch (hoverOn.type) {
		case 'rod pos':
		case 'rod end':
			let rod = hoverOn.type == 'rod pos' ? hoverOn.rodPos.rod : hoverOn.rod;
			let deletedRod = kinState.rods.splice(kinState.rods.indexOf(rod), 1)[0];
			deletedRod.objects.forEach(([object, k]) => {
				switch (object.type) {
					case 'slider':
						if (object.slideRod !== undefined) {
							object.slideRod = undefined;
						} else {
							object.fixedRods.splice(
								object.fixedRods.map((obj) => obj[0].rod).indexOf(deletedRod),
								1
							);
						}
						break;
					case 'slidep':
						if (object.slideRod !== undefined) {
							object.slideRod = undefined;
						} else {
							object.rotRods.splice(object.rotRods.map((obj) => obj.rod).indexOf(deletedRod), 1);
						}
						break;
					case 'pivot':
						object.rotRods.splice(object.rotRods.map((obj) => obj.rod).indexOf(deletedRod), 1);
						break;
					case 'fixation':
						object.fixedRods.splice(
							object.fixedRods.map((obj) => obj[0].rod).indexOf(deletedRod),
							1
						);
				}
			});
			break;
		case 'slider':
			let deletedSlider = kinState.sliders.splice(kinState.sliders.indexOf(hoverOn.object), 1)[0];
			deletedSlider.fixedRods.forEach(([rodPos, dir]) => {
				rodPos.rod.objects.splice(
					rodPos.rod.objects.map((obj) => obj[0]).indexOf(deletedSlider),
					1
				);
			});
			if (deletedSlider.slideRod !== undefined) {
				deletedSlider.slideRod.objects.splice(
					deletedSlider.slideRod.objects.map((obj) => obj[0]).indexOf(deletedSlider),
					1
				);
			}
			break;
		case 'slidep':
			let deletedSlidep = kinState.slideps.splice(kinState.slideps.indexOf(hoverOn.object), 1)[0];
			deletedSlidep.rotRods.forEach((rodPos) => {
				rodPos.rod.objects.splice(
					rodPos.rod.objects.map((obj) => obj[0]).indexOf(deletedSlidep),
					1
				);
			});
			if (deletedSlidep.slideRod !== undefined) {
				deletedSlidep.slideRod.objects.splice(
					deletedSlidep.slideRod.objects.map((obj) => obj[0]).indexOf(deletedSlidep),
					1
				);
			}
			break;
		case 'pivot':
			let deletedPivot = kinState.pivots.splice(kinState.pivots.indexOf(hoverOn.object), 1)[0];
			deletedPivot.rotRods.forEach((rodPos) => {
				rodPos.rod.objects.splice(rodPos.rod.objects.map((obj) => obj[0]).indexOf(deletedPivot), 1);
			});
			break;
		case 'fixation':
			let deletedFixation = kinState.fixations.splice(
				kinState.fixations.indexOf(hoverOn.object),
				1
			)[0];
			deletedFixation.fixedRods.forEach(([rodPos, dir]) => {
				rodPos.rod.objects.splice(
					rodPos.rod.objects.map((obj) => obj[0]).indexOf(deletedFixation),
					1
				);
			});
	}
}

/**
 * return if the hovered element is directly or indirectly grounded
 */
export function is_grounded(hoverOn: HoverOn): boolean {
	// TODO : verify chains of links (sliders and fixations)
	switch (hoverOn.type) {
		case 'rod pos':
		case 'overlapping rods':
			if (hoverOn.rodPos.rod.groundA || hoverOn.rodPos.rod.groundB) {
				return true;
			}
			break;
		case 'rod end':
			if (hoverOn.rod.groundA || hoverOn.rod.groundB) {
				return true;
			}
			break;
		case 'slider':
		case 'slidep':
		case 'pivot':
			if (hoverOn.object.ground) {
				return true;
			}
			break;
		case 'fixation':
			if (
				!hoverOn.object.fixedRods.every(
					(rodPos) => !(rodPos[0].rod.groundA || rodPos[0].rod.groundB)
				)
			) {
				return true;
			}
	}
	return false;
}
