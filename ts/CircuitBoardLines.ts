import type { LGraphCanvas as LGraphCanvasType } from "@comfyorg/litegraph";

declare const LGraphCanvas: typeof LGraphCanvasType;

import { EyeButton } from "./EyeButton.js";
import { MapLinks } from "./MapLinks.js";

export class CircuitBoardLines {
	private mapLinks: MapLinks;
	private eyeHidden: boolean;
	private recalcTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastDrawTimeout: ReturnType<typeof setTimeout> | null = null;
	private skipNextRecalcTimeout: boolean = false;

	constructor(
		private canvas: LGraphCanvasType,
		private enabled: boolean,
		public maxDirectLineDistance: number,
		eyeButton: EyeButton,
		private debug: boolean = false
	) {
		this.mapLinks = new MapLinks(this.canvas);
		this.recalcMapLinks(null);
		this.enabled = enabled;
		this.eyeHidden = false;
		eyeButton.listenEyeButton((hidden: boolean) => {
			this.eyeHidden = hidden;
		});
	}

	setEnabled(e: boolean) {
		this.enabled = e;
	}

	isShow() {
		return this.enabled && !this.eyeHidden;
	}

	recalcMapLinksTimeout(ctx) {
		// calculate paths when user is idle...
		if (!this.skipNextRecalcTimeout) {
			if (this.recalcTimeout) {
				clearTimeout(this.recalcTimeout);
				this.recalcTimeout = null;
			}

			this.recalcTimeout = setTimeout(() => {
				this.recalcTimeout = null;
				this.recalcMapLinks(ctx);
				this.redraw();
			}, this.mapLinks.lastCalcTime * 2);
		}
		this.skipNextRecalcTimeout = false;
	}

	redraw() {
		if (this.lastDrawTimeout) {
			clearTimeout(this.lastDrawTimeout);
			this.lastDrawTimeout = null;
		}

		this.lastDrawTimeout = setTimeout(() => {
			this.lastDrawTimeout = null;
			window.requestAnimationFrame(() => {
				console.log("redraw timeout"); // eslint-disable-line no-console
				this.canvas.setDirty(true, true);
				this.skipNextRecalcTimeout = true;
				this.canvas.draw(true, true);
			});
		}, 0);
	}

	recalcMapLinksCheck(ctx) {
		if (this.mapLinks) {
			if (this.mapLinks.lastCalcTime > 100) {
				this.recalcMapLinksTimeout(ctx);
				return false;
			}
		}
		this.recalcMapLinks(ctx);
		return true;
	}

	recalcMapLinks(ctx) {
		this.mapLinks = new MapLinks(this.canvas, ctx);
		this.mapLinks.maxDirectLineDistance = this.maxDirectLineDistance;
		this.mapLinks.debug = this.debug;
		const nodesByExecution =
			this.canvas.graph?.computeExecutionOrder(false) || [];
		this.mapLinks.mapLinks(nodesByExecution);
	}

	drawConnections(ctx) {
		if (!this.canvas || !this.canvas.graph) {
			return false;
		}

		this.recalcMapLinksCheck(ctx);

		this.mapLinks.drawLinks(ctx);

		return true;
	}
}

export class CircuitBoardLinesFactory {
	private circuitBoardLines: CircuitBoardLines | null = null;
	private _maxDirectLineDistance: number = Number.MAX_SAFE_INTEGER;
	private _enabled: boolean = true;

	set maxDirectLineDistance(value: number) {
		this._maxDirectLineDistance = value;
		if (this.circuitBoardLines) {
			this.circuitBoardLines.maxDirectLineDistance = value;
		}
	}

	set enabled(value: boolean) {
		this._enabled = value;
		if (this.circuitBoardLines) {
			this.circuitBoardLines.setEnabled(value);
		}
	}

	init(canvas: LGraphCanvasType) {
		this.circuitBoardLines = new CircuitBoardLines(
			canvas,
			this._enabled,
			this._maxDirectLineDistance,
			new EyeButton()
		);

		const oldDrawConnections = LGraphCanvas.prototype.drawConnections;
		LGraphCanvas.prototype.drawConnections = (ctx) => {
			if (canvas && this.circuitBoardLines?.isShow()) {
				return this.circuitBoardLines?.drawConnections(ctx);
			}
			return oldDrawConnections.apply(this, arguments);
		};
	}
}
