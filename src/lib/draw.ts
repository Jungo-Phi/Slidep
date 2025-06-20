import type { Beam, HoverOn } from '$lib/types';
import { TAU, Point } from '$lib/types';

/**
 * Ground an element in the kinematic space.\
 * Placing a ground on where there is already one will delete it.
 */
export function draw_ground_placement(ctx: CanvasRenderingContext2D, hoverOn: HoverOn, pos: Point) {
	let dir = new Point(1, 0);
	bigSwitch: switch (hoverOn.type) {
		case 'beam pos':
			highlight_node(ctx, pos);
			for (let object of hoverOn.beamPos.beam.objects) {
				if (object[1] === +(hoverOn.beamPos.k > 0.5)) {
					switch (object[0].type) {
						case 'slider':
						case 'slidep':
						case 'pivot':
							pos = object[0].pos;
							break bigSwitch;
					}
				}
			}
			if (hoverOn.beamPos.k > 0.5) {
				dir = hoverOn.beamPos.beam.dir().perp().mul(-1);
				pos = hoverOn.beamPos.beam.b;
			} else {
				dir = hoverOn.beamPos.beam.dir().perp();
				pos = hoverOn.beamPos.beam.a;
			}
			break;
		case 'beam end':
			if (hoverOn.isEnd) {
				dir = hoverOn.beam.dir().perp().mul(-1);
			} else {
				dir = hoverOn.beam.dir().perp();
			}
			break;
		case 'slider':
			if (hoverOn.object.slideBeam !== undefined) {
				dir = hoverOn.object.slideBeam.dir();
			}
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
				dir = closestBeam.dir().perp();
			} else {
				dir = closestBeam.dir().perp().mul(-1);
			}
			break;
	}
	draw_ground(ctx, pos, dir);
}

export function highlight_node(ctx: CanvasRenderingContext2D, pos: Point) {
	const grad = ctx.createRadialGradient(pos.x, pos.y, 4, pos.x, pos.y, 25);
	grad.addColorStop(0, '#ffbe80');
	grad.addColorStop(1, '#ffbe8000');
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 25, 0, TAU);
	ctx.fillStyle = grad;
	ctx.fill();
}

export function highlight_beam(ctx: CanvasRenderingContext2D, beam: Beam) {
	const width = 26;
	let delta = beam.dir();
	let angle = delta.angle_rad();
	let pR = beam.a.rotate_rad(-angle);
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

export function draw_fixation_bottom(ctx: CanvasRenderingContext2D, pos: Point) {
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 8, 0, TAU);
	ctx.fillStyle = '#001d59';
	ctx.fill();
}

export function draw_fixation_top(ctx: CanvasRenderingContext2D, pos: Point) {
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 6, 0, TAU);
	ctx.fillStyle = '#b7e2ff';
	ctx.fill();
}

export function draw_pivot(ctx: CanvasRenderingContext2D, pos: Point) {
	ctx.strokeStyle = '#001d59';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 8, 0, TAU);
	ctx.fillStyle = '#ffbe80';
	ctx.fill();
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, 4, 0, TAU);
	ctx.fillStyle = '#b7e2ff';
	ctx.fill();
	ctx.stroke();
}

export function draw_beam(ctx: CanvasRenderingContext2D, beam: Beam) {
	ctx.lineCap = 'square';
	ctx.strokeStyle = '#001d59';
	ctx.beginPath();
	ctx.moveTo(beam.a.x, beam.a.y);
	ctx.lineTo(beam.b.x, beam.b.y);
	ctx.lineWidth = 8;
	ctx.stroke();
	ctx.strokeStyle = '#b7e2ff';
	ctx.beginPath();
	ctx.moveTo(beam.a.x, beam.a.y);
	ctx.lineTo(beam.b.x, beam.b.y);
	ctx.lineWidth = 4;
	ctx.stroke();
}

export function draw_slider(ctx: CanvasRenderingContext2D, pos: Point, dir: Point) {
	ctx.strokeStyle = '#001d59';
	ctx.lineWidth = 2;

	let angle = dir.angle_rad();
	let pR = pos.rotate_rad(-angle);
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

export function draw_slidep(
	ctx: CanvasRenderingContext2D,
	pos: Point,
	dir: Point,
	overDirs: Point[]
) {
	ctx.strokeStyle = '#001d59';
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

	ctx.fillStyle = '#ffbe80';
	ctx.fillRect(pR.x - 11, pR.y - 6, 22, 12);
	ctx.fillStyle = '#ffbe80b0';
	ctx.fillRect(pR.x - 8, pR.y - 7, 16, 14);

	ctx.rotate(-angle);

	ctx.lineCap = 'butt';
	for (let overDir of overDirs) {
		let b = pos.add(overDir.normalize().mul(15));
		ctx.strokeStyle = '#001d59';
		ctx.beginPath();
		ctx.moveTo(pos.x, pos.y);
		ctx.lineTo(b.x, b.y);
		ctx.lineWidth = 8;
		ctx.stroke();
		b = pos.add(overDir.normalize().mul(16));
		ctx.strokeStyle = '#b7e2ff';
		ctx.beginPath();
		ctx.moveTo(pos.x, pos.y);
		ctx.lineTo(b.x, b.y);
		ctx.lineWidth = 4;
		ctx.stroke();
	}
}

export function draw_ground(ctx: CanvasRenderingContext2D, pos: Point, dir: Point) {
	let angle = dir.angle_rad();
	let pR = pos.rotate_rad(-angle).add(new Point(0, 4));
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
