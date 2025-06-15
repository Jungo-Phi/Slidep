export type Beam = {
	type: 'beam';
	a: Point;
	b: Point;
	groundA: boolean;
	groundB: boolean;
	objects: Array<[Slider | Slidep | Pivot | Fixation, number]>;
	id: number;
};

export type Slider = {
	type: 'slider';
	pos: Point;
	slideBeam: Beam | undefined;
	fixedBeams: Array<BeamPos>;
	ground: boolean;
};
export type Slidep = {
	type: 'slidep';
	pos: Point;
	slideBeam: Beam | undefined;
	rotBeams: Array<BeamPos>;
	ground: boolean;
};
export type Pivot = { type: 'pivot'; pos: Point; rotBeams: Array<BeamPos>; ground: boolean };
export type Fixation = { type: 'fixation'; pos: Point; fixedBeams: Array<BeamPos> };

export const TAU = 2 * Math.PI;

export class BeamPos {
	beam: Beam;
	k: number;

	constructor(beam: Beam, k: number) {
		this.beam = beam;
		this.k = k;
	}

	get_pos(): Point {
		return this.beam.a.lerp(this.beam.b, this.k);
	}
}

export class Node {
	pos: Point;
	beams: Array<Beam>;
	object: Slider | Slidep | Pivot | Fixation | null;

	constructor(
		pos: Point,
		beams: Array<Beam> = [],
		object: Slider | Slidep | Pivot | Fixation | null = null
	) {
		this.pos = pos;
		this.beams = beams;
		this.object = object;
	}

	toString(): string {
		return `(${this.pos}, ${this.beams.map((beam) => '[' + beam.a + ' ' + beam.b + ']')}, ${this.object})`;
	}
}

export class Point {
	x: number;
	y: number;

	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	clone(): Point {
		return new Point(this.x, this.y);
	}

	add(rhs: Point): Point {
		return new Point(this.x + rhs.x, this.y + rhs.y);
	}
	sub(rhs: Point): Point {
		return new Point(this.x - rhs.x, this.y - rhs.y);
	}
	mul(rhs: number): Point {
		return new Point(this.x * rhs, this.y * rhs);
	}
	div(rhs: number): Point {
		return new Point(this.x / rhs, this.y / rhs);
	}
	lerp(rhs: Point, t: number): Point {
		return this.mul(1 - t).add(rhs.mul(t));
	}
	distance_to(rhs: Point): number {
		return this.sub(rhs).length();
	}
	perp(): Point {
		return new Point(-this.y, this.x);
	}

	length(): number {
		return Math.sqrt(this.x ** 2 + this.y ** 2);
	}
	length_squared(): number {
		return this.x ** 2 + this.y ** 2;
	}
	angle_rad(): number {
		return Math.atan2(this.y, this.x);
	}
	angle_deg(): number {
		return (Math.atan2(this.y, this.x) * 360) / TAU;
	}
	rotate_rad(angle: number): Point {
		return new Point(
			this.x * Math.cos(angle) - this.y * Math.sin(angle),
			this.x * Math.sin(angle) + this.y * Math.cos(angle)
		);
	}
	rotate_deg(angle: number): Point {
		return new Point(
			this.x * Math.cos((angle * TAU) / 360) - this.y * Math.sin((angle * TAU) / 360),
			this.x * Math.sin((angle * TAU) / 360) + this.y * Math.cos((angle * TAU) / 360)
		);
	}

	dot(rhs: Point): number {
		return this.x * rhs.x + this.y * rhs.y;
	}
	project(rhs: Point): Point {
		return rhs.mul(this.dot(rhs) / rhs.length_squared());
	}
	normalize(): Point {
		if (this.length() == 0) {
			return new Point(1, 0);
		}
		return this.div(this.length());
	}

	update(rhs: Point) {
		this.x = rhs.x;
		this.y = rhs.y;
	}

	is_equal(rhs: Point): boolean {
		return this.x == rhs.x && this.y == rhs.y;
	}

	toString(): string {
		return `(${this.x}, ${this.y})`;
	}
}

export function translate_beam(beamPos: BeamPos, target: Point) {
	let delta = target.sub(beamPos.get_pos());
	beamPos.beam.a.update(beamPos.beam.a.add(delta));
	beamPos.beam.b.update(beamPos.beam.b.add(delta));
}

export function pull_beam(beamPos: BeamPos, target: Point) {
	// Calculates the movement with smallest energy
	if (beamPos.k == 0) {
		pull_beam_by_end(beamPos.beam, target, false);
		return;
	} else if (beamPos.k == 1) {
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

export function over_node(
	beams: Array<Beam>,
	sliders: Array<Slider>,
	slideps: Array<Slidep>,
	pivots: Array<Pivot>,
	fixations: Array<Fixation>,
	point: Point,
	radius: number,
	ignoreNode: Node | undefined = undefined
): Node | undefined {
	let pos = undefined;
	for (let beam of beams) {
		if (ignoreNode != undefined && ignoreNode.beams.includes(beam)) {
			continue;
		}
		let dist = beam.a.distance_to(point);
		if (dist < radius) {
			radius = dist;
			pos = beam.a;
		}
		dist = beam.b.distance_to(point);
		if (dist < radius) {
			radius = dist;
			pos = beam.b;
		}
	}
	for (let slider of sliders) {
		if (ignoreNode != undefined && slider === ignoreNode.object) {
			continue;
		}
		let dist = slider.pos.distance_to(point);
		if (dist < radius) {
			radius = dist;
			pos = slider.pos;
		}
	}
	for (let slidep of slideps) {
		if (ignoreNode != undefined && slidep === ignoreNode.object) {
			continue;
		}
		let dist = slidep.pos.distance_to(point);
		if (dist < radius) {
			radius = dist;
			pos = slidep.pos;
		}
	}
	for (let pivot of pivots) {
		if (ignoreNode != undefined && pivot === ignoreNode.object) {
			continue;
		}
		let dist = pivot.pos.distance_to(point);
		if (dist < radius) {
			radius = dist;
			pos = pivot.pos;
		}
	}
	for (let fixation of fixations) {
		if (ignoreNode != undefined && fixation === ignoreNode.object) {
			continue;
		}
		let dist = fixation.pos.distance_to(point);
		if (dist < radius) {
			radius = dist;
			pos = fixation.pos;
		}
	}

	if (pos == undefined) {
		return undefined;
	}

	let node = new Node(pos);
	for (let beam of beams) {
		if (node.pos.is_equal(beam.a) || node.pos.is_equal(beam.b)) {
			node.beams.push(beam);
		}
	}
	for (let slider of sliders) {
		if (node.pos.is_equal(slider.pos)) {
			node.object = slider;
		}
	}
	for (let slidep of slideps) {
		if (node.pos.is_equal(slidep.pos)) {
			node.object = slidep;
		}
	}
	for (let pivot of pivots) {
		if (node.pos.is_equal(pivot.pos)) {
			node.object = pivot;
		}
	}
	for (let fixation of fixations) {
		if (node.pos.is_equal(fixation.pos)) {
			node.object = fixation;
		}
	}
	return node;
}

export function over_beam(
	beams: Array<Beam>,
	point: Point,
	width: number,
	ignoreNode: Node | undefined = undefined,
	ignoreBeam: BeamPos | undefined = undefined
): BeamPos | undefined {
	let overedBeam = undefined;

	for (let beam of beams) {
		let [k, dist] = beam_coords(beam, point);
		if (dist < width && 0 < k && k < 1) {
			width = dist;
			if (
				!(ignoreNode != undefined && ignoreNode.beams.includes(beam)) &&
				!(ignoreBeam != undefined && ignoreBeam.beam === beam)
			) {
				overedBeam = new BeamPos(beam, k);
			}
		}
	}
	return overedBeam;
}

export function beam_coords(beam: Beam, point: Point): [number, number] {
	let beamVec = beam.b.sub(beam.a);
	let aToP = point.sub(beam.a);
	let k_vec = aToP.project(beamVec);
	let k = k_vec.x / beamVec.x;
	if (beamVec.x == 0) {
		k = k_vec.y / beamVec.y;
	}
	let dist = Math.sqrt(Math.abs(aToP.length_squared() - k_vec.length_squared()));
	return [k, dist];
}

/**
 * Do stuff.
 * @param {number} A A.
 * @return {number} error
 */
export function get_error(
	sliders: Array<Slider>,
	slideps: Array<Slidep>,
	pivots: Array<Pivot>,
	fixations: Array<Fixation>
): number {
	let error = 0;
	sliders.forEach((slider) => {
		if (slider.slideBeam != undefined) {
			error += beam_coords(slider.slideBeam, slider.pos)[1];
		}
		slider.fixedBeams.forEach((beamPos) => {
			error += slider.pos.distance_to(beamPos.get_pos());
		});
	});
	slideps.forEach((slidep) => {
		if (slidep.slideBeam != undefined) {
			error += beam_coords(slidep.slideBeam, slidep.pos)[1];
		}
		slidep.rotBeams.forEach((beamPos) => {
			error += slidep.pos.distance_to(beamPos.get_pos());
		});
	});
	pivots.forEach((pivot) => {
		pivot.rotBeams.forEach((beamPos) => {
			error += pivot.pos.distance_to(beamPos.get_pos());
		});
	});
	fixations.forEach((fixation) => {
		fixation.fixedBeams.forEach((beamPos) => {
			error += fixation.pos.distance_to(beamPos.get_pos());
		});
	});
	return error;
}

/**
 * Apply Constrain
 * @param {number} A A.
 */
export function apply_constrain(element: Beam | Slider | Slidep | Pivot | Fixation) {
	// Beam : Pull connected Object
	// Object : Pull Beams by appling constrains
	switch (element.type) { // Ignore GROUND ?
		case 'beam':
			element.objects.forEach(object => {
				object[0].pos.update(element.a.lerp(element.b, object[1]));
			});
			break;
		case 'slider':
			break;
		case 'slidep':
			break;
		case 'pivot':
			for (let beamPos of element.rotBeams) {
				// if (ignoreBeams.includes(beamPos.beam)) { continue; }
				pull_beam(beamPos, element.pos);
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
export function get_elements(elements: Array<Beam | Slider | Slidep | Pivot | Fixation>): Array<Beam | Slider | Slidep | Pivot | Fixation> {
	elements.forEach(element => {
		switch (element.type) {
			case 'beam':
				for (let object of element.objects) {
					if (elements.includes(object[0])) { continue; }
					elements.push(object[0]);
					elements = get_elements(elements);
				}
				break;
			case 'slider':
				break;
			case 'slidep':
				break;
			case 'pivot':
				for (let beamPos of element.rotBeams) {
					if (elements.includes(beamPos.beam)) { continue; }
					elements.push(beamPos.beam);
					elements = get_elements(elements);
				}
				break;
			case 'fixation':
				break;
		}
	});
	return elements
}

/**
 * Generate list of actions from elements to apply all constrains.\
 * For each beam : (constrain, beam, constrain).
 */
export function get_actions(elements: Array<Beam | Slider | Slidep | Pivot | Fixation>): Array<Beam | Slider | Slidep | Pivot | Fixation> {
	let actions: Array<Beam | Slider | Slidep | Pivot | Fixation> = [];
	elements.forEach(element => {
		switch (element.type) {
			case 'beam':
				let objects = element.objects.map(object => {return object[0]});
				// Sort objects with elements
				let first = true;
				elements.forEach(elem => {
					if (elem.type != 'beam' && objects.includes(elem)) {
						actions.push(elem);
						if (first) {
							actions.push(element);
							first = false;
						}
					}
				})
				/*
				for (let i = 0; i < objects.length; i ++) {
					actions.push(objects[i]);
					if (i == 0) {
						actions.push(element);
					}
				}
				*/
		}
	});
	return actions
}