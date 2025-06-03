export type Node = { pos: Point; ground: boolean };
export type Beam = { nodeA: Node; nodeB: Node };
export type BeamPos = { beam: Beam; k: number };

export type Slider = { node: Node; slideBeam: Beam; fixedBeams: Array<Beam> };
export type Pivot = { node: Node; rotBeams: Array<Beam> };
export type Slidep = { node: Node; slideBeam: Beam; rotBeams: Array<Beam> };

//export type Coincidence = {node: Node, beamPos: BeamPos};
export type Fixation = { beamA: Beam; beamB: Beam };

export const TAU = 2 * Math.PI;

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

export function pull_beam(a: Point, b: Point, target: Point, k: number) {
	// Calculates the movement with smallest energy
	let l = a.sub(b).length();
	let d = target
		.mul(2 - 1 / k)
		.sub(a)
		.add(b.mul(1 / k - 1))
		.normalize();
	a.update(target.sub(d.mul(l * k)));
	b.update(target.add(d.mul(l * (1 - k))));
}

export function translate_beam(beamPos: BeamPos, target: Point) {
	let delta = target.sub(beamPos.beam.nodeA.pos.lerp(beamPos.beam.nodeB.pos, beamPos.k));
	beamPos.beam.nodeA.pos.update(beamPos.beam.nodeA.pos.add(delta));
	beamPos.beam.nodeB.pos.update(beamPos.beam.nodeB.pos.add(delta));
}

export function over_node(
	nodes: Array<Node>,
	point: Point,
	grabbedNode: Node,
	radius: number
): Node | undefined {
	let overedNode = undefined;

	for (let node of nodes) {
		let dist = node.pos.sub(point).length();
		if (dist < radius && grabbedNode != node) {
			radius = dist;
			overedNode = node;
		}
	}
	return overedNode;
}

export function over_beam(beams: Array<Beam>, point: Point, width: number): BeamPos | undefined {
	let overedBeam = undefined;

	for (let beam of beams) {
		let beamVec = beam.nodeB.pos.sub(beam.nodeA.pos);
		let aToP = point.sub(beam.nodeA.pos);
		let k_vec = aToP.project(beamVec);
		let k = k_vec.x / beamVec.x;
		let dist = Math.sqrt(aToP.length_squared() - k_vec.length_squared());
		if (dist < width && 0 < k && k < 1) {
			width = dist;
			overedBeam = { beam, k };
		}
	}
	return overedBeam;
}

/*
export function fuze_nodes(nodes, beams, sliders, pivots, slideps, grounds, coincidences, grabbedNode, node) {
    // Realocate the elements with 'grabbedNode' to 'node'
    // Remove 'grabbedNode' from 'nodes' and update components accordingly

}
*/
