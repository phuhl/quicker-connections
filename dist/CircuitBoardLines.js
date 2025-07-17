import { EyeButton } from "./EyeButton.js";
import { MapLinks } from "./MapLinks.js";
export class CircuitBoardLines {
    canvas;
    enabled;
    maxDirectLineDistance;
    debug;
    mapLinks;
    eyeHidden;
    recalcTimeout = null;
    lastDrawTimeout = null;
    skipNextRecalcTimeout = false;
    constructor(canvas, enabled, maxDirectLineDistance, eyeButton, debug = false) {
        this.canvas = canvas;
        this.enabled = enabled;
        this.maxDirectLineDistance = maxDirectLineDistance;
        this.debug = debug;
        this.mapLinks = new MapLinks(this.canvas);
        this.recalcMapLinks(null);
        this.enabled = enabled;
        this.eyeHidden = false;
        eyeButton.listenEyeButton((hidden) => {
            this.eyeHidden = hidden;
        });
    }
    setEnabled(e) {
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
        // if (this.mapLinks) {
        // 	if (this.mapLinks.lastCalcTime > 100) {
        // 		this.recalcMapLinksTimeout(ctx);
        // 		return false;
        // 	}
        // }
        this.recalcMapLinks(ctx);
        return true;
    }
    recalcMapLinks(ctx) {
        this.mapLinks.setCtx(ctx);
        this.mapLinks.maxDirectLineDistance = this.maxDirectLineDistance;
        this.mapLinks.debug = this.debug;
        const nodesByExecution = this.canvas.graph?.computeExecutionOrder(false) || [];
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
    circuitBoardLines = null;
    _maxDirectLineDistance = Number.MAX_SAFE_INTEGER;
    _enabled = true;
    set maxDirectLineDistance(value) {
        this._maxDirectLineDistance = value;
        if (this.circuitBoardLines) {
            this.circuitBoardLines.maxDirectLineDistance = value;
        }
    }
    set enabled(value) {
        this._enabled = value;
        if (this.circuitBoardLines) {
            this.circuitBoardLines.setEnabled(value);
        }
    }
    init(canvas) {
        this.circuitBoardLines = new CircuitBoardLines(canvas, this._enabled, this._maxDirectLineDistance, new EyeButton());
        const oldDrawConnections = LGraphCanvas.prototype.drawConnections;
        LGraphCanvas.prototype.drawConnections = (ctx) => {
            if (canvas && this.circuitBoardLines?.isShow()) {
                return this.circuitBoardLines?.drawConnections(ctx);
            }
            return oldDrawConnections.apply(this, arguments);
        };
    }
}
