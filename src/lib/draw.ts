import type { Mode, HoverOn, KinState } from '$lib/types';
import {
	MY_BACKGROUND,
	Rod,
	TAU,
	Point2,
	MY_ORANGE,
	MY_BORDER,
	MY_BLUE,
	HOVER_COLOR,
	MY_TRANSPARENT,
	MY_TRANSBORDER
} from '$lib/types';
import { get_hover_pos } from './placing-elements';
import { is_grounded } from './utils';

/**
 * Draw kinematic space
 */
export function draw_kinspace(
	ctx: CanvasRenderingContext2D,
	kinState: KinState,
	mode: Mode,
	hoverOn: HoverOn,
	pos: Point2
) {
	let hover_pos = get_hover_pos(pos, hoverOn);
	// hilight
	switch (mode.type) {
		case 'idle':
		case 'grabbing':
		case 'erase':
		case 'erasing':
		case 'placing slider':
		case 'placing pivot':
		case 'placing rod start':
		case 'placing rod end':
		case 'placing ground':
		case 'dimension constraint':
		case 'horizontal constraint':
		case 'vertical constraint':
		case 'normal constraint':
			switch (hoverOn.type) {
				case 'rod pos':
					highlight_rod(ctx, hoverOn.rodPos.rod, HOVER_COLOR);
					break;
				case 'overlapping rods':
				case 'rod end':
				case 'slider':
				case 'slidep':
				case 'pivot':
				case 'fixation':
					highlight_point(ctx, hover_pos, HOVER_COLOR);
					break;
				case 'rod-hover slider':
				case 'rod-hover slidep':
				case 'rod-hover pivot':
					highlight_point(ctx, hoverOn.object.pos, HOVER_COLOR);
			}
			break;
		case 'animate':
			if (is_grounded(hoverOn)) {
				break;
			}
			switch (hoverOn.type) {
				case 'rod pos':
				case 'overlapping rods':
					highlight_rod(ctx, hoverOn.rodPos.rod, HOVER_COLOR);
					break;
				case 'rod end':
				case 'slider':
				case 'slidep':
				case 'pivot':
				case 'fixation':
					highlight_point(ctx, hover_pos, HOVER_COLOR);
			}
			break;
		case 'animating':
			switch (mode.grabbed.type) {
				case 'rod pos':
					highlight_point(ctx, mode.grabbed.rodPos.get_pos(), HOVER_COLOR);
					break;
				case 'rod end':
					highlight_point(ctx, (mode.grabbed.isEnd) ? mode.grabbed.rod.b : mode.grabbed.rod.a, HOVER_COLOR);
					break;
				case 'slider':
				case 'slidep':
				case 'pivot':
				case 'fixation':
					highlight_point(ctx, mode.grabbed.object.pos, HOVER_COLOR);
			}
	}

	if (mode.type === 'placing ground') {
		draw_ground_placement(ctx, hoverOn, hover_pos);
	}
	// fixations bottom
	kinState.fixations.forEach((fixation) => {
		draw_fixation_bottom(ctx, fixation.pos);
	});
	if (mode.type === 'placing rod end') {
		switch (mode.startHoverOn.type) {
			case 'rod pos':
			case 'rod end':
				draw_fixation_bottom(ctx, mode.startPos);
		}
		switch (hoverOn.type) {
			case 'rod pos':
			case 'overlapping rods':
			case 'rod end':
				draw_fixation_bottom(ctx, hover_pos);
		}
	}
	// rods (+ grounds)
	kinState.rods.forEach((rod) => {
		if (rod.groundA) {
			draw_ground(ctx, rod.a, rod.dir().perp());
		}
		if (rod.groundB) {
			draw_ground(ctx, rod.b, rod.dir().perp().mul(-1));
		}
		draw_rod(ctx, rod);
	});
	// placing rod start/end
	if (mode.type === 'placing rod start') {
		if (mode.ground) {
			draw_ground(ctx, hover_pos, new Point2());
		}
		if (!pos.is_equal(hover_pos)) {
			draw_rod_start(ctx, pos, true);
		}
		draw_rod_start(ctx, hover_pos, false);
	} else if (mode.type === 'placing rod end') {
		let rod = new Rod(mode.startPos, hover_pos, 0);
		if (mode.startGround) {
			draw_ground(
				ctx,
				mode.startPos,
				hover_pos.is_equal(mode.startPos) ? new Point2() : rod.dir().perp()
			);
		}
		if (mode.ground) {
			draw_ground(ctx, pos, rod.dir().perp().mul(-1));
		}
		draw_rod(ctx, rod);
		if (!pos.is_equal(hover_pos)) {
			draw_rod_start(ctx, pos, true);
		}
	}
	// fixations top
	kinState.fixations.forEach((fixation) => {
		draw_fixation_top(ctx, fixation.pos);
	});
	if (mode.type === 'placing rod end') {
		switch (mode.startHoverOn.type) {
			case 'rod pos':
			case 'rod end':
				draw_fixation_top(ctx, mode.startPos);
		}
		switch (hoverOn.type) {
			case 'rod pos':
			case 'overlapping rods':
			case 'rod end':
				draw_fixation_top(ctx, hover_pos);
		}
	}
	// sliders (+ grounds)
	kinState.sliders.forEach((slider) => {
		let dir = slider.dir.clone();
		let fill = slider.slideRod !== undefined;
		if (hoverOn.type === 'rod-hover slider' && hoverOn.object === slider) {
			dir = hover_pos.sub(hoverOn.startPos).normalize();
			fill = true;
		}
		if (slider.ground) {
			draw_ground(ctx, slider.pos.add(dir.perp().mul(2)), dir);
		}
		draw_slider(ctx, slider.pos, dir, fill, false);
	});
	// slideps (+ grounds)
	kinState.slideps.forEach((slidep) => {
		let overDirs = slidep.rotRods.map((rodP) =>
			rodP.rod.a.is_near_equal(slidep.pos) ? rodP.rod.dir() : rodP.rod.dir().mul(-1)
		);
		if (mode.type === 'placing rod end') {
			if (mode.startHoverOn.type === 'slidep') {
				if (mode.startPos.is_near_equal(slidep.pos) && !mode.startPos.is_near_equal(hover_pos)) {
					overDirs.push(hover_pos.sub(mode.startPos));
				}
			}
			if (hoverOn.type === 'slidep') {
				if (hover_pos.is_near_equal(slidep.pos) && !mode.startPos.is_near_equal(hover_pos)) {
					overDirs.push(mode.startPos.sub(hover_pos));
				}
			}
		}
		let dir = slidep.dir.clone();
		if (hoverOn.type === 'rod-hover slidep' && hoverOn.object === slidep) {
			dir = hover_pos.sub(hoverOn.startPos).normalize();
		}
		draw_slidep(ctx, slidep.pos, dir, overDirs);
		if (slidep.ground) {
			draw_ground(ctx, slidep.pos.add(new Point2(0, 2)), new Point2());
		}
		draw_pivot(
			ctx,
			slidep.pos,
			slidep.slideRod !== undefined || slidep.rotRods.length !== 0,
			false
		);
	});
	// placing slider
	if (mode.type === 'placing slider') {
		let dir = new Point2();
		switch (hoverOn.type) {
			case 'rod pos':
			case 'overlapping rods':
				dir = hoverOn.rodPos.rod.dir();
				break;
			case 'slider':
			case 'slidep':
				dir = hoverOn.object.dir;
				break;
			case 'pivot':
				hoverOn.object.rotRods.toReversed().forEach((rodPos) => {
					if (rodPos.k !== 0 && rodPos.k !== 1) {
						dir = rodPos.rod.dir();
					}
				});
				break;
			case 'fixation':
				let fixationRod = hoverOn.object.fixedRods[0];
				if (hoverOn.object.fixedRods[0] !== null) {
					dir = fixationRod[0].rod.dir();
				}
				break;
		}
		if (mode.ground) {
			draw_ground(
				ctx,
				hover_pos.add(new Point2(0, 2)),
				hoverOn.type === 'slidep' ? new Point2() : dir
			);
		}
		if (!pos.is_equal(hover_pos)) {
			draw_slider(ctx, pos, dir, hoverOn.type === 'rod pos' || hoverOn.type === 'fixation', true);
		}
		if (!(hoverOn.type === 'slider' || hoverOn.type === 'slidep')) {
			draw_slider(
				ctx,
				hover_pos,
				dir,
				hoverOn.type === 'rod pos' || hoverOn.type === 'fixation',
				false
			);
		}
	}
	// pivots (+ grounds)
	kinState.pivots.forEach((pivot) => {
		let fill =
			pivot.rotRods.length !== 0 ||
			(hoverOn.type === 'rod-hover pivot' && hoverOn.object === pivot);
		if (pivot.ground) {
			draw_ground(ctx, pivot.pos.add(new Point2(0, 2)), new Point2());
		}
		draw_pivot(ctx, pivot.pos, fill, false);
	});
	// placing pivot
	if (mode.type === 'placing pivot') {
		if (mode.ground) {
			draw_ground(ctx, hover_pos.add(new Point2(0, 2)), new Point2());
		}
		let fill = false;
		switch (hoverOn.type) {
			case 'rod pos':
			case 'overlapping rods':
			case 'rod end':
			case 'fixation':
				fill = true;
				break;
			case 'slider':
			case 'slidep':
				fill = hoverOn.object.slideRod !== undefined;
				break;
			case 'pivot':
				fill = hoverOn.object.rotRods.length !== 0;
		}
		if (!pos.is_equal(hover_pos)) {
			draw_pivot(ctx, pos, fill, true);
		}
		draw_pivot(ctx, hover_pos, fill, false);
	}
}

/**
 * Ground an element in the kinematic space.\
 * Placing a ground on where there is already one will delete it.
 */
export function draw_ground_placement(
	ctx: CanvasRenderingContext2D,
	hoverOn: HoverOn,
	pos: Point2
) {
	let dir = new Point2(1, 0);
	bigSwitch: switch (hoverOn.type) {
		case 'rod pos':
		case 'overlapping rods':
			highlight_point(ctx, pos, MY_ORANGE);
			for (let [object, k] of hoverOn.rodPos.rod.objects) {
				if (k === +(hoverOn.rodPos.k > 0.5)) {
					switch (object.type) {
						case 'slider':
							dir = object.dir;
						case 'slidep':
						case 'pivot':
							pos = object.pos;
							break bigSwitch;
					}
				}
			}
			if (hoverOn.rodPos.k > 0.5) {
				dir = hoverOn.rodPos.rod.dir().perp().mul(-1);
				pos = hoverOn.rodPos.rod.b;
			} else {
				dir = hoverOn.rodPos.rod.dir().perp();
				pos = hoverOn.rodPos.rod.a;
			}
			break;
		case 'rod end':
			if (hoverOn.isEnd) {
				dir = hoverOn.rod.dir().perp().mul(-1);
			} else {
				dir = hoverOn.rod.dir().perp();
			}
			break;
		case 'slider':
			dir = hoverOn.object.dir;
			pos = pos.add(hoverOn.object.dir.perp().mul(2));
			break;
		case 'slidep':
		case 'pivot':
			pos = pos.add(new Point2(0, 2));
			break;
		case 'fixation':
			let closestRod = hoverOn.object.fixedRods[0][0].rod;
			let dist = Infinity;
			let aToB = true;
			hoverOn.object.fixedRods.forEach((rodPos) => {
				let newDist = rodPos[0].rod.a.distance_to(pos);
				if (newDist < dist) {
					dist = newDist;
					aToB = true;
					closestRod = rodPos[0].rod;
				}
				newDist = rodPos[0].rod.b.distance_to(pos);
				if (newDist < dist) {
					dist = newDist;
					aToB = false;
					closestRod = rodPos[0].rod;
				}
			});
			if (aToB) {
				dir = closestRod.dir().perp();
			} else {
				dir = closestRod.dir().perp().mul(-1);
			}
			break;
	}
	draw_ground(ctx, pos, dir);
}

export function highlight_point(ctx: CanvasRenderingContext2D, pos: Point2, color: string) {
	const grad = ctx.createRadialGradient(pos.x, pos.y, 4, pos.x, pos.y, 25);
	grad.addColorStop(0, color);
	grad.addColorStop(1, color + '00');
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 25, 0, TAU);
	ctx.fillStyle = grad;
	ctx.fill();
}

export function highlight_rod(ctx: CanvasRenderingContext2D, rod: Rod, color: string) {
	const width = 26;
	let delta = rod.b.sub(rod.a);
	let angle = delta.angle_rad();
	let pR = rod.a.rotate_rad(-angle);
	ctx.rotate(angle);
	const grad = ctx.createLinearGradient(pR.x, pR.y - width / 2, pR.x, pR.y + width / 2);
	grad.addColorStop(0, color + '00');
	grad.addColorStop(0.25, color);
	grad.addColorStop(0.75, color);
	grad.addColorStop(1, color + '00');
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

export function draw_fixation_bottom(ctx: CanvasRenderingContext2D, pos: Point2) {
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 8, 0, TAU);
	ctx.fillStyle = MY_BORDER;
	ctx.fill();
}

export function draw_fixation_top(ctx: CanvasRenderingContext2D, pos: Point2) {
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 6, 0, TAU);
	ctx.fillStyle = MY_BLUE;
	ctx.fill();
}

export function draw_pivot(
	ctx: CanvasRenderingContext2D,
	pos: Point2,
	fill: boolean,
	transparent: boolean
) {
	let tr = transparent ? MY_TRANSPARENT : '';
	ctx.strokeStyle = MY_BORDER + (transparent ? MY_TRANSBORDER : '');
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 8, 0, TAU);
	ctx.fillStyle = MY_ORANGE + tr;
	ctx.fill();
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 4, 0, TAU);
	ctx.fillStyle = fill ? MY_BLUE + tr : MY_BACKGROUND + tr;
	ctx.fill();
	ctx.stroke();
}

export function draw_rod_start(ctx: CanvasRenderingContext2D, pos: Point2, transparent: boolean) {
	ctx.strokeStyle = MY_BORDER + (transparent ? MY_TRANSBORDER : '');
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.rect(pos.x - 4, pos.y - 4, 8, 8);
	ctx.fillStyle = MY_BLUE + (transparent ? MY_TRANSPARENT : '');
	ctx.fill();
	ctx.stroke();
}

export function draw_rod(ctx: CanvasRenderingContext2D, rod: Rod) {
	ctx.lineCap = 'square';
	ctx.strokeStyle = MY_BORDER;
	ctx.beginPath();
	ctx.moveTo(rod.a.x, rod.a.y);
	ctx.lineTo(rod.b.x, rod.b.y);
	ctx.lineWidth = 8;
	ctx.stroke();
	ctx.strokeStyle = MY_BLUE;
	ctx.beginPath();
	ctx.moveTo(rod.a.x, rod.a.y);
	ctx.lineTo(rod.b.x, rod.b.y);
	ctx.lineWidth = 4;
	ctx.stroke();
}

export function draw_slider(
	ctx: CanvasRenderingContext2D,
	pos: Point2,
	dir: Point2,
	fill: boolean,
	transparent: boolean
) {
	let tr = transparent ? MY_TRANSPARENT : '';
	ctx.strokeStyle = MY_BORDER + (transparent ? MY_TRANSBORDER : '');
	ctx.lineWidth = 2;

	let angle = dir.angle_rad();
	let pR = pos.rotate_rad(-angle);
	ctx.rotate(angle);

	ctx.beginPath();
	ctx.roundRect(pR.x - 12, pR.y - 7, 24, 14, [2]);
	ctx.fillStyle = MY_ORANGE + tr;
	ctx.fill();
	ctx.stroke();

	ctx.beginPath();
	ctx.rect(pR.x - 7, pR.y - 3, 14, 6);
	ctx.fillStyle = fill ? MY_BLUE + tr : MY_BACKGROUND + tr;
	ctx.fill();
	ctx.stroke();

	ctx.rotate(-angle);
}

export function draw_slidep(
	ctx: CanvasRenderingContext2D,
	pos: Point2,
	dir: Point2,
	overDirs: Point2[]
) {
	ctx.strokeStyle = MY_BORDER;
	ctx.lineWidth = 2;

	let angle = dir.angle_rad();
	let pR = pos.rotate_rad(-angle);
	ctx.rotate(angle);

	ctx.beginPath();
	ctx.roundRect(pR.x - 12, pR.y - 7, 4, 14, [2, 0, 0, 2]);
	ctx.fill();
	ctx.stroke();
	ctx.beginPath();
	ctx.roundRect(pR.x + 8, pR.y - 7, 4, 14, [0, 2, 2, 0]);
	ctx.fill();
	ctx.stroke();

	ctx.fillStyle = MY_ORANGE;
	ctx.fillRect(pR.x - 11, pR.y - 6, 22, 12);
	ctx.fillStyle = '#ffbe80b0';
	ctx.fillRect(pR.x - 8, pR.y - 7, 16, 14);

	ctx.rotate(-angle);

	ctx.lineCap = 'butt';
	for (let overDir of overDirs) {
		let b = pos.add(overDir.normalize().mul(15));
		ctx.strokeStyle = MY_BORDER;
		ctx.beginPath();
		ctx.moveTo(pos.x, pos.y);
		ctx.lineTo(b.x, b.y);
		ctx.lineWidth = 8;
		ctx.stroke();
		b = pos.add(overDir.normalize().mul(16));
		ctx.strokeStyle = MY_BLUE;
		ctx.beginPath();
		ctx.moveTo(pos.x, pos.y);
		ctx.lineTo(b.x, b.y);
		ctx.lineWidth = 4;
		ctx.stroke();
	}
}

export function draw_ground(ctx: CanvasRenderingContext2D, pos: Point2, dir: Point2) {
	let angle = dir.angle_rad();
	let pR = pos.rotate_rad(-angle).add(new Point2(0, 4));
	ctx.rotate(angle);

	ctx.strokeStyle = MY_BORDER;
	ctx.lineCap = 'butt';
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(pR.x, pR.y);
	ctx.lineTo(pR.x, pR.y + 6);
	ctx.stroke();

	ctx.lineCap = 'round';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(pR.x - 12, pR.y + 6.5);
	ctx.lineTo(pR.x + 12, pR.y + 6.5);
	ctx.moveTo(pR.x - 12, pR.y + 7);
	ctx.lineTo(pR.x - 6, pR.y + 16);
	ctx.moveTo(pR.x - 6, pR.y + 7);
	ctx.lineTo(pR.x, pR.y + 16);
	ctx.moveTo(pR.x, pR.y + 7);
	ctx.lineTo(pR.x + 6, pR.y + 16);
	ctx.moveTo(pR.x + 6, pR.y + 7);
	ctx.lineTo(pR.x + 12, pR.y + 16);
	ctx.stroke();

	ctx.rotate(-angle);
}
