import type { LGraphNode } from "@comfyorg/litegraph";

export type Point = [number, number];

export type BoundingBox = [number, number, number, number];

export enum Pos {
	INSIDE,
	OUTSIDE,
}

export type Node = {
	node: LGraphNode;
	area: BoundingBox;
};

export const LEFT = 0;
export const UP = 1;
export const RIGHT = 2;
export const DOWN = 3;
