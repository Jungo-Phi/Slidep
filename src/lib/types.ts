import { beam_coords } from "./utils";

export const TAU = 2 * Math.PI;
export const HOVER_RADIUS = 16;
export const HOVER_WIDTH = 10;


export type Slider = {
	type: 'slider';
	pos: Point;
	dir: Point;
	slideBeam: Beam | undefined;
	fixedBeams: [BeamPos, number][]; // angle (rad)
	ground: boolean;
};
export type Slidep = {
	type: 'slidep';
	pos: Point;
	dir: Point;
	slideBeam: Beam | undefined;
	rotBeams: BeamPos[];
	ground: boolean;
};
export type Pivot = { type: 'pivot'; pos: Point; rotBeams: BeamPos[]; ground: boolean };
export type Fixation = {
	type: 'fixation';
	pos: Point;
	fixedBeams: [BeamPos, number][]; // angle (rad)
};

export type KinElem = Beam | Slider | Slidep | Pivot | Fixation;
export type GrabElem = BeamPos | Slider | Slidep | Pivot | Fixation;

export type HoverOnStuff =
	| { type: 'beam pos'; beamPos: BeamPos }
	| { type: 'beam end'; beam: Beam; isEnd: boolean }
	| { type: 'slider'; object: Slider }
	| { type: 'slidep'; object: Slidep }
	| { type: 'pivot'; object: Pivot }
	| { type: 'fixation'; object: Fixation };
export type HoverOn = HoverOnStuff | { type: 'void' };

export type KinState = {
	beams: Beam[];
	sliders: Slider[];
	slideps: Slidep[];
	pivots: Pivot[];
	fixations: Fixation[];
};

export const Mode = {
	Idle: 'idle',
	Grabbing: 'grabbing',
	Animate: 'animate',
	Animating: 'animating',
	PlacingSlider: 'placing slider',
	PlacingPivot: 'placing pivot',
	PlacingBeamStart: 'placing beam start',
	PlacingBeamEnd: 'placing beam end',
	PlacingGround: 'placing ground'
} as const;


export class Beam {
	type: 'beam';
	a: Point;
	b: Point;
	groundA: boolean;
	groundB: boolean;
	objects: [Slider | Slidep | Pivot | Fixation, number][];
	id: number;

	constructor(a: Point, b: Point, id: number) {
		this.type = 'beam';
		this.a = a;
		this.b = b;
		this.groundA = false;
		this.groundB = false;
		this.objects = [];
		this.id = id;
	}

	dir(): Point {
		return this.b.sub(this.a).normalize();
	}
	angle_rad(): number {
		return this.dir().angle_rad();
	}
	/**
	 * Gets the point of k.
	 */
	k_pos(k: number): Point {
		return this.a.lerp(this.b, k);
	}
	/**
	 * Gets the position of the nearest point to the beam.
	 */
	closest_pos(pos: Point): Point {
		return this.k_pos(this.k_coord(pos));
	}
	/**
	 * Gets the BeamPos of the nearest point to the beam.
	 */
	closest_beam_pos(pos: Point): BeamPos {
		return new BeamPos(this, this.k_coord(pos));
	}
	/**
	 * Gets a point's position (k) and distance (dist) in the reference space of the beam.
	 * @return {[number, number]} [k, dist]
	 */
	coords(pos: Point): [number, number] {
		let beamVec = this.b.sub(this.a);
		let aToP = pos.sub(this.a);
		let k_vec = aToP.project(beamVec);
		let k = k_vec.x / beamVec.x;
		if (beamVec.x === 0) {
			k = k_vec.y / beamVec.y;
		}
		let dist = Math.sqrt(Math.abs(aToP.length_squared() - k_vec.length_squared()));
		return [k, dist];
	}

	/**
	 * Gets a point's position (k) in the reference space of the beam.
	 */
	k_coord(pos: Point): number {
		let beamVec = this.b.sub(this.a);
		let aToP = pos.sub(this.a);
		let k_vec = aToP.project(beamVec);
		let k = k_vec.x / beamVec.x;
		if (beamVec.x === 0) {
			k = k_vec.y / beamVec.y;
		}
		return k;
	}
	
	/**
	 * Gets a point's distance (dist) to the beam.
	 */
	distance_to(pos: Point): number {
		let beamVec = this.b.sub(this.a);
		let aToP = pos.sub(this.a);
		let k_vec = aToP.project(beamVec);
		return Math.sqrt(Math.abs(aToP.length_squared() - k_vec.length_squared()));
	}
};

export class BeamPos {
	type: 'beam pos';
	beam: Beam;
	k: number;

	constructor(beam: Beam, k: number) {
		this.type = 'beam pos';
		this.beam = beam;
		this.k = k;
	}

	get_pos(): Point {
		return this.beam.a.lerp(this.beam.b, this.k);
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
		if (this.length() === 0) {
			return new Point(1, 0);
		}
		return this.div(this.length());
	}

	update(rhs: Point) {
		this.x = rhs.x;
		this.y = rhs.y;
	}

	is_equal(rhs: Point): boolean {
		return this.x === rhs.x && this.y === rhs.y;
	}
	is_near_equal(rhs: Point): boolean {
		return this.sub(rhs).length_squared() < 1;
	}

	toString(): string {
		return `(${this.x}, ${this.y})`;
	}
}
