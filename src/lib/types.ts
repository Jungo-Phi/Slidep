export const TAU = 2 * Math.PI;
export const HOVER_RADIUS = 16;
export const HOVER_WIDTH = 10;

export const MY_ORANGE = '#ffbe80';
export const MY_RED = '#db5000';
export const MY_BLUE = '#b7e2ff';
export const MY_BORDER = '#001d59';
export const MY_BACKGROUND = '#ffedc6';

export const HOVER_COLOR = '#ffbe80';
export const ERROR_COLOR = '#ffa080';
export const MY_TRANSPARENT = '60';
export const MY_TRANSBORDER = '40';

export type Mode =
	| { type: 'idle' }
	| { type: 'dragging'; grabbed: GrabElem }
	| { type: 'animate' }
	| { type: 'animating'; grabbed: GrabElem }
	| { type: 'erase' }
	| { type: 'erasing' }
	| { type: 'placing slider'; ground: boolean }
	| { type: 'placing pivot'; ground: boolean }
	| { type: 'placing rod start'; ground: boolean }
	| {
			type: 'placing rod end';
			startPos: Point2;
			startHoverOn: HoverOn;
			startGround: boolean;
			ground: boolean;
	  }
	| { type: 'placing ground' }
	| { type: 'dimension constraint' }
	| { type: 'horizontal constraint' }
	| { type: 'vertical constraint' }
	| { type: 'normal constraint' };

export type Slider = {
	type: 'slider';
	pos: Point2;
	dir: Point2;
	dirOrigin: Point2;
	slideRod: Rod | undefined;
	fixedRods: [RodPos, Point2][];
	ground: boolean;
};
export type Slidep = {
	type: 'slidep';
	pos: Point2;
	dir: Point2;
	slideRod: Rod | undefined;
	rotRods: RodPos[];
	ground: boolean;
};
export type Pivot = { type: 'pivot'; pos: Point2; rotRods: RodPos[]; ground: boolean };
export type Fixation = {
	type: 'fixation';
	pos: Point2;
	fixedRods: [RodPos, Point2][];
};

export type KinObject = Slider | Slidep | Pivot | Fixation;
export type KinElem = Rod | KinObject;
export type GrabElem = RodPos | KinObject;

export type HoverOn =
	| { type: 'void' }
	| { type: 'rod pos'; rodPos: RodPos }
	| { type: 'overlapping rods'; rodPos: RodPos; rodsPositions: RodPos[] }
	| { type: 'rod end'; rod: Rod; isEnd: boolean }
	| { type: 'slider'; object: Slider }
	| { type: 'slidep'; object: Slidep }
	| { type: 'pivot'; object: Pivot }
	| { type: 'fixation'; object: Fixation }
	| { type: 'rod-hover slider'; startPos: Point2; object: Slider }
	| { type: 'rod-hover slidep'; startPos: Point2; object: Slidep };

export type KinState = {
	rods: Rod[];
	sliders: Slider[];
	slideps: Slidep[];
	pivots: Pivot[];
	fixations: Fixation[];
};

export class Rod {
	type: 'rod';
	a: Point2;
	b: Point2;
	groundA: boolean;
	groundB: boolean;
	objects: [KinObject, number][];
	id: number;

	constructor(a: Point2, b: Point2, id: number) {
		this.type = 'rod';
		this.a = a;
		this.b = b;
		this.groundA = false;
		this.groundB = false;
		this.objects = [];
		this.id = id;
	}

	dir(): Point2 {
		return this.b.sub(this.a).normalize();
	}
	/**
	 * Gets the point of k.
	 */
	k_pos(k: number): Point2 {
		return this.a.lerp(this.b, k);
	}
	/**
	 * Gets the RodPos of k.
	 */
	rod_pos(k: number): RodPos {
		return new RodPos(this, k);
	}
	/**
	 * Gets the position of the nearest point to the rod.
	 */
	closest_pos(pos: Point2): Point2 {
		return this.k_pos(this.k_coord(pos));
	}
	/**
	 * Gets the RodPos of the nearest point to the rod.
	 */
	closest_rod_pos(pos: Point2): RodPos {
		return new RodPos(this, this.k_coord(pos));
	}
	/**
	 * Gets the RodPos of the intersection with another rod.
	 */
	intersection_rod_pos(rod: Rod): RodPos {
		let a = this.a.sub(rod.a);
		let b = rod.b.sub(rod.a);
		let c = this.b.sub(this.a);
		let d = rod.b.sub(rod.a);
		let k = (a.x / b.x - a.y / b.y) / (c.y / d.y - c.x / d.x);
		if (k === Infinity) {
			k = (a.y / b.y - a.x / b.x) / (c.x / d.x - c.y / d.y);
		}
		// let k2 = c.x / d.x * k1 + a.x / b.x;
		return new RodPos(this, k);
	}
	/**
	 * Gets a point's position (k) and distance (dist) in the reference space of the rod.
	 * @return {[number, number]} [k, dist]
	 */
	coords(pos: Point2): [number, number] {
		let rodVec = this.b.sub(this.a);
		let aToP = pos.sub(this.a);
		let k_vec = aToP.project(rodVec);
		let k = k_vec.x / rodVec.x;
		if (k === Infinity) {
			k = k_vec.y / rodVec.y;
		}
		let dist = Math.sqrt(Math.abs(aToP.length_squared() - k_vec.length_squared()));
		return [k, dist];
	}

	/**
	 * Gets a point's position (k) in the reference space of the rod.
	 */
	k_coord(pos: Point2): number {
		return this.coords(pos)[0];
	}

	/**
	 * Gets a point's distance (dist) to the rod.
	 */
	distance_to(pos: Point2): number {
		return this.coords(pos)[1];
	}
}

export class RodPos {
	type: 'rod pos';
	rod: Rod;
	k: number;

	constructor(rod: Rod, k: number) {
		this.type = 'rod pos';
		this.rod = rod;
		this.k = k;
	}

	get_pos(): Point2 {
		return this.rod.a.lerp(this.rod.b, this.k);
	}
}

export class Point2 {
	x: number;
	y: number;

	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	clone(): Point2 {
		return new Point2(this.x, this.y);
	}

	add(rhs: Point2): Point2 {
		return new Point2(this.x + rhs.x, this.y + rhs.y);
	}
	sub(rhs: Point2): Point2 {
		return new Point2(this.x - rhs.x, this.y - rhs.y);
	}
	mul(rhs: number): Point2 {
		return new Point2(this.x * rhs, this.y * rhs);
	}
	div(rhs: number): Point2 {
		if (rhs === 0) {
			return new Point2(0, 0);
		}
		return new Point2(this.x / rhs, this.y / rhs);
	}
	lerp(rhs: Point2, t: number): Point2 {
		return this.mul(1 - t).add(rhs.mul(t));
	}
	distance_to(rhs: Point2): number {
		return this.sub(rhs).length();
	}
	perp(): Point2 {
		return new Point2(-this.y, this.x);
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
	rotate_rad(angle: number): Point2 {
		return new Point2(
			this.x * Math.cos(angle) - this.y * Math.sin(angle),
			this.x * Math.sin(angle) + this.y * Math.cos(angle)
		);
	}
	rotate_deg(angle: number): Point2 {
		return new Point2(
			this.x * Math.cos((angle * TAU) / 360) - this.y * Math.sin((angle * TAU) / 360),
			this.x * Math.sin((angle * TAU) / 360) + this.y * Math.cos((angle * TAU) / 360)
		);
	}

	dot(rhs: Point2): number {
		return this.x * rhs.x + this.y * rhs.y;
	}
	project(rhs: Point2): Point2 {
		return rhs.mul(this.dot(rhs) / rhs.length_squared());
	}
	normalize(): Point2 {
		if (this.length() === 0) {
			return new Point2(1, 0);
		}
		return this.div(this.length());
	}

	update(rhs: Point2) {
		this.x = rhs.x;
		this.y = rhs.y;
	}

	is_equal(rhs: Point2): boolean {
		return this.x === rhs.x && this.y === rhs.y;
	}
	is_near_equal(rhs: Point2): boolean {
		return this.sub(rhs).length_squared() < 1;
	}

	toString(): string {
		return `(${this.x}, ${this.y})`;
	}
}
