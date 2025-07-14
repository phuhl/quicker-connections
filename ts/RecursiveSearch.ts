import { liangBarsky } from "./liangBarsky.js";
import {
	BoundingBox,
	DOWN,
	LEFT,
	Node,
	Point,
	Pos,
	RIGHT,
	UP,
} from "./utils/types.js";

const getMnhDist = (a: Point, b: Point) => {
	return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
};

const getPathMnhDist = (path: Point[]) => {
	let dist = 0;
	for (let i = 0; i < path.length - 1; ++i) {
		dist += getMnhDist(path[i], path[i + 1]);
	}
	return dist;
};

const WRONG_DIR_MAX_DIST = 1000;
const ABORT_DIST = 1000;

type Candidate = {
	positionFrom: Point;
	fullyVisited: boolean;
	position: Point;
	price: number;
	targetEstimate: number;
};

export class RecursiveSearch {
	positionsVisited = {} as Record<string, Point>;

	candidates = [] as Candidate[];
	targetFoundPrice = Number.MAX_SAFE_INTEGER;

	constructor(
		private startPos: Point,
		private endPos: Point,
		private nodes: Node[]
	) {}

	public run(): Point[] | null {
		return this.search(this.startPos);
	}

	private search(currentPos: Point): Point[] | null {
		console.log("search");

		this.candidates.push({
			position: currentPos,
			fullyVisited: true,
			positionFrom: currentPos,
			price: 0,
			targetEstimate: getMnhDist(currentPos, this.endPos),
		});

		let pathFound = false as false | Point[];

		while (this.candidates.length > 0) {
			const candidate = this.candidates.shift()!;
			pathFound = this.findCandidates(candidate, candidate.price);

			if (pathFound) {
				//				return pathFound;
				this.candidates = this.candidates.filter(
					(p) => p.price + p.targetEstimate < this.targetFoundPrice
				);
			}
			this.candidates.sort((a, b) => a.targetEstimate - b.targetEstimate);
			this.candidates.sort(
				(a, b) => a.price + a.targetEstimate - (b.price + b.targetEstimate)
			);
		}
		return pathFound || null;
	}

	findCandidates(currentCandidate: Candidate, price: number) {
		if (!currentCandidate.fullyVisited) {
			// calculate actual candidats from potential candidat
			this.checkCandidate(
				currentCandidate.positionFrom,
				currentCandidate.position,
				price
			);
			return false;
		}

		const currentPos = currentCandidate.position;

		if (currentPos[0] === this.endPos[0] && currentPos[1] === this.endPos[1]) {
			this.targetFoundPrice = currentCandidate.price;
			return this.constructPath(currentPos);
		}

		const dirX = Math.sign(this.endPos[0] - currentPos[0]);
		const dirY = Math.sign(this.endPos[1] - currentPos[1]);

		const candidates = [
			[currentPos[0], this.endPos[1]],
			[this.endPos[0], currentPos[1]],
			[currentPos[0], currentPos[1] - WRONG_DIR_MAX_DIST * dirY],
			[currentPos[0] - WRONG_DIR_MAX_DIST * dirX, currentPos[1]],
		] as Point[];

		for (const candidate of candidates) {
			const key = this.getPointKey(candidate);
			if (this.positionsVisited[key]) {
				continue;
			}

			this.candidates.push({
				position: candidate,
				fullyVisited: false,
				positionFrom: currentPos,
				price: getMnhDist(currentPos, candidate) + price,
				targetEstimate: getMnhDist(candidate, this.endPos),
			});
		}

		return false;
	}

	checkCandidate(currentPos: Point, candidate: Point, price: number) {
		const candidates = [] as Point[];
		const blockingNode = this.testPath([currentPos, candidate as Point]);
		const horizontal = currentPos[1] === candidate[1];
		let blockingNodePos: Point | null = null;
		if (blockingNode) {
			if (horizontal) {
				blockingNodePos =
					Math.abs(currentPos[0] - blockingNode.node.linesArea[LEFT]) >
					Math.abs(currentPos[0] - blockingNode.node.linesArea[RIGHT])
						? [blockingNode.node.linesArea[RIGHT], currentPos[1]]
						: [blockingNode.node.linesArea[LEFT], currentPos[1]];
			} else {
				blockingNodePos =
					Math.abs(currentPos[1] - blockingNode.node.linesArea[UP]) >
					Math.abs(currentPos[1] - blockingNode.node.linesArea[DOWN])
						? [currentPos[0], blockingNode.node.linesArea[DOWN]]
						: [currentPos[0], blockingNode.node.linesArea[UP]];
			}
		}

		for (const cOnLine of this.findCandidatesOnLine(
			currentPos,
			blockingNode ? (blockingNodePos as Point) : (candidate as Point)
		)) {
			const key = this.getPointKey(cOnLine as Point);
			if (
				this.positionsVisited[key] ||
				getMnhDist(this.endPos, cOnLine) > ABORT_DIST
			) {
				continue;
			}
			this.positionsVisited[key] = currentPos;

			candidates.push(cOnLine);
		}

		this.candidates.push(
			...candidates.map((c) => ({
				fullyVisited: true,
				positionFrom: currentPos,
				position: c,
				price: getMnhDist(currentPos, c) + price,
				targetEstimate: getMnhDist(c, this.endPos),
			}))
		);
		return candidates.pop();
	}

	constructPath(currentPos: Point) {
		const path = [this.endPos];
		let current = currentPos;
		while (current[0] !== this.startPos[0] || current[1] !== this.startPos[1]) {
			current = this.positionsVisited[this.getPointKey(current)];
			path.unshift(current);
		}
		return path;
	}

	getPointKey(point: Point) {
		return `${point[0]},${point[1]}`;
	}

	findCandidatesOnLine(from: Point, to: Point) {
		const candidates = [to];
		const distX = Math.abs(from[0] - to[0]);
		const distY = Math.abs(from[1] - to[1]);
		const dirX = Math.sign(from[0] - to[0]);
		const dirY = Math.sign(from[1] - to[1]);
		const searchY = from[0] === to[0];

		for (const node of this.nodes) {
			const [left, up, right, down] = node.linesArea;
			const points = searchY
				? [
						[from[0], up],
						[from[0], down],
				  ]
				: [
						[left, from[1]],
						[right, from[1]],
				  ];
			for (const p of points) {
				const distP = searchY ? Math.abs(p[1] - to[1]) : Math.abs(p[0] - to[0]);
				const dirP = searchY
					? Math.sign(p[1] - to[1])
					: Math.sign(p[0] - to[0]);

				if (searchY) {
					if (dirP === dirY && distP > distY) {
						continue;
					}
				} else {
					if (dirP === dirX && distP > distX) {
						continue;
					}
				}
				candidates.push([p[0], p[1]] as Point);
			}
		}
		return candidates;
	}

	testPath(path: Point[]) {
		console.log("test");
		const len1 = path.length - 1;
		for (let p = 0; p < len1; ++p) {
			const { clipped } = this.findClippedNode(path[p], path[p + 1]);
			if (clipped) {
				return clipped;
			}
		}
		return null;
	}

	findClippedNode(outputXY: Point, inputXY: Point) {
		let closestDistance = Number.MAX_SAFE_INTEGER;
		let closest = null as null | { start: Point; end: Point; node: Node };

		for (let i = 0; i < this.nodes.length; ++i) {
			const node = this.nodes[i];
			const clipA = [-1, -1] as Point; // outputXY.slice();
			const clipB = [-1, -1] as Point; // inputXY.slice();
			const area = node.linesArea.map((v, i) => (i > UP ? v - 1 : v + 1));
			const clipped = liangBarsky({
				a: outputXY,
				b: inputXY,
				box: area as BoundingBox,
				da: clipA,
				db: clipB,
			});

			if (clipped === Pos.INSIDE) {
				const centerX = area[0] + (area[2] - area[0]) / 2;
				const centerY = area[1] + (area[3] - area[1]) / 2;
				const dist = Math.sqrt(
					(centerX - outputXY[0]) ** 2 + (centerY - outputXY[1]) ** 2
				);
				if (dist < closestDistance) {
					closest = {
						start: clipA,
						end: clipB,
						node,
					};
					closestDistance = dist;
				}
			}
		}
		return { clipped: closest, closestDistance };
	}
}
